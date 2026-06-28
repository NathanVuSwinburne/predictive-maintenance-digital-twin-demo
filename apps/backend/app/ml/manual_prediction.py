from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.domain.schemas import (
    ManualPredictionResult,
    PredictionConfig,
    PredictionInputField,
    PredictionRange,
)
from app.ml.inference import MLNotAvailableError, run_prediction_with_decision
from app.ml.schemas import MLInput
from app.runtime_paths import resolve_ml_path


_AI4I_CSV = resolve_ml_path("data", "raw_data", "ai4i2020.csv")
_MACHINE_C_CLEAN_CSV = resolve_ml_path(
    "machine_c", "data", "processed", "simulation", "machine_c_clean.csv"
)
_MACHINE_C_AUGMENTED_CSV = resolve_ml_path(
    "machine_c", "data", "processed", "simulation", "machine_c_augmented.csv"
)
_MACHINE_C_CLASSIFIER = resolve_ml_path(
    "machine_c", "models", "classifier", "classifier.joblib"
)
_MACHINE_C_SCALER = resolve_ml_path(
    "machine_c", "data", "processed", "classifier", "scaler.joblib"
)
_MACHINE_C_LABEL_MAP = resolve_ml_path(
    "machine_c", "data", "processed", "classifier", "label_map.json"
)

_AI4I_FIELDS: list[dict[str, Any]] = [
    {
        "key": "airTempK",
        "label": "Air Temperature",
        "column": "Air temperature [K]",
        "type": "number",
        "unit": "K",
        "step": 0.1,
        "description": "Observed air temperature in the AI4I telemetry row.",
    },
    {
        "key": "processTempK",
        "label": "Process Temperature",
        "column": "Process temperature [K]",
        "type": "number",
        "unit": "K",
        "step": 0.1,
        "description": "Observed process temperature in the AI4I telemetry row.",
    },
    {
        "key": "rotationalSpeed",
        "label": "Rotational Speed",
        "column": "Rotational speed [rpm]",
        "type": "number",
        "unit": "rpm",
        "step": 1.0,
        "description": "Observed spindle speed from the AI4I telemetry row.",
    },
    {
        "key": "torque",
        "label": "Torque",
        "column": "Torque [Nm]",
        "type": "number",
        "unit": "Nm",
        "step": 0.1,
        "description": "Observed spindle torque from the AI4I telemetry row.",
    },
    {
        "key": "toolWear",
        "label": "Tool Wear",
        "column": "Tool wear [min]",
        "type": "number",
        "unit": "min",
        "step": 1.0,
        "description": "Observed tool wear from the AI4I telemetry row.",
    },
]

_MACHINE_C_FIELDS: list[dict[str, Any]] = [
    {
        "key": "vibrationX",
        "label": "Vibration X",
        "column": "VibrationX",
        "type": "number",
        "unit": "g",
        "step": 0.001,
        "description": "Machine C X-axis vibration input.",
    },
    {
        "key": "vibrationY",
        "label": "Vibration Y",
        "column": "VibrationY",
        "type": "number",
        "unit": "g",
        "step": 0.001,
        "description": "Machine C Y-axis vibration input.",
    },
    {
        "key": "vibrationZ",
        "label": "Vibration Z",
        "column": "VibrationZ",
        "type": "number",
        "unit": "g",
        "step": 0.001,
        "description": "Machine C Z-axis vibration input.",
    },
    {
        "key": "temperature",
        "label": "Temperature",
        "column": "Temperature",
        "type": "number",
        "unit": "C",
        "step": 0.1,
        "description": "Machine C temperature input.",
    },
]

_MACHINE_C_WINDOW_SIZE = 120

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


def _is_machine_c_type(machine_type: str) -> bool:
    return machine_type == "real-sensor"


