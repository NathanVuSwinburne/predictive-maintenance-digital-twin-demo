"""Schema drift detection utilities for developer-facing startup checks."""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.sql.schema import MetaData

DEFAULT_IGNORED_TABLES = frozenset({"sqlite_sequence", "alembic_version"})
MANUAL_RESET_COMMAND = "python3 -m app.db.seed --reset"


@dataclass
class SchemaDriftReport:
    """Describes differences between expected ORM schema and live database schema."""

    existing_tables: list[str] = field(default_factory=list)
    expected_tables: list[str] = field(default_factory=list)
    missing_tables: list[str] = field(default_factory=list)
    unexpected_tables: list[str] = field(default_factory=list)
    missing_columns: dict[str, list[str]] = field(default_factory=dict)
    unexpected_columns: dict[str, list[str]] = field(default_factory=dict)

    @property
    def has_existing_schema(self) -> bool:
        return bool(self.existing_tables)

    @property
    def is_outdated(self) -> bool:
        return any(
            [
                self.missing_tables,
                self.unexpected_tables,
                self.missing_columns,
                self.unexpected_columns,
            ]
        )


def detect_schema_drift(
    *,
    db_engine: Engine,
    metadata: MetaData,
    ignored_tables: set[str] | None = None,
) -> SchemaDriftReport:
    """Compare live DB tables/columns to SQLAlchemy metadata."""
    ignored = set(DEFAULT_IGNORED_TABLES)
    if ignored_tables:
        ignored.update(ignored_tables)

    inspector = inspect(db_engine)
    existing_tables = sorted(
        table for table in inspector.get_table_names() if table not in ignored
    )
    expected_tables = sorted(
        table for table in metadata.tables.keys() if table not in ignored
    )

    existing_set = set(existing_tables)
    expected_set = set(expected_tables)

    missing_tables = sorted(expected_set - existing_set)
    unexpected_tables = sorted(existing_set - expected_set)

    missing_columns: dict[str, list[str]] = {}
    unexpected_columns: dict[str, list[str]] = {}

    for table_name in sorted(existing_set & expected_set):
        expected_cols = set(metadata.tables[table_name].columns.keys())
        actual_cols = {
            column_info["name"] for column_info in inspector.get_columns(table_name)
        }

        table_missing = sorted(expected_cols - actual_cols)
        table_unexpected = sorted(actual_cols - expected_cols)

        if table_missing:
            missing_columns[table_name] = table_missing
        if table_unexpected:
            unexpected_columns[table_name] = table_unexpected

    return SchemaDriftReport(
        existing_tables=existing_tables,
        expected_tables=expected_tables,
        missing_tables=missing_tables,
        unexpected_tables=unexpected_tables,
        missing_columns=missing_columns,
        unexpected_columns=unexpected_columns,
    )


def format_schema_drift_report(
    report: SchemaDriftReport,
    *,
    include_missing_tables: bool = True,
) -> list[str]:
    """Render schema drift details as log-ready lines."""
    lines: list[str] = []

    if include_missing_tables and report.missing_tables:
        lines.append(f"Missing tables: {', '.join(report.missing_tables)}")

    if report.unexpected_tables:
        lines.append(f"Unexpected tables: {', '.join(report.unexpected_tables)}")

    for table_name in sorted(report.missing_columns):
        lines.append(
            f"Missing columns in {table_name}: {', '.join(report.missing_columns[table_name])}"
        )

    for table_name in sorted(report.unexpected_columns):
        lines.append(
            f"Unexpected columns in {table_name}: {', '.join(report.unexpected_columns[table_name])}"
        )

    return lines
