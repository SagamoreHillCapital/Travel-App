import os
import sqlite3
from pathlib import Path

DB_PATH = os.getenv("DB_PATH", "/data/eta.db")


def get_conn() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS companies (
                domain TEXT PRIMARY KEY,
                name TEXT,
                website TEXT,
                snippet TEXT,
                location TEXT,
                owner TEXT,
                employees TEXT,
                specialties TEXT,
                triage_status TEXT DEFAULT 'open',
                notes TEXT DEFAULT '',
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
