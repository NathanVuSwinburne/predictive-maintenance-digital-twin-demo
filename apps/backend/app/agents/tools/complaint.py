"""Complaint extraction tool — converts free-text operator complaints into structured signals."""
from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """\
You are a predictive maintenance analyst. Extract structured anomaly information from the maintenance complaint below.

Return ONLY a valid JSON object — no markdown fences, no extra text:
{
  "machine_reference": "machine name or ID mentioned, or null",
  "symptom_type": "noise" | "vibration" | "temperature" | "performance" | "leakage" | "other",
  "description": "concise technical description of the symptom",
  "onset": "when the issue started in natural language, or null",
  "implied_sensor": "temperature" | "vibration" | "pressure" | "power" | null,
  "severity_estimate": "low" | "medium" | "high" | "unknown",
  "confidence": 0.0-to-1.0,
  "recommended_next_tools": ["list from: get_machine_telemetry, run_failure_prediction, run_simulation, get_history_events"]
}

Complaint: """


def extract_signal_from_complaint(
    text: str,
    machine_id: Optional[str] = None,
    api_key: Optional[str] = None,
    provider: str = "openai",
    model: Optional[str] = None,
) -> dict:
    """Parse a free-text maintenance complaint into a structured anomaly signal.

    Falls back to keyword extraction if the LLM call fails.
    """
    try:
        result = _llm_extract(text, api_key=api_key, provider=provider, model=model)
    except Exception as exc:
        logger.warning("LLM complaint extraction failed, using keyword fallback: %s", exc)
        result = _keyword_fallback(text)

    if machine_id and not result.get("machine_id"):
        result["machine_id"] = machine_id

    return result


def _llm_extract(text: str, api_key: str | None, provider: str, model: str | None) -> dict:
    from openai import OpenAI
    from app.config import settings

    if provider == "ollama":
        client = OpenAI(
            api_key="ollama",
            base_url=settings.ollama_base_url.rstrip("/") + "/v1",
        )
        model_name = model or settings.ollama_model
    elif provider == "deepseek":
        client = OpenAI(
            api_key=api_key or getattr(settings, "deepseek_api_key", None) or "",
            base_url="https://api.deepseek.com",
        )
        model_name = model or "deepseek-chat"
    elif provider == "gemini":
        client = OpenAI(
            api_key=api_key or settings.gemini_api_key or "",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        model_name = model or settings.gemini_model
    else:
        client = OpenAI(api_key=api_key or settings.openai_api_key or "")
        model_name = model or settings.openai_model

    response = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": _EXTRACTION_PROMPT + text}],
        temperature=0.0,
        max_tokens=400,
    )

    raw = (response.choices[0].message.content or "{}").strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    extracted = json.loads(raw)
    extracted["machine_id"] = extracted.pop("machine_reference", extracted.get("machine_id"))
    return extracted


def _keyword_fallback(text: str) -> dict:
    """Keyword-based extraction when LLM is unavailable or fails."""
    text_lower = text.lower()

    if any(w in text_lower for w in ["grind", "squeak", "noise", "sound", "clank", "rattle"]):
        symptom_type, implied_sensor = "noise", "vibration"
    elif any(w in text_lower for w in ["vibrat", "shake", "tremor", "wobble"]):
        symptom_type, implied_sensor = "vibration", "vibration"
    elif any(w in text_lower for w in ["hot", "heat", "temperature", "overheat", "burn"]):
        symptom_type, implied_sensor = "temperature", "temperature"
    elif any(w in text_lower for w in ["slow", "power", "performance", "output", "weak"]):
        symptom_type, implied_sensor = "performance", "power"
    elif any(w in text_lower for w in ["leak", "drip", "fluid", "oil", "moisture"]):
        symptom_type, implied_sensor = "leakage", "pressure"
    else:
        symptom_type, implied_sensor = "other", "vibration"

    if any(w in text_lower for w in ["critical", "urgent", "emergency", "stop", "shutdown"]):
        severity = "high"
    elif any(w in text_lower for w in ["bad", "worsen", "worse", "increasing", "getting"]):
        severity = "medium"
    else:
        severity = "unknown"

    return {
        "machine_id": None,
        "symptom_type": symptom_type,
        "description": text[:200],
        "onset": None,
        "implied_sensor": implied_sensor,
        "severity_estimate": severity,
        "confidence": 0.4,
        "recommended_next_tools": ["get_machine_telemetry", "get_history_events"],
    }
