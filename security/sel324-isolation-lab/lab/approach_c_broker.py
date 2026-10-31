"""Approach C -- per-board Hermes instance + UID broker (OWNER-APPROVED DIRECTION).

Implements the SEL-433 broker contract:
  * Board DBs live under a root owned by the broker UID, mode 0700. No worker
    UID can open them, by any pathname, with or without a guard. The TOCTOU /
    ABA question disappears because the attacker cannot reach the namespace.
  * One unix socket PER BOARD, in a directory mode 0750 whose group is that
    board's worker group. The broker derives the caller's identity from
    SO_PEERCRED (kernel-reported), never from anything the caller sends.
  * Early peer rejection: a UID not bound to this board's socket is dropped
    before its bytes are parsed.
  * Length-prefixed framing + EOF, so a truncated or oversized frame cannot be
    reinterpreted.
  * Ed25519-signed capability bound to sub_uid/tenant/project/board/task/
    run_id/action/nonce/exp, with duplicate-JSON-member rejection.
  * Nonce consume and effect in ONE `BEGIN IMMEDIATE` transaction.
"""
from __future__ import annotations

import json
import os
import socket
import struct
import sqlite3
import sys
import threading
import traceback

from lab.capability import Verifier, CapabilityError
from lab.nonce_ledger import NonceLedger, ReplayError

MAX_FRAME = 64 * 1024
ALLOWED_ACTIONS = {"complete", "block", "heartbeat", "read_sentinel"}


def send_frame(sock: socket.socket, obj: dict) -> None:
    body = json.dumps(obj, separators=(",", ":")).encode()
    sock.sendall(struct.pack(">I", len(body)) + body)


def recv_frame(sock: socket.socket) -> dict:
    hdr = _recv_exact(sock, 4)
    (length,) = struct.unpack(">I", hdr)
    if length == 0 or length > MAX_FRAME:
        raise ValueError(f"frame length out of policy: {length}")
    return json.loads(_recv_exact(sock, length))


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ValueError("unexpected EOF mid-frame")
        buf += chunk
    return buf


def peer_uid(conn: socket.socket) -> tuple[int, int, int]:
    """Kernel-reported peer credentials. On Linux: SO_PEERCRED."""
    raw = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED,
                          struct.calcsize("3i"))
    pid, uid, gid = struct.unpack("3i", raw)
    return pid, uid, gid


