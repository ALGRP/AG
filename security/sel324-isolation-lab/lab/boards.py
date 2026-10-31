"""Synthetic two-board fixtures.

Mirrors the shape of a Hermes kanban board DB (tasks + runs) closely enough to
exercise the SEC-01 controls, but holds only sentinel strings -- never real
tenant, project, customer or booking data.
"""
from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass

SENTINEL_A = "APPROVED_A"
SENTINEL_B = "FORBIDDEN_B"

BOARD_A = "agos-control"
BOARD_B = "agos-continuous"


@dataclass(frozen=True)
class Board:
    name: str
    sentinel: str
    root: str          # directory that holds kanban.db (+ -wal/-shm)
    db_path: str
    owner_uid: int
    owner_gid: int


def _schema(conn: sqlite3.Connection, sentinel: str, board: str) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS board_identity (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
            task_id    TEXT PRIMARY KEY,
            board      TEXT NOT NULL,
            tenant     TEXT,
            project_id TEXT,
            state      TEXT NOT NULL,
            run_id     TEXT,
            assignee   TEXT
        );
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO board_identity(k, v) VALUES ('sentinel', ?)",
        (sentinel,),
    )
    conn.execute(
        "INSERT OR REPLACE INTO board_identity(k, v) VALUES ('board', ?)",
        (board,),
    )
    conn.execute(
        "INSERT OR REPLACE INTO tasks(task_id, board, tenant, project_id, state,"
        " run_id, assignee) VALUES (?,?,?,?,?,?,?)",
        (f"t_{board}_1", board, "AGOS_SYNTHETIC", "p_synthetic", "claimed",
         f"run_{board}_1", "agosdev"),
    )
    conn.commit()


def make_board(root: str, name: str, sentinel: str, owner_uid: int,
               owner_gid: int, mode: int = 0o700,
               wal: bool = True) -> Board:
    """Create <root>/kanban.db with the given owner/mode. Root dir gets `mode`."""
    os.makedirs(root, exist_ok=True)
    db_path = os.path.join(root, "kanban.db")
    conn = sqlite3.connect(db_path)
    try:
        if wal:
            conn.execute("PRAGMA journal_mode=WAL")
        _schema(conn, sentinel, name)
    finally:
        conn.close()
    for p in (db_path, db_path + "-wal", db_path + "-shm"):
        if os.path.exists(p):
            os.chown(p, owner_uid, owner_gid)
            os.chmod(p, 0o600)
    os.chown(root, owner_uid, owner_gid)
    os.chmod(root, mode)
    return Board(name=name, sentinel=sentinel, root=root, db_path=db_path,
                 owner_uid=owner_uid, owner_gid=owner_gid)


def read_sentinel(conn: sqlite3.Connection) -> str | None:
    try:
        row = conn.execute(
            "SELECT v FROM board_identity WHERE k='sentinel'").fetchone()
        return row[0] if row else None
    except sqlite3.Error:
        return None
