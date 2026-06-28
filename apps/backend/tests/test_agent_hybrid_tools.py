from __future__ import annotations

from datetime import datetime, timezone

import pytest
from langchain_core.messages import HumanMessage

from app.agents.nodes import hybrid_tool_node
from app.agents.nodes import router_node as router_node_module
from app.agents.nodes.router_node import router_node
from app.db.database import SessionLocal
from app.db.models import (
    DBHistoryEvent,
    DBMachine,
    DBMachineCSimulationTelemetry,
    DBPersona,
    DBSimulationRun,
    DBUser,
    DBUserMachineAccess,
)


@pytest.fixture()
def hybrid_db(tmp_path):
    from app.config import settings
    from app.db.database import create_tables, reconfigure_database

    original_database_url = settings.database_url
    reconfigure_database(f"sqlite:///{tmp_path / 'hybrid.db'}")
    create_tables()
    yield
    reconfigure_database(original_database_url)


def _seed_user_and_machines() -> None:
    session = SessionLocal()
    try:
        session.add(
            DBPersona(
                id="persona-1",
                name="Operator",
                role="user",
                shift="Day",
                plant="Test Plant",
            )
        )
        session.add(
            DBUser(
                id="user-1",
                email="operator@example.com",
                password="hash",
                persona_id="persona-1",
                access_role="user",
            )
        )
        session.add_all(
            [
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
                DBMachine(
                    id="machine-a",
                    name="AI4I Production Machine",
                    line="Line A",
                    model="AI4I",
                    status="watch",
                    health_score=74.0,
                    risk_score=38.0,
                    last_service_date="2026-01-01",
                    next_service_date="2026-05-01",
                    uptime_percent=94.0,
                    location="Bay 1",
                    operating_hours=14250.0,
                    primary_failure_modes=["Tool Wear Failure"],
                    notes="Machine A test asset",
                    machine_type="ai4i",
                ),
            ]
        )
        session.add_all(
            [
                DBUserMachineAccess(user_id="user-1", machine_id="machine-c"),
                DBUserMachineAccess(user_id="user-1", machine_id="machine-a"),
            ]
        )
        session.commit()
    finally:
        session.close()


def _seed_simulation_rows() -> None:
    session = SessionLocal()
    try:
        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for index in range(4):
            session.add(
                DBMachineCSimulationTelemetry(
                    machine_id="machine-c",
                    session_id=68,
                    vibration_x=0.2 + index * 0.01,
                    vibration_y=0.3 + index * 0.01,
                    vibration_z=0.4 + index * 0.01,
                    temperature=32.0 + index,
                    time_collected=base.isoformat(),
                    vibration_magnitude=0.5,
                    time_delta_s=0.5,
                    within_session_idx=index,
                    risk_label="high",
                    synthetic=False,
                )
            )
        session.commit()
    finally:
        session.close()


def test_router_requires_llm_key_for_auto_prediction_intent() -> None:
    state = {
        "messages": [HumanMessage(content="predict risk for Machine C")],
        "query_mode": "auto",
        "api_key": "",
        "llm_provider": "openai",
        "query_type": "general",
    }

    result = router_node(state)

    assert result["query_type"] == "llm_required"
    assert "LLM provider/key required" in result["final_answer"]["content_blocks"][0]["content"]


def test_router_normalize_plan_allows_planner_to_clear_nullable_fallbacks() -> None:
    fallback = {
        **router_node_module._heuristic_plan(
            {
                "messages": [HumanMessage(content="latest status for Machine C")],
                "machine_id": None,
            }
        ),
        "machine_reference": "Machine C",
        "scenario_description": "fallback scenario",
        "scenario_name": "fallback name",
        "horizon_minutes": 30,
        "session_id": 68,
    }

    result = router_node_module._normalize_plan(
        {
            "intent": "data_lookup",
            "machine_reference": None,
            "scenario_description": None,
            "scenario_name": None,
            "horizon_minutes": None,
            "session_id": None,
        },
        fallback,
    )

    assert result["machine_reference"] is None
    assert result["scenario_description"] is None
    assert result["scenario_name"] is None
    assert result["horizon_minutes"] is None
    assert result["session_id"] is None


