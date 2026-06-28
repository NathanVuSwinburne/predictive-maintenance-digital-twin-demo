"""Simulation tool — runs Machine C session simulation with DB persistence."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import DBHistoryEvent, DBMachine, DBSimulationRun
from app.domain.schemas import SimulationScenarioInput
from app.ml.machine_c_simulation import get_simulation_config, run_session_simulation


def _severity_for_risk(risk: float) -> str:
    if risk >= 80:
        return "critical"
    if risk >= 65:
        return "high"
    if risk >= 45:
        return "medium"
    return "low"


def _choose_session(config, session_id: Optional[int] = None):
    if session_id is not None:
        for s in config.sessions:
            if int(s.sessionId) == session_id:
                return s
    return (
        next((s for s in config.sessions if getattr(s, "label", None) == "high"), None)
        or next(
            (s for s in config.sessions if not getattr(s, "usesSyntheticContinuation", False)),
            None,
        )
        or (config.sessions[0] if config.sessions else None)
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_simulation(
    db: Session,
    user_id: str,
    machine_id: str,
    horizon_minutes: int = 30,
    session_id: Optional[int] = None,
    scenario_name: Optional[str] = None,
) -> dict:
    """Run a Machine C simulation session and store the result.

    Only available for Machine C (real-sensor machine type).
    """
    machine = db.get(DBMachine, machine_id)
    if not machine:
        machine = db.query(DBMachine).filter(
            func.lower(DBMachine.name) == machine_id.lower()
        ).first()
    if not machine:
        return {"error": f"Machine '{machine_id}' not found"}
    if machine.machine_type != "real-sensor":
        return {
            "error": (
                "Simulation is only available for Machine C (real-sensor type). "
                "I can run a failure prediction for this machine instead."
            )
        }

    config = get_simulation_config(machine.id, db)
    session = _choose_session(config, session_id)
    if session is None:
        return {"error": "No simulation sessions available for this machine"}

    horizon_minutes = max(1, min(240, horizon_minutes))
    name = scenario_name or f"{machine.name} agent simulation"

    body = SimulationScenarioInput(
        machineId=machine.id,
        scenarioName=name,
        sessionId=int(session.sessionId),
        simulationHorizonMinutes=horizon_minutes,
    )

    try:
        result = run_session_simulation(body, db)
    except Exception as exc:
        return {"error": f"Simulation failed: {exc}"}

    run_id = str(uuid.uuid4())
    projected_risk = float(result["projected_risk"])
    downtime_hours = float(result.get("projected_downtime_hours", 0))

    db.add(
        DBSimulationRun(
            id=run_id,
            machine_id=machine.id,
            user_id=user_id,
            created_at=_now(),
            scenario_name=name,
            projected_risk=projected_risk,
            projected_downtime_hours=downtime_hours,
            summary=str(result.get("summary", "")),
            recommendations=list(result.get("recommendations", [])),
        )
    )
    db.add(
        DBHistoryEvent(
            id=str(uuid.uuid4()),
            timestamp=_now(),
            type="simulation-run",
            machine_id=machine.id,
            user_id=user_id,
            title=f"Simulation: {name}",
            description=str(result.get("summary", "")),
            severity=_severity_for_risk(projected_risk),
            event_metadata={"simulation_run_id": run_id},
        )
    )
    db.commit()

    return {
        "machine_id": machine.id,
        "machine_name": machine.name,
        "run_id": run_id,
        "scenario_name": name,
        "session_id": int(session.sessionId),
        "horizon_minutes": horizon_minutes,
        "baseline_risk": float(machine.risk_score),
        "simulated_risk": projected_risk,
        "risk_delta": round(projected_risk - float(machine.risk_score), 2),
        "downtime_hours": downtime_hours,
        "failure_probability": result.get("failure_probability"),
        "projected_label": result.get("projected_label"),
        "summary": str(result.get("summary", "")),
        "recommendations": list(result.get("recommendations", [])),
        "synthetic_used": bool(result.get("synthetic_continuation_used", False)),
    }
