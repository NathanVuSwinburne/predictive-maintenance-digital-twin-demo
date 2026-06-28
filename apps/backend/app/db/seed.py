"""Seed the PostgreSQL database with initial data if empty."""

from __future__ import annotations

import argparse
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pyotp

import pandas as pd
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, reset_database
from app.db.models import (
    DBHistoryEvent,
    DBMachine,
    DBMachineATelemetry,
    DBMachineBTelemetry,
    DBMachineCTelemetry,
    DBMachineCSimulationTelemetry,
    DBMfaBackupCode,
    DBPersona,
    DBPrediction,
    DBRecommendation,
    DBUserMachineAccess,
    DBUser,
)
from app.runtime_paths import resolve_ml_path
from app.security.password import hash_password

_DATA_DIR = resolve_ml_path("data", "raw_data")
_DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def seed_all(db: Session) -> None:
    try:
        _seed_personas_and_accounts(db)

        # SessionLocal uses autoflush=False, so persist users before querying them.
        db.flush()

        _seed_mfa_backup_codes(db)
        _seed_machines(db)

        # Ensure FK parent rows exist before any bulk child inserts.
        db.flush()

        _seed_machine_access(db)
        _seed_machine_a_telemetry(db)
        _seed_machine_b_telemetry(db)
        _seed_machine_c_telemetry(db)
        _seed_machine_c_simulation_telemetry(db)
        _seed_predictions(db)
        _seed_recommendations(db)
        _seed_history(db)
        db.commit()
    except Exception:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# Personas & accounts
# ---------------------------------------------------------------------------


def _seed_personas_and_accounts(db: Session) -> None:
    if db.query(DBPersona).first() or db.query(DBUser).first():
        return

    db.add_all(
        [
            DBPersona(
                id="persona-001",
                name="Alex Chen",
                role="Operations Manager",
                shift="Day",
                plant="Plant 1",
            ),
            DBPersona(
                id="persona-002",
                name="Jamie Rodriguez",
                role="Field Technician",
                shift="Swing",
                plant="Plant 1",
            ),
            DBPersona(
                id="persona-003",
                name="Sam Williams",
                role="Shift Supervisor",
                shift="Night",
                plant="Plant 1",
            ),
        ]
    )
    db.add_all(
        [
            DBUser(
                id="user-001",
                email="test1@test.com",
                password=hash_password("password1"),
                persona_id="persona-001",
                access_role="admin",
                # Stable demo MFA secret so Docker reseeds keep the login flow reproducible.
                totp_secret=_DEMO_TOTP_SECRET,
            ),
            DBUser(
                id="user-002",
                email="test2@test.com",
                password=hash_password("password2"),
                persona_id="persona-002",
                access_role="user",
                totp_secret=None,  # MFA not enabled for this user
            ),
            DBUser(
                id="user-003",
                email="test3@test.com",
                password=hash_password("password3"),
                persona_id="persona-003",
                access_role="user",
                totp_secret=None,  # MFA not enabled for this user
            ),
        ]
    )


def _seed_mfa_backup_codes(db: Session) -> None:
    if db.query(DBMfaBackupCode).first():
        return

    mfa_enabled_users = db.query(DBUser).filter(DBUser.totp_secret.isnot(None)).all()

    backup_codes = []
    for user in mfa_enabled_users:
        # Generate 10 deterministic test backup codes per MFA-enabled user.
        user_suffix = user.id.split("-")[-1]
        for idx in range(1, 11):
            backup_codes.append(
                DBMfaBackupCode(
                    user_id=user.id,
                    code=f"BKP-{user_suffix}-{idx:04d}",
                    used=False,
                )
            )

    if backup_codes:
        db.add_all(backup_codes)


# ---------------------------------------------------------------------------
# Virtual machines — one per dataset
# ---------------------------------------------------------------------------


