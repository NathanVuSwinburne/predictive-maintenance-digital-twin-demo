from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

from langchain_core.messages import HumanMessage

from app.agents.nodes import answer_node as answer_node_module


class FakeLLM:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload

    def invoke(self, _messages):
        return SimpleNamespace(content=json.dumps(self.payload))


def _base_state(telemetry_data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "messages": [HumanMessage(content="what is the status of machine C")],
        "api_key": "test-key",
        "llm_provider": "openai",
        "telemetry_data": telemetry_data,
        "ml_prediction": None,
        "rag_context": None,
        "sql_context": None,
        "final_answer": None,
    }


def _telemetry_data() -> dict[str, Any]:
    return {
        "machine_id": "machine-c",
        "machine_name": "Vibration Sensor Machine",
        "latest": {
            "timestamp": "2026-01-01T00:03:00+00:00",
            "temperature": 33.0,
            "vibration": 5.0,
            "pressure": 0.0,
            "power": 0.0,
        },
        "recent_avg": {
            "temperature": 31.5,
            "vibration": 3.5,
            "pressure": 0.0,
            "power": 0.0,
        },
    }


def test_answer_node_adds_current_telemetry_chart_blocks(monkeypatch) -> None:
    monkeypatch.setattr(answer_node_module, "_parse_llm_json", json.loads)
    monkeypatch.setattr(
        answer_node_module,
        "get_llm",
        lambda **_kwargs: FakeLLM(
            {
                "content_blocks": [
                    {"type": "text", "content": "Machine C telemetry is available."}
                ],
                "follow_up_suggestions": ["Show vibration history"],
            }
        ),
    )

    result = answer_node_module.answer_node(_base_state(_telemetry_data()))

    blocks = result["final_answer"]["content_blocks"]
    assert [block["type"] for block in blocks] == [
        "text",
        "chart",
        "chart",
        "chart",
        "chart",
    ]
    charts = {block["title"]: block for block in blocks if block["type"] == "chart"}
    assert charts["Temperature"] == {
        "type": "chart",
        "title": "Temperature",
        "unit": "°C",
        "data": [{"label": "Current", "value": 33.0}],
    }
    assert charts["Vibration"] == {
        "type": "chart",
        "title": "Vibration",
        "unit": "mm/s²",
        "data": [{"label": "Current", "value": 5.0}],
    }
    assert charts["Pressure"]["unit"] == "bar"
    assert charts["Pressure"]["data"] == [{"label": "Current", "value": 0.0}]
    assert charts["Power"]["unit"] == "kW"
    assert charts["Power"]["data"] == [{"label": "Current", "value": 0.0}]


def test_answer_node_does_not_duplicate_llm_telemetry_charts(monkeypatch) -> None:
    monkeypatch.setattr(answer_node_module, "_parse_llm_json", json.loads)
    monkeypatch.setattr(
        answer_node_module,
        "get_llm",
        lambda **_kwargs: FakeLLM(
            {
                "content_blocks": [
                    {"type": "text", "content": "Telemetry summary."},
                    {
                        "type": "chart",
                        "title": "Temperature",
                        "unit": "°C",
                        "data": [{"label": "Current", "value": 33.0}],
                    },
                ],
                "follow_up_suggestions": ["Show vibration history"],
            }
        ),
    )

    result = answer_node_module.answer_node(_base_state(_telemetry_data()))

    charts = [
        block
        for block in result["final_answer"]["content_blocks"]
        if block["type"] == "chart"
    ]
    assert [chart["title"] for chart in charts].count("Temperature") == 1
    assert {chart["title"] for chart in charts} == {
        "Temperature",
        "Vibration",
        "Pressure",
        "Power",
    }


def test_answer_node_leaves_non_telemetry_response_without_chart_injection(
    monkeypatch,
) -> None:
    monkeypatch.setattr(answer_node_module, "_parse_llm_json", json.loads)
    monkeypatch.setattr(
        answer_node_module,
        "get_llm",
        lambda **_kwargs: FakeLLM(
            {
                "content_blocks": [{"type": "text", "content": "Hello."}],
                "follow_up_suggestions": ["Ask about a machine"],
            }
        ),
    )

    result = answer_node_module.answer_node(_base_state())

    assert result["final_answer"]["content_blocks"] == [
        {"type": "text", "content": "Hello."}
    ]


def test_planning_metadata_context_uses_bounded_json() -> None:
    context = answer_node_module._build_context_section(
        {
            **_base_state(),
            "agent_plan": {
                "intent": "simulation",
                "confidence": 0.91,
                "clarity": "clear",
                "machine_reference": "Machine C",
                "scenario_description": "x" * 400,
                "risk_pattern": {
                    "requested": True,
                    "description": "60% high and 40% low",
                    "segments": [{"duration_minutes": 10, "high_percent": 60, "low_percent": 40}],
                },
                "assumptions": ["uses Machine C session simulator"],
            },
        }
    )

    payload = context.removeprefix("Assistant planning metadata:\n")
    parsed = json.loads(payload)
    assert parsed["intent"] == "simulation"
    assert parsed["risk_pattern"]["requested"] is True
    assert len(parsed["scenario_description"]) <= 240
    assert "'requested': True" not in context