def _to_range(series: pd.Series) -> PredictionRange:
    return PredictionRange(
        observedMin=float(series.min()),
        observedMax=float(series.max()),
        recommendedMin=float(series.quantile(0.05)),
        recommendedMax=float(series.quantile(0.95)),
        typicalValue=float(series.median()),
    )


@lru_cache(maxsize=1)
def _ai4i_ranges() -> dict[str, PredictionRange]:
    df = pd.read_csv(_AI4I_CSV)
    return {field["key"]: _to_range(df[field["column"]]) for field in _AI4I_FIELDS}


@lru_cache(maxsize=1)
def _machine_c_ranges() -> dict[str, PredictionRange]:
    source = _MACHINE_C_CLEAN_CSV if _MACHINE_C_CLEAN_CSV.exists() else _MACHINE_C_AUGMENTED_CSV
    df = pd.read_csv(source)
    if "synthetic" in df.columns:
        df = df[df["synthetic"] == False].copy()
    return {field["key"]: _to_range(df[field["column"]]) for field in _MACHINE_C_FIELDS}


@lru_cache(maxsize=1)
def _machine_c_reference_library() -> dict[str, Any]:
    source = _MACHINE_C_CLEAN_CSV if _MACHINE_C_CLEAN_CSV.exists() else _MACHINE_C_AUGMENTED_CSV
    df = pd.read_csv(source)
    if "synthetic" in df.columns:
        df = df[df["synthetic"] == False].copy()

    df["TimeCollected"] = pd.to_datetime(df["TimeCollected"], utc=True, errors="coerce")
    df = df.dropna(subset=["SessionId", "TimeCollected"]).copy()

    session_windows: dict[int, np.ndarray] = {}
    end_vectors: list[np.ndarray] = []
    session_ids: list[np.ndarray] = []
    end_indices: list[np.ndarray] = []

    for raw_session_id, session_df in df.groupby("SessionId", sort=False):
        session_id = int(raw_session_id)
        session_df = session_df.sort_values("TimeCollected").reset_index(drop=True)
        values = session_df[[field["column"] for field in _MACHINE_C_FIELDS]].to_numpy(
            dtype=np.float32
        )
        if len(values) < _MACHINE_C_WINDOW_SIZE:
            continue

        session_windows[session_id] = values
        candidate_end_indexes = np.arange(_MACHINE_C_WINDOW_SIZE - 1, len(values), dtype=np.int32)
        end_vectors.append(values[candidate_end_indexes])
        session_ids.append(np.full(len(candidate_end_indexes), session_id, dtype=np.int32))
        end_indices.append(candidate_end_indexes)

    if not session_windows:
        raise MLNotAvailableError("No observed Machine C windows are available for manual prediction.")

    candidate_vectors = np.concatenate(end_vectors, axis=0)
    feature_scale = candidate_vectors.std(axis=0).astype(np.float32)
    feature_scale[feature_scale == 0.0] = 1.0

    return {
        "session_windows": session_windows,
        "candidate_vectors": candidate_vectors,
        "candidate_session_ids": np.concatenate(session_ids, axis=0),
        "candidate_end_indices": np.concatenate(end_indices, axis=0),
        "feature_scale": feature_scale,
    }


def _machine_c_reference_window(target_vector: np.ndarray) -> np.ndarray:
    library = _machine_c_reference_library()
    candidate_vectors = library["candidate_vectors"]
    feature_scale = library["feature_scale"]
    distances = np.square((candidate_vectors - target_vector[np.newaxis, :]) / feature_scale).sum(axis=1)
    nearest_idx = int(np.argmin(distances))

    session_id = int(library["candidate_session_ids"][nearest_idx])
    end_idx = int(library["candidate_end_indices"][nearest_idx])
    session_values = library["session_windows"][session_id]
    window = session_values[end_idx - (_MACHINE_C_WINDOW_SIZE - 1) : end_idx + 1].copy()

    # Preserve realistic variation while anchoring the latest point to the user input.
    anchor_delta = target_vector - session_values[end_idx]
    return window + anchor_delta[np.newaxis, :]


