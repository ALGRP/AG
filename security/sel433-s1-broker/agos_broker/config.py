"""Broker configuration and fail-closed start-up preflight.

The config holds PUBLIC keys only. Preflight refuses to start unless every
path the broker will serve has exactly the ownership and modes the SEL-433
target architecture requires. It never repairs anything: fixing ownership is
an installation step that needs its own approval.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import stat
from dataclasses import dataclass, field

BOARD_RE = re.compile(r"^[a-z0-9][a-z0-9\-_]{0,63}$")   # upstream slug rule
BACKENDS = ("lab_native", "lab_native_reserve", "hermes")


@dataclass(frozen=True)
class BoardConfig:
    board: str
    db_path: str
    sock_path: str
    bound_uid: int
    worker_gid: int
    tenant: str
    backend: str = "lab_native"


@dataclass(frozen=True)
class Config:
    iss: str
    keys: dict[str, str]
    revoked_kids: tuple[str, ...]
    boards: tuple[BoardConfig, ...]
    max_inflight_per_board: int = 16
    read_timeout: float = 5.0
    source_path: str | None = field(default=None, compare=False)


def intent_marker(db_path: str) -> str:
    return db_path + ".restore-intent.json"


def load(path: str) -> Config:
    with open(path, "rb") as fh:
        raw = json.loads(fh.read())
    iss = raw["issuer"]
    boards = tuple(BoardConfig(**b) for b in raw["boards"])
    lim = raw.get("limits", {})
    return Config(iss=iss["iss"], keys=dict(iss["keys"]),
                  revoked_kids=tuple(iss.get("revoked_kids", ())),
                  boards=boards,
                  max_inflight_per_board=int(lim.get("max_inflight_per_board", 16)),
                  read_timeout=float(lim.get("read_timeout", 5.0)),
                  source_path=path)


def _private_node(path: str, euid: int, kind: str, problems: list[str],
                  must_exist: bool = True) -> None:
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        if must_exist:
            problems.append(f"{kind} missing: {path}")
        return
    if stat.S_ISLNK(st.st_mode):
        problems.append(f"{kind} is a symlink: {path}")
        return
    if st.st_uid != euid:
        problems.append(f"{kind} owner {st.st_uid} != broker {euid}: {path}")
    if st.st_mode & 0o077:
        problems.append(f"{kind} mode {oct(st.st_mode & 0o777)} grants group/other: {path}")
    if stat.S_ISREG(st.st_mode) and st.st_nlink != 1:
        problems.append(f"{kind} has {st.st_nlink} hard links: {path}")


def preflight(cfg: Config, euid: int | None = None) -> list[str]:
    euid = os.geteuid() if euid is None else euid
    problems: list[str] = []
    if euid == 0:
        problems.append("refusing to run as root; run as the broker UID")
    if cfg.source_path:
        st = os.stat(cfg.source_path)
        if st.st_mode & 0o022:
            problems.append("config writable by group/other")
        if st.st_uid not in (0, euid):
            problems.append(f"config owned by {st.st_uid}")
    if len(cfg.keys) == 0:
        problems.append("no issuer public keys")
    seen: dict[str, set] = {"board": set(), "db": set(), "sock": set(), "uid": set()}
    for b in cfg.boards:
        for k, v in (("board", b.board), ("db", os.path.realpath(b.db_path)),
                     ("sock", b.sock_path), ("uid", b.bound_uid)):
            if v in seen[k]:
                problems.append(f"duplicate {k}: {v}")
            seen[k].add(v)
        if not BOARD_RE.match(b.board):
            problems.append(f"invalid board slug {b.board!r}")
        if b.backend not in BACKENDS:
            problems.append(f"{b.board}: unknown backend {b.backend}")
        if b.bound_uid in (0, euid):
            problems.append(f"{b.board}: bound_uid {b.bound_uid} not a worker UID")
        db_dir = os.path.dirname(b.db_path)
        _private_node(db_dir, euid, f"{b.board} db dir", problems)
        _private_node(b.db_path, euid, f"{b.board} db", problems)
        for suffix in ("-wal", "-shm"):
            _private_node(b.db_path + suffix, euid, f"{b.board} db{suffix}",
                          problems, must_exist=False)
        if os.path.exists(intent_marker(b.db_path)):
            problems.append(f"{b.board}: interrupted restore marker present; "
                            "finish or roll back the restore first")
        sock_dir = os.path.dirname(b.sock_path)
        try:
            st = os.lstat(sock_dir)
            if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
                problems.append(f"{b.board}: socket dir not a real directory")
            if st.st_uid != euid:
                problems.append(f"{b.board}: socket dir owner {st.st_uid} != {euid}")
            if st.st_gid != b.worker_gid:
                problems.append(f"{b.board}: socket dir group {st.st_gid} != "
                                f"worker gid {b.worker_gid}")
            if (st.st_mode & 0o777) != 0o750:
                problems.append(f"{b.board}: socket dir mode "
                                f"{oct(st.st_mode & 0o777)} != 0o750")
            parent = os.stat(os.path.dirname(sock_dir))
            if parent.st_mode & 0o022:
                problems.append(f"{b.board}: socket parent dir writable by group/other")
        except FileNotFoundError:
            problems.append(f"{b.board}: socket dir missing: {sock_dir}")
        if not problems or all(not p.startswith(f"{b.board} db") for p in problems):
            try:
                conn = sqlite3.connect(f"file:{b.db_path}?mode=rw", uri=True,
                                       timeout=5.0)
                try:
                    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
                    if mode.lower() != "wal":
                        problems.append(f"{b.board}: journal_mode={mode}, need wal")
                    qc = conn.execute("PRAGMA quick_check").fetchone()[0]
                    if qc != "ok":
                        problems.append(f"{b.board}: quick_check={qc}")
                finally:
                    conn.close()
            except sqlite3.Error as exc:
                problems.append(f"{b.board}: cannot open db: {exc}")
    return problems
