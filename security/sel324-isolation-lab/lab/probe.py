"""Attacker/worker probe. Runs as a REAL separate UID via setpriv.

Invoked as:  python3.12 -m lab.probe '<json config>'
Prints one JSON object describing the outcome.

Outcome taxonomy (the SEL-333 distinction is kept explicit):
  ALLOWED  -- the probe got what it wanted
  BLOCKED  -- fail-closed refusal
  sentinel -- WHICH board content was actually read, so
              "opened FORBIDDEN_B" is never conflated with "returned None"
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys

from lab import boards
from lab.approach_a_stat import open_board, GuardDenied as GuardDeniedA
from lab.approach_b_fdbound import (
    GuardDenied as GuardDeniedB,
    open_board_fdbound,
    read_sentinel_nofollow,
)

# Each approach raises its own refusal type; treat them uniformly.
GuardDenied = (GuardDeniedA, GuardDeniedB)
from lab.approach_c_broker import call_broker
from lab.approach_d_diruid import open_own_board, tamper_own_board


def _out(outcome: str, detail: str = "", sentinel=None, **extra):
    print(json.dumps({"outcome": outcome, "detail": detail,
                      "sentinel": sentinel, "uid": os.getuid(), **extra}))
    sys.exit(0)


def _read_db_sentinel(path: str) -> str | None:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return boards.read_sentinel(conn)
    finally:
        conn.close()


# --------------------------------------------------------------------------
# filesystem controls
# --------------------------------------------------------------------------
def c_cross_board_db_read(cfg):
    target = cfg["forbidden_db"]
    try:
        s = _read_db_sentinel(target)
        _out("ALLOWED", f"read {target}", sentinel=s)
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_cross_board_wal_shm_read(cfg):
    opened = []
    for suffix in ("-wal", "-shm"):
        p = cfg["forbidden_db"] + suffix
        try:
            with open(p, "rb") as fh:
                fh.read(64)
            opened.append(suffix)
        except OSError:
            pass
    if opened:
        _out("ALLOWED", f"opened sidecars: {opened}")
    _out("BLOCKED", "no -wal/-shm sidecar readable")


def c_env_override_db_path(cfg):
    """Worker sets HERMES_KANBAN_DB to the other board and opens whatever the
    env says -- the shape the current dispatcher hands workers."""
    os.environ["HERMES_KANBAN_DB"] = cfg["forbidden_db"]
    try:
        s = _read_db_sentinel(os.environ["HERMES_KANBAN_DB"])
        _out("ALLOWED", "env-supplied path honoured", sentinel=s)
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_issuer_key_read(cfg):
    p = cfg.get("issuer_key_path")
    if not p:
        _out("NA", "approach has no issuer key")
    try:
        with open(p, "rb") as fh:
            fh.read(1)
        _out("ALLOWED", f"read issuer private key at {p}")
    except OSError as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_other_capability_file_read(cfg):
    p = cfg.get("other_capability_path")
    if not p:
        _out("NA", "approach has no capability files")
    try:
        with open(p, "rb") as fh:
            fh.read(1)
        _out("ALLOWED", f"read peer capability at {p}")
    except OSError as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_leaf_symlink(cfg):
    """Plant a symlink in writable space pointing at the forbidden DB and try
    to open it through the approach's guard."""
    link = os.path.join(cfg["scratch"], "leaf_alias.db")
    try:
        if os.path.lexists(link):
            os.unlink(link)
        os.symlink(cfg["forbidden_db"], link)
    except OSError as e:
        _out("BLOCKED", f"cannot even plant the symlink: {e}")

    approach = cfg["approach"]
    try:
        if approach == "A":
            conn = open_board(link)
            s = boards.read_sentinel(conn); conn.close()
            _out("ALLOWED", "stat guard followed the symlink", sentinel=s)
        if approach == "B":
            r = read_sentinel_nofollow(link)
            if r["opened"]:
                _out("ALLOWED", "SQLITE_OPEN_NOFOLLOW did not refuse",
                     sentinel=r["sentinel"])
            _out("BLOCKED", f"SQLITE_OPEN_NOFOLLOW rc={r['rc']}: {r['err']}")
        s = _read_db_sentinel(link)
        _out("ALLOWED", "kernel followed the symlink", sentinel=s)
    except GuardDenied as e:
        _out("BLOCKED", f"guard denied: {e}")
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_ancestor_symlink(cfg):
    """Symlinked GRANDPARENT directory -- the higher-ancestor case both model
    reviews flagged as incompletely handled."""
    base = os.path.join(cfg["scratch"], "anc")
    link = os.path.join(cfg["scratch"], "anc_link")
    try:
        shutil.rmtree(base, ignore_errors=True)
        if os.path.lexists(link):
            os.unlink(link)
        os.makedirs(base, exist_ok=True)
        os.symlink(os.path.dirname(os.path.dirname(cfg["forbidden_db"])), link)
        victim = os.path.join(link, os.path.basename(
            os.path.dirname(cfg["forbidden_db"])), "kanban.db")
    except OSError as e:
        _out("BLOCKED", f"cannot build ancestor symlink: {e}")

    try:
        if cfg["approach"] == "A":
            conn = open_board(victim)
            s = boards.read_sentinel(conn); conn.close()
            _out("ALLOWED", "ancestor symlink traversed", sentinel=s)
        if cfg["approach"] == "B":
            # O_NOFOLLOW guards only the FINAL component, so this is the
            # case the fd-bound guard is expected to miss.
            conn, _ = open_board_fdbound(victim)
            s = boards.read_sentinel(conn); conn.close()
            _out("ALLOWED", "ancestor symlink traversed despite O_NOFOLLOW",
                 sentinel=s)
        s = _read_db_sentinel(victim)
        _out("ALLOWED", "ancestor symlink traversed", sentinel=s)
    except GuardDenied as e:
        _out("BLOCKED", f"guard denied: {e}")
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_hardlink_to_forbidden(cfg):
    link = os.path.join(cfg["scratch"], "hard_alias.db")
    try:
        if os.path.lexists(link):
            os.unlink(link)
        os.link(cfg["forbidden_db"], link)
    except OSError as e:
        _out("BLOCKED", f"cannot create hard link: {e}")
    try:
        if cfg["approach"] == "A":
            conn = open_board(link)
            s = boards.read_sentinel(conn); conn.close()
            _out("ALLOWED", "hard link accepted", sentinel=s)
        if cfg["approach"] == "B":
            conn, _ = open_board_fdbound(link)
            s = boards.read_sentinel(conn); conn.close()
            _out("ALLOWED", "hard link accepted", sentinel=s)
        s = _read_db_sentinel(link)
        _out("ALLOWED", "hard link readable", sentinel=s)
    except GuardDenied as e:
        _out("BLOCKED", f"guard denied: {e}")
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_aba_rename_swap(cfg):
    """Two-step ABA against the approach's own guard, on a pathname the probe
    controls: vet inode A, swap a copy of the forbidden DB in, open, restore.
    Requires write access to the victim's directory -- which is itself the
    point: under C/D the probe cannot get it."""
    scratch = cfg["scratch"]
    victim = os.path.join(scratch, "victim.db")
    stash = os.path.join(scratch, "victim_stash.db")
    decoy = os.path.join(scratch, "victim_decoy.db")
    try:
        for p in (victim, stash, decoy):
            if os.path.lexists(p):
                os.unlink(p)
        shutil.copy(cfg["approved_db"], victim)
        shutil.copy(cfg["forbidden_db"], decoy)
    except OSError as e:
        _out("BLOCKED", f"cannot stage ABA (no write access): {e}")

    def swap():
        os.rename(victim, stash)
        os.rename(decoy, victim)

    def restore():
        os.rename(victim, decoy)
        os.rename(stash, victim)

    try:
        if cfg["approach"] == "A":
            conn = open_board(victim, after_check_hook=swap,
                              after_open_hook=restore)
            s = boards.read_sentinel(conn); conn.close()
            if s == boards.SENTINEL_B:
                _out("ALLOWED", "post-open re-check passed while the fd read "
                                "the forbidden inode", sentinel=s)
            _out("BLOCKED", "guard held", sentinel=s)
        if cfg["approach"] == "B":
            conn, _ = open_board_fdbound(victim, after_check_hook=swap)
            s = boards.read_sentinel(conn); conn.close()
            restore()
            if s == boards.SENTINEL_B:
                _out("ALLOWED", "fd-bound guard leaked", sentinel=s)
            _out("BLOCKED", "fd stayed bound to the vetted inode", sentinel=s)
        _out("NA", "no in-process guard in this approach")
    except GuardDenied as e:
        _out("BLOCKED", f"guard denied: {e}")
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_direct_connect_bypass(cfg):
    """Models the 25 raw sqlite3.connect sites in DIRECT_CONNECT_SITES.txt:
    the worker simply does not call the guard."""
    try:
        conn = sqlite3.connect(cfg["forbidden_db"])
        s = boards.read_sentinel(conn); conn.close()
        if s is None:
            _out("BLOCKED", "connect() returned a handle but no row was "
                            "readable")
        _out("ALLOWED", "guard bypassed entirely", sentinel=s)
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_self_board_tamper(cfg):
    """Can the worker forge its OWN board's state with no capability?"""
    try:
        got = tamper_own_board(cfg["approved_db"])
        _out("ALLOWED", f"forged own-board state to {got}")
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_own_board_lifecycle(cfg):
    """Functional positive: the legitimate path must still work."""
    if cfg["approach"] == "C":
        r = call_broker(cfg["sock_path"], cfg["capability"])
        if r.get("ok"):
            _out("ALLOWED", f"broker applied {r.get('result')}")
        _out("BLOCKED", f"legitimate call refused: {r}")
    try:
        conn = open_own_board(cfg["approved_db"])
        s = boards.read_sentinel(conn); conn.close()
        _out("ALLOWED", "own board readable", sentinel=s)
    except (OSError, sqlite3.Error) as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


