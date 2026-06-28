"""Shared authentication and authorization helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import DBMachine, DBPersona, DBSession, DBUser, DBUserMachineAccess
from app.domain.schemas import UserPersona


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str
    access_role: str
    persona_id: str
    name: str
    shift: str
    plant: str
    operational_role: str

    @property
    def is_admin(self) -> bool:
        return self.access_role == "admin"


def _unauthorized(detail: str = "Authentication required.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _forbidden(detail: str = "You do not have permission to perform this action.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _parse_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise _unauthorized()

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Invalid authorization header.")

    return token.strip()


def get_user_account(db: Session, user_id: str) -> DBUser:
    account = (
        db.query(DBUser)
        .filter(DBUser.id == user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User '{user_id}' not found.")
    return account


def get_user_persona_schema(db: Session, user_id: str) -> UserPersona:
    account = get_user_account(db, user_id)
    persona = db.get(DBPersona, account.persona_id)
    if not persona:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Persona '{account.persona_id}' not found.")

    return UserPersona(
        id=account.id,
        name=persona.name,
        email=account.email,
        role=account.access_role,  # type: ignore[arg-type]
        shift=persona.shift,  # type: ignore[arg-type]
        plant=persona.plant,
    )


def get_explicit_machine_ids(db: Session, user_id: str) -> list[str]:
    rows = (
        db.query(DBUserMachineAccess)
        .filter(DBUserMachineAccess.user_id == user_id)
        .order_by(DBUserMachineAccess.machine_id.asc())
        .all()
    )
    return [row.machine_id for row in rows]


def get_visible_machine_ids(db: Session, user: AuthenticatedUser) -> Optional[list[str]]:
    if user.is_admin:
        return None
    return get_explicit_machine_ids(db, user.user_id)


def get_visible_machine_ids_for_user(db: Session, target_user_id: str) -> Optional[list[str]]:
    account = get_user_account(db, target_user_id)
    if account.access_role == "admin":
        return None
    return get_explicit_machine_ids(db, target_user_id)


def user_can_access_machine(db: Session, user: AuthenticatedUser, machine_id: str) -> bool:
    if user.is_admin:
        return db.get(DBMachine, machine_id) is not None

    return (
        db.query(DBUserMachineAccess)
        .filter(
            DBUserMachineAccess.user_id == user.user_id,
            DBUserMachineAccess.machine_id == machine_id,
        )
        .first()
        is not None
    )


def require_machine_access(db: Session, user: AuthenticatedUser, machine_id: str) -> DBMachine:
    machine = db.get(DBMachine, machine_id)
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Machine '{machine_id}' not found.")

    if not user.is_admin and machine_id not in set(get_explicit_machine_ids(db, user.user_id)):
        raise _forbidden("You do not have permission to access this machine.")

    return machine


def dedupe_machine_ids(machine_ids: Iterable[str]) -> list[str]:
    return sorted({machine_id.strip() for machine_id in machine_ids if machine_id and machine_id.strip()})


def filter_existing_machine_ids(db: Session, machine_ids: Iterable[str]) -> list[str]:
    requested_ids = dedupe_machine_ids(machine_ids)
    if not requested_ids:
        return []

    existing_ids = {
        machine_id
        for (machine_id,) in (
            db.query(DBMachine.id)
            .filter(DBMachine.id.in_(requested_ids))
            .all()
        )
    }
    return [machine_id for machine_id in requested_ids if machine_id in existing_ids]


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    token = _parse_bearer_token(authorization)
    session = db.get(DBSession, token)
    if not session:
        raise _unauthorized("Invalid or expired session.")

    account = (
        db.query(DBUser)
        .filter(DBUser.id == session.user_id)
        .first()
    )
    if not account:
        raise _unauthorized("Session user could not be resolved.")

    persona = db.get(DBPersona, account.persona_id)
    if not persona:
        raise _unauthorized("Session persona could not be resolved.")

    return AuthenticatedUser(
        user_id=account.id,
        email=account.email,
        access_role=account.access_role,
        persona_id=account.persona_id,
        name=persona.name,
        shift=persona.shift,
        plant=persona.plant,
        operational_role=persona.role,
    )


def require_admin(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if not current_user.is_admin:
        raise _forbidden("Admin access is required for this action.")
    return current_user