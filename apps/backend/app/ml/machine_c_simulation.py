from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db.models import DBMachineCSimulationTelemetry
from app.domain.schemas import (
    SimulationClassificationWindow,
    SimulationConfig,
    SimulationGeneratedReading,
    SimulationRun,
    SimulationScenarioInput,
    SimulationSensorChartGroup,
    SimulationSessionPreview,
    SimulationSessionOption,
    SimulationSourceWindow,
)
from app.ml.model_input_profiles import (
    MACHINE_C_FEATURE_COLS,
    MACHINE_C_SAMPLE_INTERVAL_MS,
)
from app.runtime_paths import resolve_ml_path

FEATURE_COLS = list(MACHINE_C_FEATURE_COLS)
RETURN_SENSOR_FIELDS = ["vibrationX", "vibrationY", "vibrationZ", "temperature"]
SENSOR_CHART_GROUPS = [
    SimulationSensorChartGroup(
        id="vibration",
        label="Vibration",
        unit="g",
        fields=["vibrationX", "vibrationY", "vibrationZ"],
    ),
    SimulationSensorChartGroup(
        id="temperature",
        label="Temperature",
        unit="°C",
        fields=["temperature"],
    ),
]
STEP_MS = MACHINE_C_SAMPLE_INTERVAL_MS
CLASSIFIER_WINDOW = 120
TOP_K_PRIOR = 5
MC_PASSES = 8
HIDDEN_SIZE = 128
NUM_LAYERS = 2
DROPOUT = 0.2

_MELB_CLIMATE = {
    1: {"avg_temp": 25.9, "avg_humidity": 56},
    2: {"avg_temp": 25.8, "avg_humidity": 58},
    3: {"avg_temp": 23.9, "avg_humidity": 60},
    4: {"avg_temp": 20.3, "avg_humidity": 65},
    5: {"avg_temp": 16.7, "avg_humidity": 70},
    6: {"avg_temp": 14.1, "avg_humidity": 73},
    7: {"avg_temp": 13.5, "avg_humidity": 73},
    8: {"avg_temp": 14.8, "avg_humidity": 69},
    9: {"avg_temp": 17.0, "avg_humidity": 64},
    10: {"avg_temp": 19.5, "avg_humidity": 60},
    11: {"avg_temp": 22.0, "avg_humidity": 57},
    12: {"avg_temp": 24.3, "avg_humidity": 56},
}


class MachineCSimulationUnavailableError(RuntimeError):
    pass


def _month_to_season(month: int) -> float:
    return float(
        {12: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3}[
            month
        ]
    )


def _slope(arr: np.ndarray) -> float:
    if len(arr) < 2:
        return 0.0
    x = np.arange(len(arr), dtype=np.float32)
    return float(np.polyfit(x, arr, 1)[0])


def _sensor_features(window: np.ndarray) -> np.ndarray:
    feats: list[float] = []
    for idx in range(window.shape[1]):
        col = window[:, idx]
        feats += [
            float(col.mean()),
            float(col.std()),
            float(col.min()),
            float(col.max()),
            float(col[-1]),
            _slope(col),
        ]
    mag = np.sqrt(window[:, 0] ** 2 + window[:, 1] ** 2 + window[:, 2] ** 2)
    feats += [
        float(mag.mean()),
        float(mag.std()),
        float(mag.min()),
        float(mag.max()),
        float(mag[-1]),
        _slope(mag),
    ]
    return np.array(feats, dtype=np.float32)


def _weather_features(ts: pd.Timestamp) -> np.ndarray:
    month = ts.month
    dow = ts.dayofweek
    hour = ts.hour + ts.minute / 60.0
    climate = _MELB_CLIMATE[month]
    return np.array(
        [
            np.sin(2 * np.pi * month / 12),
            np.cos(2 * np.pi * month / 12),
            np.sin(2 * np.pi * hour / 24),
            np.cos(2 * np.pi * hour / 24),
            np.sin(2 * np.pi * dow / 7),
            np.cos(2 * np.pi * dow / 7),
            climate["avg_temp"],
            climate["avg_humidity"],
            _month_to_season(month),
        ],
        dtype=np.float32,
    )