class BoardBroker:
    """Serves exactly one board on exactly one socket, for exactly one UID."""

    def __init__(self, *, board: str, db_path: str, sock_path: str,
                 bound_uid: int, verifier: Verifier, ledger: NonceLedger,
                 worker_gid: int, manage_dir: bool = True) -> None:
        if os.path.realpath(ledger.path) != os.path.realpath(db_path):
            raise ValueError("nonce ledger and board effects must share one database")
        self.board = board
        self.db_path = db_path
        self.sock_path = sock_path
        self.bound_uid = bound_uid
        self.verifier = verifier
        self.ledger = ledger
        self.worker_gid = worker_gid
        self.manage_dir = manage_dir
        self._srv: socket.socket | None = None
        self._stop = threading.Event()

    # -- lifecycle -------------------------------------------------------
    def start(self) -> None:
        if os.path.exists(self.sock_path):
            os.unlink(self.sock_path)
        sock_dir = os.path.dirname(self.sock_path)
        if self.manage_dir:
            # Only this board's worker group may traverse into the socket dir.
            os.makedirs(sock_dir, exist_ok=True)
            os.chown(sock_dir, os.getuid(), self.worker_gid)
            os.chmod(sock_dir, 0o750)

        srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        srv.bind(self.sock_path)
        # Access is gated by the 0750 PARENT DIRECTORY (group = this board's
        # worker group), the standard unix-socket pattern. The socket node
        # itself is permissive because a non-root broker cannot chgrp it to a
        # group it does not belong to.
        os.chmod(self.sock_path, 0o666)
        srv.listen(64)
        srv.settimeout(0.5)
        self._srv = srv
        threading.Thread(target=self._serve, daemon=True).start()

    def stop(self) -> None:
        self._stop.set()
        if self._srv is not None:
            self._srv.close()

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                conn, _ = self._srv.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            threading.Thread(target=self._handle, args=(conn,),
                             daemon=True).start()

    # -- request path ----------------------------------------------------
    def _handle(self, conn: socket.socket) -> None:
        try:
            conn.settimeout(10.0)
            pid, uid, gid = peer_uid(conn)

            # EARLY PEER REJECTION -- before parsing any caller bytes.
            if uid != self.bound_uid:
                send_frame(conn, {"ok": False, "reason": "peer_uid_not_bound",
                                  "detail": f"uid {uid} may not use the "
                                            f"{self.board} socket"})
                return

            req = recv_frame(conn)
            token = req.get("capability")
            if not isinstance(token, str):
                send_frame(conn, {"ok": False, "reason": "no_capability"})
                return

            claims = self.verifier.verify(token, peer_uid=uid,
                                          board=self.board)
            action = claims["action"]
            if action not in ALLOWED_ACTIONS:
                send_frame(conn, {"ok": False, "reason": "action_not_allowed",
                                  "detail": action})
                return

            result = self.ledger.consume_and_apply(
                claims, lambda tx: self._apply(claims, tx))
            send_frame(conn, {"ok": True, "action": action, "result": result,
                              "peer": {"pid": pid, "uid": uid, "gid": gid}})
        except CapabilityError as exc:
            _reply(conn, "capability_rejected", str(exc))
        except ReplayError as exc:
            _reply(conn, "replay_rejected", str(exc))
        except ValueError as exc:
            _reply(conn, "framing_rejected", str(exc))
        except Exception as exc:  # fail closed, never leak a traceback
            _reply(conn, "internal_fail_closed", type(exc).__name__)
            print(traceback.format_exc(), file=sys.stderr)
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def _apply(self, claims: dict, conn: sqlite3.Connection) -> str:
        """Use the ledger transaction's connection; never commit separately.

        This lab's active state is ``claimed``. Native Hermes state mapping
        must be implemented and reviewed independently in its adapter.
        """
        row = conn.execute(
            "SELECT board, tenant, project_id, run_id, state FROM tasks "
            "WHERE task_id=?", (claims["task"],)).fetchone()
        expected = (self.board, claims["tenant"], claims["project"],
                    claims["run_id"], "claimed")
        if row != expected:
            raise CapabilityError("task scope, active state or run_id CAS failed")
        if claims["action"] == "read_sentinel":
            row = conn.execute(
                "SELECT v FROM board_identity WHERE k='sentinel'"
            ).fetchone()
            return row[0] if row else "<none>"
        if claims["action"] in ("complete", "block"):
            state = "done" if claims["action"] == "complete" else "blocked"
            cur = conn.execute(
                "UPDATE tasks SET state=? WHERE task_id=? AND board=? "
                "AND tenant=? AND project_id=? AND run_id=? AND state='claimed'",
                (state, claims["task"], self.board, claims["tenant"],
                 claims["project"], claims["run_id"]))
            if cur.rowcount != 1:
                raise CapabilityError("task scope, active state or run_id CAS failed")
            return f"{claims['task']}->{state}"
        return "ok"


def _reply(conn: socket.socket, reason: str, detail: str) -> None:
    try:
        send_frame(conn, {"ok": False, "reason": reason, "detail": detail})
    except OSError:
        pass


def call_broker(sock_path: str, token: str, timeout: float = 10.0) -> dict:
    """Worker-side client. The worker never sees a DB path or a key."""
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect(sock_path)
        send_frame(s, {"capability": token})
        return recv_frame(s)
    finally:
        s.close()
