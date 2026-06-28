"""History events endpoint."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.auth import AuthenticatedUser, get_current_user, get_visible_machine_ids
from app.db.database import get_db
from app.db.models import DBHistoryEvent
from app.domain.schemas import HistoryEvent

router = APIRouter(prefix="/history", tags=["history"])


def _parse_machine_ids(raw_machine_ids: Optional[str]) -> list[str]:
    if not raw_machine_ids:
        return []
    return [machine_id.strip() for machine_id in raw_machine_ids.split(",") if machine_id.strip()]


@router.get("", response_model=List[HistoryEvent])
def list_history(
    user_id: Optional[str] = Query(None),
    machine_id: Optional[str] = Query(None),
    machine_ids: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(DBHistoryEvent)
    visible_machine_ids = get_visible_machine_ids(db, current_user)
    requested_machine_ids = set(_parse_machine_ids(machine_ids))

    if machine_id and machine_id != "all":
        requested_machine_ids = {machine_id}

    if current_user.is_admin:
        if user_id and user_id != "all":
            query = query.filter(DBHistoryEvent.user_id == user_id)
    else:
        query = query.filter(DBHistoryEvent.user_id == current_user.user_id)

        allowed_machine_ids = set(visible_machine_ids or [])
        if requested_machine_ids:
            requested_machine_ids &= allowed_machine_ids
        else:
            requested_machine_ids = allowed_machine_ids

        if not requested_machine_ids:
            return []

    if requested_machine_ids:
        query = query.filter(DBHistoryEvent.machine_id.in_(sorted(requested_machine_ids)))

    if type and type != "all":
        query = query.filter(DBHistoryEvent.type == type)
    if date_from:
        query = query.filter(DBHistoryEvent.timestamp >= date_from)
    if date_to:
        query = query.filter(DBHistoryEvent.timestamp <= date_to)

    events = query.order_by(DBHistoryEvent.timestamp.desc()).all()

    return [
        HistoryEvent(
            id=event.id,
            timestamp=event.timestamp,
            type=event.type,  # type: ignore[arg-type]
            machineId=event.machine_id,
            userId=event.user_id,
            title=event.title,
            description=event.description,
            severity=event.severity,  # type: ignore[arg-type]
            metadata=event.event_metadata,
        )
        for event in events
    ]
