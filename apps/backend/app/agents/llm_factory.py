"""Factory functions for creating LLM and embedding instances by provider."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = ("openai", "ollama", "gemini", "deepseek")


def get_llm(
    provider: str,
    api_key: Optional[str] = None,
    ollama_base_url: Optional[str] = None,
    model: Optional[str] = None,
):
    """Return a LangChain chat model for the given provider.

    provider: "openai" | "ollama" | "gemini"
    api_key:  OpenAI or Gemini key (ignored for Ollama)
    ollama_base_url: Ollama server URL (default http://localhost:11434)
    model:    override the default model name for the chosen provider
    """
    from app.config import settings

    provider = provider.lower()

    if provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            raise ImportError(
                "langchain-ollama is not installed. Run: pip install langchain-ollama"
            )
        base_url = ollama_base_url or settings.ollama_base_url
        model_name = model or settings.ollama_model
        num_ctx = settings.ollama_num_ctx
        logger.debug("LLM: Ollama model=%s base_url=%s num_ctx=%d", model_name, base_url, num_ctx)
        return ChatOllama(model=model_name, base_url=base_url, temperature=0.3, timeout=120, num_ctx=num_ctx)

    elif provider == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError:
            raise ImportError(
                "langchain-google-genai is not installed. Run: pip install langchain-google-genai"
            )
        key = api_key or settings.gemini_api_key
        model_name = model or settings.gemini_model
        logger.debug("LLM: Gemini model=%s", model_name)
        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=key,
            temperature=0.3,
        )

    elif provider == "deepseek":
        from langchain_openai import ChatOpenAI
        model_name = model or "deepseek-chat"
        key = api_key or settings.deepseek_api_key or ""
        logger.debug("LLM: DeepSeek model=%s", model_name)
        return ChatOpenAI(
            model=model_name,
            temperature=0.3,
            api_key=key,
            base_url="https://api.deepseek.com",
        )

    else:  # openai (default)
        from langchain_openai import ChatOpenAI
        model_name = model or settings.openai_model
        logger.debug("LLM: OpenAI model=%s", model_name)
        return ChatOpenAI(model=model_name, temperature=0.3, api_key=api_key)


def get_embeddings(
    provider: str,
    api_key: Optional[str] = None,
    ollama_base_url: Optional[str] = None,
    model: Optional[str] = None,
):
    """Return a LangChain embeddings instance for the given provider."""
    from app.config import settings

    provider = provider.lower()

    if provider == "ollama":
        try:
            from langchain_ollama import OllamaEmbeddings
        except ImportError:
            raise ImportError(
                "langchain-ollama is not installed. Run: pip install langchain-ollama"
            )
        base_url = ollama_base_url or settings.ollama_base_url
        model_name = model or settings.ollama_embedding_model
        logger.debug("Embeddings: Ollama model=%s base_url=%s", model_name, base_url)
        return OllamaEmbeddings(model=model_name, base_url=base_url)

    elif provider == "gemini":
        try:
            from langchain_google_genai import GoogleGenerativeAIEmbeddings
        except ImportError:
            raise ImportError(
                "langchain-google-genai is not installed. Run: pip install langchain-google-genai"
            )
        key = api_key or settings.gemini_api_key
        model_name = model or "models/text-embedding-004"
        logger.debug("Embeddings: Gemini model=%s", model_name)
        return GoogleGenerativeAIEmbeddings(model=model_name, google_api_key=key)

    else:  # openai
        from langchain_openai import OpenAIEmbeddings
        logger.debug("Embeddings: OpenAI")
        return OpenAIEmbeddings(api_key=api_key)
