"""Failure prediction tool — wraps ML inference with DB persistence."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import DBMachine, DBMachineATelemetry, DBMachineCTelemetry, DBPrediction
from app.ml.manual_prediction import predict as run_manual_prediction


def _latest_input_values(machine: DBMachine, db: Session) -> dict | None:
    if machine.machine_type == "ai4i":
        row = (
            db.query(DBMachineATelemetry)
            .filter(DBMachineATelemetry.machine_id == machine.id)
            .order_by(DBMachineATelemetry.udi.desc())
            .first()
        )
        if not row:
            return None
        return {
            "airTempK": float(row.air_temp_k or 0.0),
            "processTempK": float(row.process_temp_k or 0.0),
            "rotationalSpeed": float(row.rotational_speed or 0),
            "torque": float(row.torque or 0.0),
            "toolWear": float(row.tool_wear or 0),
            "productType": row.product_type or "L",
        }
    if machine.machine_type == "real-sensor":
        row = (
            db.query(DBMachineCTelemetry)
            .filter(DBMachineCTelemetry.machine_id == machine.id)
            .order_by(DBMachineCTelemetry.time_collected.desc())
            .first()
        )
        if not row:
            return None
        return {
            "vibrationX": float(row.vibration_x or 0.0),
            "vibrationY": float(row.vibration_y or 0.0),
            "vibrationZ": float(row.vibration_z or 0.0),
            "temperature": float(row.temperature or 0.0),
        }
    return None


def run_failure_prediction(db: Session, user_id: str, machine_id: str) -> dict:
    """Run an ML failure prediction for a machine using its latest telemetry.

    Stores the result in the predictions table and returns a structured summary.
    """
    machine = db.get(DBMachine, machine_id)
    if not machine:
        machine = db.query(DBMachine).filter(
            func.lower(DBMachine.name) == machine_id.lower()
        ).first()
    if not machine:
        return {"error": f"Machine '{machine_id}' not found"}

    values = _latest_input_values(machine, db)
    if values is None:
        return {"error": f"No telemetry available for {machine.name}"}

    try:
        result = run_manual_prediction(machine.id, machine.machine_type, values)
    except Exception as exc:
        return {"error": f"Prediction failed: {exc}"}

    prediction_id = str(uuid.uuid4())
    db.add(
        DBPrediction(
            id=prediction_id,
            machine_id=machine.id,
            generated_at=datetime.now(timezone.utc),
            horizon_hours=24,
            failure_mode=result.failureType or result.predictedLabel,
            probability=result.failureProbability,
            confidence=result.confidence,
            severity=result.severity,
            input_snapshot=values,
        )
    )
    db.commit()

    return {
        "machine_id": machine.id,
        "machine_name": machine.name,
        "machine_type": machine.machine_type,
        "prediction_id": prediction_id,
        "failure_probability": result.failureProbability,
        "failure_mode": result.failureType or result.predictedLabel,
        "predicted_label": result.predictedLabel,
        "confidence": result.confidence,
        "severity": result.severity,
        "health_score": float(machine.health_score),
        "risk_score": float(machine.risk_score),
        "status": machine.status,
    }
