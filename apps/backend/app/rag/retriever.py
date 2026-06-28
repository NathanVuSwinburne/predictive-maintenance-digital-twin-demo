"""RAG retrieval interface."""
from __future__ import annotations

import logging
from typing import Optional

from app.rag import knowledge_base

logger = logging.getLogger(__name__)


def retrieve(
    query: str,
    api_key: Optional[str] = None,
    provider: str = "openai",
    ollama_base_url: Optional[str] = None,
    k: int = 4,
) -> str:
    """Retrieve the top-k relevant chunks for a query.

    Returns concatenated text or an empty string if unavailable.
    Performs lazy initialization of the vector store on the first call
    for a given provider.
    """
    vs = knowledge_base.get_vector_store(provider)

    if vs is None:
        if provider in knowledge_base._initialized_providers:
            # Already attempted but failed (e.g. missing key/model)
            return ""

        # Lazy init for this provider
        from app.config import settings
        knowledge_base.initialize(
            docs_dir=settings.rag_docs_path(),
            api_key=api_key,
            provider=provider,
            ollama_base_url=ollama_base_url or settings.ollama_base_url,
        )
        vs = knowledge_base.get_vector_store(provider)

    if vs is None:
        logger.debug("RAG vector store not available for provider '%s'; returning empty context.", provider)
        return ""

    try:
        results = vs.similarity_search(query, k=k)
        return "\n\n---\n\n".join(doc.page_content for doc in results)
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return ""
