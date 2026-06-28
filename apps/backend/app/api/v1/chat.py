"""Chat endpoints — threads, messages, tool-calling agent integration."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.loop import run as run_agent_loop
from app.api.dependencies.auth import (
    AuthenticatedUser,
    get_current_user,
    require_machine_access,
)
from app.db.database import get_db
from app.db.models import DBChatMessage, DBChatThread
from app.domain.schemas import (
    ChatMessage,
    ChatThread,
    CreateThreadInput,
    RenameThreadInput,
    SendMessageInput,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

_DEFAULT_PROMPT_SUGGESTIONS = [
    "Machine C is vibrating badly. What is happening and what should I do?",
    "Predict failure risk for Machine C from the latest readings.",
    "Simulate Machine C for 10 minutes with mostly high vibration.",
    "Which machines need attention first today?",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _thread_to_schema(thread: DBChatThread) -> ChatThread:
    return ChatThread(
        id=thread.id,
        title=thread.title,
        machineId=thread.machine_id,
        updatedAt=thread.updated_at,
        userId=thread.user_id,
        promptSuggestions=thread.prompt_suggestions,
        followUpSuggestions=thread.follow_up_suggestions,
    )


_VALID_BLOCK_TYPES = {"text", "chart", "links", "table", "status-card", "comparison"}


def _sanitize_block(block: object) -> dict | None:
    if not isinstance(block, dict):
        return {"type": "text", "content": str(block)}
    if block.get("type") not in _VALID_BLOCK_TYPES:
        return None
    if block.get("type") == "chart":
        for point in block.get("data", []):
            value = point.get("value")
            if isinstance(value, list):
                point["value"] = sum(value) / len(value) if value else 0.0
            elif isinstance(value, str):
                import ast

                try:
                    parsed_value = ast.literal_eval(value)
                    point["value"] = (
                        sum(parsed_value) / len(parsed_value)
                        if isinstance(parsed_value, list) and parsed_value
                        else float(parsed_value)
                    )
                except Exception:
                    point["value"] = 0.0
    return block


def _message_to_schema(message: DBChatMessage) -> ChatMessage:
    blocks = [sanitized for block in (message.content_blocks or []) if (sanitized := _sanitize_block(block)) is not None]
    if not blocks:
        blocks = [{"type": "text", "content": ""}]
    return ChatMessage(
        id=message.id,
        threadId=message.thread_id,
        role=message.role,  # type: ignore[arg-type]
        createdAt=message.created_at,
        contentBlocks=blocks,
        agentTrace=message.agent_trace or None,
    )


def _get_owned_thread(db: Session, current_user: AuthenticatedUser, thread_id: str) -> DBChatThread:
    thread = db.get(DBChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Thread '{thread_id}' not found.")
    if thread.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this thread.",
        )
    if thread.machine_id:
        require_machine_access(db, current_user, thread.machine_id)
    return thread


@router.get("/threads", response_model=List[ChatThread])
def list_threads(
    user_id: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = user_id
    threads = (
        db.query(DBChatThread)
        .filter(DBChatThread.user_id == current_user.user_id)
        .order_by(DBChatThread.updated_at.desc())
        .all()
    )
    return [_thread_to_schema(thread) for thread in threads]


@router.post("/threads", response_model=ChatThread)
def create_thread(
    body: CreateThreadInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread_id = str(uuid.uuid4())
    title = body.title or "New Conversation"
    thread = DBChatThread(
        id=thread_id,
        title=title,
        machine_id=None,
        updated_at=_now(),
        user_id=current_user.user_id,
        prompt_suggestions=_DEFAULT_PROMPT_SUGGESTIONS,
        follow_up_suggestions=[],
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _thread_to_schema(thread)


@router.get("/threads/{thread_id}")
def get_thread(
    thread_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = _get_owned_thread(db, current_user, thread_id)
    messages = (
        db.query(DBChatMessage)
        .filter(DBChatMessage.thread_id == thread_id)
        .order_by(DBChatMessage.created_at)
        .all()
    )
    return {
        "thread": _thread_to_schema(thread).model_dump(),
        "messages": [_message_to_schema(message).model_dump() for message in messages],
    }


@router.patch("/threads/{thread_id}", response_model=ChatThread)
def rename_thread(
    thread_id: str,
    body: RenameThreadInput,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = _get_owned_thread(db, current_user, thread_id)
    thread.title = body.title.strip() or thread.title
    db.commit()
    db.refresh(thread)
    return _thread_to_schema(thread)


@router.delete("/threads/{thread_id}", status_code=204)
def delete_thread(
    thread_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = _get_owned_thread(db, current_user, thread_id)
    db.query(DBChatMessage).filter(DBChatMessage.thread_id == thread_id).delete()
    db.delete(thread)
    db.commit()


@router.post("/messages")
def send_message(
    body: SendMessageInput,
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    x_openai_key: Optional[str] = Header(None, alias="X-OpenAI-Key"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = _get_owned_thread(db, current_user, body.threadId)

    from app.agents.llm_factory import SUPPORTED_PROVIDERS
    from app.config import settings

    provider = (x_llm_provider or settings.default_llm_provider).lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported LLM provider '{provider}'. Choose from: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    if provider == "gemini":
        api_key = x_api_key or x_openai_key or settings.gemini_api_key or ""
    elif provider == "ollama":
        api_key = ""
    elif provider == "deepseek":
        api_key = x_api_key or x_openai_key or getattr(settings, "deepseek_api_key", None) or ""
    else:
        api_key = x_api_key or x_openai_key or settings.openai_api_key or ""

    user_msg = DBChatMessage(
        id=str(uuid.uuid4()),
        thread_id=body.threadId,
        role="user",
        created_at=_now(),
        content_blocks=[{"type": "text", "content": body.text}],
    )
    db.add(user_msg)
    db.flush()

    # Build conversation history in OpenAI format
    all_msgs = (
        db.query(DBChatMessage)
        .filter(DBChatMessage.thread_id == body.threadId)
        .order_by(DBChatMessage.created_at)
        .all()
    )
    openai_messages: list[dict] = []
    for message in all_msgs:
        if not message.content_blocks:
            continue
        if message.role == "user":
            first = message.content_blocks[0]
            content = first["content"] if isinstance(first, dict) else str(first)
            openai_messages.append({"role": "user", "content": content})
        else:
            text_parts = [
                block["content"] if isinstance(block, dict) else block
                for block in message.content_blocks
                if isinstance(block, str) or (isinstance(block, dict) and block.get("type") == "text")
            ]
            content = "\n".join(text_parts) if text_parts else "[assistant response]"
            openai_messages.append({"role": "assistant", "content": content})

    # machineId from message body takes precedence over thread-level machine_id
    effective_machine_id = body.machineId or thread.machine_id
    working_memory = thread.working_memory or {}

    try:
        final_answer = run_agent_loop(
            messages=openai_messages,
            db=db,
            user_id=current_user.user_id,
            machine_id=effective_machine_id,
            api_key=api_key,
            provider=provider,
            access_role=current_user.access_role,
            thread_id=body.threadId,
            working_memory=working_memory,
        )
    except Exception as exc:
        logger.error("Agent invocation failed: %s", exc)
        final_answer = {
            "content_blocks": [{"type": "text", "content": f"Agent error: {exc}"}],
            "follow_up_suggestions": [],
        }

    content_blocks = final_answer.get(
        "content_blocks",
        [{"type": "text", "content": "I was unable to generate a response."}],
    )
    follow_ups = final_answer.get("follow_up_suggestions", [])

    asst_msg = DBChatMessage(
        id=str(uuid.uuid4()),
        thread_id=body.threadId,
        role="assistant",
        created_at=_now(),
        content_blocks=content_blocks,
        agent_trace=final_answer.get("agent_trace") or None,
    )
    db.add(asst_msg)

    thread.updated_at = _now()
    thread.follow_up_suggestions = follow_ups[:4]
    thread.working_memory = final_answer.get("working_memory") or None
    if thread.title == "New Conversation" and body.text:
        thread.title = body.text[:60] + ("..." if len(body.text) > 60 else "")

    db.commit()

    final_messages = (
        db.query(DBChatMessage)
        .filter(DBChatMessage.thread_id == body.threadId)
        .order_by(DBChatMessage.created_at)
        .all()
    )

    return {
        "thread": _thread_to_schema(thread).model_dump(),
        "messages": [_message_to_schema(message).model_dump() for message in final_messages],
    }
