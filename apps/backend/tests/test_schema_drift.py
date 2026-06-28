from __future__ import annotations

from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, text

from app.db.schema_drift import detect_schema_drift, format_schema_drift_report


def test_schema_drift_reports_in_sync_schema(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'schema_ok.db'}")

    metadata = MetaData()
    Table(
        "users",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String, nullable=False),
    )

    metadata.create_all(engine)

    report = detect_schema_drift(db_engine=engine, metadata=metadata)

    assert report.has_existing_schema is True
    assert report.is_outdated is False
    assert format_schema_drift_report(report) == []


def test_schema_drift_reports_missing_and_unexpected_objects(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'schema_drift.db'}")

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    legacy_status VARCHAR
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE telemetry (
                    id INTEGER PRIMARY KEY,
                    value FLOAT
                )
                """
            )
        )

    metadata = MetaData()
    Table(
        "users",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String, nullable=False),
        Column("email", String, nullable=False),
    )
    Table(
        "machines",
        metadata,
        Column("id", Integer, primary_key=True),
    )

    report = detect_schema_drift(db_engine=engine, metadata=metadata)
    lines = format_schema_drift_report(report)

    assert report.has_existing_schema is True
    assert report.is_outdated is True
    assert report.missing_tables == ["machines"]
    assert report.unexpected_tables == ["telemetry"]
    assert report.missing_columns == {"users": ["email"]}
    assert report.unexpected_columns == {"users": ["legacy_status"]}
    assert "Missing tables: machines" in lines
    assert "Unexpected tables: telemetry" in lines
    assert "Missing columns in users: email" in lines
    assert "Unexpected columns in users: legacy_status" in lines
