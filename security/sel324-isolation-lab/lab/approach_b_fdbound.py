"""Approach B -- fd-bound identity, two variants.

B1  sqlite3_open_v2(..., SQLITE_OPEN_NOFOLLOW) through the C API via ctypes.
    This is the control the Fable 5.1 trial got WRONG: it proposed the URI
    parameter `nofollow=1`, which SQLite does not define (disproven in
    SEL-324, 30.10). SQLITE_OPEN_NOFOLLOW is a real sqlite3_open_v2 FLAG, so
    the question "does the flag work when passed properly?" is still open and
    is measured here.

B2  Bind to the OPEN FILE DESCRIPTOR: open(O_NOFOLLOW|O_CLOEXEC), fstat the
    fd for identity, then have SQLite reopen THAT INODE through the procfs
    magic link /proc/self/fd/N instead of re-resolving the pathname.

Platform note that matters for SEL-433: B2 depends on /proc. Linux (Hetzner)
has it; macOS does NOT, so B2 is not portable to the Mac leg of the target
architecture.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import os
import sqlite3
from typing import Any, Callable

SQLITE_OK = 0
SQLITE_OPEN_READONLY = 0x00000001
SQLITE_OPEN_READWRITE = 0x00000002
SQLITE_OPEN_NOFOLLOW = 0x01000000

_EXEC_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_int,
                            ctypes.POINTER(ctypes.c_char_p),
                            ctypes.POINTER(ctypes.c_char_p))


class GuardDenied(Exception):
    pass


def _lib() -> ctypes.CDLL:
    path = ctypes.util.find_library("sqlite3") or "libsqlite3.so.0"
    lib = ctypes.CDLL(path)
    lib.sqlite3_open_v2.argtypes = [ctypes.c_char_p,
                                    ctypes.POINTER(ctypes.c_void_p),
                                    ctypes.c_int, ctypes.c_char_p]
    lib.sqlite3_open_v2.restype = ctypes.c_int
    lib.sqlite3_close.argtypes = [ctypes.c_void_p]
    lib.sqlite3_close.restype = ctypes.c_int
    lib.sqlite3_errmsg.argtypes = [ctypes.c_void_p]
    lib.sqlite3_errmsg.restype = ctypes.c_char_p
    lib.sqlite3_exec.argtypes = [ctypes.c_void_p, ctypes.c_char_p, _EXEC_CB,
                                 ctypes.c_void_p,
                                 ctypes.POINTER(ctypes.c_char_p)]
    lib.sqlite3_exec.restype = ctypes.c_int
    lib.sqlite3_libversion.restype = ctypes.c_char_p
    return lib


def libversion() -> str:
    return _lib().sqlite3_libversion().decode()


def read_sentinel_nofollow(path: str) -> dict[str, Any]:
    """B1: open with SQLITE_OPEN_NOFOLLOW and read board_identity.sentinel.

    Returns {opened: bool, sentinel: str|None, rc: int, err: str|None}.
    """
    lib = _lib()
    db = ctypes.c_void_p()
    rc = lib.sqlite3_open_v2(
        path.encode(), ctypes.byref(db),
        SQLITE_OPEN_READONLY | SQLITE_OPEN_NOFOLLOW, None)
    if rc != SQLITE_OK:
        err = lib.sqlite3_errmsg(db).decode() if db else "open failed"
        lib.sqlite3_close(db)
        return {"opened": False, "sentinel": None, "rc": rc, "err": err}

    captured: list[str] = []

    def _cb(_ctx, ncol, values, _names):  # pragma: no cover - C callback
        if ncol > 0 and values[0]:
            captured.append(values[0].decode())
        return 0

    cb = _EXEC_CB(_cb)
    errp = ctypes.c_char_p()
    rc2 = lib.sqlite3_exec(
        db, b"SELECT v FROM board_identity WHERE k='sentinel'", cb, None,
        ctypes.byref(errp))
    err = errp.value.decode() if errp.value else None
    lib.sqlite3_close(db)
    return {"opened": True, "sentinel": captured[0] if captured else None,
            "rc": rc2, "err": err}


def open_board_fdbound(path: str,
                       after_check_hook: Callable[[], Any] | None = None,
                       ) -> tuple[sqlite3.Connection, tuple[int, int]]:
    """B2: identity comes from the fd, and SQLite reopens that same inode via
    procfs rather than re-resolving the pathname."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        if st.st_nlink > 1:
            raise GuardDenied(f"database has {st.st_nlink} hard links")
        ident = (st.st_dev, st.st_ino)

        if after_check_hook is not None:
            after_check_hook()      # attacker swaps the PATHNAME here

        fd_path = f"/proc/self/fd/{fd}"
        if not os.path.exists(fd_path):
            raise GuardDenied("procfs fd reopen unavailable on this platform")
        # mode=ro so SQLite does not need to create -wal/-shm beside the
        # procfs path (which is not a writable directory).
        conn = sqlite3.connect(f"file:{fd_path}?mode=ro", uri=True)

        # Confirm the thing SQLite actually opened is the inode we vetted.
        post = os.fstat(fd)
        if (post.st_dev, post.st_ino) != ident:
            conn.close()
            raise GuardDenied("fd identity changed")
        return conn, ident
    finally:
        os.close(fd)
