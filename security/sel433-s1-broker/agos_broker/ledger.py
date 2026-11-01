"""Nonce history for one board, stored INSIDE that board's database.

Two consumption modes, chosen by the effect backend:

* ``atomic``  -- nonce insert and effect in ONE ``BEGIN IMMEDIATE`` on one
  connection (the lab BoardLedger contract). Any failure rolls back both, so
  the same capability may be retried. Used when the effect can run inside a
  caller-owned transaction.

* ``reserve`` -- for native Hermes ``kanban_db.complete_task`` & co., which
  open their own ``write_txn`` and refuse to nest (upstream c419cf7c,
  ``kanban_db_connect.write_txn``: "helpers with post-commit side effects ...
  must never run under an open outer transaction"). The nonce is durably
  RESERVED in its own committed transaction BEFORE the effect runs, then
  marked ``applied`` or ``rejected``. A crash at any point leaves the nonce
  spent (fail closed): a capability is never usable twice. A crash after
  reserve but before the effect costs liveness (dispatcher must mint a new
  capability), never safety; a fresh capability cannot redo a finished effect
  because the native CAS (status + current_run_id) refuses it.

Both modes enforce, inside the same write transaction as the nonce insert:

* restore watermark -- ``not_before_iat``: a restored (older) DB has lost the
  nonces spent after its backup. Restore sets this to the restore time, so
  every capability minted before the restore is refused (SEL-436 restore leg).
* clock-regression guard -- ``high_water_time``: if wall-clock time moves
  backwards by more than ``CLOCK_SKEW`` the broker fails closed instead of
  re-admitting expired capabilities whose nonces may have been pruned.

Pruning only deletes rows whose ``exp`` is older than ``RETENTION`` seconds
and never touches ``reserved`` rows.
"""
from __future__ import annotations

import sqlite3
import time
from typing import Any, Callable

SCHEMA_VERSION = "2"
CLOCK_SKEW = 5
RETENTION = 7 * 24 * 3600


class ReplayError(Exception):
    """Nonce already spent (or reserved)."""


class FreshnessError(Exception):
    """Capability predates a restore, or the clock moved backwards."""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10.0, isolation_level=None)
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS agos_broker_nonce (
                   nonce       TEXT PRIMARY KEY,
                   kid         TEXT NOT NULL,
                   board       TEXT NOT NULL,
                   sub_uid     INTEGER NOT NULL,
                   task        TEXT NOT NULL,
                   run_id      TEXT NOT NULL,
                   action      TEXT NOT NULL,
                   iat         INTEGER NOT NULL,
                   exp         INTEGER NOT NULL,
                   state       TEXT NOT NULL
                               CHECK (state IN ('applied','reserved','rejected')),
                   reserved_at INTEGER NOT NULL,
                   finished_at INTEGER,
                   detail      TEXT
               )""")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS agos_broker_meta (
                   k TEXT PRIMARY KEY, v TEXT NOT NULL)""")
        for k, v in (("schema_version", SCHEMA_VERSION),
                     ("not_before_iat", "0"), ("high_water_time", "0"),
                     ("restore_epoch", "0")):
            conn.execute("INSERT OR IGNORE INTO agos_broker_meta(k,v) VALUES (?,?)",
                         (k, v))
        row = conn.execute(
            "SELECT v FROM agos_broker_meta WHERE k='schema_version'").fetchone()
        if row[0] != SCHEMA_VERSION:
            raise RuntimeError(f"unsupported nonce schema {row[0]}")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _meta(conn: sqlite3.Connection, k: str) -> int:
    return int(conn.execute("SELECT v FROM agos_broker_meta WHERE k=?",
                            (k,)).fetchone()[0])


def set_meta(conn: sqlite3.Connection, k: str, v: int) -> None:
    conn.execute("UPDATE agos_broker_meta SET v=? WHERE k=?", (str(int(v)), k))


