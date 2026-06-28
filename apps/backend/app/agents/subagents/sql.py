"""SQL sub-agent — handles all database queries for the supervisor.

The agent receives the full database schema in its system prompt (static
injection from the agent_wiki/sql notes) and has a single tool:
execute_read_only_sql. It writes SELECT statements and returns results
as JSON that the supervisor synthesises into a final answer.
"""
from __future__ import annotations

import logging
import os

from agents import Agent

from app.agents.context import AgentContext
from app.agents.tools.database import execute_read_only_sql

logger = logging.getLogger(__name__)

_WIKI_DIR = os.path.join(
    os.path.dirname(__file__),   # app/agents/subagents/
    "..", "..", "..",            # apps/backend/
    "agent_wiki", "sql",
)

_NOTE_ORDER = [
    "schema-reference.md",
    "machine-routing.md",
    "query-patterns.md",
    "gotchas.md",
]


def _load_schema_prompt() -> str:
    """Read SQL wiki notes and return them as a single injected block."""
    parts: list[str] = []
    for fname in _NOTE_ORDER:
        path = os.path.normpath(os.path.join(_WIKI_DIR, fname))
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                parts.append(fh.read())
        else:
            logger.warning("SQL wiki note not found: %s", path)
    return "\n\n---\n\n".join(parts)


_SYSTEM_PROMPT = f"""\
You are a read-only database query agent for an industrial predictive-maintenance system.

## Your job
Answer the supervisor's data question by writing a SQL SELECT query and calling
execute_read_only_sql. Return a concise, structured answer — the supervisor will
synthesise your result into the final user response.

## Rules
- Only write SELECT queries. execute_read_only_sql rejects anything else.
- Qualify column names with the table name whenever you JOIN (e.g. machines.id, not id).
- For person-to-machine queries always join via user_machine_access, never history_events.
- Cross-user lookups (asking about a different user's machines) are only valid when
  access_role = "admin". If the question implies looking up another user's data and
  you are not admin, return an access-denied message instead of querying.
- If a query returns 0 rows, say so clearly. Do not guess or fabricate data.
- Keep responses focused. Do not re-state the full row dump; summarise what the data shows.

## Database reference (injected at startup)

{_load_schema_prompt()}
"""

sql_sub_agent: Agent[AgentContext] = Agent(
    name="SQL Database Agent",
    instructions=_SYSTEM_PROMPT,
    tools=[execute_read_only_sql],
)
