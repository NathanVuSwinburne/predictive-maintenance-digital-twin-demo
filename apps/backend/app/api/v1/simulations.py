"""Simulation endpoints for session-based Machine C forecasting."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    AuthenticatedUser,
    get_current_user,
    get_visible_machine_ids,
    require_machine_access,
)
from app.db.database import get_db
from app.db.models import DBHistoryEvent, DBMachine, DBSimulationRun
from app.domain.schemas import (
    SimulationConfig,
    SimulationRun,
    SimulationScenarioInput,
    SimulationSessionPreview,
)
from app.ml.machine_c_simulation import (
    MachineCSimulationUnavailableError,
    get_simulation_config,
    get_session_preview,
    run_session_simulation,
)

router = APIRouter(prefix="/simulations", tags=["simulations"])


def _is_machine_c_type(machine_type: str) -> bool:
    return machine_type == "real-sensor"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _risk_to_label(risk: float) -> str:
    if risk >= 75:
        return "critical"
    if risk >= 50:
        return "high"
    if risk >= 25:
        return "medium"
    return "low"


def _metadata_for_run(db: Session, run_id: str) -> dict:
    events = (
        db.query(DBHistoryEvent)
        .filter(DBHistoryEvent.type == "simulation-run")
        .order_by(DBHistoryEvent.timestamp.desc())
        .all()
    )
    for event in events:
        if (
            isinstance(event.event_metadata, dict)
            and event.event_metadata.get("simulation_run_id") == run_id
        ):
            return event.event_metadata
    return {}


def _result_payload_from_runtime_result(result: dict) -> dict:
    return {
        "projectedLabel": result.get("projected_label"),
        "failureProbability": result.get("failure_probability"),
        "selectedSessionId": result.get("selected_session_id"),
        "syntheticContinuationUsed": result.get("synthetic_continuation_used"),
        "generatedReadings": result.get("generated_readings"),
        "sourceReadings": result.get("source_readings"),
        "sourceWindow": result.get("source_window"),
        "sensorFields": result.get("sensor_fields"),
        "sensorChartGroups": result.get("sensor_chart_groups"),
        "simulationHorizonMinutes": result.get("simulation_horizon_minutes"),
        "simulationStatus": result.get("simulation_status"),
        "simulationMessage": result.get("simulation_message"),
        "classificationWindows": result.get("classification_windows"),
    }


def _result_payload_from_history_metadata(metadata: dict | None) -> dict:
    details = metadata or {}
    return {
        "projectedLabel": details.get("projected_label"),
        "failureProbability": details.get("failure_probability"),
        "selectedSessionId": details.get("selected_session_id")
        or details.get("session_id"),
        "syntheticContinuationUsed": details.get("synthetic_continuation_used")
        or details.get("synthetic_context"),
        "generatedReadings": details.get("generated_readings"),
        "sourceReadings": details.get("source_readings"),
        "sourceWindow": details.get("source_window"),
        "sensorFields": details.get("sensor_fields"),
        "sensorChartGroups": details.get("sensor_chart_groups"),
        "simulationHorizonMinutes": details.get("simulation_horizon_minutes"),
        "simulationStatus": details.get("simulation_status"),
        "simulationMessage": details.get("simulation_message"),
        "classificationWindows": details.get("classification_windows"),
    }


def _simulation_run_response(
    run: DBSimulationRun, metadata: dict | None = None
) -> SimulationRun:
    payload = run.result_payload or _result_payload_from_history_metadata(metadata)
    return SimulationRun(
        id=run.id,
        machineId=run.machine_id,
        userId=run.user_id,
        createdAt=run.created_at,
        scenarioName=run.scenario_name,
        projectedRisk=run.projected_risk,
        projectedDowntimeHours=run.projected_downtime_hours,
        summary=run.summary,
        recommendations=run.recommendations,
        projectedLabel=payload.get("projectedLabel"),
        failureProbability=payload.get("failureProbability"),
        selectedSessionId=payload.get("selectedSessionId"),
        syntheticContinuationUsed=payload.get("syntheticContinuationUsed"),
        generatedReadings=payload.get("generatedReadings"),
        sourceReadings=payload.get("sourceReadings"),
        sourceWindow=payload.get("sourceWindow"),
        sensorFields=payload.get("sensorFields"),
        sensorChartGroups=payload.get("sensorChartGroups"),
        simulationHorizonMinutes=payload.get("simulationHorizonMinutes"),
        simulationStatus=payload.get("simulationStatus"),
        simulationMessage=payload.get("simulationMessage"),
        classificationWindows=payload.get("classificationWindows"),
    )


@router.get("", response_model=List[SimulationRun])
def list_simulations(
    user_id: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DBSimulationRun)

    if current_user.is_admin:
        if user_id:
            query = query.filter(DBSimulationRun.user_id == user_id)
    else:
        visible_machine_ids = get_visible_machine_ids(db, current_user) or []
        if not visible_machine_ids:
            return []
        query = query.filter(DBSimulationRun.user_id == current_user.user_id)
        query = query.filter(DBSimulationRun.machine_id.in_(visible_machine_ids))

    runs = query.order_by(DBSimulationRun.created_at.desc()).all()
    return [_simulation_run_response(run, _metadata_for_run(db, run.id)) for run in runs]


@router.get("/config/{machine_id}", response_model=SimulationConfig)
def get_machine_c_simulation_config(
    machine_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)
    if not _is_machine_c_type(machine.machine_type):
        raise HTTPException(
            status_code=400,
            detail="Simulation is currently available for Machine C only.",
        )

    try:
        return get_simulation_config(machine_id=machine.id, db=db)
    except MachineCSimulationUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/config/{machine_id}/sessions/{session_id}/preview",
    response_model=SimulationSessionPreview,
)
def get_machine_c_session_preview(
    machine_id: str,
    session_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)
    if not _is_machine_c_type(machine.machine_type):
        raise HTTPException(
            status_code=400,
            detail="Simulation is currently available for Machine C only.",
        )

    try:
        return get_session_preview(machine_id=machine.id, session_id=session_id, db=db)
    except MachineCSimulationUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/run", response_model=SimulationRun)
def run_simulation(
    body: SimulationScenarioInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, body.machineId)
    if not _is_machine_c_type(machine.machine_type):
        raise HTTPException(
            status_code=400,
            detail="Simulation is currently available for Machine C only.",
        )

    try:
        result = run_session_simulation(body, db)
    except MachineCSimulationUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    run_id = str(uuid.uuid4())
    result_payload = _result_payload_from_runtime_result(result)
    result_metadata = {
        "simulation_run_id": run_id,
        "projected_risk": float(result["projected_risk"]),
        "projected_label": result.get("projected_label"),
        "session_id": body.sessionId,
        "synthetic_context": bool(result.get("synthetic_continuation_used")),
        "failure_probability": result.get("failure_probability"),
        "selected_session_id": result.get("selected_session_id"),
        "synthetic_continuation_used": result.get("synthetic_continuation_used"),
        "generated_readings": result.get("generated_readings"),
        "source_readings": result.get("source_readings"),
        "source_window": result.get("source_window"),
        "sensor_fields": result.get("sensor_fields"),
        "sensor_chart_groups": result.get("sensor_chart_groups"),
        "simulation_horizon_minutes": result.get("simulation_horizon_minutes"),
        "simulation_status": result.get("simulation_status"),
        "simulation_message": result.get("simulation_message"),
        "classification_windows": result.get("classification_windows"),
    }
    run_obj = DBSimulationRun(
        id=run_id,
        machine_id=body.machineId,
        user_id=current_user.user_id,
        created_at=_now(),
        scenario_name=body.scenarioName,
        projected_risk=result["projected_risk"],
        projected_downtime_hours=result["projected_downtime_hours"],
        summary=result["summary"],
        recommendations=result["recommendations"],
        result_payload=result_payload,
    )
    db.add(run_obj)
    db.add(
        DBHistoryEvent(
            id=str(uuid.uuid4()),
            timestamp=_now(),
            type="simulation-run",
            machine_id=body.machineId,
            user_id=current_user.user_id,
            title=f"Simulation: {body.scenarioName}",
            description=result["summary"],
            severity=_risk_to_label(float(result["projected_risk"])),
            event_metadata=result_metadata,
        )
    )
    db.commit()

    return _simulation_run_response(run_obj)
