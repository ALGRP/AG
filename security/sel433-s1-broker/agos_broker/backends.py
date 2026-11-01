"""Effect backends. The broker decides WHO may act; a backend decides WHAT
the action does to the board database.

* ``LabNativeBackend`` -- executed in this package's tests. Operates on a
  Hermes-SHAPED schema subset (``tasks.id/status/tenant/project_id/
  current_run_id/claim_lock/claim_expires`` + ``task_runs``) copied from
  upstream ``hermes_cli/kanban_db.py`` @ c419cf7c. Runs inside the nonce
  transaction (``atomic`` mode).

* ``HermesKanbanBackend`` -- calls the real upstream ``kanban_db`` helpers in
  ``reserve`` mode because they own their transactions. NOT EXECUTED in this
  package: running it needs the pinned installed Hermes on S1/S2 and is a
  separately approved step. It is here so SEL-333 reviews the exact call shape.

Every action is bound to the task row: status must be ``running`` and
tenant/project_id/current_run_id must equal the capability claims. The
effect's own UPDATE repeats those predicates (CAS), so a check-then-act race
inside the transaction cannot widen scope.
"""
from __future__ import annotations

import sqlite3
import time
from typing import Any

from agos_broker.capability import CapabilityError

MAX_TEXT = 8192
ARG_SCHEMA = {
    "complete": {"summary", "result"},
    "block": {"reason"},
    "heartbeat": {"note"},
}


class ArgsError(ValueError):
    pass


def validate_args(action: str, args: Any) -> dict[str, str]:
    if args is None:
        return {}
    if not isinstance(args, dict):
        raise ArgsError("args must be an object")
    extra = set(args) - ARG_SCHEMA.get(action, set())
    if extra:
        raise ArgsError(f"unexpected args for {action}: {sorted(extra)}")
    for k, v in args.items():
        if not isinstance(v, str) or len(v) > MAX_TEXT:
            raise ArgsError(f"arg {k} must be a string <= {MAX_TEXT} chars")
    return dict(args)


def check_scope(conn: sqlite3.Connection, claims: dict[str, Any]) -> None:
    row = conn.execute(
        "SELECT status, tenant, project_id, current_run_id FROM tasks WHERE id=?",
        (claims["task"],)).fetchone()
    if row is None:
        raise CapabilityError("task not found on this board")
    status, tenant, project, run = row
    if status != "running":
        raise CapabilityError(f"task not running (status={status})")
    if tenant != claims["tenant"] or project != claims["project"]:
        raise CapabilityError("tenant/project scope mismatch")
    if run is None or int(run) != int(claims["run_id"]):
        raise CapabilityError("stale or foreign run_id")


NATIVE_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, assignee TEXT, status TEXT NOT NULL,
    created_at INTEGER NOT NULL, completed_at INTEGER, project_id TEXT,
    claim_lock TEXT, claim_expires INTEGER, tenant TEXT, result TEXT,
    worker_pid INTEGER, last_heartbeat_at INTEGER, current_run_id INTEGER);
CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, status TEXT NOT NULL,
    claim_lock TEXT, claim_expires INTEGER, started_at INTEGER NOT NULL,
    ended_at INTEGER, outcome TEXT, summary TEXT);
"""


def create_native_fixture(db_path: str, tasks: list[dict]) -> dict[str, int]:
    """Synthetic Hermes-shaped board. Returns task_id -> run_id."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(NATIVE_SCHEMA)
        runs = {}
        now = int(time.time())
        for t in tasks:
            conn.execute(
                "INSERT INTO tasks(id,title,assignee,status,created_at,project_id,"
                "claim_lock,claim_expires,tenant) VALUES (?,?,?,?,?,?,?,?,?)",
                (t["id"], "SYNTHETIC", "agosdev", t.get("status", "running"), now,
                 t["project"], f"lock-{t['id']}", now + 900, t["tenant"]))
            cur = conn.execute(
                "INSERT INTO task_runs(task_id,status,claim_lock,claim_expires,started_at)"
                " VALUES (?,?,?,?,?)", (t["id"], "running", f"lock-{t['id']}",
                                        now + 900, now))
            conn.execute("UPDATE tasks SET current_run_id=? WHERE id=?",
                         (cur.lastrowid, t["id"]))
            runs[t["id"]] = cur.lastrowid
        conn.commit()
        return runs
    finally:
        conn.close()


