from __future__ import annotations

import os
from typing import List, Optional, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # LLM provider selection: "openai" | "ollama" | "gemini"
    default_llm_provider: str = "openai"

    # OpenAI
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"  # answer node
    ollama_sql_model: str = "deepseek-coder:6.7b"  # SQL agent
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_num_ctx: int = (
        4096  # prompt + schema + response fits ~3000 tokens; 4096 gives safe headroom
    )

    # Google Gemini
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.1-flash-lite"

    # DeepSeek (OpenAI-compatible at https://api.deepseek.com)
    deepseek_api_key: Optional[str] = None

    database_url: str = (
        "postgresql://postgres:postgres@localhost:5432/predictive_maintenance"
    )
    testing: bool = True

    cors_origins: Union[List[str], str] = ["http://localhost:3000"]
    models_dir: str = "models"
    rag_docs_dir: str = "rag_docs"
    supervisor_wiki_dir: str = "agent_wiki/supervisor"
    sql_wiki_dir: str = "agent_wiki/sql"
    knowledge_vault_path: Optional[str] = None  # absolute path to external Obsidian vault

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def models_path(self) -> str:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, self.models_dir)

    def rag_docs_path(self) -> str:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, self.rag_docs_dir)

    def supervisor_wiki_path(self) -> str:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, self.supervisor_wiki_dir)

    def sql_wiki_path(self) -> str:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, self.sql_wiki_dir)


settings = Settings()
