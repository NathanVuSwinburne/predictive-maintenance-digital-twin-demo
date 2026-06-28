"""Auth endpoints — login, MFA, logout, session validation."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import pyotp

from app.config import settings
from app.api.dependencies.auth import get_current_user, get_user_persona_schema
from app.api.dependencies.auth import AuthenticatedUser
from app.security.password import verify_password
from app.db.database import get_db
from app.db.models import (
    DBMfaBackupCode,
    DBMfaToken,
    DBPendingTotpSetup,
    DBSession,
    DBUser,
)
from app.domain.schemas import (
    LoginInput,
    LoginResult,
    LogoutInput,
    Session as SessionSchema,
    TotpBackupCodesResult,
    TotpConfirmInput,
    TotpPasswordInput,
    TotpSetupResult,
    TotpStatus,
    UserPersona,
    VerifyMfaInput,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_TOTP_CODE = "123456"
_BACKUP_CODE = "BACKUP-001"
_BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@router.post("/login", response_model=LoginResult)
def login(body: LoginInput, db: Session = Depends(get_db)):
    account = db.query(DBUser).filter(DBUser.email == body.email).first()
    password_hash = cast(str, account.password) if account else ""
    if not account or not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not account.totp_secret:
        return LoginResult(
            requiresMfa=False,
            session=_create_session(db, account.id),
        )

    mfa_token = str(uuid.uuid4())
    db.add(DBMfaToken(token=mfa_token, user_id=account.id))
    db.commit()

    return LoginResult(
        requiresMfa=True,
        mfaToken=mfa_token,
        availableMethods=_available_mfa_methods(db, account.id),
    )


@router.post("/mfa/verify", response_model=SessionSchema)
def verify_mfa(body: VerifyMfaInput, db: Session = Depends(get_db)):
    mfa = db.get(DBMfaToken, body.mfaToken)
    if not mfa:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token.")

    valid_code = False
    code = body.code.strip()

    if body.method == "totp":
        user = db.get(DBUser, mfa.user_id)
        totp_secret = user.totp_secret if user else None
        totp = pyotp.TOTP(totp_secret) if totp_secret else None

        valid_code = bool(totp and totp.verify(code.replace(" ", "")))
    elif body.method == "backup-code":
        backup_code_value = code.replace(" ", "").upper()
        backup_code = (
            db.query(DBMfaBackupCode)
            .filter(
                DBMfaBackupCode.user_id == mfa.user_id,
                DBMfaBackupCode.code == backup_code_value,
                DBMfaBackupCode.used == False,
            )
            .first()
        )
        if backup_code:
            valid_code = True
            backup_code.used = True  # Mark this backup code as used
            db.add(backup_code)
            db.commit()

    if (
        not valid_code
        and settings.testing
        and (code == _TOTP_CODE or code.upper() == _BACKUP_CODE)
    ):
        valid_code = True
        logger.warning(
            "TEST MODE: Accepting hardcoded MFA code '%s' for method '%s' in testing mode. This should not be used in production.",
            body.code,
            body.method,
        )

    if not valid_code:
        raise HTTPException(status_code=401, detail="Invalid MFA code.")

    user_id = mfa.user_id

    # Consume the MFA token
    db.delete(mfa)
    db.commit()

    return _create_session(db, user_id)


@router.post("/logout", status_code=204)
def logout(body: LogoutInput, db: Session = Depends(get_db)):

    session = db.get(DBSession, body.token)
    if session:
        db.delete(session)
        db.commit()
    return None


@router.get("/session", response_model=Optional[SessionSchema])
def get_session(token: str = Query(...), db: Session = Depends(get_db)):
    session = db.get(DBSession, token)
    if not session:
        return None
    return SessionSchema(
        token=session.token,
        userId=session.user_id,
        activePersonaId=session.active_persona_id,
        authenticatedAt=session.authenticated_at,
    )


@router.get("/me", response_model=UserPersona)
def get_current_account(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_persona_schema(db, current_user.user_id)


@router.get("/totp", response_model=TotpStatus)
def get_totp_status(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.get(DBUser, current_user.user_id)
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")

    return _totp_status_for_user(db, account)


@router.post("/totp/setup", response_model=TotpSetupResult)
def setup_totp(
    body: TotpPasswordInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _verify_current_password(db, current_user.user_id, body.password)

    if account.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP is already enabled.")

    (
        db.query(DBPendingTotpSetup)
        .filter(DBPendingTotpSetup.user_id == current_user.user_id)
        .delete(synchronize_session=False)
    )

    secret = pyotp.random_base32()
    setup_token = str(uuid.uuid4())
    db.add(
        DBPendingTotpSetup(
            token=setup_token,
            user_id=current_user.user_id,
            secret=secret,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    otpauth_uri = pyotp.TOTP(secret).provisioning_uri(
        name=account.email,
        issuer_name="Predictive Maintenance Digital Twin",
    )

    return TotpSetupResult(
        setupToken=setup_token,
        secret=secret,
        otpauthUri=otpauth_uri,
    )


@router.post("/totp/confirm", response_model=TotpBackupCodesResult)
def confirm_totp(
    body: TotpConfirmInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pending_setup = db.get(DBPendingTotpSetup, body.setupToken)
    if (
        not pending_setup
        or pending_setup.user_id != current_user.user_id
        or datetime.now(timezone.utc) - pending_setup.created_at > timedelta(minutes=30)
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired TOTP setup.")

    totp = pyotp.TOTP(pending_setup.secret)
    if not totp.verify(body.code.strip().replace(" ", "")):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")

    account = db.get(DBUser, current_user.user_id)
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")

    account.totp_secret = pending_setup.secret
    backup_codes = _replace_backup_codes(db, current_user.user_id)
    db.delete(pending_setup)
    db.add(account)
    db.commit()

    return TotpBackupCodesResult(
        backupCodes=backup_codes,
        backupCodeCount=len(backup_codes),
        unusedBackupCodeCount=len(backup_codes),
    )


@router.post("/totp/disable", response_model=TotpStatus)
def disable_totp(
    body: TotpPasswordInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _verify_current_password(db, current_user.user_id, body.password)

    account.totp_secret = None
    db.add(account)
    _delete_backup_codes(db, current_user.user_id)
    _delete_pending_setups(db, current_user.user_id)
    _delete_mfa_tokens(db, current_user.user_id)
    db.commit()

    return _totp_status_for_user(db, account)


@router.post("/totp/backup-codes/regenerate", response_model=TotpBackupCodesResult)
def regenerate_totp_backup_codes(
    body: TotpPasswordInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _verify_current_password(db, current_user.user_id, body.password)

    if not account.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP is not enabled.")

    backup_codes = _replace_backup_codes(db, current_user.user_id)
    db.commit()

    return TotpBackupCodesResult(
        backupCodes=backup_codes,
        backupCodeCount=len(backup_codes),
        unusedBackupCodeCount=len(backup_codes),
    )


def _persona_for_user(db: Session, user_id: str) -> str:
    user = db.get(DBUser, user_id)
    return user.persona_id if user else ""


def _create_session(db: Session, user_id: str) -> SessionSchema:
    persona_id = _persona_for_user(db, user_id)

    if not persona_id or persona_id == "":
        raise HTTPException(status_code=500, detail="User persona not found.")

    session_token = str(uuid.uuid4())
    authenticated_at = datetime.now(timezone.utc).isoformat()
    db.add(
        DBSession(
            token=session_token,
            user_id=user_id,
            active_persona_id=persona_id,
            authenticated_at=authenticated_at,
        )
    )
    db.commit()

    return SessionSchema(
        token=session_token,
        userId=user_id,
        activePersonaId=persona_id,
        authenticatedAt=authenticated_at,
    )


def _available_mfa_methods(
    db: Session,
    user_id: str,
) -> list[Literal["totp", "backup-code"]]:
    methods: list[Literal["totp", "backup-code"]] = ["totp"]
    unused_backup_codes = (
        db.query(DBMfaBackupCode)
        .filter(
            DBMfaBackupCode.user_id == user_id,
            DBMfaBackupCode.used == False,
        )
        .count()
    )
    if unused_backup_codes > 0:
        methods.append("backup-code")
    return methods


def _totp_status_for_user(db: Session, account: DBUser) -> TotpStatus:
    backup_code_count = (
        db.query(DBMfaBackupCode).filter(DBMfaBackupCode.user_id == account.id).count()
    )
    unused_backup_code_count = (
        db.query(DBMfaBackupCode)
        .filter(
            DBMfaBackupCode.user_id == account.id,
            DBMfaBackupCode.used == False,
        )
        .count()
    )

    return TotpStatus(
        enabled=bool(account.totp_secret),
        backupCodeCount=backup_code_count,
        unusedBackupCodeCount=unused_backup_code_count,
    )


def _verify_current_password(db: Session, user_id: str, password: str) -> DBUser:
    account = db.get(DBUser, user_id)
    if not account:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(password, cast(str, account.password)):
        raise HTTPException(status_code=401, detail="Invalid password.")

    return account


def _generate_backup_code() -> str:
    parts = [
        "".join(secrets.choice(_BACKUP_CODE_ALPHABET) for _ in range(4))
        for _ in range(3)
    ]
    return "-".join(parts)


def _replace_backup_codes(db: Session, user_id: str) -> list[str]:
    _delete_backup_codes(db, user_id)
    backup_codes: list[str] = []

    while len(backup_codes) < 10:
        code = _generate_backup_code()
        if code not in backup_codes:
            backup_codes.append(code)

    db.add_all(
        [
            DBMfaBackupCode(user_id=user_id, code=code, used=False)
            for code in backup_codes
        ]
    )
    return backup_codes


def _delete_backup_codes(db: Session, user_id: str) -> None:
    (
        db.query(DBMfaBackupCode)
        .filter(DBMfaBackupCode.user_id == user_id)
        .delete(synchronize_session=False)
    )


def _delete_pending_setups(db: Session, user_id: str) -> None:
    (
        db.query(DBPendingTotpSetup)
        .filter(DBPendingTotpSetup.user_id == user_id)
        .delete(synchronize_session=False)
    )


def _delete_mfa_tokens(db: Session, user_id: str) -> None:
    (
        db.query(DBMfaToken)
        .filter(DBMfaToken.user_id == user_id)
        .delete(synchronize_session=False)
    )