class NonceStore:
    def __init__(self, db_path: str, clock: Callable[[], float] = time.time) -> None:
        self.path = db_path
        self.clock = clock
        conn = connect(db_path)
        try:
            ensure_schema(conn)
        finally:
            conn.close()

    # -- shared checks, MUST run inside an open write transaction -----------
    def _admit(self, conn: sqlite3.Connection, claims: dict[str, Any],
               state: str, now: int) -> None:
        hw = _meta(conn, "high_water_time")
        if now + CLOCK_SKEW < hw:
            raise FreshnessError(
                f"clock regression: now={now} < high_water_time={hw}")
        # "<=": a capability minted in the same second as the restore is
        # refused too (iat has 1 s resolution); costs liveness, never safety.
        if claims["iat"] <= _meta(conn, "not_before_iat"):
            raise FreshnessError("capability minted before last restore")
        if now > hw:
            set_meta(conn, "high_water_time", now)
        try:
            conn.execute(
                "INSERT INTO agos_broker_nonce(nonce,kid,board,sub_uid,task,run_id,"
                "action,iat,exp,state,reserved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (claims["nonce"], claims["kid"], claims["board"], claims["sub_uid"],
                 claims["task"], claims["run_id"], claims["action"], claims["iat"],
                 claims["exp"], state, now))
        except sqlite3.IntegrityError as exc:
            raise ReplayError(f"nonce already spent: {claims['nonce'][:12]}...") from exc

    def consume_atomic(self, claims: dict[str, Any],
                       effect: Callable[[sqlite3.Connection], Any]) -> Any:
        now = int(self.clock())
        conn = connect(self.path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                self._admit(conn, claims, "applied", now)
                conn.execute("UPDATE agos_broker_nonce SET finished_at=? WHERE nonce=?",
                             (now, claims["nonce"]))
                result = effect(conn)
                conn.execute("COMMIT")
                return result
            except BaseException:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
        finally:
            conn.close()

    def consume_reserved(self, claims: dict[str, Any],
                         effect: Callable[[], Any],
                         precheck: Callable[[sqlite3.Connection], None] | None = None,
                         ) -> Any:
        """Reserve (durable) -> effect (own txn) -> mark. Fail closed."""
        now = int(self.clock())
        conn = connect(self.path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                # Replay is classified before scope so a spent capability is
                # always audited as a replay, whatever the task state now is.
                if conn.execute("SELECT 1 FROM agos_broker_nonce WHERE nonce=?",
                                (claims["nonce"],)).fetchone():
                    raise ReplayError(
                        f"nonce already spent: {claims['nonce'][:12]}...")
                if precheck is not None:
                    # Scope rejections here roll back -> nonce NOT consumed,
                    # matching atomic-mode behaviour for unauthorised scope.
                    precheck(conn)
                self._admit(conn, claims, "reserved", now)
                conn.execute("COMMIT")
            except BaseException:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
            try:
                result = effect()
            except BaseException as exc:
                self._finish(conn, claims["nonce"], "rejected", type(exc).__name__)
                raise
            self._finish(conn, claims["nonce"], "applied", None)
            return result
        finally:
            conn.close()

    def _finish(self, conn: sqlite3.Connection, nonce: str, state: str,
                detail: str | None) -> None:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("UPDATE agos_broker_nonce SET state=?, finished_at=?, detail=? "
                     "WHERE nonce=? AND state='reserved'",
                     (state, int(self.clock()), detail, nonce))
        conn.execute("COMMIT")

    def prune(self) -> int:
        now = int(self.clock())
        conn = connect(self.path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            hw = _meta(conn, "high_water_time")
            if now + CLOCK_SKEW < hw:
                conn.execute("ROLLBACK")
                raise FreshnessError("clock regression; refusing to prune")
            cur = conn.execute("DELETE FROM agos_broker_nonce WHERE exp < ? "
                               "AND state != 'reserved'", (now - RETENTION,))
            conn.execute("COMMIT")
            return cur.rowcount
        finally:
            conn.close()

    def row(self, nonce: str) -> tuple | None:
        conn = connect(self.path)
        try:
            return conn.execute("SELECT state, exp FROM agos_broker_nonce WHERE nonce=?",
                                (nonce,)).fetchone()
        finally:
            conn.close()