def test_router_heuristic_simulation_requires_runnable_scenario() -> None:
    vague = router_node_module._heuristic_plan(
        {
            "messages": [HumanMessage(content="simulate Machine C")],
            "machine_id": None,
        }
    )
    concrete = router_node_module._heuristic_plan(
        {
            "messages": [HumanMessage(content="if Machine C was at 100 degrees celsius, what status would it be at?")],
            "machine_id": None,
        }
    )

    assert vague["intent"] == "simulation"
    assert vague["clarity"] == "ambiguous"
    assert "scenario" in vague["missing_fields"]
    assert vague["scenario_description"] is None
    assert concrete["intent"] == "simulation"
    assert concrete["clarity"] == "clear"
    assert concrete["scenario_description"]


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("what is the latest vibration for Machine C?", "data_lookup"),
        ("predict failure risk for Machine C", "prediction"),
        ("simulate Machine C for 10 minutes with 60% high and 40% low", "simulation"),
        ("if Machine C was at 100 degrees celsius, what status would it be at?", "simulation"),
        ("what maintenance should I do for Machine C?", "maintenance"),
        ("hello there", "general"),
    ],
)
def test_router_auto_uses_structured_plan(prompt, expected, monkeypatch) -> None:
    monkeypatch.setattr(
        router_node_module,
        "_invoke_structured_planner",
        lambda state, intent_override=None: {
            **router_node_module._heuristic_plan(state, intent_override),
            "intent": expected,
        },
    )

    result = router_node(
        {
            "messages": [HumanMessage(content=prompt)],
            "query_mode": "auto",
            "api_key": "test-key",
            "llm_provider": "openai",
            "query_type": "general",
            "agent_plan": None,
            "scenario_plan": None,
        }
    )

    assert result["query_type"] == expected
    assert result["agent_plan"]["intent"] == expected
    if "60% high" in prompt:
        assert result["scenario_plan"]["risk_pattern"]["requested"] is True


def test_router_accepts_task_modes_and_legacy_aliases(monkeypatch) -> None:
    seen_overrides = []

    def fake_planner(state, intent_override=None):
        seen_overrides.append(intent_override)
        return {**router_node_module._heuristic_plan(state, intent_override), "intent": intent_override}

    monkeypatch.setattr(router_node_module, "_invoke_structured_planner", fake_planner)

    telemetry_result = router_node(
        {
            "messages": [HumanMessage(content="latest readings for Machine C")],
            "query_mode": "telemetry",
            "api_key": "test-key",
            "llm_provider": "openai",
            "query_type": "general",
        }
    )
    maintenance_result = router_node(
        {
            "messages": [HumanMessage(content="recommended maintenance for Machine C")],
            "query_mode": "maintenance",
            "api_key": "test-key",
            "llm_provider": "openai",
            "query_type": "general",
        }
    )

    assert telemetry_result["query_type"] == "data_lookup"
    assert maintenance_result["query_type"] == "maintenance"
    assert seen_overrides == ["data_lookup", "maintenance"]


def test_hybrid_tool_ambiguous_simulation_clarifies_without_persisting(hybrid_db, monkeypatch) -> None:
    _seed_user_and_machines()
    monkeypatch.setattr(
        hybrid_tool_node,
        "_invoke_planner",
        lambda state, machines: {
            "intent": "simulation",
            "clarity": "ambiguous",
            "machine_reference": "Machine C",
            "missing_fields": ["vibration increase or duration"],
            "presets": [
                {"label": "+10%", "prompt": "simulate Machine C if vibration increases by 10%"},
                {"label": "+20%", "prompt": "simulate Machine C if vibration increases by 20%"},
            ],
        },
    )

    result = hybrid_tool_node.hybrid_tool_node(
        {
            "messages": [HumanMessage(content="simulate Machine C under higher vibration")],
            "user_id": "user-1",
            "machine_id": None,
            "api_key": "test-key",
            "llm_provider": "openai",
        }
    )

    blocks = result["final_answer"]["content_blocks"]
    assert blocks[0]["type"] == "text"
    assert blocks[1]["type"] == "table"
    assert "+20%" in blocks[1]["rows"][1]

    session = SessionLocal()
    try:
        assert session.query(DBSimulationRun).count() == 0
    finally:
        session.close()