@dataclass(frozen=True)
class ForecastAssets:
    model: Any
    forecast_scaler: Any
    classifier: Any
    classifier_scaler: Any
    label_map: Dict[str, int]
    forecast_config: Dict[str, Any]
    session_features: Dict[str, Any]
    sigma_ref: np.ndarray
    torch: Any
    device: Any


def _build_forecast_model(torch: Any, horizon: int, n_features: int):
    nn = torch.nn

    class AutoregressiveLSTM(nn.Module):
        def __init__(self):
            super().__init__()
            drop = DROPOUT if NUM_LAYERS > 1 else 0.0
            self.horizon = horizon
            self.encoder = nn.LSTM(
                n_features,
                HIDDEN_SIZE,
                NUM_LAYERS,
                dropout=drop,
                batch_first=True,
            )
            self.decoder = nn.LSTM(
                n_features,
                HIDDEN_SIZE,
                NUM_LAYERS,
                dropout=drop,
                batch_first=True,
            )
            self.head = nn.Linear(HIDDEN_SIZE, n_features)

        def forward(self, x):
            _, (h, c) = self.encoder(x)
            dec_input = x[:, -1:, :]
            outputs = []
            for _ in range(self.horizon):
                dec_out, (h, c) = self.decoder(dec_input, (h, c))
                pred = self.head(dec_out)
                outputs.append(pred)
                dec_input = pred.detach()
            return torch.cat(outputs, dim=1)

    return AutoregressiveLSTM()


@lru_cache(maxsize=1)
def _load_assets() -> ForecastAssets:
    try:
        import torch
    except ModuleNotFoundError as exc:
        raise MachineCSimulationUnavailableError(
            "Machine C simulation requires PyTorch in the backend environment."
        ) from exc

    try:
        forecast_config = json.loads(
            resolve_ml_path(
                "machine_c", "data", "processed", "forecast", "config.json"
            ).read_text(encoding="utf-8")
        )
        session_features = json.loads(
            resolve_ml_path(
                "machine_c", "data", "processed", "forecast", "session_features.json"
            ).read_text(encoding="utf-8")
        )
        metrics = json.loads(
            resolve_ml_path("machine_c", "models", "eval_metrics.json").read_text(
                encoding="utf-8"
            )
        )
        label_map = json.loads(
            resolve_ml_path(
                "machine_c", "data", "processed", "classifier", "label_map.json"
            ).read_text(encoding="utf-8")
        )
    except FileNotFoundError as exc:
        raise MachineCSimulationUnavailableError(str(exc)) from exc

    try:
        classifier = joblib.load(
            resolve_ml_path("machine_c", "models", "classifier", "classifier.joblib")
        )
        classifier_scaler = joblib.load(
            resolve_ml_path(
                "machine_c", "data", "processed", "classifier", "scaler.joblib"
            )
        )
        forecast_scaler = joblib.load(
            resolve_ml_path(
                "machine_c", "data", "processed", "forecast", "scaler.joblib"
            )
        )
    except ModuleNotFoundError as exc:
        raise MachineCSimulationUnavailableError(
            "Machine C classifier artifacts require the `xgboost` package in the backend environment."
        ) from exc
    except FileNotFoundError as exc:
        raise MachineCSimulationUnavailableError(str(exc)) from exc

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = _build_forecast_model(
        torch=torch,
        horizon=int(forecast_config["horizon"]),
        n_features=int(forecast_config["n_features"]),
    ).to(device)
    checkpoint = resolve_ml_path("machine_c", "models", "forecast_lstm_best.pt")
    model.load_state_dict(
        torch.load(checkpoint, weights_only=True, map_location=device)
    )

    return ForecastAssets(
        model=model,
        forecast_scaler=forecast_scaler,
        classifier=classifier,
        classifier_scaler=classifier_scaler,
        label_map={str(key): int(value) for key, value in label_map.items()},
        forecast_config=forecast_config,
        session_features=session_features,
        sigma_ref=np.array(metrics["sigma_ref"], dtype=np.float64),
        torch=torch,
        device=device,
    )


