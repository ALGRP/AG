"""Dispatcher side (broker trust domain): mint a per-run capability bundle and
build the worker environment.

Replaces upstream c419cf7c ``hermes_cli/kanban_db_dispatch.py:2846``
(``env["HERMES_KANBAN_DB"] = ...``) and ``gateway/session_kanban.py:163-168``
(``'HERMES_KANBAN_DB': context['db']``): in broker mode the worker gets a
socket path and a capability FILE, never a database path.

The bundle holds one ``complete``, one ``block`` and ``heartbeats`` distinct
``heartbeat`` capabilities, each single-use, all bound to (sub_uid, tenant,
project, board, task, run_id) and expiring within MAX_TTL_SECONDS (600 s).

OPEN for SEL-333 (not solved here): runs longer than the TTL need a renewal
path. The broker holds only public keys, so renewal must be a dispatcher
action (re-mint on the dispatcher's heartbeat tick and atomically replace the
bundle file) -- not a worker-requestable mint.
"""
from __future__ import annotations

import json
import os
import tempfile

from agos_broker.capability import MAX_TTL_SECONDS, Issuer

DB_ENV_VARS = ("HERMES_KANBAN_DB",)


def mint_bundle(issuer: Issuer, *, worker_uid: int, board: str, task: str,
                run_id: int, tenant: str, project: str, heartbeats: int = 8,
                ttl: int = MAX_TTL_SECONDS) -> dict:
    common = dict(sub_uid=worker_uid, board=board, task=task, run_id=str(int(run_id)),
                  tenant=tenant, project=project, ttl=ttl)
    return {
        "version": 1, "board": board, "task": task, "run_id": str(int(run_id)),
        "complete": issuer.mint(action="complete", **common),
        "block": issuer.mint(action="block", **common),
        "heartbeat": [issuer.mint(action="heartbeat", **common)
                      for _ in range(heartbeats)],
    }


def write_bundle(bundle: dict, cap_dir: str, worker_uid: int, worker_gid: int) -> str:
    """Atomically write ``<cap_dir>/<task>.cap.json`` 0600 owned by the worker.

    ``cap_dir`` must be a 0700 directory owned by the worker (systemd
    StateDirectory of agos-hermes-worker@<board>). Requires root or CAP_CHOWN
    in the dispatcher; nothing else may read it."""
    st = os.lstat(cap_dir)
    if st.st_uid != worker_uid or st.st_mode & 0o077:
        raise PermissionError(f"capability dir {cap_dir} must be 0700 owned by {worker_uid}")
    fd, tmp = tempfile.mkstemp(dir=cap_dir, prefix=".cap-")
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, worker_uid, worker_gid)
        with os.fdopen(fd, "w") as fh:
            json.dump(bundle, fh)
            fh.flush()
            os.fsync(fh.fileno())
        dest = os.path.join(cap_dir, f"{bundle['task']}.cap.json")
        os.rename(tmp, dest)
        return dest
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def worker_env(base_env: dict, *, sock_path: str, cap_file: str, task: str,
               run_id: int, board: str) -> dict:
    env = {k: v for k, v in base_env.items() if k not in DB_ENV_VARS}
    env.update({
        "HERMES_KANBAN_BROKER_SOCK": sock_path,
        "HERMES_KANBAN_CAPABILITY_FILE": cap_file,
        "HERMES_KANBAN_TASK": task,
        "HERMES_KANBAN_RUN_ID": str(int(run_id)),
        "HERMES_KANBAN_BOARD": board,
    })
    return env


def load_issuer(key_file: str, *, iss: str, kid: str) -> Issuer:
    """Load the dispatcher's Ed25519 signing key (raw 32 bytes, 0600, owned by
    the dispatcher/broker trust domain). Never readable by a worker UID."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    st = os.stat(key_file)
    if st.st_mode & 0o077:
        raise PermissionError(f"signing key {key_file} must be 0600")
    with open(key_file, "rb") as fh:
        raw = fh.read()
    if len(raw) != 32:
        raise ValueError("signing key must be 32 raw bytes")
    issuer = Issuer(iss=iss, kid=kid)
    issuer._sk = Ed25519PrivateKey.from_private_bytes(raw)
    return issuer


def spawn_env(env: dict, *, board: str, task_id: str, run_id: int | None,
              tenant: str | None, project: str | None,
              cfg_path: str = "/etc/agos-dispatcher/broker-mode.json") -> dict:
    """Upstream hook for kanban_db_dispatch (see UPSTREAM_PATCH.diff).

    cfg: {"iss","kid","signing_key_file","heartbeats",
          "boards": {slug: {"worker_uid","worker_gid","sock_path","cap_dir"}}}
    Fails closed: a task without run_id/tenant/project cannot be scoped, so
    it is not spawned in broker mode."""
    if run_id is None or not tenant or not project:
        raise ValueError(f"task {task_id} lacks run_id/tenant/project; refusing broker spawn")
    with open(cfg_path) as fh:
        cfg = json.load(fh)
    b = cfg["boards"][board]
    issuer = load_issuer(cfg["signing_key_file"], iss=cfg["iss"], kid=cfg["kid"])
    bundle = mint_bundle(issuer, worker_uid=b["worker_uid"], board=board, task=task_id,
                         run_id=run_id, tenant=tenant, project=project,
                         heartbeats=int(cfg.get("heartbeats", 8)))
    cap = write_bundle(bundle, b["cap_dir"], b["worker_uid"], b["worker_gid"])
    return worker_env(env, sock_path=b["sock_path"], cap_file=cap, task=task_id,
                      run_id=run_id, board=board)