@lru_cache(maxsize=1)
def _machine_c_classifier_bundle() -> tuple[Any, Any, dict[str, int]]:
    classifier = joblib.load(_MACHINE_C_CLASSIFIER)
    scaler = joblib.load(_MACHINE_C_SCALER)
    with open(_MACHINE_C_LABEL_MAP, "r", encoding="utf-8") as handle:
        label_map = json.load(handle)
    return classifier, scaler, {str(k): int(v) for k, v in label_map.items()}


def get_prediction_config(machine_id: str, machine_type: str) -> PredictionConfig:
    if machine_type == "ai4i":
        ranges = _ai4i_ranges()
        return PredictionConfig(
            machineId=machine_id,
            machineType=machine_type,
            title="Machine A Manual Prediction",
            description=(
                "Enter raw AI4I telemetry-style values to estimate failure probability. "
                "Failure type is only surfaced when the binary stage crosses the model decision boundary."
            ),
            fields=[
                PredictionInputField(
                    key=field["key"],
                    label=field["label"],
                    type=field["type"],
                    unit=field["unit"],
                    description=field["description"],
                    step=field["step"],
                    range=ranges[field["key"]],
                )
                for field in _AI4I_FIELDS
            ]
            + [
                PredictionInputField(
                    key="productType",
                    label="Product Type",
                    type="select",
                    description="AI4I product type encoded by the original training data.",
                    options=[
                        {"label": "Low (L)", "value": "L"},
                        {"label": "Medium (M)", "value": "M"},
                        {"label": "High (H)", "value": "H"},
                    ],
                )
            ],
            failureThreshold=0.5,
            warnings=[
                "Out-of-range values are accepted but may be outside the model's training distribution."
            ],
        )

    if _is_machine_c_type(machine_type):
        ranges = _machine_c_ranges()
        return PredictionConfig(
            machineId=machine_id,
            machineType="real-sensor",
            title="Machine C Manual Prediction",
            description=(
                "Enter raw Machine C sensor values to classify the predicted machine state. "
                "Machine C shows high-risk probability separately from predicted-label confidence."
            ),
            fields=[
                PredictionInputField(
                    key=field["key"],
                    label=field["label"],
                    type=field["type"],
                    unit=field["unit"],
                    description=field["description"],
                    step=field["step"],
                    range=ranges[field["key"]],
                )
                for field in _MACHINE_C_FIELDS
            ],
            warnings=[
                "Out-of-range values are accepted but may be outside the model's training distribution."
            ],
        )

    raise ValueError(f"Manual prediction is not supported for machine type '{machine_type}'.")


def _range_warning(value: float, field_range: PredictionRange, label: str) -> str | None:
    if value < field_range.observedMin or value > field_range.observedMax:
        return (
            f"{label} is outside the observed dataset range "
            f"[{field_range.observedMin:.3f}, {field_range.observedMax:.3f}]."
        )
    return None


def _month_to_season(month: int) -> float:
    return float({12: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3}[month])


def _slope(arr: np.ndarray) -> float:
    if len(arr) < 2:
        return 0.0
    x = np.arange(len(arr), dtype=np.float32)
    return float(np.polyfit(x, arr, 1)[0])


def _machine_c_features(window: np.ndarray, ts: pd.Timestamp) -> np.ndarray:
    feats: list[float] = []
    for idx in range(window.shape[1]):
        col = window[:, idx]
        feats += [float(col.mean()), float(col.std()), float(col.min()), float(col.max()), float(col[-1]), _slope(col)]
    mag = np.sqrt(window[:, 0] ** 2 + window[:, 1] ** 2 + window[:, 2] ** 2)
    feats += [float(mag.mean()), float(mag.std()), float(mag.min()), float(mag.max()), float(mag[-1]), _slope(mag)]
    month = ts.month
    hour = ts.hour + ts.minute / 60.0
    dow = ts.dayofweek
    climate = _MELB_CLIMATE[month]
    feats += [
        float(np.sin(2 * np.pi * month / 12)),
        float(np.cos(2 * np.pi * month / 12)),
        float(np.sin(2 * np.pi * hour / 24)),
        float(np.cos(2 * np.pi * hour / 24)),
        float(np.sin(2 * np.pi * dow / 7)),
        float(np.cos(2 * np.pi * dow / 7)),
        float(climate["avg_temp"]),
        float(climate["avg_humidity"]),
        _month_to_season(month),
    ]
    return np.array(feats, dtype=np.float32)


