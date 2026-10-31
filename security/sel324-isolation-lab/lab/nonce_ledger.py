"""Durable single-use nonce ledger.

The SEL-433 contract requires that the nonce consume and the effect land in the
SAME `BEGIN IMMEDIATE` transaction, so a crash or a concurrent caller can never
produce "nonce burned but effect lost" or "effect applied twice".

`consume_and_apply` is the only public entry point, and it takes the effect as a
callback executed INSIDE the write transaction. That shape is what makes the
single-winner and replay-after-restart controls hold.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Callable


class ReplayError(Exception):
    pass


class NonceLedger:
    def __init__(self, path: str) -> None:
        self.path = path
        conn = self._connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """CREATE TABLE IF NOT EXISTS nonce_ledger (
                       nonce     TEXT PRIMARY KEY,
                       board     TEXT NOT NULL,
                       sub_uid   INTEGER NOT NULL,
                       task      TEXT NOT NULL,
                       action    TEXT NOT NULL,
                       consumed_at REAL NOT NULL
                   )"""
            )
            conn.commit()
        finally:
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        # isolation_level=None -> explicit BEGIN IMMEDIATE, no implicit txn.
        conn = sqlite3.connect(self.path, timeout=10.0, isolation_level=None)
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    def consume_and_apply(self, claims: dict[str, Any],
                          effect: Callable[[sqlite3.Connection], Any]) -> Any:
        """Burn the nonce and run `effect` atomically. Raises ReplayError if the
        nonce was already consumed. Any exception rolls BOTH back."""
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
                    f"nonce already consumed: {claims['nonce'][:12]}...") from exc
            result = effect(conn)
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
