"""Supervisor agent loop — OpenAI Agents SDK implementation.

Architecture:
- Supervisor Agent orchestrates all user interactions.
- SQL sub-agent is exposed as a single `query_database` tool — handles all
  data reads (machines, telemetry, predictions, history, person queries).
- Action tools (prediction, simulation, complaint, recommendation, knowledge)
  live directly on the supervisor.
- All providers normalised to an AsyncOpenAI client (OpenAI, DeepSeek, Ollama, Gemini).
- Context (db, user_id, access_role, etc.) injected via RunContextWrapper[AgentContext].
"""
from __future__ import annotations

import asyncio
import json as _json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from agents import Agent, Runner, RunConfig
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.agents.agent_tools import (
    extract_signal_from_complaint,
    list_knowledge_notes,
    propose_recommendation,
    read_knowledge_note,
    run_failure_prediction,
    run_simulation,
)
from app.agents.context import AgentContext
from app.agents.subagents.sql import sql_sub_agent
from app.agents.system_prompt import AGENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Supervisor agent (module-level singleton — model is set per-run via RunConfig)
# ---------------------------------------------------------------------------

_supervisor: Agent[AgentContext] = Agent(
    name="Maintenance Supervisor",
    instructions=AGENT_SYSTEM_PROMPT,
    tools=[
        sql_sub_agent.as_tool(
            tool_name="query_database",
            tool_description=(
                "Query the database for ANY data-related question: machine status, "
                "telemetry readings, predictions, recommendations, simulation runs, "
                "history events, or person-to-machine lookups. "
                "Pass the user's question as-is — the SQL agent will write and execute "
                "the correct query and return structured results."
            ),
        ),
        run_failure_prediction,
        run_simulation,
        extract_signal_from_complaint,
        propose_recommendation,
        list_knowledge_notes,
        read_knowledge_note,
    ],
)


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------

def _build_model(provider: str, api_key: str) -> OpenAIChatCompletionsModel:
    from app.config import settings

    provider_map = {
        "deepseek": (
            api_key or getattr(settings, "deepseek_api_key", None) or "",
            "https://api.deepseek.com",
            "deepseek-chat",
        ),
        "ollama": (
            "ollama",
            settings.ollama_base_url.rstrip("/") + "/v1",
            settings.ollama_model,
        ),
        "gemini": (
            api_key or settings.gemini_api_key or "",
            "https://generativelanguage.googleapis.com/v1beta/openai/",
            settings.gemini_model,
        ),
    }

    if provider in provider_map:
        key, base_url, model_name = provider_map[provider]
        client = AsyncOpenAI(api_key=key, base_url=base_url)
    else:
        client = AsyncOpenAI(api_key=api_key or settings.openai_api_key or "")
        model_name = settings.openai_model

    return OpenAIChatCompletionsModel(model=model_name, openai_client=client)


# ---------------------------------------------------------------------------
# Rich block builders
# ---------------------------------------------------------------------------

def _pct(v: float) -> str:
    return f"{v:.1f}%"


def _prob(v) -> str:
    return "N/A" if v is None else f"{v * 100:.1f}%"


def _severity_for_risk(risk: float) -> str:
    if risk >= 80:
        return "critical"
    if risk >= 65:
        return "high"
    if risk >= 45:
        return "medium"
    return "low"


def _prediction_blocks(result: dict) -> list[dict]:
    return [
        {
            "type": "status-card",
            "title": "Prediction result",
            "machineName": result["machine_name"],
            "machineId": result["machine_id"],
            "intent": "prediction",
            "status": result.get("status", ""),
            "severity": result["severity"],
            "summary": (
                f"{result['machine_name']} — {result['predicted_label']} "
                f"with {_prob(result['failure_probability'])} failure probability."
            ),
            "metrics": [
                {"label": "Current risk", "value": _pct(result["risk_score"])},
                {"label": "Health score", "value": _pct(result["health_score"])},
                {"label": "Failure probability", "value": _prob(result["failure_probability"])},
                {"label": "Confidence", "value": _prob(result["confidence"])},
                {"label": "Likely issue", "value": result["failure_mode"]},
            ],
        },
        {
            "type": "links",
            "links": [
                {
                    "label": "Open prediction view",
                    "href": (
                        f"/simulator?mode=predict"
                        f"&machineId={result['machine_id']}"
                        f"&predictionId={result['prediction_id']}"
                    ),
                    "description": "Review the prediction in the advanced workspace.",
                },
            ],
        },
    ]