def _seed_machines(db: Session) -> None:
    if db.query(DBMachine).first():
        return

    db.add_all(
        [
            DBMachine(
                id="machine-a",
                name="AI4I Production Machine",
                line="Line A",
                model="AI4I 2020 Kaggle Dataset",
                status="watch",
                health_score=74.0,
                risk_score=38.0,
                last_service_date="2026-01-15",
                next_service_date="2026-04-15",
                uptime_percent=94.0,
                location="Bay 1, Section A",
                operating_hours=14250.0,
                primary_failure_modes=[
                    "Tool Wear Failure",
                    "Heat Dissipation Failure",
                    "Power Failure",
                    "Overstrain Failure",
                ],
                notes="Kaggle AI4I batch dataset - 9,999 records with no timestamp. Used for Machine A prediction only with multi-label failure classification (TWF, HDF, PWF, OSF, RNF).",
                machine_type="ai4i",
            ),
            DBMachine(
                id="machine-b",
                name="Sensor Data Machine",
                line="Line B",
                model="Synthetic Sensor Dataset",
                status="healthy",
                health_score=82.0,
                risk_score=22.0,
                last_service_date="2026-02-01",
                next_service_date="2026-05-01",
                uptime_percent=90.1,
                location="Bay 2, Section B",
                operating_hours=9800.0,
                primary_failure_modes=[
                    "Sensor Anomaly",
                    "Pressure Spike",
                    "Thermal Runaway",
                ],
                notes="Synthetic time-series dataset - 3,000 records across 21 days at 10-minute intervals. Used for telemetry only; no production prediction or simulation is exposed for Machine B.",
                machine_type="synthetic",
            ),
            DBMachine(
                id="machine-c",
                name="Vibration Sensor Machine",
                line="Line C",
                model="Real Machine C Sensor Dataset",
                status="risk",
                health_score=55.0,
                risk_score=62.0,
                last_service_date="2025-12-01",
                next_service_date="2026-03-01",
                uptime_percent=87.5,
                location="Bay 3, Section C",
                operating_hours=6200.0,
                primary_failure_modes=[
                    "Vibration Anomaly",
                    "Bearing Fatigue",
                    "Imbalance",
                ],
                notes="Real high-frequency 3-axis accelerometer dataset from Machine C. Canonical telemetry stays observed-only; simulation uses a separate augmented session-serving table for LSTM + classifier runtime.",
                machine_type="real-sensor",
            ),
        ]
    )


def _seed_machine_access(db: Session) -> None:
    if db.query(DBUserMachineAccess).first():
        return

    db.add_all(
        [
            DBUserMachineAccess(user_id="user-001", machine_id="machine-a"),
            DBUserMachineAccess(user_id="user-002", machine_id="machine-b"),
            DBUserMachineAccess(user_id="user-002", machine_id="machine-c"),
            DBUserMachineAccess(user_id="user-003", machine_id="machine-c"),
        ]
    )


# ---------------------------------------------------------------------------
# Machine A telemetry — AI4I 2020 dataset (no timestamp)
# ---------------------------------------------------------------------------


def _seed_machine_a_telemetry(db: Session) -> None:
    if db.query(DBMachineATelemetry).first():
        return

    csv_path = _DATA_DIR / "ai4i2020.csv"
    if not csv_path.exists():
        return

    df = pd.read_csv(csv_path)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "machine_id": "machine-a",
                "udi": int(row["UDI"]),
                "product_id": str(row["Product ID"]),
                "product_type": str(row["Type"]),
                "air_temp_k": float(row["Air temperature [K]"]),
                "process_temp_k": float(row["Process temperature [K]"]),
                "rotational_speed": int(row["Rotational speed [rpm]"]),
                "torque": float(row["Torque [Nm]"]),
                "tool_wear": int(row["Tool wear [min]"]),
                "machine_failure": bool(row["Machine failure"]),
                "failure_twf": bool(row["TWF"]),
                "failure_hdf": bool(row["HDF"]),
                "failure_pwf": bool(row["PWF"]),
                "failure_osf": bool(row["OSF"]),
                "failure_rnf": bool(row["RNF"]),
            }
        )
    db.bulk_insert_mappings(DBMachineATelemetry, records)


# ---------------------------------------------------------------------------
# Machine B telemetry — client sensor dataset (time-series, binary failure)
# ---------------------------------------------------------------------------


def _seed_machine_b_telemetry(db: Session) -> None:
    if db.query(DBMachineBTelemetry).first():
        return

    csv_path = _DATA_DIR / "machine_failure_data.csv"
    if not csv_path.exists():
        return

    df = pd.read_csv(csv_path)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "machine_id": "machine-b",
                # Machine_ID column in CSV is a misleading row identifier — dropped
                "timestamp": str(row["Timestamp"]),
                "temperature": float(row["Temperature"]),
                "pressure": float(row["Pressure"]),
                "vibration_level": float(row["Vibration_Level"]),
                "humidity": float(row["Humidity"]),
                "power_consumption": float(row["Power_Consumption"]),
                "failure_status": bool(row["Failure_Status"]),
            }
        )
    db.bulk_insert_mappings(DBMachineBTelemetry, records)


