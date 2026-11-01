"""Worker side: lifecycle tools over the broker socket.

Drop-in for the run-lifecycle half of upstream c419cf7c
``tools/kanban_tools.py`` (``_handle_complete`` :726, ``_handle_block`` :812,
``_handle_heartbeat`` :933), which today open the board DB directly via
``_board()`` -> ``kbc.connect`` (:314-320). In broker mode:

* the worker NEVER opens a database; ``HERMES_KANBAN_DB`` is ignored even if
  a prompt-injected shell sets it (the OS denies it anyway -- 0700 broker
  dir -- this just keeps the code path honest);
* there is no fallback to direct DB access on any error;
* the ``task_id`` check against the bundle is accident prevention only; the
  authority is the broker (peer UID + signed capability + row CAS).

Return values mirror upstream ``_ok`` / ``tool_error`` JSON strings so the
MCP surface (``agent/transports/hermes_tools_mcp_server.py``) is unchanged.
"""
from __future__ import annotations

import json
import os
import threading

from agos_broker import wire


class AdapterError(RuntimeError):
    pass


def _ok(**fields) -> str:
    return json.dumps({"ok": True, **fields})


def _err(msg: str) -> str:
    return json.dumps({"error": msg})


class BrokerKanbanClient:
    def __init__(self, sock_path: str, cap_file: str) -> None:
        self.sock_path = sock_path
        self.cap_file = cap_file
        self._hb_index = 0
        self._lock = threading.Lock()
        with open(cap_file) as fh:
            self.bundle = json.load(fh)
        self.ignored_db_env = bool(os.environ.get("HERMES_KANBAN_DB"))

    @classmethod
    def from_env(cls) -> "BrokerKanbanClient":
        sock = os.environ.get("HERMES_KANBAN_BROKER_SOCK")
        cap = os.environ.get("HERMES_KANBAN_CAPABILITY_FILE")
        if not sock or not cap:
            raise AdapterError("broker mode requires HERMES_KANBAN_BROKER_SOCK and "
                               "HERMES_KANBAN_CAPABILITY_FILE; refusing direct DB access")
        return cls(sock, cap)

    def _call(self, token: str, args: dict) -> dict:
        return wire.call(self.sock_path, {"capability": token, "args": args})

    def _guard(self, task_id: str | None) -> None:
        if task_id is not None and task_id != self.bundle["task"]:
            raise AdapterError(f"worker is scoped to task {self.bundle['task']}; "
                               f"refusing to mutate {task_id}")

    def complete(self, task_id: str | None = None, *, summary: str | None = None,
                 result: str | None = None) -> dict:
        self._guard(task_id)
        if not (summary or result):
            raise AdapterError("provide at least one of: summary, result")
        args = {k: v for k, v in (("summary", summary), ("result", result)) if v}
        return self._call(self.bundle["complete"], args)

    def block(self, task_id: str | None = None, *, reason: str | None = None) -> dict:
        self._guard(task_id)
        return self._call(self.bundle["block"], {"reason": reason} if reason else {})

    def heartbeat(self, task_id: str | None = None, *, note: str | None = None) -> dict:
        self._guard(task_id)
        with self._lock:
            if self._hb_index >= len(self.bundle["heartbeat"]):
                raise AdapterError("heartbeat capabilities exhausted; dispatcher must "
                                   "renew the bundle")
            token = self.bundle["heartbeat"][self._hb_index]
            self._hb_index += 1
        return self._call(token, {"note": note} if note else {})


# -- upstream-shaped tool handlers -------------------------------------------
def _render(reply: dict, task_id: str) -> str:
    if reply.get("ok"):
        return _ok(task_id=task_id, **{k: v for k, v in reply["result"].items()
                                       if k != "task_id"})
    return _err(f"broker refused: {reply.get('reason')}: {reply.get('detail')}")


def handle_kanban_complete(args: dict, client: BrokerKanbanClient | None = None) -> str:
    c = client or BrokerKanbanClient.from_env()
    try:
        return _render(c.complete(args.get("task_id"), summary=args.get("summary"),
                                  result=args.get("result")), c.bundle["task"])
    except AdapterError as exc:
        return _err(str(exc))


def handle_kanban_block(args: dict, client: BrokerKanbanClient | None = None) -> str:
    c = client or BrokerKanbanClient.from_env()
    try:
        return _render(c.block(args.get("task_id"), reason=args.get("reason")),
                       c.bundle["task"])
    except AdapterError as exc:
        return _err(str(exc))


def handle_kanban_heartbeat(args: dict, client: BrokerKanbanClient | None = None) -> str:
    c = client or BrokerKanbanClient.from_env()
    try:
        return _render(c.heartbeat(args.get("task_id"), note=args.get("note")),
                       c.bundle["task"])
    except AdapterError as exc:
        return _err(str(exc))