def predict(machine_id: str, machine_type: str, values: dict[str, Any]) -> ManualPredictionResult:
    generated_at = datetime.now(timezone.utc).isoformat()

    if machine_type == "ai4i":
        ranges = _ai4i_ranges()
        warnings: list[str] = []
        breached: list[str] = []
        for field in _AI4I_FIELDS:
            value = float(values[field["key"]])
            warning = _range_warning(value, ranges[field["key"]], field["label"])
            if warning:
                warnings.append(warning)
                breached.append(field["key"])

        product_type = str(values.get("productType", "M")).upper()
        type_enc = {"L": 0.0, "M": 1.0, "H": 2.0}.get(product_type, 1.0)
        ml_input = MLInput(
            air_temp_k=float(values["airTempK"]),
            process_temp_k=float(values["processTempK"]),
            rotational_speed=float(values["rotationalSpeed"]),
            torque=float(values["torque"]),
            tool_wear=float(values["toolWear"]),
            type_enc=type_enc,
        )
        result, predicted_failure = run_prediction_with_decision(ml_input)
        return ManualPredictionResult(
            machineId=machine_id,
            machineType=machine_type,
            predictedLabel="Failure Risk" if predicted_failure else "Low Risk",
            failureProbability=result.failure_probability,
            confidence=result.confidence,
            severity=result.severity,  # type: ignore[arg-type]
            failureType=result.failure_type if predicted_failure else None,
            thresholdTriggered=predicted_failure,
            warnings=warnings,
            breachedFields=breached,
            generatedAt=generated_at,
        )

    if _is_machine_c_type(machine_type):
        ranges = _machine_c_ranges()
        warnings = []
        breached: list[str] = []
        vector = np.array(
            [
                float(values["vibrationX"]),
                float(values["vibrationY"]),
                float(values["vibrationZ"]),
                float(values["temperature"]),
            ],
            dtype=np.float32,
        )
        for field in _MACHINE_C_FIELDS:
            value = float(values[field["key"]])
            warning = _range_warning(value, ranges[field["key"]], field["label"])
            if warning:
                warnings.append(warning)
                breached.append(field["key"])

        classifier, scaler, label_map = _machine_c_classifier_bundle()
        window = _machine_c_reference_window(vector)
        window_scaled = scaler.transform(window).astype(np.float32)
        feature_row = _machine_c_features(window_scaled, pd.Timestamp.now(tz="UTC"))
        proba = classifier.predict_proba(feature_row[np.newaxis, :])[0]
        pred_idx = int(np.argmax(proba))
        inv_map = {value: key for key, value in label_map.items()}
        predicted_label = inv_map[pred_idx]
        high_risk_probability = float(proba[label_map["high"]])
        confidence = float(proba[pred_idx])
        severity = {"low": "low", "medium": "medium", "high": "high"}[predicted_label]
        return ManualPredictionResult(
            machineId=machine_id,
            machineType="real-sensor",
            predictedLabel=predicted_label,
            failureProbability=round(high_risk_probability, 4),
            confidence=round(confidence, 4),
            severity=severity,  # type: ignore[arg-type]
            warnings=warnings,
            breachedFields=breached,
            generatedAt=generated_at,
        )

    raise ValueError(f"Manual prediction is not supported for machine type '{machine_type}'.")
