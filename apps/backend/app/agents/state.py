"""LangGraph AgentState definition."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from langchain_core.messages import BaseMessage
from typing_extensions import TypedDict


class AgentState(TypedDict):
    messages: List[BaseMessage]
    thread_id: str
    user_id: Optional[str]
    machine_id: Optional[str]
    query_type: str   # resolved: "data_lookup" | "prediction" | "simulation" | "maintenance" | "general"
    query_mode: str   # user selection: "auto" | task override; legacy aliases accepted
    telemetry_data: Optional[Dict[str, Any]]
    ml_prediction: Optional[Dict[str, Any]]
    rag_context: Optional[str]
    sql_context: Optional[Dict[str, Any]]  # structured: {"queries": [...], "total_rows": int}
    agent_plan: Optional[Dict[str, Any]]
    scenario_plan: Optional[Dict[str, Any]]
    tool_result: Optional[Dict[str, Any]]
    final_answer: Optional[Dict[str, Any]]
    api_key: str
    llm_provider: str  # "openai" | "ollama" | "gemini"