def _simulation_blocks(result: dict) -> list[dict]:
    severity = _severity_for_risk(result["simulated_risk"])
    blocks: list[dict] = [
        {
            "type": "status-card",
            "title": "Simulation result",
            "machineName": result["machine_name"],
            "machineId": result["machine_id"],
            "intent": "simulation",
            "status": result.get("projected_label") or severity,
            "severity": severity,
            "summary": result["summary"],
            "metrics": [
                {"label": "Scenario", "value": result["scenario_name"]},
                {"label": "Horizon", "value": f"{result['horizon_minutes']} minutes"},
                {"label": "Baseline risk", "value": _pct(result["baseline_risk"])},
                {"label": "Simulated risk", "value": _pct(result["simulated_risk"])},
                {"label": "Risk delta", "value": f"{result['risk_delta']:+.1f} pts"},
                {"label": "Failure probability", "value": _prob(result.get("failure_probability"))},
                {"label": "Estimated downtime", "value": f"{result['downtime_hours']:.1f}h"},
            ],
        },
        {
            "type": "comparison",
            "title": "Baseline vs simulated outcome",
            "baselineLabel": "Current",
            "scenarioLabel": "Simulated",
            "rows": [
                {
                    "label": "Risk score",
                    "baseline": _pct(result["baseline_risk"]),
                    "scenario": _pct(result["simulated_risk"]),
                    "delta": f"{result['risk_delta']:+.1f} pts",
                },
            ],
        },
    ]
    if result.get("recommendations"):
        blocks.append({
            "type": "table",
            "columns": ["Recommended action"],
            "rows": [[str(r)] for r in result["recommendations"]],
        })
    blocks.append({
        "type": "links",
        "links": [
            {
                "label": "Open full simulator",
                "href": (
                    f"/simulator?mode=simulate"
                    f"&machineId={result['machine_id']}"
                    f"&runId={result['run_id']}"
                ),
                "description": "Open the advanced simulator with this scenario.",
            }
        ],
    })
    return blocks


def _proposal_block(result: dict) -> dict:
    eta_str = f" | ETA: {result['eta_minutes']} min" if result.get("eta_minutes") else ""
    return {
        "type": "text",
        "content": (
            f"**Proposed action (pending your approval):**\n"
            f"{result['action']}\n\n"
            f"Priority: **{result['priority']}**{eta_str}\n"
            f"*Proposal ID: {result['proposal_id']} — confirm or reject via the dashboard.*"
        ),
    }


def _extract_rich_blocks(run_result) -> list[dict]:
    """Build rich UI blocks from tool call outputs in the agent run."""
    import json as _json

    rich: list[dict] = []
    for item in getattr(run_result, "new_items", []):
        if item.type != "tool_call_output_item":
            continue
        try:
            out = item.output
            data = out if isinstance(out, dict) else _json.loads(out)
        except Exception:
            continue
        if not isinstance(data, dict) or "error" in data:
            continue
        if "failure_probability" in data and "prediction_id" in data:
            rich.extend(_prediction_blocks(data))
        elif "simulated_risk" in data and "run_id" in data:
            rich.extend(_simulation_blocks(data))
        elif "proposal_id" in data and "action" in data:
            rich.append(_proposal_block(data))
    return rich


