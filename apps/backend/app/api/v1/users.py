"""User and access-management endpoints."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import (
    AuthenticatedUser,
    filter_existing_machine_ids,
    get_current_user,
    get_explicit_machine_ids,
    get_user_account,
    get_user_persona_schema,
    require_admin,
)
from app.db.database import get_db
from app.db.models import DBPersona, DBUser, DBUserMachineAccess
from app.domain.schemas import (
    MachineAccessResponse,
    UpdateMachineAccessInput,
    UpdateUserRoleInput,
    UserPersona,
)

router = APIRouter(prefix="/users", tags=["users"])


def _list_all_users(db: Session) -> list[UserPersona]:
    rows = (
        db.query(DBUser, DBPersona)
        .join(DBPersona, DBPersona.id == DBUser.persona_id)
        .order_by(DBPersona.name.asc())
        .all()
    )
    return [
        UserPersona(
            id=account.id,
            name=persona.name,
            email=account.email,
            role=account.access_role,  # type: ignore[arg-type]
            shift=persona.shift,  # type: ignore[arg-type]
            plant=persona.plant,
        )
        for account, persona in rows
    ]


@router.get("", response_model=List[UserPersona])
def list_users(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_admin:
        return _list_all_users(db)

    return [get_user_persona_schema(db, current_user.user_id)]


@router.get("/{user_id}/machine-access", response_model=MachineAccessResponse)
def get_user_machine_access(
    user_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin and current_user.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this user's machine access.",
        )

    get_user_account(db, user_id)
    return MachineAccessResponse(machineIds=get_explicit_machine_ids(db, user_id))


@router.put("/{user_id}/machine-access", response_model=MachineAccessResponse)
def update_user_machine_access(
    user_id: str,
    body: UpdateMachineAccessInput,
    _: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    get_user_account(db, user_id)
    next_machine_ids = filter_existing_machine_ids(db, body.machineIds)

    db.query(DBUserMachineAccess).filter(DBUserMachineAccess.user_id == user_id).delete()
    db.add_all(
        [
            DBUserMachineAccess(user_id=user_id, machine_id=machine_id)
            for machine_id in next_machine_ids
        ]
    )
    db.commit()

    return MachineAccessResponse(machineIds=next_machine_ids)


@router.patch("/{user_id}/role", response_model=UserPersona)
def update_user_role(
    user_id: str,
    body: UpdateUserRoleInput,
    _: AuthenticatedUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    account = get_user_account(db, user_id)

    if account.access_role == "admin" and body.role == "user":
        admin_count = (
            db.query(DBUser)
            .filter(DBUser.access_role == "admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one admin must remain in the system.",
            )

    account.access_role = body.role
    db.commit()

    return get_user_persona_schema(db, user_id)
