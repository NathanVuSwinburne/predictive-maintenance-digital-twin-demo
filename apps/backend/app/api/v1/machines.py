"""Machine endpoints — list, detail, telemetry, predictions, recommendations."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    AuthenticatedUser,
    get_current_user,
    get_user_account,
    get_user_persona_schema,
    get_visible_machine_ids,
    get_visible_machine_ids_for_user,
    require_admin,
    require_machine_access,
)
from app.db.database import get_db
from app.db.models import (
    DBMachine,
    DBMachineATelemetry,
    DBMachineBTelemetry,
    DBMachineCTelemetry,
    DBPrediction,
    DBRecommendation,
    DBUserMachineAccess,
)
from app.domain.schemas import (
    ManualPredictionInput,
    ManualPredictionResult,
    MachineDetail,
    MachineSummary,
    MaintenanceRecommendation,
    Prediction,
    PredictionConfig,
    TelemetryPoint,
    UserPersona,
)
from app.ml.inference import MLNotAvailableError, run_prediction
from app.ml.manual_prediction import get_prediction_config, predict as run_manual_prediction
from app.ml.schemas import MLInput

router = APIRouter(prefix="/machines", tags=["machines"])


def _is_machine_c_type(machine_type: str) -> bool:
    return machine_type == "real-sensor"


def _to_summary(m: DBMachine) -> MachineSummary:
    return MachineSummary(
        id=m.id,
        name=m.name,
        line=m.line,
        model=m.model,
        machineType=m.machine_type,
        status=m.status,
        healthScore=m.health_score,
        riskScore=m.risk_score,
        lastServiceDate=m.last_service_date,
        nextServiceDate=m.next_service_date,
        uptimePercent=m.uptime_percent,
    )


def _to_detail(m: DBMachine) -> MachineDetail:
    return MachineDetail(
        id=m.id,
        name=m.name,
        line=m.line,
        model=m.model,
        machineType=m.machine_type,
        status=m.status,
        healthScore=m.health_score,
        riskScore=m.risk_score,
        lastServiceDate=m.last_service_date,
        nextServiceDate=m.next_service_date,
        uptimePercent=m.uptime_percent,
        location=m.location,
        operatingHours=m.operating_hours,
        primaryFailureModes=m.primary_failure_modes,
        notes=m.notes,
    )


def _scoped_machine_query(
    db: Session,
    current_user: AuthenticatedUser,
    authorized_for_user_id: Optional[str],
):
    query = db.query(DBMachine)
    visible_machine_ids = get_visible_machine_ids(db, current_user)

    if visible_machine_ids is not None:
        if not visible_machine_ids:
            return query.filter(DBMachine.id.in_(["__none__"]))
        query = query.filter(DBMachine.id.in_(visible_machine_ids))

    if authorized_for_user_id and current_user.is_admin:
        get_user_account(db, authorized_for_user_id)
        target_machine_ids = get_visible_machine_ids_for_user(db, authorized_for_user_id)
        if target_machine_ids is not None:
            if not target_machine_ids:
                return query.filter(DBMachine.id.in_(["__none__"]))
            query = query.filter(DBMachine.id.in_(target_machine_ids))

    return query


# ---------------------------------------------------------------------------
# List machines
# ---------------------------------------------------------------------------

@router.get("", response_model=List[MachineSummary])
def list_machines(
    search: Optional[str] = Query(None),
    line: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: Optional[str] = Query(None),
    sort_direction: Optional[str] = Query("asc"),
    authorized_for_user_id: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machines = _scoped_machine_query(db, current_user, authorized_for_user_id).all()

    if search:
        s = search.lower()
        machines = [
            machine
            for machine in machines
            if s in machine.name.lower() or s in machine.model.lower() or s in machine.id.lower() or s in machine.line.lower()
        ]

    if line and line != "all":
        machines = [machine for machine in machines if machine.line.lower() == line.lower()]

    if status_filter and status_filter != "all":
        machines = [machine for machine in machines if machine.status == status_filter]

    reverse = sort_direction == "desc"
    if sort_by == "risk":
        machines.sort(key=lambda machine: machine.risk_score, reverse=reverse)
    elif sort_by == "health":
        machines.sort(key=lambda machine: machine.health_score, reverse=reverse)
    elif sort_by == "name":
        machines.sort(key=lambda machine: machine.name, reverse=reverse)
    elif sort_by == "uptime":
        machines.sort(key=lambda machine: machine.uptime_percent, reverse=reverse)

    return [_to_summary(machine) for machine in machines]


# ---------------------------------------------------------------------------
# Machine detail
# ---------------------------------------------------------------------------

@router.get("/{machine_id}", response_model=MachineDetail)
def get_machine(
    machine_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)
    return _to_detail(machine)


# ---------------------------------------------------------------------------
# Telemetry — routed by machine_type to dataset-specific tables
# ---------------------------------------------------------------------------

@router.get("/{machine_id}/telemetry", response_model=List[TelemetryPoint])
def get_telemetry(machine_id: str, current_user: AuthenticatedUser = Depends(get_current_user), db: Session = Depends(get_db)):
    machine = require_machine_access(db, current_user, machine_id)

    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found.")

    if machine.machine_type == "ai4i":
        # Machine A: no timestamp — proxy common fields from AI4I sensor columns
        points = (
            db.query(DBMachineATelemetry)
            .filter(DBMachineATelemetry.machine_id == machine_id)
            .order_by(DBMachineATelemetry.udi)
            .all()
        )
        return [
            TelemetryPoint(
                timestamp=f"row-{p.udi}",
                temperature=p.air_temp_k or 0.0,
                vibration=round((p.torque or 0.0) / 10.0, 3),  # torque scaled as vibration proxy
                pressure=p.process_temp_k or 0.0,
                power=float(p.rotational_speed or 0),
            )
            for p in points
        ]

    if machine.machine_type == "synthetic":
        # Machine B: time-series with natural field mapping
        points = (
            db.query(DBMachineBTelemetry)
            .filter(DBMachineBTelemetry.machine_id == machine_id)
            .order_by(DBMachineBTelemetry.timestamp)
            .all()
        )
        return [
            TelemetryPoint(
                timestamp=p.timestamp,
                temperature=p.temperature or 0.0,
                vibration=p.vibration_level or 0.0,
                pressure=p.pressure or 0.0,
                power=p.power_consumption or 0.0,
            )
            for p in points
        ]

    if _is_machine_c_type(machine.machine_type):
        # Machine C: high-frequency 3-axis vibration — aggregate vibration axes
        points = (
            db.query(DBMachineCTelemetry)
            .filter(DBMachineCTelemetry.machine_id == machine_id)
            .order_by(DBMachineCTelemetry.time_collected)
            .all()
        )
        return [
            TelemetryPoint(
                timestamp=p.time_collected,
                temperature=p.temperature or 0.0,
                vibration=round(((p.vibration_x or 0) + (p.vibration_y or 0) + (p.vibration_z or 0)) / 3.0, 4),
                pressure=0.0,  # not available in this dataset
                power=0.0,     # not available in this dataset
            )
            for p in points
        ]

    raise HTTPException(status_code=400, detail=f"Unknown machine_type '{machine.machine_type}' for machine '{machine_id}'.")


# ---------------------------------------------------------------------------
# Predictions (ML-backed with graceful stub) — routed by machine_type
# ---------------------------------------------------------------------------

def _latest_ml_input(machine: DBMachine, db: Session) -> MLInput | None:
    """Live runtime prediction is not exposed through this endpoint."""
    return None


def _manual_prediction_supported(machine: DBMachine) -> bool:
    return machine.machine_type == "ai4i" or _is_machine_c_type(machine.machine_type)

@router.get("/{machine_id}/predictions", response_model=List[Prediction])
def get_predictions(machine_id: str, current_user: AuthenticatedUser = Depends(get_current_user), db: Session = Depends(get_db)):
    machine = require_machine_access(db, current_user, machine_id)
    
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found.")

    # Attempt live ML inference using latest telemetry point (where applicable)
    ml_inp = _latest_ml_input(machine, db)
    if ml_inp:
        try:
            result = run_prediction(ml_inp)
            now_str = datetime.now(timezone.utc).isoformat()
            return [Prediction(
                id=str(uuid.uuid4()),
                machineId=machine_id,
                generatedAt=now_str,
                horizonHours=24,
                failureMode=result.failure_type,
                probability=result.failure_probability,
                confidence=result.confidence,
                severity=result.severity,  # type: ignore[arg-type]
            )]
        except MLNotAvailableError:
            pass  # fall through to seeded predictions

    # Return seeded / static predictions
    seeded = (
        db.query(DBPrediction)
        .filter(DBPrediction.machine_id == machine_id)
        .order_by(DBPrediction.generated_at.desc())
        .all()
    )
    return [
        Prediction(
            id=p.id,
            machineId=p.machine_id,
            generatedAt=p.generated_at.isoformat() if hasattr(p.generated_at, "isoformat") else str(p.generated_at),
            horizonHours=p.horizon_hours, failureMode=p.failure_mode,
            probability=p.probability, confidence=p.confidence,
            severity=p.severity,  # type: ignore[arg-type]
        )
        for p in seeded
    ]


@router.get("/{machine_id}/prediction-config", response_model=PredictionConfig)
def get_manual_prediction_config(
    machine_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)
    if not _manual_prediction_supported(machine):
        raise HTTPException(
            status_code=400,
            detail=f"Manual prediction is not supported for machine '{machine_id}'.",
        )

    try:
        return get_prediction_config(machine_id=machine.id, machine_type=machine.machine_type)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/{machine_id}/predict", response_model=ManualPredictionResult)
def predict_from_manual_input(
    machine_id: str,
    body: ManualPredictionInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)
    if not _manual_prediction_supported(machine):
        raise HTTPException(
            status_code=400,
            detail=f"Manual prediction is not supported for machine '{machine_id}'.",
        )

    try:
        return run_manual_prediction(
            machine_id=machine.id,
            machine_type=machine.machine_type,
            values=body.values,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except MLNotAvailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Missing required prediction field: {exc.args[0]}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

@router.get("/{machine_id}/recommendations", response_model=List[MaintenanceRecommendation])
def get_recommendations(
    machine_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    machine = require_machine_access(db, current_user, machine_id)

    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found.")

    recs = db.query(DBRecommendation).filter(DBRecommendation.machine_id == machine_id).all()
    return [
        MaintenanceRecommendation(
            id=r.id, machineId=r.machine_id, title=r.title, detail=r.detail,
            actionType=r.action_type, priority=r.priority,  # type: ignore[arg-type]
            etaMinutes=r.eta_minutes, estimatedDowntimeHours=r.estimated_downtime_hours,
        )
        for r in recs
    ]


# ---------------------------------------------------------------------------
# Authorized users for machine (admin-only)
# ---------------------------------------------------------------------------

@router.get("/{machine_id}/users", response_model=List[UserPersona])
def get_machine_authorized_users(
    machine_id: str,
    _: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    machine = db.get(DBMachine, machine_id)
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine '{machine_id}' not found.",
        )

    rows = (
        db.query(DBUserMachineAccess)
        .filter(DBUserMachineAccess.machine_id == machine_id)
        .order_by(DBUserMachineAccess.user_id.asc())
        .all()
    )
    return [get_user_persona_schema(db, row.user_id) for row in rows]