# ---------------------------------------------------------------------------
# Machine C telemetry — Kaggle high-frequency 3-axis vibration dataset
# ---------------------------------------------------------------------------


def _seed_machine_c_telemetry(db: Session) -> None:
    if db.query(DBMachineCTelemetry).first():
        return

    csv_path = _DATA_DIR / "sensordata 1.csv"
    if not csv_path.exists():
        return

    df = pd.read_csv(csv_path)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "machine_id": "machine-c",
                "session_id": int(row["SessionId"]),
                "vibration_x": float(row["VibrationX"]),
                "vibration_y": float(row["VibrationY"]),
                "vibration_z": float(row["VibrationZ"]),
                "temperature": float(row["Temperature"]),
                "time_collected": str(row["TimeCollected"]),
                "risk_label": str(row["Label"]),
            }
        )
    db.bulk_insert_mappings(DBMachineCTelemetry, records)


def _seed_machine_c_simulation_telemetry(db: Session) -> None:
    if db.query(DBMachineCSimulationTelemetry).first():
        return

    csv_path = resolve_ml_path(
        "machine_c", "data", "processed", "simulation", "machine_c_augmented.csv"
    )
    if not csv_path.exists():
        return

    df = pd.read_csv(csv_path)
    records = []
    for _, row in df.iterrows():
        records.append(
            {
                "machine_id": "machine-c",
                "session_id": int(row["SessionId"]),
                "vibration_x": float(row["VibrationX"]),
                "vibration_y": float(row["VibrationY"]),
                "vibration_z": float(row["VibrationZ"]),
                "temperature": float(row["Temperature"]),
                "time_collected": str(row["TimeCollected"]),
                "vibration_magnitude": float(row["VibrationMagnitude"]),
                "time_delta_s": None if pd.isna(row["time_delta_s"]) else float(row["time_delta_s"]),
                "within_session_idx": int(row["within_session_idx"]),
                "risk_label": str(row["Label"]),
                "synthetic": str(row["synthetic"]).lower() == "true",
            }
        )
    db.bulk_insert_mappings(DBMachineCSimulationTelemetry, records)


# ---------------------------------------------------------------------------
# Predictions
# ---------------------------------------------------------------------------


def _seed_predictions(db: Session) -> None:
    if db.query(DBPrediction).first():
        return

    now = _now()
    db.add_all(
        [
            # Machine A — AI4I batch dataset predictions
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-a",
                generated_at=now,
                horizon_hours=48,
                failure_mode="Tool Wear Failure",
                probability=0.28,
                confidence=0.84,
                severity="medium",
            ),
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-a",
                generated_at=now,
                horizon_hours=24,
                failure_mode="Heat Dissipation Failure",
                probability=0.15,
                confidence=0.79,
                severity="low",
            ),
            # Machine B — client sensor dataset predictions
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-b",
                generated_at=now,
                horizon_hours=12,
                failure_mode="Sensor Anomaly",
                probability=0.42,
                confidence=0.81,
                severity="medium",
            ),
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-b",
                generated_at=now,
                horizon_hours=24,
                failure_mode="Pressure Spike",
                probability=0.18,
                confidence=0.76,
                severity="low",
            ),
            # Machine C — Kaggle vibration dataset predictions
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-c",
                generated_at=now,
                horizon_hours=8,
                failure_mode="Vibration Anomaly",
                probability=0.67,
                confidence=0.88,
                severity="high",
            ),
            DBPrediction(
                id=str(uuid.uuid4()),
                machine_id="machine-c",
                generated_at=now,
                horizon_hours=4,
                failure_mode="Bearing Fatigue",
                probability=0.58,
                confidence=0.83,
                severity="high",
            ),
        ]
    )


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


