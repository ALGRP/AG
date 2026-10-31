"""Durable single-use nonce ledger, co-located with the board it guards.

CORRECTION (31.10.2026, after review on ALGRP/AG#5): an earlier version of
this module kept the ledger in its OWN database file and handed the effect a
connection to that file. The broker's effect ignored it and opened the board
DB separately, committing board state BEFORE the ledger's COMMIT. Two separate
SQLite files cannot share one transaction, so a crash in between left the task
done and the nonce unspent -- replayable. The "same transaction" claim was
false for that shape.

The ledger now lives as a TABLE INSIDE the board's own database, so the nonce
consume and the effect are one `BEGIN IMMEDIATE` transaction on one file, and
`effect` is handed that very connection. There is no second connection and no
separate ledger path to misconfigure.

WAL note: single-file transactions are atomic under WAL. This is deliberately
NOT an ATTACH across two files, which SQLite does not commit atomically in WAL
mode.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Callable


class ReplayError(Exception):
    pass


class BoardLedger:
    """Owns the write path for ONE board database."""

    def __init__(self, board_db_path: str) -> None:
        self.path = board_db_path
        conn = self._connect()
        try:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS nonce_ledger (
                       nonce       TEXT PRIMARY KEY,
                       board       TEXT NOT NULL,
                       sub_uid     INTEGER NOT NULL,
                       task        TEXT NOT NULL,
                       action      TEXT NOT NULL,
                       consumed_at REAL NOT NULL
                   )"""
            )
        finally:
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        # isolation_level=None -> we issue BEGIN IMMEDIATE ourselves and python
        # never opens an implicit transaction behind our back.
        conn = sqlite3.connect(self.path, timeout=10.0, isolation_level=None)
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    def consume_and_apply(self, claims: dict[str, Any],
                          effect: Callable[[sqlite3.Connection], Any],
                          after_effect_hook: Callable[[], Any] | None = None,
                          ) -> Any:
        """Burn the nonce and run `effect` in ONE transaction on ONE file.

        `effect` MUST use the connection it is given and MUST NOT commit.
        Any exception rolls back both the nonce and the effect, so the caller
        may safely retry with the same capability.

        `after_effect_hook` exists only so the test battery can inject a
        failure after the effect but before the commit; production passes None.
        """
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT INTO nonce_ledger(nonce, board, sub_uid, task,"
                    " action, consumed_at)"
                    " VALUES (?,?,?,?,?, strftime('%s','now'))",
                    (claims["nonce"], claims["board"], claims["sub_uid"],
                     claims["task"], claims["action"]),
                )
            except sqlite3.IntegrityError as exc:
                conn.execute("ROLLBACK")
                raise ReplayError(
                    f"nonce already consumed: {claims['nonce'][:12]}..."
                ) from exc

            result = effect(conn)

            if after_effect_hook is not None:
                after_effect_hook()      # may raise -> everything rolls back

            conn.execute("COMMIT")
            return result
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
        finally:
            conn.close()


def nonce_spent(board_db_path: str, nonce: str) -> bool:
    conn = sqlite3.connect(board_db_path)
    try:
        row = conn.execute(
            "SELECT 1 FROM nonce_ledger WHERE nonce=?", (nonce,)).fetchone()
        return row is not None
    finally:
        conn.close()
