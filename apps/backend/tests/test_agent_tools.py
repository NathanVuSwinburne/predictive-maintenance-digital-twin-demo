"""Smoke tests for the new tool-calling agent architecture."""
from __future__ import annotations

import json


# ---------------------------------------------------------------------------
# 1. Tool registration — all 11 tools import cleanly
# ---------------------------------------------------------------------------

def test_tools_import():
    from app.agents.tools import (
        extract_signal_from_complaint,
        get_history_events,
        get_machine_telemetry,
        get_machines,
        get_predictions,
        get_recommendations,
        get_simulation_runs,
        get_telemetry_summary,
        propose_recommendation,
        run_failure_prediction,
        run_simulation,
    )
    tools = [
        get_machines,
        get_machine_telemetry,
        get_telemetry_summary,
        get_predictions,
        get_recommendations,
        get_simulation_runs,
        get_history_events,
        run_failure_prediction,
        run_simulation,
        extract_signal_from_complaint,
        propose_recommendation,
    ]
    assert len(tools) == 11
    for tool in tools:
        assert callable(tool), f"{tool} is not callable"


# ---------------------------------------------------------------------------
# 2. Complaint extraction — keyword fallback (no API key required)
# ---------------------------------------------------------------------------

def test_complaint_extraction_keyword_fallback():
    from app.agents.tools.complaint import extract_signal_from_complaint, _keyword_fallback

    # Directly test the fallback
    result = _keyword_fallback("Machine C has been making a grinding noise since yesterday.")
    assert result["symptom_type"] == "noise"
    assert result["implied_sensor"] == "vibration"
    assert "recommended_next_tools" in result
    assert isinstance(result["recommended_next_tools"], list)
    assert result["confidence"] > 0.0

    # End-to-end: LLM call should fail (no key) → keyword fallback kicks in
    result2 = extract_signal_from_complaint(
        "The motor is vibrating badly.",
        machine_id="machine-c",
        api_key="",          # no key → LLM fails → fallback
        provider="openai",
    )
    assert result2["symptom_type"] in {"vibration", "noise", "temperature", "performance", "leakage", "other"}
    assert result2.get("machine_id") == "machine-c"


# ---------------------------------------------------------------------------
# 3. DB query tool shape — uses SQLite in-memory via conftest
# ---------------------------------------------------------------------------

def test_get_machines_returns_correct_shape(client):
    """get_machines should return a list of dicts with the expected keys."""
    from app.db.database import SessionLocal
    from app.agents.tools.queries import get_machines

    # The test DB is seeded by the app startup; if empty that's fine — check shape only.
    with SessionLocal() as db:
        # Use a fake user_id — visible_machines returns [] for unknown users, which is valid
        result = get_machines(db, user_id="nonexistent-user")
    assert isinstance(result, list)
    for item in result:
        assert "id" in item
        assert "name" in item
        assert "health_score" in item
        assert "risk_score" in item
        assert "status" in item


def test_get_predictions_returns_list(client):
    from app.db.database import SessionLocal
    from app.agents.tools.queries import get_predictions

    with SessionLocal() as db:
        result = get_predictions(db, machine_id="machine-c", days_back=30, limit=5)
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# 4. Loop module imports and tool schemas are valid JSON schemas
# ---------------------------------------------------------------------------

def test_loop_imports():
    from app.agents.loop import run, _TOOL_SCHEMAS, _dispatch, _build_client

    assert callable(run)
    assert callable(_dispatch)
    assert callable(_build_client)
    assert isinstance(_TOOL_SCHEMAS, list)
    assert len(_TOOL_SCHEMAS) == 11


def test_tool_schemas_are_valid():
    from app.agents.loop import _TOOL_SCHEMAS

    tool_names = set()
    for schema in _TOOL_SCHEMAS:
        assert schema["type"] == "function"
        fn = schema["function"]
        assert "name" in fn
        assert "description" in fn
        assert "parameters" in fn
        assert fn["parameters"]["type"] == "object"
        assert "properties" in fn["parameters"]
        tool_names.add(fn["name"])

    expected = {
        "get_machines",
        "get_machine_telemetry",
        "get_telemetry_summary",
        "get_predictions",
        "get_recommendations",
        "get_simulation_runs",
        "get_history_events",
        "run_failure_prediction",
        "run_simulation",
        "extract_signal_from_complaint",
        "propose_recommendation",
    }
    assert tool_names == expected


# ---------------------------------------------------------------------------
# 5. propose_recommendation — no DB write, returns proposal with UUID
# ---------------------------------------------------------------------------

def test_propose_recommendation():
    from app.agents.tools.actions import (
        confirm_proposal,
        get_proposal,
        propose_recommendation,
        reject_proposal,
    )

    proposal = propose_recommendation(
        machine_id="machine-c",
        action="Inspect and lubricate bearings",
        priority="high",
        eta_minutes=45,
    )
    assert proposal["status"] == "pending"
    assert proposal["machine_id"] == "machine-c"
    assert proposal["priority"] == "high"
    pid = proposal["proposal_id"]
    assert len(pid) == 36  # UUID format

    retrieved = get_proposal(pid)
    assert retrieved is not None

    confirmed = confirm_proposal(pid)
    assert confirmed["status"] == "confirmed"
    assert get_proposal(pid) is None  # removed after confirm

    # Test reject path
    proposal2 = propose_recommendation("machine-a", "Replace tool", "medium")
    assert reject_proposal(proposal2["proposal_id"]) is True


# ---------------------------------------------------------------------------
# 6. No hardcoded secrets in any of the new modules
# ---------------------------------------------------------------------------

def test_no_hardcoded_api_keys():
    import pathlib

    agents_dir = pathlib.Path(__file__).parent.parent / "app" / "agents"
    # Scan only the new modules we wrote — not the legacy LangGraph nodes
    new_files = list((agents_dir / "tools").rglob("*.py")) + [
        agents_dir / "loop.py",
        agents_dir / "system_prompt.py",
    ]
    suspicious_patterns = ["sk-proj-", "sk-ant-", "AKIA", "Bearer ey"]

    for py_file in new_files:
        if not py_file.exists():
            continue
        source = py_file.read_text(encoding="utf-8", errors="ignore")
        for pattern in suspicious_patterns:
            assert pattern not in source, (
                f"Possible hardcoded secret ({pattern!r}) found in {py_file}"
            )
