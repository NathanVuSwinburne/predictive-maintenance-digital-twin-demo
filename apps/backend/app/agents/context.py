"""Shared request context injected into every agent tool call."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session


@dataclass
class AgentContext:
    db: Session
    user_id: str
    machine_id: Optional[str]
    api_key: str
    provider: str
    access_role: str  # "admin" | "user" — drives cross-user query permission
    sql_trace: list = field(default_factory=list)  # SQL sub-agent internal call log
