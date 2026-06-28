"""OpenAI Agents SDK @function_tool wrappers for all supervisor action tools.

Each wrapper pulls request-scoped context (db, user_id, etc.) from
RunContextWrapper[AgentContext] and delegates to the underlying tool function.
The underlying functions in tools/ are unchanged — they stay plain Python.
"""
from __future__ import annotations

import json
from typing import Optional

from agents import RunContextWrapper, function_tool

from app.agents.context import AgentContext


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

@function_tool
def run_failure_prediction(ctx: RunContextWrapper[AgentContext], machine_id: str) -> str:
    """Run an ML failure prediction for a machine using its latest telemetry.

    Returns failure probability, severity, and confidence. Stores result in DB.
    Valid for Machine A (ai4i) and Machine C (real-sensor) only.
    """
    from app.agents.tools.prediction import run_failure_prediction as _run
    result = _run(ctx.context.db, ctx.context.user_id, machine_id)
    return json.dumps(result, default=str)


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

@function_tool
def run_simulation(
    ctx: RunContextWrapper[AgentContext],
    machine_id: str,
    horizon_minutes: int = 30,
    scenario_name: Optional[str] = None,
) -> str:
    """Run a Machine C simulation to project future risk under current conditions.

    Only available for Machine C (real-sensor type).
    Use for 'what if' scenario requests. Stores result in DB.
    """
    from app.agents.tools.simulation import run_simulation as _run
    result = _run(
        ctx.context.db,
        ctx.context.user_id,
        machine_id,
        horizon_minutes=horizon_minutes,
        scenario_name=scenario_name,
    )
    return json.dumps(result, default=str)


# ---------------------------------------------------------------------------
# Complaint extraction
# ---------------------------------------------------------------------------

@function_tool
def extract_signal_from_complaint(
    ctx: RunContextWrapper[AgentContext],
    text: str,
    machine_id: Optional[str] = None,
) -> str:
    """Parse a free-text maintenance complaint into a structured anomaly signal.

    Use this FIRST when a user describes a symptom in natural language, then
    decide which other tools to call based on the result.
    """
    from app.agents.tools.complaint import extract_signal_from_complaint as _extract
    effective_machine_id = machine_id or ctx.context.machine_id
    result = _extract(
        text=text,
        machine_id=effective_machine_id,
        api_key=ctx.context.api_key,
        provider=ctx.context.provider,
    )
    return json.dumps(result, default=str)


# ---------------------------------------------------------------------------
# Recommendation proposal
# ---------------------------------------------------------------------------

@function_tool
def propose_recommendation(
    ctx: RunContextWrapper[AgentContext],
    machine_id: str,
    action: str,
    priority: str,
    eta_minutes: Optional[int] = None,
) -> str:
    """Draft a maintenance recommendation for human approval.

    Does NOT write to the database — the user must confirm before it is saved.
    priority must be one of: low, medium, high, critical.
    """
    from app.agents.tools.actions import propose_recommendation as _propose
    result = _propose(
        machine_id=machine_id,
        action=action,
        priority=priority,
        eta_minutes=eta_minutes,
    )
    return json.dumps(result, default=str)


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------

@function_tool
def list_knowledge_notes(ctx: RunContextWrapper[AgentContext]) -> str:
    """List all note titles available in the project knowledge base."""
    from app.agents.tools.knowledge import list_knowledge_notes as _list
    result = _list()
    return json.dumps(result, default=str)


@function_tool
def read_knowledge_note(ctx: RunContextWrapper[AgentContext], title: str) -> str:
    """Read a knowledge base note by title (without .md extension).

    Use to look up domain knowledge — dataset facts, ML model details,
    architecture decisions, or anything not covered by the database or action tools.
    """
    from app.agents.tools.knowledge import read_knowledge_note as _read
    result = _read(title)
    return json.dumps(result, default=str)