def _summarise_tool_output(tool: str, output: str) -> str:
    import json as _json

    if not output:
        return "No result."

    if tool == "query_database":
        return output[:220] + ("…" if len(output) > 220 else "")

    try:
        data = _json.loads(output)
    except Exception:
        return output[:220] + ("…" if len(output) > 220 else "")

    if not isinstance(data, dict):
        return str(data)[:220]

    if "error" in data:
        return f"Error: {data['error']}"

    if tool == "run_failure_prediction":
        machine = data.get("machine_name", "?")
        label = data.get("predicted_label", "?")
        risk = data.get("risk_score")
        prob = data.get("failure_probability")
        parts = [f"{machine}: {label}"]
        if risk is not None:
            parts.append(f"risk {risk:.0f}")
        if prob is not None:
            parts.append(f"failure probability {prob * 100:.0f}%")
        return ", ".join(parts)

    if tool == "run_simulation":
        machine = data.get("machine_name", "?")
        scenario = data.get("scenario_name", "?")
        sim_risk = data.get("simulated_risk")
        delta = data.get("risk_delta")
        parts = [f"{machine} — {scenario}"]
        if sim_risk is not None:
            parts.append(f"simulated risk {sim_risk:.0f}")
        if delta is not None:
            parts.append(f"delta {delta:+.1f} pts")
        return ", ".join(parts)

    if tool == "extract_signal_from_complaint":
        symptom = data.get("symptom_type", "?")
        severity = data.get("severity_estimate", "?")
        desc = data.get("description", "")
        return f"{symptom.title()} — severity: {severity}. {desc[:100]}"

    if tool == "propose_recommendation":
        action = data.get("action", "?")
        priority = data.get("priority", "?")
        return f"Priority {priority}: {str(action)[:140]}"

    if tool == "list_knowledge_notes":
        notes = data.get("notes", [])
        count = data.get("count", len(notes) if isinstance(notes, list) else 0)
        titles = ", ".join(str(n) for n in (notes[:5] if isinstance(notes, list) else []))
        return f"{count} notes available: {titles}" + ("…" if count > 5 else "")

    if tool == "read_knowledge_note":
        title = data.get("title", "")
        content = str(data.get("content", ""))
        snippet = content[:160] + ("…" if len(content) > 160 else "")
        return f'"{title}": {snippet}'

    return str(data)[:220]


def _build_agent_trace(run_result) -> list[dict]:
    """Extract the sequence of tool calls the supervisor made into a client-readable trace."""
    _LABELS = {
        "query_database": "Queried the database",
        "run_failure_prediction": "Ran failure prediction",
        "run_simulation": "Ran simulation",
        "extract_signal_from_complaint": "Analysed complaint",
        "propose_recommendation": "Proposed maintenance action",
        "list_knowledge_notes": "Listed knowledge notes",
        "read_knowledge_note": "Read knowledge note",
    }

    calls: list[tuple[str, str]] = []  # (call_id, tool_name)
    outputs: dict[str, str] = {}       # call_id -> output string

    for item in getattr(run_result, "new_items", []):
        if item.type == "tool_call_item":
            # Use SDK properties — they handle both dict and object raw_items, and
            # correctly read call_id (unique) rather than id (FAKE_RESPONSES_ID constant
            # that Chat Completions sets identically on every call).
            call_id = item.call_id or f"__pos_{len(calls)}"
            name = item.tool_name or "unknown"
            calls.append((call_id, name))
        elif item.type == "tool_call_output_item":
            # raw_item for Chat Completions is a dict; use the SDK property.
            call_id = item.call_id
            if call_id is None:
                # positional fallback: assign to the earliest unmatched call
                unmatched = [cid for cid, _ in calls if cid not in outputs]
                call_id = unmatched[0] if unmatched else f"__orphan_{len(outputs)}"
            outputs[call_id] = str(item.output) if item.output is not None else ""

    trace = []
    for step, (call_id, tool) in enumerate(calls, 1):
        output = outputs.get(call_id, "")
        trace.append({
            "step": step,
            "tool": tool,
            "label": _LABELS.get(tool, tool.replace("_", " ").title()),
            "summary": _summarise_tool_output(tool, output),
        })
    return trace