def c_read_proc_environ(cfg):
    """Peer worker's environment (would leak HERMES_KANBAN_DB / tokens)."""
    pid = cfg.get("peer_pid")
    if not pid:
        _out("NA", "no peer pid supplied")
    try:
        with open(f"/proc/{pid}/environ", "rb") as fh:
            data = fh.read()
        _out("ALLOWED", f"read {len(data)} bytes of peer environ")
    except OSError as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")


# --------------------------------------------------------------------------
# broker / capability controls (approach C)
# --------------------------------------------------------------------------
def c_broker_call(cfg):
    """Generic broker call; the runner decides which token to hand over."""
    try:
        r = call_broker(cfg["sock_path"], cfg["capability"])
    except OSError as e:
        _out("BLOCKED", f"socket refused: {type(e).__name__}: {e}")
    if r.get("ok"):
        _out("ALLOWED", f"broker accepted: {r.get('result')}",
             sentinel=r.get("result"))
    _out("BLOCKED", f"{r.get('reason')}: {r.get('detail')}")


def c_oversized_frame(cfg):
    """Declare an 8 MiB frame. The broker must refuse on the LENGTH, before
    reading or buffering the body."""
    import socket as _s
    import struct as _st
    s = _s.socket(_s.AF_UNIX, _s.SOCK_STREAM)
    s.settimeout(10.0)
    try:
        s.connect(cfg["sock_path"])
        s.sendall(_st.pack(">I", 8 * 1024 * 1024) + b"{")
        raw = s.recv(4096)
        if not raw:
            _out("ERROR", "broker closed without a reply")
        try:
            reply = json.loads(raw[4:].decode())
        except Exception as e:
            _out("ERROR", f"unparseable reply ({len(raw)}B): {e}")
        if reply.get("ok"):
            _out("ALLOWED", f"broker accepted an oversized frame: {reply}")
        if reply.get("reason") != "framing_rejected":
            _out("ERROR", f"refused for the wrong reason: {reply}")
        _out("BLOCKED", f"framing_rejected: {reply.get('detail')}")
    except OSError as e:
        _out("BLOCKED", f"{type(e).__name__}: {e}")
    finally:
        s.close()


CONTROLS = {
    "cross_board_db_read": c_cross_board_db_read,
    "cross_board_wal_shm_read": c_cross_board_wal_shm_read,
    "env_override_db_path": c_env_override_db_path,
    "issuer_key_read": c_issuer_key_read,
    "other_capability_file_read": c_other_capability_file_read,
    "leaf_symlink": c_leaf_symlink,
    "ancestor_symlink": c_ancestor_symlink,
    "hardlink_to_forbidden": c_hardlink_to_forbidden,
    "aba_rename_swap": c_aba_rename_swap,
    "direct_connect_bypass": c_direct_connect_bypass,
    "self_board_tamper": c_self_board_tamper,
    "own_board_lifecycle": c_own_board_lifecycle,
    "read_proc_environ": c_read_proc_environ,
    "broker_call": c_broker_call,
    "oversized_frame": c_oversized_frame,
}


def main() -> None:
    cfg = json.loads(sys.argv[1])
    fn = CONTROLS.get(cfg["control"])
    if fn is None:
        _out("ERROR", f"unknown control {cfg['control']}")
    try:
        fn(cfg)
    except SystemExit:
        raise
    except Exception as exc:
        _out("ERROR", f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