def test_hybrid_tool_clear_simulation_runs_and_persists(hybrid_db, monkeypatch) -> None:
    _seed_user_and_machines()
    _seed_simulation_rows()
    monkeypatch.setattr(
        hybrid_tool_node,
        "_invoke_planner",
        lambda state, machines: {
            "intent": "simulation",
            "clarity": "clear",
            "machine_reference": "Machine C",
            "scenario_name": "Machine C vibration +20%",
            "horizon_minutes": 60,
            "risk_pattern": {
                "requested": True,
                "description": "60% high and 40% low",
                "segments": [
                    {
                        "duration_minutes": 10,
                        "high_percent": 60,
                        "medium_percent": None,
                        "low_percent": 40,
                    }
                ],
            },
        },
    )
    monkeypatch.setattr(
        hybrid_tool_node,
        "get_simulation_config",
        lambda machine_id, db: type(
            "Config",
            (),
            {"sessions": [type("SessionOption", (), {"sessionId": 68, "label": "high", "usesSyntheticContinuation": False})()]},
        )(),
    )
    monkeypatch.setattr(
        hybrid_tool_node,
        "run_session_simulation",
        lambda body, db: {
            "projected_risk": 81.2,
            "projected_downtime_hours": 2.5,
            "summary": "Simulated Machine C for 60 minutes.",
            "recommendations": ["Inspect bearing assembly."],
            "projected_label": "high",
            "failure_probability": 0.812,
            "selected_session_id": 68,
            "synthetic_continuation_used": False,
            "sensor_fields": ["vibrationX", "vibrationY", "vibrationZ", "temperature"],
            "simulation_horizon_minutes": 60,
            "simulation_status": "completed",
            "classification_windows": [
                {
                    "windowStart": "2026-01-01T00:00:00+00:00",
                    "windowEnd": "2026-01-01T00:01:00+00:00",
                    "predictedLabel": "high",
                    "failureProbability": 0.812,
                    "confidence": 0.91,
                    "probabilities": {"low": 0.04, "medium": 0.05, "high": 0.91},
                }
            ],
        },
    )

    result = hybrid_tool_node.hybrid_tool_node(
        {
            "messages": [HumanMessage(content="simulate Machine C if vibration increases by 20%")],
            "user_id": "user-1",
            "machine_id": None,
            "api_key": "test-key",
            "llm_provider": "openai",
        }
    )

    blocks = result["final_answer"]["content_blocks"]
    assert any(block["type"] == "status-card" for block in blocks)
    assert any(block["type"] == "comparison" for block in blocks)
    status_card = next(block for block in blocks if block["type"] == "status-card")
    metric_labels = {metric["label"] for metric in status_card["metrics"]}
    assert "Generation confidence" in metric_labels
    assert "Requested risk pattern" in metric_labels
    simulation_href = blocks[-1]["links"][0]["href"]
    assert simulation_href.startswith("/simulator?mode=simulate&machineId=machine-c&runId=")
    assert "sessionId=68" in simulation_href
    assert "horizon=1-hour" in simulation_href
    assert "scenario=Machine+C+vibration+%2B20%25" in simulation_href

    session = SessionLocal()
    try:
        assert session.query(DBSimulationRun).count() == 1
        event = session.query(DBHistoryEvent).filter(DBHistoryEvent.type == "simulation-run").one()
        assert event.event_metadata["simulation_run_id"]
        assert event.event_metadata["generated_readings"] is None
    finally:
        session.close()


def test_hybrid_tool_uses_router_agent_plan_without_replanning(hybrid_db, monkeypatch) -> None:
    _seed_user_and_machines()
    called = False

    def fail_planner(state, machines):
        nonlocal called
        called = True
        raise AssertionError("planner should not be called when router supplied a plan")

    monkeypatch.setattr(hybrid_tool_node, "_invoke_planner", fail_planner)
    monkeypatch.setattr(
        hybrid_tool_node,
        "_prediction_answer",
        lambda machine, db: {
            "content_blocks": [{"type": "text", "content": f"predicted {machine.id}"}],
            "follow_up_suggestions": [],
        },
    )

    result = hybrid_tool_node.hybrid_tool_node(
        {
            "messages": [HumanMessage(content="predict risk for Machine C")],
            "user_id": "user-1",
            "machine_id": None,
            "api_key": "test-key",
            "llm_provider": "openai",
            "agent_plan": {
                "intent": "prediction",
                "clarity": "clear",
                "machine_reference": "Machine C",
                "missing_fields": [],
            },
        }
    )

    assert called is False
    assert result["final_answer"]["content_blocks"][0]["content"] == "predicted machine-c"


def test_hybrid_tool_unauthorized_machine_reference_does_not_execute_or_leak(hybrid_db, monkeypatch) -> None:
    _seed_user_and_machines()
    session = SessionLocal()
    try:
        session.query(DBUserMachineAccess).filter(
            DBUserMachineAccess.user_id == "user-1",
            DBUserMachineAccess.machine_id == "machine-c",
        ).delete()
        session.commit()
    finally:
        session.close()

    monkeypatch.setattr(
        hybrid_tool_node,
        "_invoke_planner",
        lambda state, machines: {
            "intent": "simulation",
            "clarity": "clear",
            "machine_reference": "Machine C",
            "scenario_name": "Machine C vibration +20%",
            "horizon_minutes": 60,
        },
    )

    result = hybrid_tool_node.hybrid_tool_node(
        {
            "messages": [HumanMessage(content="simulate Machine C if vibration increases by 20%")],
            "user_id": "user-1",
            "machine_id": None,
            "api_key": "test-key",
            "llm_provider": "openai",
        }
    )

    text = result["final_answer"]["content_blocks"][0]["content"]
    assert "Vibration Sensor Machine" not in text

    session = SessionLocal()
    try:
        assert session.query(DBSimulationRun).count() == 0
    finally:
        session.close()
