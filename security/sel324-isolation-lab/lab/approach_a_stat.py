"""Approach A -- in-process pathname stat identity guard (BASELINE).

This is the shape of the candidate pinned in SEL-324 as
`sel324_authz.py` / `_file_identity`: stat the pathname, compare
(st_dev, st_ino), reject symlinked ancestors and st_nlink > 1, then
`sqlite3.connect(pathname)`.

It is reproduced here UNCHANGED IN SPIRIT in order to be measured, not because
it is believed sound. The known defect -- the window between the stat and the
open -- is exercised by the `aba_*` controls.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Callable


class GuardDenied(Exception):
    pass


def file_identity(path: str) -> tuple[int, int]:
    st = os.lstat(path)
    if os.path.islink(path):
        raise GuardDenied("database pathname is a symlink")
    if st.st_nlink > 1:
        raise GuardDenied(f"database has {st.st_nlink} hard links")
    return (st.st_dev, st.st_ino)


def assert_no_symlinked_ancestor(path: str) -> None:
    """Walk every ancestor up to '/' and refuse any symlinked component."""
    cur = os.path.dirname(os.path.abspath(path))
    while True:
        if os.path.islink(cur):
            raise GuardDenied(f"ancestor is a symlink: {cur}")
        parent = os.path.dirname(cur)
        if parent == cur:
            return
        cur = parent


def open_board(path: str, expected: tuple[int, int] | None = None,
               after_check_hook: Callable[[], Any] | None = None,
               after_open_hook: Callable[[], Any] | None = None
               ) -> sqlite3.Connection:
    """Check-then-open.

    `after_check_hook` and `after_open_hook` are deterministic synchronization
    barriers standing in for an attacker that wins the race. They make the
    TOCTOU window observable without a flaky timing loop. The faithful ABA is
    two-step: swap a decoy inode in at the pathname before the open, then
    restore the real pathname before the post-open re-check, so the re-check
    sees the ORIGINAL identity while the open fd points at the decoy."""
    assert_no_symlinked_ancestor(path)
    ident = file_identity(path)
    if expected is not None and ident != expected:
        raise GuardDenied(f"identity mismatch: {ident} != {expected}")

    if after_check_hook is not None:
        after_check_hook()          # <-- the window

    conn = sqlite3.connect(path)    # resolves the PATHNAME a second time

    if after_open_hook is not None:
        after_open_hook()           # attacker puts the original back

    # Re-check after the open. This is what the pinned candidate does, and it
    # is exactly what the ABA attack defeats: the pathname looks unchanged
    # again, while the OPEN FD points at the attacker's file.
    post = file_identity(path)
    if post != ident:
        conn.close()
        raise GuardDenied(f"identity changed across open: {ident} -> {post}")
    return conn