def _seed_recommendations(db: Session) -> None:
    if db.query(DBRecommendation).first():
        return

    db.add_all(
        [
            # Machine A
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-a",
                title="Monitor Tool Wear Threshold",
                detail="Dataset analysis shows tool wear failure rate increases significantly above 200 minutes. Inspect and replace tools at or before this threshold.",
                action_type="inspect",
                priority="medium",
                eta_minutes=30,
                estimated_downtime_hours=0.5,
            ),
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-a",
                title="Check Heat Dissipation System",
                detail="Heat dissipation failures correlate with high air-to-process temperature differentials. Inspect cooling pathways when delta exceeds 10K.",
                action_type="inspect",
                priority="low",
                eta_minutes=45,
                estimated_downtime_hours=0.75,
            ),
            # Machine B
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-b",
                title="Inspect Vibration Sensor Mounting",
                detail="Elevated vibration readings detected. Verify sensor mounting integrity and check for mechanical loosening.",
                action_type="inspect",
                priority="medium",
                eta_minutes=60,
                estimated_downtime_hours=1.0,
            ),
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-b",
                title="Review Pressure Regulation",
                detail="Pressure readings show periodic spikes. Inspect pressure regulator and relief valve for wear.",
                action_type="replace-part",
                priority="low",
                eta_minutes=90,
                estimated_downtime_hours=2.0,
            ),
            # Machine C
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-c",
                title="URGENT: Investigate High Vibration Sessions",
                detail="Multiple sessions labelled high-risk. 3-axis vibration anomalies suggest bearing imbalance or rotor defect. Immediate inspection required.",
                action_type="dispatch-tech",
                priority="high",
                eta_minutes=120,
                estimated_downtime_hours=4.0,
            ),
            DBRecommendation(
                id=str(uuid.uuid4()),
                machine_id="machine-c",
                title="Balance Rotating Components",
                detail="Asymmetric VibrationX/Y/Z values across sessions indicate imbalance. Schedule dynamic balancing at next planned downtime.",
                action_type="parameter",
                priority="medium",
                eta_minutes=180,
                estimated_downtime_hours=3.0,
            ),
        ]
    )


# ---------------------------------------------------------------------------
# History events
# ---------------------------------------------------------------------------


def _seed_history(db: Session) -> None:
    if db.query(DBHistoryEvent).first():
        return

    now = datetime.now(timezone.utc)
    db.add_all(
        [
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=2)),
                type="telemetry-anomaly",
                machine_id="machine-c",
                user_id="user-001",
                title="High-Risk Vibration Session Detected on Machine C",
                description="Session 78 recorded sustained high-risk vibration label for 30+ minutes. Automatic alert triggered.",
                severity="high",
                event_metadata={"session_id": 78, "risk_label": "high"},
            ),
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=5)),
                type="fault-prediction",
                machine_id="machine-b",
                user_id="user-002",
                title="Pressure Spike Risk Predicted for Machine B",
                description="ML model predicts 42% probability of sensor anomaly failure within 12 hours.",
                severity="medium",
                event_metadata={"probability": 0.42, "horizon_hours": 12},
            ),
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=8)),
                type="maintenance-action",
                machine_id="machine-a",
                user_id="user-002",
                title="Tool Wear Inspection Completed on Machine A",
                description="Preventive inspection triggered by tool wear threshold analysis. Tools replaced on 3 spindles.",
                severity="low",
                event_metadata=None,
            ),
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=12)),
                type="simulation-run",
                machine_id="machine-c",
                user_id="user-001",
                title="What-If Simulation: Sustained High-Load on Machine C",
                description="Simulated continuous high vibration load. Projected risk: 82%. Immediate balancing recommended.",
                severity="critical",
                event_metadata={"projected_risk": 0.82, "load_percent": 115},
            ),
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=18)),
                type="telemetry-anomaly",
                machine_id="machine-b",
                user_id="user-003",
                title="Humidity Spike on Machine B",
                description="Humidity exceeded 80% threshold for 20 minutes. Possible condensation risk.",
                severity="medium",
                event_metadata={"humidity_value": 83.29, "threshold": 80.0},
            ),
            DBHistoryEvent(
                id=str(uuid.uuid4()),
                timestamp=_iso(now - timedelta(hours=24)),
                type="chat-insight",
                machine_id="machine-a",
                user_id="user-001",
                title="AI Assistant Identified Tool Wear Pattern",
                description="AI analysis highlighted correlation between high torque and tool wear failure in AI4I dataset — consistent with overstrain failure mode.",
                severity="medium",
                event_metadata=None,
            ),
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the backend database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate all tables before seeding.",
    )
    args = parser.parse_args()

    if args.reset:
        reset_database()

    db = SessionLocal()
    try:
        seed_all(db)
        print("Database seed completed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
