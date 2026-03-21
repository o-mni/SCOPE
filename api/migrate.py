"""
SCOPE — SQLite schema migration helper.

Called once at startup (before any request handling) to add columns
introduced after the initial schema was created.

SQLite ALTER TABLE only supports ADD COLUMN, so each step is
attempt-and-ignore: if the column already exists the statement will
raise an OperationalError which we catch and discard.
"""
from sqlalchemy import text
from database import engine


def run_migrations() -> None:
    # v1.1 — checklist system
    _add_column_if_missing(
        "findings", "task_id",
        "INTEGER REFERENCES assessment_tasks(id) ON DELETE SET NULL",
    )

    # v1.2 — wizard coverage selection
    _add_column_if_missing(
        "assessments", "module_names",
        "TEXT DEFAULT '[]'",
    )
    _add_column_if_missing(
        "assessments", "template_id",
        "TEXT",
    )
    _add_column_if_missing(
        "assessment_tasks", "domain_id",
        "TEXT",
    )


def _add_column_if_missing(table: str, column: str, column_def: str) -> None:
    stmt = f"ALTER TABLE {table} ADD COLUMN {column} {column_def}"
    with engine.connect() as conn:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            # Column already exists — safe to ignore
            pass
