"""Approach D -- per-board directory ownership, no broker (CHEAP OPTION).

Each board lives in its own directory, mode 0700, owned by that board's
worker UID. The worker process runs as that UID. Cross-board access is then
refused by the kernel, with no application guard in the path -- which also
means the ~25 raw `sqlite3.connect` call sites catalogued in
DIRECT_CONNECT_SITES.txt stop mattering for CROSS-BOARD reads.

What D deliberately does NOT provide, and why C exists:
  * The worker OWNS its own board DB. A compromised worker can rewrite its own
    rows directly -- state, run_id, assignee, approval columns -- bypassing
    any in-DB CAS or approval guard, because the guard is library code running
    inside the very process that is compromised.
  * No capability, no nonce, no replay protection, no scope or expiry.
"""
from __future__ import annotations

import sqlite3


def open_own_board(path: str) -> sqlite3.Connection:
    """No guard at all -- the kernel is the control. Raises PermissionError
    (EACCES) when the caller's UID is not the directory owner."""
    return sqlite3.connect(f"file:{path}?mode=rw", uri=True)


def tamper_own_board(path: str) -> str:
    """Demonstrates D's residual gap: self-board integrity is NOT protected.
    Returns the forged state written without any capability."""
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            "UPDATE tasks SET state='done', run_id='forged_by_worker'")
        conn.commit()
        row = conn.execute(
            "SELECT state, run_id FROM tasks LIMIT 1").fetchone()
        return f"{row[0]}/{row[1]}"
    finally:
        conn.close()