class LabNativeBackend:
    mode = "atomic"
    actions = frozenset(ARG_SCHEMA)

    def apply_atomic(self, conn: sqlite3.Connection, claims: dict[str, Any],
                     args: dict[str, str]) -> dict[str, Any]:
        check_scope(conn, claims)
        now = int(time.time())
        tid, run = claims["task"], int(claims["run_id"])
        cas = ("WHERE id=? AND status='running' AND current_run_id=? "
               "AND tenant=? AND project_id=?")
        cas_args = (tid, run, claims["tenant"], claims["project"])
        action = claims["action"]
        if action in ("complete", "block"):
            status = "done" if action == "complete" else "blocked"
            text = args.get("summary") or args.get("result") or args.get("reason")
            cur = conn.execute(
                f"UPDATE tasks SET status=?, result=?, completed_at=?, claim_lock=NULL,"
                f" claim_expires=NULL, worker_pid=NULL, current_run_id=NULL {cas}",
                (status, args.get("result") if action == "complete" else None,
                 now if action == "complete" else None, *cas_args))
            if cur.rowcount != 1:
                raise CapabilityError("task CAS matched no running row")
            r = conn.execute(
                "UPDATE task_runs SET status=?, outcome=?, ended_at=?, summary=? "
                "WHERE id=? AND task_id=? AND ended_at IS NULL",
                (status, "completed" if action == "complete" else "blocked", now,
                 text, run, tid))
            if r.rowcount != 1:
                raise CapabilityError("run CAS matched no open run")
            return {"task_id": tid, "run_id": run, "status": status}
        if action == "heartbeat":
            expires = now + 900
            cur = conn.execute(
                f"UPDATE tasks SET claim_expires=?, last_heartbeat_at=? {cas}",
                (expires, now, *cas_args))
            if cur.rowcount != 1:
                raise CapabilityError("task CAS matched no running row")
            conn.execute("UPDATE task_runs SET claim_expires=? WHERE id=?",
                         (expires, run))
            return {"task_id": tid, "run_id": run, "claim_expires": expires}
        raise CapabilityError(f"action not supported: {action}")


class LabNativeReserveBackend:
    """Same Hermes-shaped effects, but in ``reserve`` mode with its OWN write
    transaction -- the exact shape native ``kanban_db`` helpers impose. Used to
    exercise reserve-mode crash points with real processes."""

    mode = "reserve"
    actions = frozenset(ARG_SCHEMA)

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._inner = LabNativeBackend()

    def precheck(self, conn: sqlite3.Connection, claims: dict[str, Any]) -> None:
        check_scope(conn, claims)

    def apply_reserved(self, claims: dict[str, Any], args: dict[str, str]) -> dict:
        from agos_broker.ledger import connect
        conn = connect(self.db_path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                result = self._inner.apply_atomic(conn, claims, args)
                conn.execute("COMMIT")
                return result
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()


class HermesKanbanBackend:  # pragma: no cover - NOT EXECUTED in this package
    """Native upstream calls. Requires the pinned Hermes import path inside
    the broker trust domain (dispatcher side), never inside a worker."""

    mode = "reserve"
    actions = frozenset(ARG_SCHEMA)

    def __init__(self, db_path: str) -> None:
        from hermes_cli import kanban_db as kb            # noqa: F401
        from hermes_cli import kanban_db_dispatch as kbd  # noqa: F401
        self.db_path = db_path

    def _conn(self):
        # SEL-333 OPEN: upstream exposes board-slug resolution (kbc.connect)
        # and a private path connector. The broker must open THIS db_path with
        # upstream pragmas (WAL, busy_timeout, row_factory). Pin the exact
        # helper against the installed Hermes bytes before S2.
        from hermes_cli import kanban_db_connect as kbc
        return kbc._sqlite_connect(__import__("pathlib").Path(self.db_path))

    def precheck(self, conn: sqlite3.Connection, claims: dict[str, Any]) -> None:
        check_scope(conn, claims)

    def apply_reserved(self, claims: dict[str, Any], args: dict[str, str]) -> dict:
        from hermes_cli import kanban_db as kb
        from hermes_cli import kanban_db_dispatch as kbd
        tid, run = claims["task"], int(claims["run_id"])
        conn = self._conn()
        try:
            if claims["action"] == "complete":
                ok = kb.complete_task(conn, tid, result=args.get("result"),
                                      summary=args.get("summary"),
                                      expected_run_id=run)
            elif claims["action"] == "block":
                ok = kb.block_task(conn, tid, reason=args.get("reason"),
                                   expected_run_id=run)
            else:
                lock = conn.execute("SELECT claim_lock FROM tasks WHERE id=? AND "
                                    "current_run_id=?", (tid, run)).fetchone()
                ok = bool(lock) and kb.heartbeat_claim(conn, tid, claimer=lock[0]) \
                    and kbd.heartbeat_worker(conn, tid, note=args.get("note"),
                                             expected_run_id=run)
            if not ok:
                raise CapabilityError("native CAS refused the transition")
            return {"task_id": tid, "run_id": run, "action": claims["action"]}
        finally:
            conn.close()