def _extract_working_memory_updates(run_result, current: dict) -> dict:
    """Merge structured tool outputs from this run into the thread working memory."""
    import json as _json
    memory = dict(current) if current else {}

    for item in getattr(run_result, "new_items", []):
        if item.type != "tool_call_output_item":
            continue
        try:
            out = item.output
            data = out if isinstance(out, dict) else _json.loads(out)
        except Exception:
            continue
        if not isinstance(data, dict) or "error" in data:
            continue

        machine_id = data.get("machine_id")
        machine_name = data.get("machine_name")

        if "failure_probability" in data and "prediction_id" in data:
            memory["last_prediction"] = {k: data.get(k) for k in (
                "machine_id", "machine_name", "risk_score", "failure_probability",
                "failure_mode", "severity", "predicted_label", "prediction_id",
            )}
            if machine_id:
                memory["focused_machine_id"] = machine_id
                memory["focused_machine_name"] = machine_name

        elif "simulated_risk" in data and "run_id" in data:
            memory["last_simulation"] = {k: data.get(k) for k in (
                "machine_id", "machine_name", "scenario_name",
                "baseline_risk", "simulated_risk", "risk_delta", "run_id",
            )}
            if machine_id:
                memory["focused_machine_id"] = machine_id
                memory["focused_machine_name"] = machine_name

        elif "symptom_type" in data and "severity_estimate" in data:
            symptom = {
                "symptom_type": data.get("symptom_type"),
                "severity_estimate": data.get("severity_estimate"),
                "description": (data.get("description") or "")[:120],
            }
            prior = [s for s in memory.get("flagged_symptoms", [])
                     if s.get("symptom_type") != symptom["symptom_type"]]
            memory["flagged_symptoms"] = (prior + [symptom])[-3:]

        elif "proposal_id" in data and "action" in data:
            proposal = {
                "proposal_id": data.get("proposal_id"),
                "action": str(data.get("action") or "")[:100],
                "priority": data.get("priority"),
            }
            memory["pending_proposals"] = (memory.get("pending_proposals", []) + [proposal])[-5:]

    return memory


def _format_memory_context(memory: dict) -> Optional[str]:
    """Build a system message block from working memory; returns None if empty."""
    if not memory:
        return None

    def _r(v) -> str:
        try:
            return f"{float(v):.0f}"
        except (TypeError, ValueError):
            return "N/A"

    def _p(v) -> str:
        try:
            return f"{float(v) * 100:.0f}%"
        except (TypeError, ValueError):
            return "N/A"

    lines = ["## Working memory — context from this conversation"]

    focused_id = memory.get("focused_machine_id")
    focused_name = memory.get("focused_machine_name")
    if focused_id:
        display = f"{focused_name} ({focused_id})" if focused_name else focused_id
        lines.append(f"- Focused machine: {display}")

    pred = memory.get("last_prediction")
    if pred:
        mname = pred.get("machine_name") or pred.get("machine_id") or "?"
        lines.append(
            f"- Last prediction ({mname}): {pred.get('predicted_label', '?')} — "
            f"risk {_r(pred.get('risk_score'))}, failure prob {_p(pred.get('failure_probability'))}, "
            f"mode: {pred.get('failure_mode', '?')} [{pred.get('severity', '?')} severity]"
        )

    sim = memory.get("last_simulation")
    if sim:
        mname = sim.get("machine_name") or sim.get("machine_id") or "?"
        delta = sim.get("risk_delta")
        delta_str = f"{delta:+.0f} pts" if delta is not None else "?"
        lines.append(
            f"- Last simulation ({mname}): {sim.get('scenario_name', '?')} — "
            f"baseline {_r(sim.get('baseline_risk'))} → simulated {_r(sim.get('simulated_risk'))} ({delta_str})"
        )

    symptoms = memory.get("flagged_symptoms") or []
    if symptoms:
        parts = [f"{s.get('symptom_type', '?')} ({s.get('severity_estimate', '?')})" for s in symptoms]
        lines.append(f"- Flagged symptoms: {', '.join(parts)}")

    proposals = memory.get("pending_proposals") or []
    if proposals:
        parts = [f"[{p.get('priority', '?')}] {p.get('action', '?')[:60]}" for p in proposals]
        lines.append(f"- Pending proposals: {'; '.join(parts)}")

    return "\n".join(lines) if len(lines) > 1 else None


def _follow_ups(run_result, machine_id: Optional[str]) -> list[str]:
    ref = machine_id or "Machine C"
    tools_called = [
        item.raw_item.name
        for item in getattr(run_result, "new_items", [])
        if item.type == "tool_call_item" and hasattr(item, "raw_item")
    ]
    if "run_failure_prediction" in tools_called:
        return [
            f"Simulate {ref} if vibration increases by 20%",
            f"What maintenance is recommended for {ref}?",
            f"Show recent history for {ref}",
        ]
    if "run_simulation" in tools_called:
        return [
            f"Predict the failure risk for {ref}",
            f"What does the telemetry show for {ref}?",
            f"Show recent history for {ref}",
        ]
    if "extract_signal_from_complaint" in tools_called:
        return [
            f"Run a failure prediction for {ref}",
            f"Show recent history for {ref}",
            "Which machines need attention today?",
        ]
    return [
        "Which machines need attention today?",
        "Run a failure prediction for Machine C",
        "Show telemetry for Machine C",
    ]


