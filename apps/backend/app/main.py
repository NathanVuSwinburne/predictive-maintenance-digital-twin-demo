"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.config import settings
from app.db.database import SessionLocal, create_tables, engine
from app.db.models import Base
from app.db.schema_drift import (
    MANUAL_RESET_COMMAND,
    detect_schema_drift,
    format_schema_drift_report,
)
from app.db.seed import seed_all
from app.ml.inference import load_models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.testing:
        logger.warning(
            "--- Running in TEST mode. To disable test mode, set testing=false in config.py. ---"
        )
    else:
        logger.info(
            "--- Running in PRODUCTION mode. To enable test mode, set testing=true in config.py. ---"
        )

    # Startup
    pre_create_report = detect_schema_drift(db_engine=engine, metadata=Base.metadata)

    logger.info("Creating database tables...")
    create_tables()

    # Add new nullable columns to existing DBs without a full reset
    from sqlalchemy import text
    with engine.connect() as _conn:
        for _stmt in [
            "ALTER TABLE chat_threads ADD COLUMN working_memory TEXT",
        ]:
            try:
                _conn.execute(text(_stmt))
                _conn.commit()
                logger.info("Migration applied: %s", _stmt)
            except Exception:
                pass  # column already exists

    post_create_report = detect_schema_drift(db_engine=engine, metadata=Base.metadata)

    drift_detected = False

    if pre_create_report.has_existing_schema and pre_create_report.missing_tables:
        drift_detected = True
        logger.warning(
            "This database existed before the latest schema and is missing tables from the current SQLAlchemy models. This may indicate an outdated database schema - a reset may be required to sync with the latest SQLAlchemy models."
        )
        for line in format_schema_drift_report(
            pre_create_report,
            include_missing_tables=True,
        ):
            logger.warning("Schema change: %s", line)

    if post_create_report.is_outdated:
        drift_detected = True
        logger.warning(
            "Detected schema drift after table creation. SQLAlchemy create_all does not remove old tables or add missing columns. A database reset may be required to fully sync the database schema with the latest SQLAlchemy models."
        )
        for line in format_schema_drift_report(
            post_create_report,
            include_missing_tables=False,
        ):
            logger.warning("Schema change: %s", line)

    if drift_detected:
        logger.warning(
            "Optional action: reset and reseed to the latest schema/data with: %s",
            MANUAL_RESET_COMMAND,
        )
        logger.warning("No reset was performed automatically.")

    if settings.testing:
        logger.info("Test mode is enabled - Seeding database...")
        db = SessionLocal()
        try:
            seed_all(db)
        finally:
            db.close()
    else:
        logger.info("Test mode is disabled - Skipping database seeding.")
    logger.info("Loading ML models...")
    load_models()
    logger.info("Backend ready.")
    yield
    # Shutdown


app = FastAPI(
    title="Predictive Maintenance Digital Twin API",
    version="1.0.0",
    description="Agentic AI backend for industrial predictive maintenance.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