def get_simulation_config(machine_id: str, db: Session) -> SimulationConfig:
    rows = (
        db.query(
            DBMachineCSimulationTelemetry.session_id.label("session_id"),
            func.min(DBMachineCSimulationTelemetry.time_collected).label("start"),
            func.max(DBMachineCSimulationTelemetry.time_collected).label("end"),
            func.count(DBMachineCSimulationTelemetry.id).label("total_rows"),
            func.sum(
                case((DBMachineCSimulationTelemetry.synthetic.is_(False), 1), else_=0)
            ).label("real_rows"),
            func.sum(
                case((DBMachineCSimulationTelemetry.synthetic.is_(True), 1), else_=0)
            ).label("synthetic_rows"),
            func.min(DBMachineCSimulationTelemetry.risk_label).label("label"),
        )
        .filter(DBMachineCSimulationTelemetry.machine_id == machine_id)
        .group_by(DBMachineCSimulationTelemetry.session_id)
        .order_by(DBMachineCSimulationTelemetry.session_id.asc())
        .all()
    )

    assets = _load_assets()
    window_rows = int(assets.forecast_config["window_size"])
    chunk_rows = int(assets.forecast_config["horizon"])

    sessions: list[SimulationSessionOption] = []
    for row in rows:
        start_ts = pd.Timestamp(row.start)
        end_ts = pd.Timestamp(row.end)
        sessions.append(
            SimulationSessionOption(
                sessionId=int(row.session_id),
                start=str(row.start),
                end=str(row.end),
                totalRows=int(row.total_rows or 0),
                realRows=int(row.real_rows or 0),
                syntheticRows=int(row.synthetic_rows or 0),
                durationMinutes=round(
                    max(0.0, (end_ts - start_ts).total_seconds() / 60.0), 2
                ),
                usesSyntheticContinuation=bool(row.synthetic_rows),
                label=str(row.label) if row.label is not None else None,
            )
        )

    return SimulationConfig(
        machineId=machine_id,
        machineType="real-sensor",
        title="Machine C Session Simulation",
        description=(
            "Select a Machine C session from the augmented simulation-serving table. "
            "The simulator uses the final 20-minute context window from that session, "
            "runs the trained LSTM forecast, then classifies the forecast windows."
        ),
        contextWindowMinutes=int(window_rows * STEP_MS / 60000),
        contextWindowRows=window_rows,
        forecastChunkMinutes=int(chunk_rows * STEP_MS / 60000),
        sampleIntervalMs=STEP_MS,
        warnings=[
            "Synthetic continuation may be present in sessions shorter than one hour.",
            "Failure probability is derived from the classifier's predicted high-risk probability across the simulated horizon.",
        ],
        sessions=sessions,
        sensorChartGroups=SENSOR_CHART_GROUPS,
    )


def _session_dataframe(rows: Iterable[DBMachineCSimulationTelemetry]) -> pd.DataFrame:
    df = pd.DataFrame(
        [
            {
                "TimeCollected": row.time_collected,
                "VibrationX": float(row.vibration_x or 0.0),
                "VibrationY": float(row.vibration_y or 0.0),
                "VibrationZ": float(row.vibration_z or 0.0),
                "Temperature": float(row.temperature or 0.0),
                "synthetic": bool(row.synthetic),
            }
            for row in rows
        ]
    )
    if df.empty:
        return df
    df["TimeCollected"] = pd.to_datetime(df["TimeCollected"])
    return df.sort_values("TimeCollected").reset_index(drop=True)


