"""Stopped-service backup, resumable restore, and ownership rollback.

  python3 -m agos_broker.backup backup  --db DB --sock SOCK --out DIR
  python3 -m agos_broker.backup restore --db DB --sock SOCK --backup FILE
  python3 -m agos_broker.backup snapshot-owner --db DB --out FILE     (root)
  python3 -m agos_broker.backup rollback-owner --snapshot FILE        (root)

Backup uses the SQLite online-backup API into a single self-contained file,
so pages still only in ``-wal`` are included. (Copying ``kanban.db`` alone
silently drops WAL-resident commits -- including spent nonces.)

Restore is crash-safe and resumable:
  1. write ``<db>.restore-intent.json`` (fsync) -- the daemon refuses to start
     while it exists;
  2. stage ``<db>.restore-tmp`` from the verified backup, stamp the restore
     watermark (``not_before_iat = now``, ``restore_epoch += 1``), fsync;
  3. move the live triple (db, -wal, -shm) aside to ``<db>.pre-restore-<ts>*``;
  4. rename the staged file over ``<db>``; fsync the directory;
  5. remove the intent marker.
Re-running restore after an interruption at any step completes it. The old
``-wal``/``-shm`` are never left next to the restored file, so a foreign WAL
can never be replayed onto it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import sqlite3
import sys
import time
from typing import Callable

from agos_broker import ledger
from agos_broker.config import intent_marker

SIDE = ("", "-wal", "-shm")


class RestoreError(RuntimeError):
    pass


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _fsync_dir(path: str) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def service_live(sock_path: str) -> bool:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        s.connect(sock_path)
        return True
    except OSError:
        return False
    finally:
        s.close()


def backup(db: str, sock: str, out_dir: str) -> dict:
    if service_live(sock):
        raise RestoreError("broker is serving this board; stop it before backup")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    dest = os.path.join(out_dir, f"{os.path.basename(db)}.{ts}.backup")
    src = sqlite3.connect(db)          # service stopped; we are the owner
    old = os.umask(0o077)
    try:
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")
            check = dst.execute("PRAGMA integrity_check").fetchone()[0]
            nonces = dst.execute("SELECT count(*) FROM agos_broker_nonce").fetchone()[0]
        finally:
            dst.close()
    finally:
        os.umask(old)
        src.close()
    if check != "ok":
        raise RestoreError(f"backup integrity_check={check}")
    with open(dest, "rb") as fh:
        os.fsync(fh.fileno())
    manifest = {"backup": dest, "sha256": sha256_file(dest), "source_db": db,
                "created_utc": ts, "integrity_check": check, "nonce_rows": nonces,
                "source_triple_sha256": {s: sha256_file(db + s)
                                         for s in SIDE if os.path.exists(db + s)}}
    with open(dest + ".manifest.json", "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    _fsync_dir(out_dir)
    return manifest


def restore(db: str, sock: str, backup_file: str, *,
            fail_at: str | None = None, now: Callable[[], float] = time.time) -> dict:
    """``fail_at`` is a test-only fault-injection point name."""
    def step(name: str) -> None:
        if fail_at == name:
            raise RestoreError(f"INJECTED_INTERRUPTION:{name}")

    if service_live(sock):
        raise RestoreError("broker is serving this board; stop it before restore")
    db_dir = os.path.dirname(db)
    marker = intent_marker(db)
    tmp = db + ".restore-tmp"
    if os.path.exists(marker):
        with open(marker) as fh:
            intent = json.load(fh)
        if intent["backup"] != os.path.realpath(backup_file):
            raise RestoreError("a different restore is in progress")
    else:
        with open(backup_file + ".manifest.json") as fh:
            manifest = json.load(fh)
        digest = sha256_file(backup_file)
        if digest != manifest["sha256"]:
            raise RestoreError("backup sha256 does not match its manifest")
        intent = {"backup": os.path.realpath(backup_file), "sha256": digest,
                  "aside": f"{db}.pre-restore-{int(now())}", "started": int(now())}
        old = os.umask(0o077)
        try:
            with open(marker, "w") as fh:
                json.dump(intent, fh)
                fh.flush()
                os.fsync(fh.fileno())
        finally:
            os.umask(old)
        _fsync_dir(db_dir)
    step("after_intent")

    # (2) stage -- idempotent: always rebuilt from the verified backup.
    if not os.path.exists(db + ".restore-staged"):
        if sha256_file(backup_file) != intent["sha256"]:
            raise RestoreError("backup changed during restore")
        for s in SIDE:
            if os.path.exists(tmp + s):
                os.unlink(tmp + s)
        old = os.umask(0o077)
        try:
            with open(backup_file, "rb") as src, open(tmp, "wb") as dst:
                dst.write(src.read())
                dst.flush()
                os.fsync(dst.fileno())
        finally:
            os.umask(old)
        step("mid_stage")
        conn = ledger.connect(tmp)
        try:
            ledger.ensure_schema(conn)
            conn.execute("BEGIN IMMEDIATE")
            t = int(now())
            hw = int(conn.execute("SELECT v FROM agos_broker_meta "
                                  "WHERE k='high_water_time'").fetchone()[0])
            ep = int(conn.execute("SELECT v FROM agos_broker_meta "
                                  "WHERE k='restore_epoch'").fetchone()[0])
            ledger.set_meta(conn, "not_before_iat", t)
            ledger.set_meta(conn, "high_water_time", max(hw, t))
            ledger.set_meta(conn, "restore_epoch", ep + 1)
            conn.execute("COMMIT")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RestoreError("staged restore failed integrity_check")
        finally:
            conn.close()
        for s in ("-wal", "-shm"):
            if os.path.exists(tmp + s):
                os.unlink(tmp + s)
        with open(db + ".restore-staged", "w") as fh:
            fh.flush()
            os.fsync(fh.fileno())
        _fsync_dir(db_dir)
    step("after_stage")

    # (3) move the live triple aside (each rename is atomic; order db last so
    # a half-moved state never leaves a db next to a foreign WAL).
    for s in ("-wal", "-shm", ""):
        if os.path.exists(db + s) and os.path.exists(tmp):
            os.rename(db + s, intent["aside"] + s)
            if s == "-wal":
                step("after_wal_aside")
    _fsync_dir(db_dir)
    step("after_aside")

    # (4) swap in
    if os.path.exists(tmp):
        os.rename(tmp, db)
        _fsync_dir(db_dir)
    step("after_swap")

    # (5) done
    os.unlink(db + ".restore-staged")
    os.unlink(marker)
    _fsync_dir(db_dir)
    conn = sqlite3.connect(db)
    try:
        meta = dict(conn.execute("SELECT k, v FROM agos_broker_meta").fetchall())
        check = conn.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        conn.close()
    return {"restored": db, "from": intent["backup"], "aside": intent["aside"],
            "integrity_check": check, "meta": meta}


def snapshot_owner(db: str) -> dict:
    snap = {"db": db, "nodes": {}}
    for p in [os.path.dirname(db)] + [db + s for s in SIDE]:
        if os.path.exists(p):
            st = os.lstat(p)
            snap["nodes"][p] = {"uid": st.st_uid, "gid": st.st_gid,
                                "mode": st.st_mode & 0o7777}
    return snap


def rollback_owner(snap: dict) -> dict:
    """S-step rollback: give the board back to its pre-migration owner.

    Must run as root with every broker/worker unit stopped."""
    done = {}
    for p, want in snap["nodes"].items():
        if os.path.exists(p):
            os.chown(p, want["uid"], want["gid"], follow_symlinks=False)
            os.chmod(p, want["mode"])
            done[p] = want
    return done


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backup"); b.add_argument("--db", required=True)
    b.add_argument("--sock", required=True); b.add_argument("--out", required=True)
    r = sub.add_parser("restore"); r.add_argument("--db", required=True)
    r.add_argument("--sock", required=True); r.add_argument("--backup", required=True)
    s = sub.add_parser("snapshot-owner"); s.add_argument("--db", required=True)
    s.add_argument("--out", required=True)
    o = sub.add_parser("rollback-owner"); o.add_argument("--snapshot", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "backup":
        res = backup(a.db, a.sock, a.out)
    elif a.cmd == "restore":
        res = restore(a.db, a.sock, a.backup)
    elif a.cmd == "snapshot-owner":
        res = snapshot_owner(a.db)
        with open(a.out, "w") as fh:
            json.dump(res, fh, indent=2)
    else:
        with open(a.snapshot) as fh:
            res = rollback_owner(json.load(fh))
    print(json.dumps(res, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
