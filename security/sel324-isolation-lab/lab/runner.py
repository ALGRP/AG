"""SEL-324 comparative isolation lab -- orchestrator.

Builds four candidate layouts and runs ONE shared control battery against each
with REAL separate operating-system UIDs, then emits a comparative matrix.

Approaches
  A  in-process pathname stat identity guard      (the pinned SEL-324 shape)
  B  fd-bound identity (O_NOFOLLOW + procfs reopen + SQLITE_OPEN_NOFOLLOW)
  D  per-board directory owned by that board's worker UID, no broker
  C  per-board Hermes instance + UID broker        (SEL-433 target)

LOCAL_ONLY: synthetic boards, ephemeral keys, throwaway UIDs, no network.
Run as root in a disposable container. See ../SCOPE.md.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

import sqlite3

from lab import boards
from lab.approach_c_broker import BoardBroker
from lab.capability import Issuer, Verifier

PY = "/usr/bin/python3.12"
LAB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BROKER_UID, BROKER_GID = 450, 450
WORKER_A_UID, WORKER_A_GID = 511, 511      # agos-control
WORKER_B_UID, WORKER_B_GID = 512, 512      # agos-continuous
OUTSIDER_UID, OUTSIDER_GID = 520, 520

USERS = [
    ("agosbroker", BROKER_UID, BROKER_GID),
    ("agosw-control", WORKER_A_UID, WORKER_A_GID),
    ("agosw-continuous", WORKER_B_UID, WORKER_B_GID),
    ("agosouter", OUTSIDER_UID, OUTSIDER_GID),
]

NEGATIVE = "BLOCKED"
POSITIVE = "ALLOWED"

# control -> (expectation, human description)
BATTERY: dict[str, tuple[str, str]] = {
    "cross_board_db_read":        (NEGATIVE, "Worker A opens board B's kanban.db"),
    "cross_board_wal_shm_read":   (NEGATIVE, "Worker A reads board B's -wal/-shm sidecars"),
    "env_override_db_path":       (NEGATIVE, "Worker A repoints HERMES_KANBAN_DB at board B"),
    "issuer_key_read":            (NEGATIVE, "Worker A reads the capability signing key"),
    "other_capability_file_read": (NEGATIVE, "Worker A reads board B's capability"),
    "leaf_symlink":               (NEGATIVE, "Symlink at the DB pathname -> board B"),
    "ancestor_symlink":           (NEGATIVE, "Symlinked grandparent directory -> board B"),
    "hardlink_to_forbidden":      (NEGATIVE, "Hard link to board B's DB"),
    "aba_rename_swap":            (NEGATIVE, "Two-step ABA rename across the check/open window"),
    "direct_connect_bypass":      (NEGATIVE, "Raw sqlite3.connect, guard never called"),
    "self_board_tamper":          (NEGATIVE, "Worker forges its OWN board state, no capability"),
    "read_proc_environ":          (NEGATIVE, "Worker A reads worker B's /proc/<pid>/environ"),
    "forged_signature":           (NEGATIVE, "Capability with an invalid Ed25519 signature"),
    "leaked_capability_wrong_peer": (NEGATIVE, "Board B's valid capability replayed by UID A"),
    "expired_capability":         (NEGATIVE, "Capability past its exp"),
    "duplicate_json_member":      (NEGATIVE, "Validly signed payload with a duplicated board member"),
    "cross_board_capability":     (NEGATIVE, "Capability for board B presented on board A's socket"),
    "replay_same_nonce":          (NEGATIVE, "Second use of an already-consumed nonce"),
    "replay_after_restart":       (NEGATIVE, "Nonce replayed after the broker restarts"),
    "foreign_uid_socket":         (NEGATIVE, "Unrelated UID connects to board A's socket"),
    "early_peer_rejection":       (NEGATIVE, "Privileged non-bound UID passes the dir gate"),
    "oversized_frame":            (NEGATIVE, "8 MiB declared frame length"),
    "atomic_rollback_on_effect_failure": (NEGATIVE, "Failure after the effect, before commit, leaves NOTHING applied"),
    "fresh_nonce_on_completed_task": (NEGATIVE, "A brand-new nonce redoing an already-completed task"),
    "cross_scope_tenant_project":  (NEGATIVE, "Valid signature, wrong tenant/project, enforced at the UPDATE"),
    "own_board_lifecycle":        (POSITIVE, "Legitimate task completion still works"),
    "concurrent_single_winner":   (POSITIVE, "8 concurrent uses of one capability -> exactly 1"),
    "flood_isolation":            (POSITIVE, "Board B serves 40/40 while A floods"),
}


@dataclass
class Result:
    approach: str
    control: str
    expected: str
    outcome: str
    detail: str = ""
    sentinel: Any = None
    verdict: str = field(default="")

    def finish(self) -> "Result":
        if self.outcome == "NA":
            self.verdict = "NA"
        elif self.outcome == "ERROR":
            self.verdict = "ERROR"
        else:
            self.verdict = "PASS" if self.outcome == self.expected else "FAIL"
        return self


# ---------------------------------------------------------------- users ----
def ensure_users() -> None:
    for name, uid, gid in USERS:
        subprocess.run(["groupadd", "-g", str(gid), name],
                       capture_output=True, text=True)
        subprocess.run(["useradd", "-u", str(uid), "-g", str(gid), "-M",
                        "-N", "-s", "/usr/sbin/nologin", name],
                       capture_output=True, text=True)
    missing = [n for n, u, _ in USERS
               if subprocess.run(["id", "-u", n], capture_output=True).returncode]
    if missing:
        raise SystemExit(f"could not create lab users: {missing}")


def run_probe(uid: int, gid: int, cfg: dict) -> dict:
    """Run one control as a REAL separate UID."""
    proc = subprocess.run(
        ["setpriv", "--reuid", str(uid), "--regid", str(gid),
         "--clear-groups", PY, "-m", "lab.probe", json.dumps(cfg)],
        capture_output=True, text=True, cwd=LAB_DIR, timeout=120,
        env={**os.environ, "PYTHONPATH": LAB_DIR, "HOME": "/tmp",
             "PYTHONDONTWRITEBYTECODE": "1"},
    )
    out = proc.stdout.strip().splitlines()
    if not out:
        return {"outcome": "ERROR",
                "detail": (proc.stderr.strip() or "no output")[-400:]}
    try:
        return json.loads(out[-1])
    except json.JSONDecodeError:
        return {"outcome": "ERROR", "detail": out[-1][-400:]}


# -------------------------------------------------------------- layouts ----
def build_shared_uid_layout(root: str, approach: str) -> dict:
    """Approaches A and B: ONE Hermes instance, one UID, both boards.
    This is the shape of the currently installed system."""
    shutil.rmtree(root, ignore_errors=True)
    kanban = os.path.join(root, "kanban")
    a = boards.make_board(os.path.join(kanban, boards.BOARD_A), boards.BOARD_A,
                          boards.SENTINEL_A, WORKER_A_UID, WORKER_A_GID)
    b = boards.make_board(os.path.join(kanban, boards.BOARD_B), boards.BOARD_B,
                          boards.SENTINEL_B, WORKER_A_UID, WORKER_A_GID)
    scratch = os.path.join(root, "scratch")
    os.makedirs(scratch, exist_ok=True)
    os.chown(scratch, WORKER_A_UID, WORKER_A_GID)
    os.chmod(scratch, 0o700)
    # The key sits in the same trust domain, because there is only one.
    key = os.path.join(root, "issuer.key")
    with open(key, "wb") as fh:
        fh.write(b"SYNTHETIC-LAB-KEY-NOT-A-REAL-SECRET")
    os.chown(key, WORKER_A_UID, WORKER_A_GID)
    os.chmod(key, 0o600)
    cap = os.path.join(root, "cap_board_b.json")
    with open(cap, "w") as fh:
        fh.write('{"synthetic":"board-b capability"}')
    os.chown(cap, WORKER_A_UID, WORKER_A_GID)
    os.chmod(cap, 0o600)
    os.chmod(root, 0o755)
    os.chmod(kanban, 0o755)
    return {"approach": approach, "approved_db": a.db_path,
            "forbidden_db": b.db_path, "scratch": scratch,
            "issuer_key_path": key, "other_capability_path": cap,
            "probe_uid": WORKER_A_UID, "probe_gid": WORKER_A_GID}


def build_per_board_uid_layout(root: str) -> dict:
    """Approach D: each board directory 0700, owned by ITS OWN worker UID."""
    shutil.rmtree(root, ignore_errors=True)
    kanban = os.path.join(root, "kanban")
    a = boards.make_board(os.path.join(kanban, boards.BOARD_A), boards.BOARD_A,
                          boards.SENTINEL_A, WORKER_A_UID, WORKER_A_GID)
    b = boards.make_board(os.path.join(kanban, boards.BOARD_B), boards.BOARD_B,
                          boards.SENTINEL_B, WORKER_B_UID, WORKER_B_GID)
    scratch = os.path.join(root, "scratch-a")
    os.makedirs(scratch, exist_ok=True)
    os.chown(scratch, WORKER_A_UID, WORKER_A_GID)
    os.chmod(scratch, 0o700)
    key = os.path.join(root, "issuer.key")
    with open(key, "wb") as fh:
        fh.write(b"SYNTHETIC-LAB-KEY-NOT-A-REAL-SECRET")
    os.chown(key, BROKER_UID, BROKER_GID)
    os.chmod(key, 0o600)
    cap = os.path.join(root, "cap_board_b.json")
    with open(cap, "w") as fh:
        fh.write('{"synthetic":"board-b capability"}')
    os.chown(cap, WORKER_B_UID, WORKER_B_GID)
    os.chmod(cap, 0o600)
    os.chmod(root, 0o755)
    os.chmod(kanban, 0o755)
    return {"approach": "D", "approved_db": a.db_path,
            "forbidden_db": b.db_path, "scratch": scratch,
            "issuer_key_path": key, "other_capability_path": cap,
            "probe_uid": WORKER_A_UID, "probe_gid": WORKER_A_GID}


def build_broker_layout(root: str) -> dict:
    """Approach C: board DBs 0700 under the BROKER's UID; workers reach them
    only through a per-board socket gated by a 0750 directory."""
    shutil.rmtree(root, ignore_errors=True)
    kanban = os.path.join(root, "kanban")
    a = boards.make_board(os.path.join(kanban, boards.BOARD_A), boards.BOARD_A,
                          boards.SENTINEL_A, BROKER_UID, BROKER_GID)
    b = boards.make_board(os.path.join(kanban, boards.BOARD_B), boards.BOARD_B,
                          boards.SENTINEL_B, BROKER_UID, BROKER_GID)
    os.chmod(kanban, 0o700)
    os.chown(kanban, BROKER_UID, BROKER_GID)

    scratch = os.path.join(root, "scratch-a")
    os.makedirs(scratch, exist_ok=True)
    os.chown(scratch, WORKER_A_UID, WORKER_A_GID)
    os.chmod(scratch, 0o700)

    state = os.path.join(root, "state")
    os.makedirs(state, exist_ok=True)
    os.chown(state, BROKER_UID, BROKER_GID)
    os.chmod(state, 0o700)
    key = os.path.join(state, "issuer.key")
    with open(key, "wb") as fh:
        fh.write(b"SYNTHETIC-LAB-KEY-NOT-A-REAL-SECRET")
    os.chown(key, BROKER_UID, BROKER_GID)
    os.chmod(key, 0o600)
    cap = os.path.join(state, "cap_board_b.json")
    with open(cap, "w") as fh:
        fh.write('{"synthetic":"board-b capability"}')
    os.chown(cap, BROKER_UID, BROKER_GID)
    os.chmod(cap, 0o600)

    run_root = os.path.join(root, "run")
    socks = {}
    for board, gid in ((boards.BOARD_A, WORKER_A_GID),
                       (boards.BOARD_B, WORKER_B_GID)):
        d = os.path.join(run_root, board)
        os.makedirs(d, exist_ok=True)
        os.chown(d, BROKER_UID, gid)
        os.chmod(d, 0o750)           # only that board's worker group traverses
        socks[board] = os.path.join(d, "broker.sock")
    os.chown(run_root, BROKER_UID, BROKER_GID)
    os.chmod(run_root, 0o755)
    os.chmod(root, 0o755)

    return {"approach": "C", "approved_db": a.db_path,
            "forbidden_db": b.db_path, "scratch": scratch,
            "issuer_key_path": key, "other_capability_path": cap,
            "probe_uid": WORKER_A_UID, "probe_gid": WORKER_A_GID,
            "socks": socks, "state": state, "root": root}


# --------------------------------------------------------- broker control ---
class BrokerProcess:
    """Runs lab/broker_main.py as the REAL broker UID (450)."""

    def __init__(self, layout: dict, issuer: Issuer) -> None:
        self.layout = layout
        self.issuer = issuer
        self.ready = os.path.join(layout["root"], "broker.ready")
        self.stop = os.path.join(layout["root"], "broker.stop")
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        for p in (self.ready, self.stop):
            if os.path.exists(p):
                os.unlink(p)
        cfg = {
            "public_key_hex": self.issuer.public_bytes().hex(),
            "ready_file": self.ready, "stop_file": self.stop,
            "boards": [
                {"board": boards.BOARD_A,
                 "db_path": self.layout["approved_db"],
                 "sock_path": self.layout["socks"][boards.BOARD_A],
                 "bound_uid": WORKER_A_UID, "worker_gid": WORKER_A_GID},
                {"board": boards.BOARD_B,
                 "db_path": self.layout["forbidden_db"],
                 "sock_path": self.layout["socks"][boards.BOARD_B],
                 "bound_uid": WORKER_B_UID, "worker_gid": WORKER_B_GID},
            ],
        }
        # The ready/stop files live in a dir the broker UID must write to.
        for p in (self.ready, self.stop):
            open(p + ".touch", "w").close()
            os.unlink(p + ".touch")
        os.chmod(self.layout["root"], 0o777)
        self.proc = subprocess.Popen(
            ["setpriv", "--reuid", str(BROKER_UID), "--regid", str(BROKER_GID),
             "--clear-groups", PY, "-m", "lab.broker_main", json.dumps(cfg)],
            cwd=LAB_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, "PYTHONPATH": LAB_DIR, "HOME": "/tmp",
                 "PYTHONDONTWRITEBYTECODE": "1"},
        )
        for _ in range(200):
            if os.path.exists(self.ready):
                return
            if self.proc.poll() is not None:
                _, err = self.proc.communicate()
                raise SystemExit(f"broker died on start:\n{err}")
            time.sleep(0.05)
        raise SystemExit("broker did not become ready")

    def shutdown(self) -> None:
        if self.proc is None:
            return
        open(self.stop, "w").close()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


# ------------------------------------------------------------- batteries ----
FS_CONTROLS = ["cross_board_db_read", "cross_board_wal_shm_read",
               "env_override_db_path", "issuer_key_read",
               "other_capability_file_read", "leaf_symlink",
               "ancestor_symlink", "hardlink_to_forbidden",
               "aba_rename_swap", "direct_connect_bypass",
               "self_board_tamper"]

BROKER_ONLY = ["atomic_rollback_on_effect_failure",
               "fresh_nonce_on_completed_task",
               "cross_scope_tenant_project",
               "forged_signature", "leaked_capability_wrong_peer",
               "expired_capability", "duplicate_json_member",
               "cross_board_capability", "replay_same_nonce",
               "replay_after_restart", "foreign_uid_socket",
               "early_peer_rejection", "oversized_frame",
               "concurrent_single_winner", "flood_isolation"]


def _peer_sleeper(uid: int, gid: int) -> subprocess.Popen:
    return subprocess.Popen(
        ["setpriv", "--reuid", str(uid), "--regid", str(gid),
         "--clear-groups", "/bin/sleep", "60"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, "HERMES_KANBAN_DB": "/synthetic/peer/kanban.db"})


def run_fs_battery(layout: dict, results: list[Result]) -> None:
    approach = layout["approach"]
    uid, gid = layout["probe_uid"], layout["probe_gid"]

    for control in FS_CONTROLS:
        cfg = {**{k: v for k, v in layout.items() if k != "socks"},
               "control": control}
        r = run_probe(uid, gid, cfg)
        results.append(Result(approach, control, BATTERY[control][0],
                              r.get("outcome", "ERROR"), r.get("detail", ""),
                              r.get("sentinel")).finish())

    peer = _peer_sleeper(WORKER_B_UID, WORKER_B_GID)
    try:
        time.sleep(0.3)
        cfg = {"control": "read_proc_environ", "approach": approach,
               "peer_pid": peer.pid, "scratch": layout["scratch"],
               "approved_db": layout["approved_db"],
               "forbidden_db": layout["forbidden_db"]}
        r = run_probe(uid, gid, cfg)
        results.append(Result(approach, "read_proc_environ", NEGATIVE,
                              r.get("outcome", "ERROR"),
                              r.get("detail", "")).finish())
    finally:
        peer.kill()

    # Functional positive on the non-broker approaches.
    if approach != "C":
        cfg = {"control": "own_board_lifecycle", "approach": approach,
               "approved_db": layout["approved_db"],
               "forbidden_db": layout["forbidden_db"],
               "scratch": layout["scratch"]}
        r = run_probe(uid, gid, cfg)
        results.append(Result(approach, "own_board_lifecycle", POSITIVE,
                              r.get("outcome", "ERROR"), r.get("detail", ""),
                              r.get("sentinel")).finish())
        for control in BROKER_ONLY:
            results.append(Result(approach, control, BATTERY[control][0],
                                  "NA", "no broker in this approach").finish())


def _call(sock: str, token: str, uid: int = WORKER_A_UID,
          gid: int = WORKER_A_GID) -> dict:
    return run_probe(uid, gid, {"control": "broker_call", "approach": "C",
                                "sock_path": sock, "capability": token})


def run_broker_battery(layout: dict, issuer: Issuer, broker: BrokerProcess,
                       results: list[Result]) -> None:
    sock_a = layout["socks"][boards.BOARD_A]
    sock_b = layout["socks"][boards.BOARD_B]

    def add(control: str, outcome: str, detail: str = "", sentinel=None):
        results.append(Result("C", control, BATTERY[control][0], outcome,
                              detail, sentinel).finish())

    def mint(**kw):
        base = dict(sub_uid=WORKER_A_UID, board=boards.BOARD_A,
                    task=f"t_{boards.BOARD_A}_1",
                    run_id=f"run_{boards.BOARD_A}_1", action="heartbeat")
        base.update(kw)
        return issuer.mint(**base)

    # functional positive -- a real task completion through the broker
    tok = mint(action="complete")
    r = run_probe(WORKER_A_UID, WORKER_A_GID,
                  {"control": "own_board_lifecycle", "approach": "C",
                   "sock_path": sock_a, "capability": tok})
    add("own_board_lifecycle", r.get("outcome", "ERROR"), r.get("detail", ""))

    # forged signature
    env = json.loads(mint())
    env["sig"] = "00" * 64
    add("forged_signature", *_oc(_call(sock_a, json.dumps(env))))

    # board B's capability, presented by UID A on A's socket
    leaked = issuer.mint(sub_uid=WORKER_B_UID, board=boards.BOARD_A,
                         task=f"t_{boards.BOARD_A}_1",
                         run_id=f"run_{boards.BOARD_A}_1", action="heartbeat")
    add("leaked_capability_wrong_peer", *_oc(_call(sock_a, leaked)))

    # expired
    add("expired_capability", *_oc(_call(sock_a, mint(ttl=60, iat=1))))

    # duplicate JSON member, validly signed
    dup = ('{"action":"heartbeat","board":"%s","board":"%s","exp":%d,"iat":%d,'
           '"iss":"agos-broker","kid":"k1","nonce":"%s","project":'
           '"p_synthetic","run_id":"r","sub_uid":%d,"task":"t","tenant":'
           '"AGOS_SYNTHETIC"}' % (boards.BOARD_A, boards.BOARD_B,
                                  int(time.time()) + 300, int(time.time()),
                                  "d" * 32, WORKER_A_UID))
    add("duplicate_json_member", *_oc(_call(sock_a, issuer.mint_raw(dup))))

    # capability scoped to board B, presented on board A's socket
    add("cross_board_capability",
        *_oc(_call(sock_a, mint(board=boards.BOARD_B))))

    # replay: same nonce twice
    replay_tok = mint()
    first = _call(sock_a, replay_tok)
    second = _call(sock_a, replay_tok)
    add("replay_same_nonce", *_oc(second,
                                  prefix=f"first={first.get('outcome')} "))

    # replay across a broker restart (durable ledger)
    restart_tok = mint()
    _call(sock_a, restart_tok)
    broker.shutdown()
    broker.start()
    add("replay_after_restart", *_oc(_call(sock_a, restart_tok)))

    # unrelated UID -- stopped by the 0750 socket directory
    add("foreign_uid_socket",
        *_oc(_call(sock_a, mint(), uid=OUTSIDER_UID, gid=OUTSIDER_GID)))

    # privileged caller that DOES pass the directory gate: SO_PEERCRED must
    # still refuse it, because uid 0 is not the bound UID for this board.
    add("early_peer_rejection", *_oc(_call(sock_a, mint(), uid=0, gid=0)))

    # oversized declared frame length
    r = run_probe(WORKER_A_UID, WORKER_A_GID,
                  {"control": "oversized_frame", "approach": "C",
                   "sock_path": sock_a})
    add("oversized_frame", r.get("outcome", "ERROR"), r.get("detail", ""))

    # one capability, 8 concurrent uses -> exactly one winner
    shared = mint()
    with ThreadPoolExecutor(max_workers=8) as pool:
        outs = list(pool.map(lambda _: _call(sock_a, shared), range(8)))
    winners = sum(1 for o in outs if o.get("outcome") == "ALLOWED")
    add("concurrent_single_winner",
        "ALLOWED" if winners == 1 else "BLOCKED",
        f"winners={winners}/8 (exactly 1 required)")

    # ---- findings from the ALGRP/AG#5 review, 31.10.2026 ----------------
    # (a) Atomicity. Injected failure AFTER the effect, BEFORE the commit.
    # Checked in-process because proving it through the socket would require
    # a failure-injection action in the broker, i.e. a backdoor.
    from lab.nonce_ledger import BoardLedger, nonce_spent
    db_a = layout["approved_db"]
    probe_task, probe_run = f"t_{boards.BOARD_A}_1", f"run_{boards.BOARD_A}_1"
    _set_task_state(db_a, probe_task, "claimed")
    atomic_tok = json.loads(mint(action="complete"))["payload"]
    atomic_claims = json.loads(atomic_tok)
    ledger = BoardLedger(db_a)
    broker_probe = BoardBroker(
        board=boards.BOARD_A, db_path=db_a, sock_path="/dev/null",
        bound_uid=WORKER_A_UID, verifier=Verifier(issuer.public_bytes()),
        ledger=ledger, worker_gid=WORKER_A_GID, manage_dir=False)
    try:
        ledger.consume_and_apply(
            atomic_claims,
            lambda txn: broker_probe._apply(txn, atomic_claims),
            after_effect_hook=lambda: (_ for _ in ()).throw(
                RuntimeError("injected crash after effect, before commit")),
        )
        add("atomic_rollback_on_effect_failure", "ALLOWED",
            "the injected failure did not propagate")
    except RuntimeError:
        state_after = _get_task_state(db_a, probe_task)
        spent = nonce_spent(db_a, atomic_claims["nonce"])
        if state_after == "claimed" and not spent:
            add("atomic_rollback_on_effect_failure", "BLOCKED",
                "rolled back together: task still 'claimed', nonce unspent "
                "(capability safely retryable)")
        else:
            add("atomic_rollback_on_effect_failure", "ALLOWED",
                f"partial commit: state={state_after!r} nonce_spent={spent}")

    # (b) A FRESH nonce must not be able to redo an already-completed task.
    _set_task_state(db_a, probe_task, "claimed")
    r = _call(sock_a, mint(action="complete"))          # legitimate -> done
    first_state = _get_task_state(db_a, probe_task)
    r2 = _call(sock_a, mint(action="complete"))          # new nonce, same task
    add("fresh_nonce_on_completed_task", *_oc(
        r2, prefix=f"first={r.get('outcome')}/state={first_state!r} "))

    # (c) Valid signature and correct peer/board, but a foreign tenant and
    # project. Signature verification passes; the scoped CAS must refuse.
    _set_task_state(db_a, probe_task, "claimed")
    add("cross_scope_tenant_project", *_oc(_call(sock_a, mint(
        action="complete", tenant="OTHER_TENANT", project="p_other"))))

    # availability: A floods while B must still be served 40/40
    b_tokens = [issuer.mint(sub_uid=WORKER_B_UID, board=boards.BOARD_B,
                            task=f"t_{boards.BOARD_B}_1",
                            run_id=f"run_{boards.BOARD_B}_1",
                            action="heartbeat") for _ in range(40)]
    with ThreadPoolExecutor(max_workers=12) as pool:
        flood = [pool.submit(_call, sock_a, mint()) for _ in range(60)]
        served = list(pool.map(
            lambda t: _call(sock_b, t, WORKER_B_UID, WORKER_B_GID), b_tokens))
        for f in flood:
            f.result()
    ok_b = sum(1 for o in served if o.get("outcome") == "ALLOWED")
    add("flood_isolation", "ALLOWED" if ok_b == 40 else "BLOCKED",
        f"board B served {ok_b}/40 under board A flood")


def _oc(r: dict, prefix: str = "") -> tuple[str, str]:
    return r.get("outcome", "ERROR"), prefix + r.get("detail", "")


def _set_task_state(db_path: str, task: str, state: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("UPDATE tasks SET state=? WHERE task_id=?",
                     (state, task))
        conn.commit()
    finally:
        conn.close()


def _get_task_state(db_path: str, task: str) -> str | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute("SELECT state FROM tasks WHERE task_id=?",
                           (task,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------- report ----
APPROACH_LABEL = {
    "A": "A  in-process stat guard (pinned SEL-324 shape)",
    "B": "B  fd-bound (O_NOFOLLOW + procfs reopen)",
    "D": "D  per-board UID, no broker",
    "C": "C  per-board instance + UID broker (SEL-433 target)",
}
ORDER = ["A", "B", "D", "C"]


def emit(results: list[Result], out_dir: str, meta: dict) -> None:
    os.makedirs(out_dir, exist_ok=True)
    payload = {"meta": meta,
               "results": [r.__dict__ for r in results]}
    with open(os.path.join(out_dir, "results.json"), "w") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)

    by: dict[str, dict[str, Result]] = {}
    for r in results:
        by.setdefault(r.control, {})[r.approach] = r

    lines = [
        "# SEL-324 comparative isolation battery — results",
        "",
        f"- Host: `{meta['uname']}`",
        f"- Python: `{meta['python']}`  SQLite: `{meta['sqlite']}`",
        f"- Run: `{meta['run_id']}`  ({meta['started_utc']} UTC)",
        f"- Real separate UIDs: broker {BROKER_UID}, worker-A {WORKER_A_UID}, "
        f"worker-B {WORKER_B_UID}, outsider {OUTSIDER_UID}",
        "",
        "`PASS` = the control behaved as a security control must. "
        "`FAIL` = the attack succeeded (negative control) or the legitimate "
        "path broke (positive control). `NA` = not applicable to that design.",
        "",
        "| # | Control | Expected | " + " | ".join(
            f"**{a}**" for a in ORDER) + " |",
        "|---|---------|----------|" + "|".join(["----"] * len(ORDER)) + "|",
    ]
    for i, control in enumerate(BATTERY, 1):
        exp, desc = BATTERY[control]
        row = [f"| {i} | {desc}<br>`{control}` | {exp} "]
        for a in ORDER:
            r = by.get(control, {}).get(a)
            row.append(f"| {r.verdict} " if r else "| — ")
        lines.append("".join(row) + "|")

    lines += ["", "## Verdict per approach", ""]
    for a in ORDER:
        rs = [r for r in results if r.approach == a]
        p = sum(1 for r in rs if r.verdict == "PASS")
        f = sum(1 for r in rs if r.verdict == "FAIL")
        na = sum(1 for r in rs if r.verdict == "NA")
        e = sum(1 for r in rs if r.verdict == "ERROR")
        lines.append(f"- **{APPROACH_LABEL[a]}** — PASS {p}, FAIL {f}, "
                     f"NA {na}, ERROR {e}")

    lines += ["", "## Failures in detail", ""]
    for a in ORDER:
        fails = [r for r in results if r.approach == a
                 and r.verdict in ("FAIL", "ERROR")]
        if not fails:
            lines.append(f"### {APPROACH_LABEL[a]}\n\nNone.\n")
            continue
        lines.append(f"### {APPROACH_LABEL[a]}\n")
        for r in fails:
            sent = f" — read sentinel `{r.sentinel}`" if r.sentinel else ""
            lines.append(f"- `{r.control}` → outcome **{r.outcome}** "
                         f"(expected {r.expected}){sent}  \n  {r.detail}")
        lines.append("")

    with open(os.path.join(out_dir, "RESULTS.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


# ------------------------------------------------------------------ main ----
def main() -> int:
    if os.geteuid() != 0:
        print("must run as root in a disposable container", file=sys.stderr)
        return 2
    import platform
    import sqlite3 as _s

    run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    meta = {"run_id": run_id, "started_utc": time.strftime(
                "%Y-%m-%d %H:%M:%S", time.gmtime()),
            "uname": " ".join(platform.uname()[:3]),
            "python": sys.version.split()[0], "sqlite": _s.sqlite_version,
            "scope": "LOCAL_ONLY synthetic boards; no installed Hermes, no "
                     "real board DB, no credentials, no network"}

    ensure_users()
    base = "/tmp/sel324_lab"
    shutil.rmtree(base, ignore_errors=True)
    os.makedirs(base, exist_ok=True)

    results: list[Result] = []

    print("[1/4] approach A — in-process stat guard")
    run_fs_battery(build_shared_uid_layout(os.path.join(base, "A"), "A"),
                   results)
    print("[2/4] approach B — fd-bound identity")
    run_fs_battery(build_shared_uid_layout(os.path.join(base, "B"), "B"),
                   results)
    print("[3/4] approach D — per-board UID, no broker")
    run_fs_battery(build_per_board_uid_layout(os.path.join(base, "D")),
                   results)

    print("[4/4] approach C — per-board instance + UID broker")
    layout_c = build_broker_layout(os.path.join(base, "C"))
    issuer = Issuer()
    broker = BrokerProcess(layout_c, issuer)
    broker.start()
    try:
        run_fs_battery(layout_c, results)
        run_broker_battery(layout_c, issuer, broker, results)
    finally:
        broker.shutdown()

    out_dir = os.path.join(LAB_DIR, "evidence", f"run_{run_id}")
    emit(results, out_dir, meta)
    print(f"\nevidence -> {out_dir}")
    fails = [r for r in results if r.verdict == "FAIL"]
    errs = [r for r in results if r.verdict == "ERROR"]
    for a in ORDER:
        rs = [r for r in results if r.approach == a]
        print(f"  {a}: PASS {sum(1 for r in rs if r.verdict=='PASS')} "
              f"FAIL {sum(1 for r in rs if r.verdict=='FAIL')} "
              f"NA {sum(1 for r in rs if r.verdict=='NA')} "
              f"ERROR {sum(1 for r in rs if r.verdict=='ERROR')}")
    if errs:
        print("\nERRORS:")
        for r in errs:
            print(f"  {r.approach}/{r.control}: {r.detail[:200]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