def _session_prior(
    assets: ForecastAssets,
    session_id: int,
    db: Session,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    session_features = assets.session_features
    key = str(session_id)
    if key not in session_features:
        raise MachineCSimulationUnavailableError(
            f"Missing forecast session features for Machine C session {session_id}."
        )

    all_sids = [int(sid) for sid in session_features]
    feat_matrix = np.array(
        [session_features[str(sid)]["features"] for sid in all_sids], dtype=np.float64
    )
    feat_std = feat_matrix.std(axis=0) + 1e-8
    feat_mean = feat_matrix.mean(axis=0)
    session_norm = (
        np.array(session_features[key]["features"], dtype=np.float64) - feat_mean
    ) / feat_std
    all_norm = (feat_matrix - feat_mean) / feat_std
    dists = np.linalg.norm(all_norm - session_norm, axis=1)
    dists[all_sids.index(session_id)] = np.inf
    top_k_sids = [all_sids[idx] for idx in np.argsort(dists)[:TOP_K_PRIOR]]

    prior_rows = (
        db.query(DBMachineCSimulationTelemetry)
        .filter(
            DBMachineCSimulationTelemetry.machine_id == "machine-c",
            DBMachineCSimulationTelemetry.session_id.in_(top_k_sids),
        )
        .order_by(
            DBMachineCSimulationTelemetry.session_id.asc(),
            DBMachineCSimulationTelemetry.time_collected.asc(),
        )
        .all()
    )
    prior_df = _session_dataframe(prior_rows)
    prior_vals = prior_df[FEATURE_COLS].values.astype(np.float64)
    return (
        prior_vals.mean(axis=0),
        np.percentile(prior_vals, 1, axis=0),
        np.percentile(prior_vals, 99, axis=0),
    )


def _rollout_forecast(
    assets: ForecastAssets,
    context_raw: np.ndarray,
    total_steps: int,
    prior_mean: np.ndarray,
    prior_p01: np.ndarray,
    prior_p99: np.ndarray,
) -> np.ndarray:
    torch = assets.torch
    model = assets.model
    scaler = assets.forecast_scaler
    chunk_steps = int(assets.forecast_config["horizon"])
    n_features = int(assets.forecast_config["n_features"])
    n_chunks = math.ceil(total_steps / chunk_steps)

    context_scaled = scaler.transform(context_raw).astype(np.float32)
    ctx = torch.tensor(context_scaled[np.newaxis], dtype=torch.float32).to(
        assets.device
    )
    means_scaled: list[np.ndarray] = []
    stds_scaled: list[np.ndarray] = []

    model.train()
    with torch.no_grad():
        for chunk_idx in range(n_chunks):
            passes = []
            for _ in range(MC_PASSES):
                pred = model(ctx)
                passes.append(pred[0].cpu().numpy())
            chunk_arr = np.stack(passes, axis=0)
            chunk_mean = chunk_arr.mean(axis=0)
            chunk_std = chunk_arr.std(axis=0)

            remaining = total_steps - len(means_scaled) * chunk_steps
            take = min(chunk_steps, remaining)
            means_scaled.append(chunk_mean[:take])
            stds_scaled.append(chunk_std[:take])
            ctx = torch.tensor(chunk_mean[np.newaxis], dtype=torch.float32).to(
                assets.device
            )

    all_means_scaled = np.concatenate(means_scaled, axis=0).reshape(
        total_steps, n_features
    )
    all_stds_scaled = np.concatenate(stds_scaled, axis=0).reshape(
        total_steps, n_features
    )
    y_lstm_real = scaler.inverse_transform(all_means_scaled.astype(np.float32))
    lambda_mat = np.exp(-all_stds_scaled / (assets.sigma_ref[np.newaxis, :] + 1e-12))
    y_blended = (
        lambda_mat * y_lstm_real + (1.0 - lambda_mat) * prior_mean[np.newaxis, :]
    )
    return np.clip(y_blended, prior_p01[np.newaxis, :], prior_p99[np.newaxis, :])


def _classify_forecast(
    assets: ForecastAssets,
    forecast_values: np.ndarray,
    timestamps: list[pd.Timestamp],
) -> list[SimulationClassificationWindow]:
    label_map = assets.label_map
    inv_label_map = {value: key for key, value in label_map.items()}
    values_scaled = assets.classifier_scaler.transform(forecast_values).astype(
        np.float32
    )
    windows: list[SimulationClassificationWindow] = []
    n_windows = len(values_scaled) // CLASSIFIER_WINDOW

    for idx in range(n_windows):
        start = idx * CLASSIFIER_WINDOW
        end = start + CLASSIFIER_WINDOW
        win = values_scaled[start:end]
        mid_ts = timestamps[(start + end) // 2]
        x_row = np.concatenate([_sensor_features(win), _weather_features(mid_ts)])
        proba = assets.classifier.predict_proba(x_row[np.newaxis, :])[0]
        pred_idx = int(np.argmax(proba))
        predicted_label = inv_label_map[pred_idx]
        windows.append(
            SimulationClassificationWindow(
                windowStart=timestamps[start].isoformat(),
                windowEnd=timestamps[end - 1].isoformat(),
                predictedLabel=predicted_label,
                failureProbability=round(float(proba[label_map["high"]]), 4),
                confidence=round(float(proba[pred_idx]), 4),
                probabilities={
                    "low": round(float(proba[label_map["low"]]), 4),
                    "medium": round(float(proba[label_map["medium"]]), 4),
                    "high": round(float(proba[label_map["high"]]), 4),
                },
            )
        )

    return windows


def _reading(
    timestamp: pd.Timestamp, values: np.ndarray, synthetic: bool | None = None
) -> SimulationGeneratedReading:
    return SimulationGeneratedReading(
        timestamp=timestamp.isoformat(),
        synthetic=synthetic,
        values={
            "vibrationX": round(float(values[0]), 4),
            "vibrationY": round(float(values[1]), 4),
            "vibrationZ": round(float(values[2]), 4),
            "temperature": round(float(values[3]), 4),
        },
    )


def _build_recommendations(
    label: str, probability: float, uses_synthetic: bool
) -> list[str]:
    recs: list[str] = []
    if label == "high" or probability >= 0.7:
        recs.append(
            f"High-risk forecast detected. Peak high-risk probability reached {probability * 100:.1f}% - inspect Machine C before extended operation."
        )
    elif label == "medium" or probability >= 0.35:
        recs.append(
            f"Moderate stress forecast detected. Peak high-risk probability reached {probability * 100:.1f}% - monitor bearing and imbalance indicators during the run."
        )
    else:
        recs.append(
            f"Low projected stress across the simulated horizon. Peak high-risk probability stayed at {probability * 100:.1f}%."
        )

    if uses_synthetic:
        recs.append(
            "This session includes synthetic continuation data, do not treat the data as observed telemetry."
        )

    if label in {"medium", "high"}:
        recs.append(
            "Review vibration axis asymmetry and temperature drift before replaying a longer scenario."
        )

    return recs


def get_session_preview(
    machine_id: str,
    session_id: int,
    db: Session,
) -> SimulationSessionPreview:
    assets = _load_assets()
    rows = (
        db.query(DBMachineCSimulationTelemetry)
        .filter(
            DBMachineCSimulationTelemetry.machine_id == machine_id,
            DBMachineCSimulationTelemetry.session_id == session_id,
        )
        .order_by(DBMachineCSimulationTelemetry.within_session_idx.asc())
        .all()
    )
    if not rows:
        raise ValueError(
            f"Machine C session {session_id} was not found in simulation-serving data."
        )

    session_df = _session_dataframe(rows)
    window_rows = int(assets.forecast_config["window_size"])
    context_df = session_df.tail(min(len(session_df), window_rows))
    sample_count = min(10, len(context_df))
    sampled = (
        context_df
        if len(context_df) <= sample_count
        else context_df.iloc[
            np.round(np.linspace(0, len(context_df) - 1, sample_count)).astype(int)
        ]
    )

    readings = [
        _reading(
            timestamp=row.TimeCollected,
            values=row_values,
            synthetic=bool(synthetic),
        )
        for row, row_values, synthetic in zip(
            sampled.itertuples(index=False),
            sampled[FEATURE_COLS].values,
            sampled["synthetic"].tolist(),
        )
    ]

    return SimulationSessionPreview(
        machineId=machine_id,
        machineType="real-sensor",
        sessionId=session_id,
        sensorFields=RETURN_SENSOR_FIELDS,
        sensorChartGroups=SENSOR_CHART_GROUPS,
        sourceWindow=SimulationSourceWindow(
            start=context_df["TimeCollected"].iloc[0].isoformat(),
            end=context_df["TimeCollected"].iloc[-1].isoformat(),
            points=len(context_df),
            sessionId=session_id,
            realPoints=int((~context_df["synthetic"]).sum()),
            syntheticPoints=int(context_df["synthetic"].sum()),
        ),
        readings=readings,
    )


def run_session_simulation(inp: SimulationScenarioInput, db: Session) -> Dict[str, Any]:
    assets = _load_assets()
    rows = (
        db.query(DBMachineCSimulationTelemetry)
        .filter(
            DBMachineCSimulationTelemetry.machine_id == inp.machineId,
            DBMachineCSimulationTelemetry.session_id == inp.sessionId,
        )
        .order_by(DBMachineCSimulationTelemetry.within_session_idx.asc())
        .all()
    )
    if not rows:
        raise ValueError(
            f"Machine C session {inp.sessionId} was not found in simulation-serving data."
        )

    session_df = _session_dataframe(rows)
    window_rows = int(assets.forecast_config["window_size"])
    if len(session_df) < window_rows:
        return {
            "projected_risk": 0.0,
            "projected_downtime_hours": 0.0,
            "projected_label": None,
            "failure_probability": 0.0,
            "summary": f"Session {inp.sessionId} does not have enough rows for the required 20-minute context window.",
            "recommendations": [
                "Choose a different session. This session is shorter than the trained LSTM context requirement."
            ],
            "selected_session_id": inp.sessionId,
            "synthetic_continuation_used": bool(session_df["synthetic"].any()),
            "generated_readings": [],
            "source_readings": [],
            "source_window": SimulationSourceWindow(
                start=session_df["TimeCollected"].iloc[0].isoformat(),
                end=session_df["TimeCollected"].iloc[-1].isoformat(),
                points=len(session_df),
                sessionId=inp.sessionId,
                realPoints=int((~session_df["synthetic"]).sum()),
                syntheticPoints=int(session_df["synthetic"].sum()),
            ).model_dump(),
            "sensor_fields": RETURN_SENSOR_FIELDS,
            "sensor_chart_groups": [
                group.model_dump() for group in SENSOR_CHART_GROUPS
            ],
            "simulation_horizon_minutes": inp.simulationHorizonMinutes,
            "simulation_status": "insufficient-data",
            "simulation_message": "The selected Machine C session is shorter than the trained forecast context window.",
            "classification_windows": [],
        }

    horizon_minutes = int(inp.simulationHorizonMinutes or 60)
    horizon_minutes = max(1, min(240, horizon_minutes))
    total_steps = max(CLASSIFIER_WINDOW, int(round(horizon_minutes * 60_000 / STEP_MS)))
    context_df = session_df.tail(window_rows)
    context_raw = context_df[FEATURE_COLS].values.astype(np.float32)
    prior_mean, prior_p01, prior_p99 = _session_prior(assets, inp.sessionId, db)
    forecast_values = _rollout_forecast(
        assets=assets,
        context_raw=context_raw,
        total_steps=total_steps,
        prior_mean=prior_mean,
        prior_p01=prior_p01,
        prior_p99=prior_p99,
    )

    start_ts = pd.Timestamp(session_df["TimeCollected"].iloc[-1]) + pd.Timedelta(
        milliseconds=STEP_MS
    )
    timestamps = list(
        pd.date_range(start=start_ts, periods=total_steps, freq=f"{STEP_MS}ms")
    )
    classification_windows = _classify_forecast(assets, forecast_values, timestamps)
    peak_window = max(
        classification_windows,
        key=lambda window: window.failureProbability,
        default=SimulationClassificationWindow(
            windowStart=timestamps[0].isoformat(),
            windowEnd=timestamps[
                min(len(timestamps) - 1, CLASSIFIER_WINDOW - 1)
            ].isoformat(),
            predictedLabel="low",
            failureProbability=0.0,
            confidence=0.0,
            probabilities={"low": 1.0, "medium": 0.0, "high": 0.0},
        ),
    )
    uses_synthetic = bool(context_df["synthetic"].any())
    failure_probability = float(peak_window.failureProbability)
    projected_label = peak_window.predictedLabel
    projected_risk = round(failure_probability * 100.0, 2)
    projected_downtime = round(
        {
            "low": 0.5,
            "medium": 2.0,
            "high": 4.0,
        }.get(projected_label, 1.0)
        * max(0.25, failure_probability),
        2,
    )
    source_readings = [
        _reading(
            timestamp=row.TimeCollected,
            values=row_values,
            synthetic=bool(synthetic),
        )
        for row, row_values, synthetic in zip(
            context_df.itertuples(index=False),
            context_df[FEATURE_COLS].values,
            context_df["synthetic"].tolist(),
        )
    ]
    generated_readings = [
        _reading(timestamp=timestamp, values=values)
        for timestamp, values in zip(timestamps, forecast_values)
    ]
    summary = (
        f"Session {inp.sessionId} was simulated for {horizon_minutes} minutes using the final "
        f"20-minute context window from the augmented Machine C session data. "
        f"Peak projected state: {projected_label}. Peak high-risk probability: {projected_risk:.1f}%."
    )
    if uses_synthetic:
        summary += " The selected context window includes synthetic continuation rows."

    return {
        "projected_risk": projected_risk,
        "projected_downtime_hours": projected_downtime,
        "projected_label": projected_label,
        "failure_probability": round(failure_probability, 4),
        "summary": summary,
        "recommendations": _build_recommendations(
            projected_label, failure_probability, uses_synthetic
        ),
        "selected_session_id": inp.sessionId,
        "synthetic_continuation_used": uses_synthetic,
        "generated_readings": [reading.model_dump() for reading in generated_readings],
        "source_readings": [reading.model_dump() for reading in source_readings[-240:]],
        "source_window": SimulationSourceWindow(
            start=context_df["TimeCollected"].iloc[0].isoformat(),
            end=context_df["TimeCollected"].iloc[-1].isoformat(),
            points=len(context_df),
            sessionId=inp.sessionId,
            realPoints=int((~context_df["synthetic"]).sum()),
            syntheticPoints=int(context_df["synthetic"].sum()),
        ).model_dump(),
        "sensor_fields": RETURN_SENSOR_FIELDS,
        "sensor_chart_groups": [group.model_dump() for group in SENSOR_CHART_GROUPS],
        "simulation_horizon_minutes": horizon_minutes,
        "simulation_status": "completed",
        "simulation_message": (
            "Synthetic continuation was used in the simulation context."
            if uses_synthetic
            else "The simulation context came entirely from observed Machine C telemetry."
        ),
        "classification_windows": [
            window.model_dump() for window in classification_windows
        ],
    }
