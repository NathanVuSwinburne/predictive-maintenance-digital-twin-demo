from __future__ import annotations

from datetime import datetime, timezone

import pytest
from langchain_core.messages import HumanMessage

from app.agents.nodes.telemetry_node import telemetry_node
from app.agents.sql_agent.intent_parser import normalize_question
from app.db.database import SessionLocal
from app.db.models import (
    DBMachine,
    DBMachineBTelemetry,
    DBMachineCTelemetry,
    DBPersona,
    DBUser,
    DBUserMachineAccess,
)


@pytest.fixture()
def telemetry_db(tmp_path):
    from app.config import settings
    from app.db.database import create_tables, reconfigure_database

    original_database_url = settings.database_url
    reconfigure_database(f"sqlite:///{tmp_path / 'telemetry.db'}")
    create_tables()
    yield
    reconfigure_database(original_database_url)


def _seed_user_and_machines() -> None:
    session = SessionLocal()
    try:
        session.add_all(
            [
                DBPersona(
                    id="persona-1",
                    name="Operator One",
                    role="user",
                    shift="Day",
                    plant="Test Plant",
                ),
                DBPersona(
                    id="persona-2",
                    name="Operator Two",
                    role="user",
                    shift="Night",
                    plant="Test Plant",
                ),
            ]
        )
        session.add_all(
            [
                DBUser(
                    id="user-1",
                    email="operator1@example.com",
                    password="hash",
                    persona_id="persona-1",
                    access_role="user",
                ),
                DBUser(
                    id="user-2",
                    email="operator2@example.com",
                    password="hash",
                    persona_id="persona-2",
                    access_role="user",
                ),
            ]
        )
        session.add_all(
            [
                DBMachine(
                    id="machine-b",
                    name="Telemetry Machine B",
                    line="Line B",
                    model="Sensor",
                    status="watch",
                    health_score=70.0,
                    risk_score=35.0,
                    last_service_date="2026-01-01",
                    next_service_date="2026-06-01",
                    uptime_percent=92.0,
                    location="Bay 2",
                    operating_hours=2500.0,
                    primary_failure_modes=["Overheating"],
                    notes="Machine B test asset",
                    machine_type="sensor",
                ),
                DBMachine(
                    id="machine-c",
                    name="Vibration Sensor Machine",
                    line="Line C",
                    model="Real Machine C Sensor Dataset",
                    status="risk",
                    health_score=55.0,
                    risk_score=62.0,
                    last_service_date="2026-01-01",
                    next_service_date="2026-05-01",
                    uptime_percent=87.5,
                    location="Bay 3",
                    operating_hours=6200.0,
                    primary_failure_modes=["Bearing Fatigue", "Imbalance"],
                    notes="Machine C test asset",
                    machine_type="real-sensor",
                ),
            ]
        )
        session.add_all(
            [
                DBUserMachineAccess(user_id="user-1", machine_id="machine-b"),
                DBUserMachineAccess(user_id="user-1", machine_id="machine-c"),
                DBUserMachineAccess(user_id="user-2", machine_id="machine-b"),
            ]
        )
        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for index in range(4):
            session.add(
                DBMachineCTelemetry(
                    machine_id="machine-c",
                    session_id=68,
                    vibration_x=1.0 + index,
                    vibration_y=2.0 + index,
                    vibration_z=3.0 + index,
                    temperature=30.0 + index,
                    time_collected=base.replace(minute=index).isoformat(),
                    risk_label="high",
                )
            )
        session.add(
            DBMachineBTelemetry(
                machine_id="machine-b",
                timestamp=base.isoformat(),
                temperature=20.0,
                pressure=10.0,
                vibration_level=2.0,
                humidity=40.0,
                power_consumption=100.0,
                failure_status=False,
            )
        )
        session.commit()
    finally:
        session.close()


def test_telemetry_node_resolves_typed_machine_c_reference(telemetry_db) -> None:
    _seed_user_and_machines()

    result = telemetry_node(
        {
            "messages": [HumanMessage(content="what is the status of machine C")],
            "user_id": "user-1",
            "machine_id": None,
        }
    )

    assert result["machine_id"] == "machine-c"
    assert result["telemetry_data"]["machine_id"] == "machine-c"
    assert result["telemetry_data"]["machine_name"] == "Vibration Sensor Machine"
    assert result["telemetry_data"]["latest"]["temperature"] == 33.0
    assert result["telemetry_data"]["latest"]["vibration"] == 5.0
    assert len(result["telemetry_data"]["series"]) == 4


def test_telemetry_node_does_not_resolve_inaccessible_machine(telemetry_db) -> None:
    _seed_user_and_machines()

    result = telemetry_node(
        {
            "messages": [HumanMessage(content="what is the status of machine C")],
            "user_id": "user-2",
            "machine_id": None,
        }
    )

    assert result["machine_id"] is None
    assert result["telemetry_data"] is None


def test_telemetry_node_explicit_machine_id_takes_precedence(telemetry_db) -> None:
    _seed_user_and_machines()

    result = telemetry_node(
        {
            "messages": [HumanMessage(content="what is the status of machine C")],
            "user_id": "user-1",
            "machine_id": "machine-b",
        }
    )

    assert result["machine_id"] == "machine-b"
    assert result["telemetry_data"]["machine_id"] == "machine-b"
    assert result["telemetry_data"]["machine_name"] == "Telemetry Machine B"


def test_telemetry_node_rejects_explicit_inaccessible_machine_id(telemetry_db) -> None:
    _seed_user_and_machines()

    result = telemetry_node(
        {
            "messages": [HumanMessage(content="what is the status of machine C")],
            "user_id": "user-2",
            "machine_id": "machine-c",
        }
    )

    assert result["machine_id"] == "machine-c"
    assert result["telemetry_data"] is None


def test_sql_normalizer_canonicalizes_spaced_machine_ids() -> None:
    assert normalize_question("what is the status of Machine C") == (
        "what is the status of machine-c"
    )
    assert normalize_question("latest telemetry for machine B") == (
        "latest telemetry for machine-b"
    )
    assert normalize_question("status for machine-a") == "status for machine-a"
