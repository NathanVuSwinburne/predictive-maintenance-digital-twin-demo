"""LLM Wiki knowledge base tools — supervisor wiki (project-local) and Obsidian vault."""
from __future__ import annotations

import os

from app.config import settings


def _resolve_path(namespace: str | None) -> str | None:
    """Map a namespace to its filesystem path.

    namespace="supervisor" → project-local agent_wiki/supervisor/
    namespace=None         → external Obsidian vault (knowledge_vault_path)
    Any other string       → subdirectory inside the Obsidian vault
    """
    if namespace == "supervisor":
        return settings.supervisor_wiki_path()
    vault = settings.knowledge_vault_path or None
    if not vault:
        return None
    return os.path.join(vault, namespace) if namespace else vault


def list_knowledge_notes(namespace: str | None = None) -> dict:
    """Return all note titles in the knowledge base.

    namespace="supervisor" → supervisor agent wiki (project-local routing/tool knowledge).
    namespace=None         → main Obsidian vault (dataset notes, ML models, architecture).
    """
    path = _resolve_path(namespace)
    if not path:
        return {"error": "Knowledge base not configured. Set KNOWLEDGE_VAULT_PATH env var."}
    if not os.path.isdir(path):
        return {"error": f"Wiki path not found for namespace='{namespace}'.", "path": path}
    titles = [
        os.path.splitext(f)[0]
        for f in sorted(os.listdir(path))
        if f.endswith(".md")
    ]
    return {"notes": titles, "count": len(titles), "namespace": namespace}


def read_knowledge_note(title: str, namespace: str | None = None) -> dict:
    """Read a knowledge base note by title (without .md extension).

    namespace="supervisor" → supervisor agent wiki.
    namespace=None         → main Obsidian vault.
    """
    path = _resolve_path(namespace)
    if not path:
        return {"error": "Knowledge base not configured."}

    exact = os.path.join(path, title + ".md")
    if os.path.isfile(exact):
        with open(exact, encoding="utf-8") as fh:
            return {"title": title, "namespace": namespace, "content": fh.read()}

    target = (title + ".md").lower()
    for fname in os.listdir(path):
        if fname.lower() == target:
            fp = os.path.join(path, fname)
            with open(fp, encoding="utf-8") as fh:
                return {"title": os.path.splitext(fname)[0], "namespace": namespace, "content": fh.read()}

    return {
        "error": f"Note '{title}' not found (namespace='{namespace}').",
        "hint": "Call list_knowledge_notes to see available titles.",
    }


# ---------------------------------------------------------------------------
# SQL agent wiki — injected into llm_planner, not exposed as agent tools
# ---------------------------------------------------------------------------

def load_sql_wiki_context(pages: list[str] | None = None) -> str:
    """Load SQL agent wiki pages for injection into the planner prompt.

    pages: titles to load. Defaults to index + gotchas + machine-routing.
    Returns combined markdown, or empty string if wiki not available.
    """
    wiki_path = settings.sql_wiki_path()
    if not os.path.isdir(wiki_path):
        return ""

    load = pages or ["index", "gotchas", "machine-routing"]
    parts: list[str] = []
    for title in load:
        fp = os.path.join(wiki_path, title + ".md")
        if os.path.isfile(fp):
            with open(fp, encoding="utf-8") as fh:
                parts.append(f"## [{title}]\n{fh.read()}")
    return "\n\n".join(parts)
