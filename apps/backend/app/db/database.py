"""Database engine and session factory."""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Base


def _engine_kwargs(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {
            "connect_args": {"check_same_thread": False},
        }

    return {
        "pool_pre_ping": True,
    }


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_tables() -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def drop_tables() -> None:
    """Drop all tables."""
    Base.metadata.drop_all(bind=engine)


def reset_database() -> None:
    """Reset the current database schema."""
    drop_tables()
    create_tables()


def reconfigure_database(database_url: str) -> None:
    """Rebind the global engine/sessionmaker, primarily for tests."""
    global engine

    settings.database_url = database_url
    engine.dispose()
    engine = create_engine(database_url, **_engine_kwargs(database_url))
    SessionLocal.configure(bind=engine)


def get_db():
    """FastAPI dependency that yields a SQLAlchemy session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
