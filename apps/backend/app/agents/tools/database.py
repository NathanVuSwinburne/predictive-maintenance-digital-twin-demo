"""execute_read_only_sql — the single tool given to the SQL sub-agent."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from agents import RunContextWrapper, function_tool

from app.agents.context import AgentContext

logger = logging.getLogger(__name__)


@function_tool
def execute_read_only_sql(ctx: RunContextWrapper[AgentContext], query: str) -> str:
    """Execute a read-only SELECT query against the PostgreSQL database.

    Returns rows as a JSON string. Only SELECT statements are permitted.
    """
    stripped = query.strip()
    if not stripped.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are permitted."})

    db = ctx.context.db
    ts = datetime.now(timezone.utc).isoformat()
    try:
        from sqlalchemy import text
        result = db.execute(text(stripped))
        rows = [dict(row._mapping) for row in result]
        ctx.context.sql_trace.append({
            "timestamp": ts,
            "query": stripped,
            "row_count": len(rows),
            "error": None,
        })
        logger.info(
            "execute_read_only_sql: %d row(s) — %s",
            len(rows),
            stripped[:120],
        )
        return json.dumps({"rows": rows, "row_count": len(rows)}, default=str)
    except Exception as exc:
        logger.warning("execute_read_only_sql error: %s", exc)
        ctx.context.sql_trace.append({
            "timestamp": ts,
            "query": stripped,
            "row_count": None,
            "error": str(exc),
        })
        # Roll back the aborted transaction so the session stays usable for
        # the next tool call or the chat_messages INSERT that follows.
        try:
            db.rollback()
        except Exception:
            pass
        return json.dumps({"error": str(exc)})
