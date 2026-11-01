"""One socket per board, one bound worker UID per socket.

Request path (fail closed at every step):
  kernel peer UID -> early reject if not the board's bound UID (no bytes
  parsed) -> bounded frame -> Ed25519 capability via keyring (peer UID +
  board bound) -> board tenant pin -> action allow-list -> args schema ->
  nonce history + effect (atomic or reserve mode, see ledger.py).
"""
from __future__ import annotations

import os
import socket
import stat
import sys
import threading
import traceback
from typing import Any

from agos_broker import wire
from agos_broker.backends import (ArgsError, HermesKanbanBackend,
                                  LabNativeBackend, LabNativeReserveBackend,
                                  validate_args)
from agos_broker.capability import CapabilityError
from agos_broker.config import BoardConfig
from agos_broker.keyring import Keyring
from agos_broker.ledger import FreshnessError, NonceStore, ReplayError


def make_backend(board: BoardConfig):
    if board.backend == "lab_native":
        return LabNativeBackend()
    if board.backend == "lab_native_reserve":
        return LabNativeReserveBackend(board.db_path)
    if board.backend == "hermes":
        return HermesKanbanBackend(board.db_path)
    raise ValueError(board.backend)


class BoardService:
    def __init__(self, board: BoardConfig, keyring: Keyring, *,
                 max_inflight: int = 16, read_timeout: float = 5.0,
                 backend: Any = None, store: NonceStore | None = None) -> None:
        self.board = board
        self.keyring = keyring
        self.backend = backend or make_backend(board)
        self.store = store or NonceStore(board.db_path)
        if os.path.realpath(self.store.path) != os.path.realpath(board.db_path):
            raise ValueError("nonce history and board effects must share one database")
        self.read_timeout = read_timeout
        self._slots = threading.BoundedSemaphore(max_inflight)
        self._srv: socket.socket | None = None
        self._stop = threading.Event()
        self._threads: set[threading.Thread] = set()
        self._lock = threading.Lock()

    # -- lifecycle -----------------------------------------------------------
    def start(self) -> None:
        path = self.board.sock_path
        try:
            st = os.lstat(path)
            # Only ever remove a stale SOCKET we own (left by SIGKILL).
            if not stat.S_ISSOCK(st.st_mode) or st.st_uid != os.geteuid():
                raise RuntimeError(f"refusing to replace non-socket/foreign node {path}")
            os.unlink(path)
        except FileNotFoundError:
            pass
        old = os.umask(0o177)
        try:
            srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            srv.bind(path)
        finally:
            os.umask(old)
        # Node: owner broker, group = worker group, 0660. Requires the broker
        # to be a member of the worker group (systemd SupplementaryGroups=).
        os.chown(path, -1, self.board.worker_gid)
        os.chmod(path, 0o660)
        # Keeper connection for the service lifetime: keeps -wal/-shm present
        # (created by THIS UID with the db file's 0600 mode) instead of a
        # checkpoint+delete+recreate cycle on every request.
        from agos_broker.ledger import connect
        self._keeper = connect(self.board.db_path)
        self._keeper.execute("SELECT count(*) FROM agos_broker_meta").fetchone()
        srv.listen(64)
        srv.settimeout(0.25)
        self._srv = srv
        t = threading.Thread(target=self._serve, name=f"accept-{self.board.board}",
                             daemon=True)
        t.start()
        self._accept_thread = t

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        if self._srv is not None:
            self._srv.close()
        self._accept_thread.join(timeout)
        with self._lock:
            threads = list(self._threads)
        for t in threads:
            t.join(timeout)
        try:
            os.unlink(self.board.sock_path)
        except FileNotFoundError:
            pass
        keeper = getattr(self, "_keeper", None)
        if keeper is not None:
            keeper.close()

    def _serve(self) -> None:
        while not self._stop.is_set():
            try:
                conn, _ = self._srv.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            if not self._slots.acquire(blocking=False):
                _reply(conn, "busy", "board in-flight limit reached")
                conn.close()
                continue
            t = threading.Thread(target=self._run, args=(conn,), daemon=True)
            with self._lock:
                self._threads.add(t)
            t.start()

    def _run(self, conn: socket.socket) -> None:
        try:
            self.handle(conn)
        finally:
            self._slots.release()
            with self._lock:
                self._threads.discard(threading.current_thread())

    # -- request path --------------------------------------------------------
    def handle(self, conn: socket.socket) -> None:
        try:
            conn.settimeout(self.read_timeout)
            pid, uid, gid = wire.peer_cred(conn)
            if uid != self.board.bound_uid:
                _reply(conn, "peer_uid_not_bound",
                       f"uid {uid} may not use the {self.board.board} socket")
                return
            req = wire.recv_frame(conn)
            if set(req) - {"capability", "args"}:
                raise wire.FramingError("unexpected request members")
            token = req.get("capability")
            if not isinstance(token, str):
                _reply(conn, "no_capability", "capability missing")
                return
            claims = self.keyring.verify(token, peer_uid=uid, board=self.board.board)
            if claims["tenant"] != self.board.tenant:
                raise CapabilityError("tenant not served by this board")
            action = claims["action"]
            if action not in self.backend.actions:
                _reply(conn, "action_not_allowed", action)
                return
            args = validate_args(action, req.get("args"))
            if self.backend.mode == "atomic":
                result = self.store.consume_atomic(
                    claims, lambda txn: self.backend.apply_atomic(txn, claims, args))
            else:
                result = self.store.consume_reserved(
                    claims, lambda: self.backend.apply_reserved(claims, args),
                    precheck=lambda txn: self.backend.precheck(txn, claims))
            wire.send_frame(conn, {"ok": True, "action": action, "result": result,
                                   "peer": {"pid": pid, "uid": uid, "gid": gid}})
        except CapabilityError as exc:
            _reply(conn, "capability_rejected", str(exc))
        except ReplayError as exc:
            _reply(conn, "replay_rejected", str(exc))
        except FreshnessError as exc:
            _reply(conn, "freshness_rejected", str(exc))
        except ArgsError as exc:
            _reply(conn, "args_rejected", str(exc))
        except (wire.FramingError, socket.timeout) as exc:
            _reply(conn, "framing_rejected", str(exc) or type(exc).__name__)
        except Exception as exc:  # fail closed; traceback to journal only
            _reply(conn, "internal_fail_closed", type(exc).__name__)
            print(traceback.format_exc(), file=sys.stderr)
        finally:
            try:
                conn.close()
            except OSError:
                pass


def _reply(conn: socket.socket, reason: str, detail: str) -> None:
    try:
        wire.send_frame(conn, {"ok": False, "reason": reason, "detail": detail})
    except OSError:
        pass
