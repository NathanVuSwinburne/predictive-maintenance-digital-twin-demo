"""Load and index maintenance documents into a FAISS vector store."""
from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# One vector store per embedding provider so indexes don't cross-contaminate.
_vector_stores: Dict[str, object] = {}
_initialized_providers: set = set()

# Backward-compat sentinel used by retriever lazy-init check.
_is_initialized: bool = False


def _split_markdown(text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
    """Simple sliding-window splitter on newlines."""
    lines = text.splitlines(keepends=True)
    chunks: List[str] = []
    current = []
    current_len = 0

    for line in lines:
        current.append(line)
        current_len += len(line)
        if current_len >= chunk_size:
            chunks.append("".join(current))
            kept, kept_len = [], 0
            for l in reversed(current):
                kept_len += len(l)
                kept.insert(0, l)
                if kept_len >= overlap:
                    break
            current = kept
            current_len = kept_len

    if current:
        chunks.append("".join(current))
    return [c.strip() for c in chunks if c.strip()]


def initialize(
    docs_dir: str,
    api_key: Optional[str] = None,
    provider: str = "openai",
    ollama_base_url: Optional[str] = None,
) -> None:
    """Build a FAISS index from markdown files using the specified embedding provider.

    provider: "openai" | "ollama" | "gemini"
    api_key:  OpenAI or Gemini key (not required for Ollama)
    """
    global _vector_stores, _initialized_providers, _is_initialized

    if provider in _initialized_providers:
        return

    try:
        import faiss  # noqa: F401 — presence check
        from langchain_community.vectorstores import FAISS
        from langchain_core.documents import Document
    except ImportError as e:
        logger.warning("RAG dependencies not available: %s. RAG will be disabled.", e)
        return

    # Guard: non-Ollama providers need a key
    if provider != "ollama" and not api_key:
        logger.warning(
            "No API key provided for provider '%s' — RAG knowledge base will not be indexed.",
            provider,
        )
        return

    md_files = [
        os.path.join(docs_dir, f)
        for f in os.listdir(docs_dir)
        if f.endswith(".md")
    ]

    if not md_files:
        logger.warning("No markdown files found in %s", docs_dir)
        return

    docs: List[Document] = []
    for path in md_files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        for chunk in _split_markdown(text):
            docs.append(Document(page_content=chunk, metadata={"source": os.path.basename(path)}))

    if not docs:
        return

    try:
        from app.agents.llm_factory import get_embeddings
        embeddings = get_embeddings(
            provider=provider,
            api_key=api_key,
            ollama_base_url=ollama_base_url,
        )
        vs = FAISS.from_documents(docs, embeddings)
        _vector_stores[provider] = vs
        _initialized_providers.add(provider)
        # Mark the legacy sentinel so retriever lazy-init skips duplicate work
        _is_initialized = True
        logger.info(
            "RAG knowledge base initialized for provider '%s' with %d chunks from %d file(s).",
            provider, len(docs), len(md_files),
        )
    except Exception as exc:
        logger.error("Failed to build RAG index for provider '%s': %s", provider, exc)


def get_vector_store(provider: str = "openai"):
    """Return the FAISS vector store for the given provider, or None."""
    return _vector_stores.get(provider)