# ---------------------------------------------------------------------------
# Trace file persistence
# ---------------------------------------------------------------------------

_LOG_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "logs", "agent_traces")
)


def _write_trace_log(
    thread_id: str,
    user_id: str,
    provider: str,
    messages: list[dict],
    supervisor_trace: list[dict],
    sql_trace: list[dict],
    content_blocks: list[dict],
    duration_ms: int,
) -> None:
    try:
        os.makedirs(_LOG_DIR, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        safe_thread = (thread_id or "no-thread").replace("/", "_")[:36]
        log_path = os.path.join(_LOG_DIR, f"{safe_thread}_{ts}.json")
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "thread_id": thread_id,
            "user_id": user_id,
            "provider": provider,
            "duration_ms": duration_ms,
            "conversation": messages,
            "supervisor_trace": supervisor_trace,
            "sql_sub_agent_trace": sql_trace,
            "final_text_blocks": [
                b for b in content_blocks if isinstance(b, dict) and b.get("type") == "text"
            ],
        }
        with open(log_path, "w", encoding="utf-8") as fh:
            _json.dump(payload, fh, indent=2, default=str)
        logger.info("Agent trace written → %s", log_path)
    except Exception as exc:
        logger.warning("Failed to write agent trace log: %s", exc)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_async(
    messages: list[dict],
    db: Session,
    user_id: str,
    machine_id: Optional[str],
    api_key: str,
    provider: str,
    access_role: str = "user",
    thread_id: str = "",
    working_memory: Optional[dict] = None,
) -> dict:
    """Run the supervisor agent and return a final_answer dict."""
    if not api_key and provider in {"openai", "deepseek", "gemini"}:
        return {
            "content_blocks": [{
                "type": "text",
                "content": (
                    "No API key provided. Please add your API key in chat settings, "
                    "or switch to the Ollama provider for local inference."
                ),
            }],
            "follow_up_suggestions": [],
        }

    # Prepend working memory as a system message so the agent has structured context
    memory_ctx = _format_memory_context(working_memory or {})
    effective_messages = ([{"role": "system", "content": memory_ctx}] + messages) if memory_ctx else messages

    context = AgentContext(
        db=db,
        user_id=user_id,
        machine_id=machine_id,
        api_key=api_key,
        provider=provider,
        access_role=access_role,
    )
    model = _build_model(provider, api_key)
    run_config = RunConfig(model=model, tracing_disabled=True)

    t0 = time.monotonic()
    try:
        result = await Runner.run(
            _supervisor,
            effective_messages,
            context=context,
            run_config=run_config,
        )
    except Exception as exc:
        logger.error("Supervisor agent failed: %s", exc)
        return {
            "content_blocks": [{"type": "text", "content": f"Agent error: {exc}"}],
            "follow_up_suggestions": [],
        }

    duration_ms = int((time.monotonic() - t0) * 1000)
    final_text = result.final_output or "I was unable to generate a response."
    rich_blocks = _extract_rich_blocks(result)
    supervisor_trace = _build_agent_trace(result)
    content_blocks = [{"type": "text", "content": final_text}, *rich_blocks]
    updated_memory = _extract_working_memory_updates(result, working_memory or {})

    _write_trace_log(
        thread_id=thread_id,
        user_id=user_id,
        provider=provider,
        messages=messages,
        supervisor_trace=supervisor_trace,
        sql_trace=context.sql_trace,
        content_blocks=content_blocks,
        duration_ms=duration_ms,
    )

    return {
        "content_blocks": content_blocks,
        "follow_up_suggestions": _follow_ups(result, machine_id),
        "agent_trace": supervisor_trace,
        "working_memory": updated_memory,
    }


def run(
    messages: list[dict],
    db: Session,
    user_id: str,
    machine_id: Optional[str],
    api_key: str,
    provider: str,
    access_role: str = "user",
    thread_id: str = "",
    working_memory: Optional[dict] = None,
) -> dict:
    """Synchronous wrapper called by the FastAPI endpoint."""
    return asyncio.run(
        run_async(messages, db, user_id, machine_id, api_key, provider, access_role, thread_id, working_memory)
    )
