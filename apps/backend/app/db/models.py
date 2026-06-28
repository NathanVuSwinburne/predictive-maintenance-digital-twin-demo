"""SQLAlchemy ORM models for all database tables."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class DBPersona(Base):
    __tablename__ = "personas"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    shift = Column(String, nullable=False)
    plant = Column(String, nullable=False)


class DBUser(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    persona_id = Column(
        String, ForeignKey("personas.id"), nullable=False, unique=True, index=True
    )
    access_role = Column(String, nullable=False, index=True)
    totp_secret = Column(String, nullable=True)  # For MFA; null means MFA not enabled


class DBUserMachineAccess(Base):
    __tablename__ = "user_machine_access"
    __table_args__ = (
        UniqueConstraint("user_id", "machine_id", name="uq_user_machine_access"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)


class DBMachine(Base):
    __tablename__ = "machines"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    line = Column(String, nullable=False)
    model = Column(String, nullable=False)
    status = Column(String, nullable=False)
    health_score = Column(Float, nullable=False)
    risk_score = Column(Float, nullable=False)
    last_service_date = Column(String, nullable=False)
    next_service_date = Column(String, nullable=False)
    uptime_percent = Column(Float, nullable=False)
    location = Column(String, nullable=False)
    operating_hours = Column(Float, nullable=False)
    primary_failure_modes = Column(JSON, nullable=False)
    notes = Column(Text, nullable=False)
    # Identifies which dataset backs this virtual machine
    # Values: 'ai4i' | 'synthetic' | 'real-sensor' | 'generic'
    machine_type = Column(String, nullable=False, default="generic")


# ---------------------------------------------------------------------------
# Dataset-specific telemetry tables (replaces the old generic `telemetry` table)
# ---------------------------------------------------------------------------


class DBMachineATelemetry(Base):
    """AI4I 2020 predictive maintenance dataset — no timestamp, multi-label failure."""

    __tablename__ = "machine_a_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    udi = Column(Integer, nullable=True)  # original row identifier (1–9999)
    product_id = Column(String, nullable=True)
    product_type = Column(String(1), nullable=True)  # L / M / H
    air_temp_k = Column(Float, nullable=True)
    process_temp_k = Column(Float, nullable=True)
    rotational_speed = Column(Integer, nullable=True)
    torque = Column(Float, nullable=True)
    tool_wear = Column(Integer, nullable=True)
    machine_failure = Column(Boolean, nullable=True)
    failure_twf = Column(Boolean, nullable=True)
    failure_hdf = Column(Boolean, nullable=True)
    failure_pwf = Column(Boolean, nullable=True)
    failure_osf = Column(Boolean, nullable=True)
    failure_rnf = Column(Boolean, nullable=True)


class DBMachineBTelemetry(Base):
    """Client sensor dataset — time-series, single machine, binary failure label."""

    __tablename__ = "machine_b_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    timestamp = Column(String, nullable=False, index=True)
    temperature = Column(Float, nullable=True)
    pressure = Column(Float, nullable=True)
    vibration_level = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    power_consumption = Column(Float, nullable=True)
    failure_status = Column(Boolean, nullable=True)


class DBMachineCTelemetry(Base):
    """Machine C real sensor dataset — high-frequency 3-axis vibration, ordinal risk label."""

    __tablename__ = "machine_c_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    session_id = Column(Integer, nullable=True)
    vibration_x = Column(Float, nullable=True)
    vibration_y = Column(Float, nullable=True)
    vibration_z = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    time_collected = Column(
        String, nullable=False, index=True
    )  # millisecond precision ISO string
    risk_label = Column(String(16), nullable=True)  # 'low' | 'medium' | 'high' | 'unknown'


class DBMachineCSimulationTelemetry(Base):
    """Machine C augmented simulation dataset — real + synthetic rows by session."""

    __tablename__ = "machine_c_simulation_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    session_id = Column(Integer, nullable=False, index=True)
    vibration_x = Column(Float, nullable=True)
    vibration_y = Column(Float, nullable=True)
    vibration_z = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    time_collected = Column(String, nullable=False, index=True)
    vibration_magnitude = Column(Float, nullable=True)
    time_delta_s = Column(Float, nullable=True)
    within_session_idx = Column(Integer, nullable=True)
    risk_label = Column(String(16), nullable=True)
    synthetic = Column(Boolean, nullable=False, default=False)


class DBPrediction(Base):
    __tablename__ = "predictions"

    id = Column(String, primary_key=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    generated_at = Column(DateTime(timezone=True), nullable=False, index=True)
    horizon_hours = Column(Integer, nullable=False)
    failure_mode = Column(String, nullable=False)
    probability = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    severity = Column(String, nullable=False)
    input_snapshot = Column(JSON, nullable=True)


class DBRecommendation(Base):
    __tablename__ = "recommendations"

    id = Column(String, primary_key=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    detail = Column(Text, nullable=False)
    action_type = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    eta_minutes = Column(Integer, nullable=False)
    estimated_downtime_hours = Column(Float, nullable=False)


class DBHistoryEvent(Base):
    __tablename__ = "history_events"

    id = Column(String, primary_key=True)
    timestamp = Column(String, nullable=False)
    type = Column(String, nullable=False)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String, nullable=False)
    # "metadata" shadows SQLAlchemy's DeclarativeBase.metadata — use column alias
    event_metadata = Column("metadata", JSON, nullable=True)


class DBChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=True, index=True)
    updated_at = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    prompt_suggestions = Column(JSON, nullable=False)
    follow_up_suggestions = Column(JSON, nullable=False)
    working_memory = Column(JSON, nullable=True)


class DBChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True)
    thread_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    content_blocks = Column(JSON, nullable=False)
    agent_trace = Column(JSON, nullable=True)


class DBMfaToken(Base):
    __tablename__ = "mfa_tokens"

    token = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)


class DBPendingTotpSetup(Base):
    __tablename__ = "pending_totp_setups"

    token = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    secret = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)


class DBMfaBackupCode(Base):
    __tablename__ = "mfa_backup_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String, nullable=False)
    used = Column(Boolean, nullable=False, default=False)


class DBSession(Base):
    __tablename__ = "sessions"

    token = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    active_persona_id = Column(
        String, ForeignKey("personas.id"), nullable=False, index=True
    )
    authenticated_at = Column(String, nullable=False)


class DBSimulationRun(Base):
    __tablename__ = "simulations"

    id = Column(String, primary_key=True)
    machine_id = Column(String, ForeignKey("machines.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(String, nullable=False)
    scenario_name = Column(String, nullable=False)
    projected_risk = Column(Float, nullable=False)
    projected_downtime_hours = Column(Float, nullable=False)
    summary = Column(Text, nullable=False)
    recommendations = Column(JSON, nullable=False)
    result_payload = Column(JSON, nullable=True)
