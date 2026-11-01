"""SEL-433 S1 broker-service battery with REAL separate numeric UIDs.

Disposable only: everything lives under one fresh mkdtemp() tree that mirrors
the S1 target paths (var/lib/agos/kanban, run/agos-broker, etc/agos-broker).
No accounts are created (setpriv takes numeric IDs), no systemd unit is
installed, no installed Hermes / real board / customer data is touched.

  sudo python3 -B tests/run_s1_battery.py --output-dir DIR

UIDs: broker 450, worker A 511 (agos-continuous), worker B 512 (agos-control),
outsider 520. Exit 0 only if every control passes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PKG_SRC = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG_SRC))

from agos_broker import backup as bk                              # noqa: E402
from agos_broker.backends import create_native_fixture            # noqa: E402
from agos_broker.capability import Issuer, canonical_bytes        # noqa: E402
from agos_broker.keyring import Keyring                           # noqa: E402
from agos_broker.ledger import NonceStore                         # noqa: E402
from hermes_adapter import dispatch                               # noqa: E402

BROKER, A, B, OUT = 450, 511, 512, 520
BOARD_A, BOARD_B = "agos-continuous", "agos-control"
TEN_A, TEN_B = "AGOS_CONTINUOUS", "AGOS_CONTROL"
PROJ = "p_synthetic"
PY = sys.executable
ISS = "agos-dispatcher"

TASKS_A = ["a_hb", "a_complete", "a_replay", "a_conc_same", "a_conc_distinct",
           "a_restart", "a_crash", "a_adapter", "a_adapter_hb", "a_restore",
           "a_flood"]
TASKS_B = ["b_hb", "b_basic", "b_crash_reserve", "b_crash_effect", "b_flood"]

RESULTS: list[dict] = []


def check(cid: str, section: str, ok: bool, detail="") -> bool:
    RESULTS.append({"control": cid, "section": section,
                    "verdict": "PASS" if ok else "FAIL",
                    "detail": detail if isinstance(detail, str) else json.dumps(detail)[:1500]})
    print(f"[{'PASS' if ok else 'FAIL'}] {section}/{cid}: "
          f"{detail if isinstance(detail, str) else json.dumps(detail)[:300]}", flush=True)
    return ok


# ------------------------------------------------------------------ helpers --
def mk(path: Path, uid: int, gid: int, mode: int) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, uid, gid)
    os.chmod(path, mode)
    return path


class Lab:
    def __init__(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="sel433-s1-"))
        os.chmod(self.root, 0o755)
        r = self.root
        for d in ("var", "var/lib", "run", "etc", "opt", "var/backups"):
            mk(r / d, 0, 0, 0o755)
        self.pkg = r / "opt/agos-broker"
        shutil.copytree(PKG_SRC, self.pkg, ignore=shutil.ignore_patterns(
            "__pycache__", "*.pyc", "evidence"))
        for p in [self.pkg, *self.pkg.rglob("*")]:
            os.chmod(p, 0o755 if p.is_dir() else 0o644)
        self.kanban = mk(r / "var/lib/agos/kanban", BROKER, BROKER, 0o700)
        os.chmod(r / "var/lib/agos", 0o755)
        self.run = mk(r / "run/agos-broker", BROKER, BROKER, 0o711)
        self.state = mk(r / "var/lib/agos-broker", BROKER, BROKER, 0o700)
        self.backups = mk(r / "var/backups/agos", BROKER, BROKER, 0o700)
        self.etc = mk(r / "etc/agos-broker", 0, 0, 0o755)
        mk(r / "var/lib/agos-worker", 0, 0, 0o755)
        self.boards = {}
        for board, uid, tenant, tasks, backend in (
                (BOARD_A, A, TEN_A, TASKS_A, "lab_native"),
                (BOARD_B, B, TEN_B, TASKS_B, "lab_native_reserve")):
            d = mk(self.kanban / board, BROKER, BROKER, 0o700)
            db = d / "kanban.db"
            runs = create_native_fixture(str(db), [
                {"id": t, "tenant": tenant, "project": PROJ} for t in tasks])
            for s in ("", "-wal", "-shm"):
                if os.path.exists(str(db) + s):
                    os.chown(str(db) + s, BROKER, BROKER)
                    os.chmod(str(db) + s, 0o600)
            sockdir = mk(self.run / board, BROKER, uid, 0o750)
            caps = mk(r / "var/lib/agos-worker" / board, uid, uid, 0o700)
            self.boards[board] = {"db": str(db), "sock": str(sockdir / "broker.sock"),
                                  "uid": uid, "tenant": tenant, "runs": runs,
                                  "caps": str(caps), "backend": backend}
        self.cfg = self.etc / "broker.json"
        self.k1 = Issuer(iss=ISS, kid="k1")
        self.k2 = Issuer(iss=ISS, kid="k2")
        self.write_config({"k1": self.k1.public_bytes().hex()}, [])

    def write_config(self, keys: dict, revoked: list) -> None:
        cfg = {"issuer": {"iss": ISS, "keys": keys, "revoked_kids": revoked},
               "limits": {"max_inflight_per_board": 16, "read_timeout": 5},
               "boards": [{"board": b, "db_path": v["db"], "sock_path": v["sock"],
                           "bound_uid": v["uid"], "worker_gid": v["uid"],
                           "tenant": v["tenant"], "backend": v["backend"]}
                          for b, v in self.boards.items()]}
        self.cfg.write_text(json.dumps(cfg, indent=2))
        os.chown(self.cfg, 0, BROKER)
        os.chmod(self.cfg, 0o640)

    def tok(self, bname: str, task: str, action: str = "heartbeat", issuer=None,
            **kw) -> str:
        b = self.boards[bname]
        p = dict(sub_uid=b["uid"], board=bname, tenant=b["tenant"], project=PROJ,
                 task=task, run_id=str(b["runs"].get(task, 1)), action=action)
        p.update(kw)
        return (issuer or self.k1).mint(**p)

    def q(self, board: str, sql: str, *args):
        # Root connection: SQLite chowns any -wal/-shm it creates to the db
        # owner when euid==0, so this cannot leave root-owned side files.
        c = sqlite3.connect(self.boards[board]["db"])
        try:
            return c.execute(sql, args).fetchall()
        finally:
            c.close()

    def status(self, board: str, task: str) -> str:
        return self.q(board, "SELECT status FROM tasks WHERE id=?", task)[0][0]

    def nonces(self, board: str) -> int:
        return self.q(board, "SELECT count(*) FROM agos_broker_nonce")[0][0]

    def env(self) -> dict:
        return {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent",
                "PYTHONPATH": str(self.pkg), "PYTHONDONTWRITEBYTECODE": "1"}


PRELUDE = """
import sys, json, os, socket, struct
sys.path.insert(0, {pkg!r})
ARGS = json.loads(os.environ.get('PROBE_ARGS', '{{}}'))
def try_open(p, mode='rb'):
    try:
        open(p, mode).close(); return 'OPENED'
    except PermissionError: return 'EACCES'
    except FileNotFoundError: return 'ENOENT'
    except OSError as e: return 'ERR%d' % e.errno
def call(sock, req):
    from agos_broker import wire
    try: return wire.call(sock, req)
    except PermissionError: return {{'ok': False, 'reason': 'EACCES'}}
    except OSError as e: return {{'ok': False, 'reason': 'OSERR:%s' % type(e).__name__}}
    except ValueError as e: return {{'ok': False, 'reason': 'EOF:%s' % e}}
"""


def as_uid(lab: Lab, uid: int, code: str, *, groups=None, args=None, env=None,
           timeout=90, background=False):
    cmd = ["setpriv", "--reuid", str(uid), "--regid", str(uid)]
    cmd += ["--groups", ",".join(map(str, groups))] if groups else ["--clear-groups"]
    cmd += [PY, "-I", "-B", "-c", PRELUDE.format(pkg=str(lab.pkg)) + code]
    e = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent",
         "PROBE_ARGS": json.dumps(args or {})}
    e.update(env or {})
    if background:
        return subprocess.Popen(cmd, env=e, cwd="/", stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)
    p = subprocess.run(cmd, env=e, cwd="/", capture_output=True, text=True,
                       timeout=timeout)
    return parse(p.returncode, p.stdout, p.stderr)


def parse(rc, out, err):
    lines = (out or "").strip().splitlines()
    try:
        return json.loads(lines[-1])
    except Exception:
        return {"_rc": rc, "_stderr": (err or "")[-1500:], "_stdout": (out or "")[-300:]}


class Broker:
    def __init__(self, lab: Lab) -> None:
        self.lab = lab
        self.ready = lab.state / "ready"
        self.proc: subprocess.Popen | None = None

    def start(self, harness: list[str] | None = None, expect_ready=True):
        if self.ready.exists():
            self.ready.unlink()
        mod = ["-m", "tests.crash_harness", *harness, "--"] if harness else \
              ["-m", "agos_broker.daemon"]
        cmd = ["setpriv", "--reuid", str(BROKER), "--regid", str(BROKER),
               "--groups", f"{A},{B}", PY, "-B", *mod,
               "--config", str(self.lab.cfg), "--ready-file", str(self.ready)]
        self.proc = subprocess.Popen(cmd, cwd=str(self.lab.pkg), env=self.lab.env(),
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True)
        for _ in range(200):
            if self.ready.exists():
                return True
            if self.proc.poll() is not None:
                break
            time.sleep(0.05)
        if expect_ready:
            _, err = self.proc.communicate(timeout=5)
            raise SystemExit(f"broker failed to start:\n{err}")
        return False

    def stop(self) -> int:
        self.proc.send_signal(signal.SIGTERM)
        try:
            return self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            return -999

    def wait_dead(self, timeout=10) -> int:
        try:
            return self.proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            return -998


def as_broker_tool(lab: Lab, *argv) -> subprocess.CompletedProcess:
    return subprocess.run(["setpriv", "--reuid", str(BROKER), "--regid", str(BROKER),
                           "--clear-groups", PY, "-B", *argv], cwd=str(lab.pkg),
                          env=lab.env(), capture_output=True, text=True, timeout=60)


# ----------------------------------------------------------------- sections --
def sec_sqlite_and_isolation(lab: Lab, br: Broker) -> None:
    S = "sqlite_wal_shm"
    a, b = lab.boards[BOARD_A], lab.boards[BOARD_B]
    r = as_uid(lab, A, "print(json.dumps(call(ARGS['sock'], {'capability': ARGS['t']})))",
               args={"sock": a["sock"], "t": lab.tok(BOARD_A, "a_hb")})
    check("broker_write_path_works", S, r.get("ok") is True, r)
    modes = [lab.q(x, "PRAGMA journal_mode")[0][0] for x in (BOARD_A, BOARD_B)]
    check("journal_mode_wal", S, modes == ["wal", "wal"], modes)
    nodes = {}
    for bd in (a, b):
        for s in ("", "-wal", "-shm"):
            p = bd["db"] + s
            if os.path.exists(p):
                st = os.lstat(p)
                nodes[p.rsplit("/", 2)[-2] + "/" + os.path.basename(p)] = \
                    (st.st_uid, oct(st.st_mode & 0o777))
    wal_ok = all(v == (BROKER, "0o600") for v in nodes.values()) and \
        any(k.endswith("-wal") for k in nodes) and any(k.endswith("-shm") for k in nodes)
    check("wal_shm_created_broker_owned_0600", S, wal_ok, nodes)

    files = [bd["db"] + s for bd in (a, b) for s in ("", "-wal", "-shm")]
    code = ("print(json.dumps({p: [try_open(p), try_open(p, 'ab')] for p in ARGS['f']}"
            " | {'create': try_open(ARGS['plant'], 'wb')}))")
    for uid, name in ((A, "worker_a"), (B, "worker_b"), (OUT, "outsider")):
        r = as_uid(lab, uid, code, args={"f": files, "plant": a["db"] + "-journal"})
        vals = [v for k, v in r.items() if k != "create" for v in v] if "_rc" not in r else []
        ok = vals and all(v == "EACCES" for v in vals) and r.get("create") == "EACCES"
        check(f"{name}_cannot_read_write_or_plant_db_wal_shm", S, bool(ok),
              {k.split('/kanban/')[-1]: v for k, v in r.items()})

    code = ("import sqlite3\n"
            "try:\n"
            " c = sqlite3.connect('file:' + os.environ['HERMES_KANBAN_DB'] + '?mode=ro', uri=True)\n"
            " print(json.dumps({'r': str(c.execute('SELECT v FROM agos_broker_meta').fetchall())}))\n"
            "except Exception as e:\n"
            " print(json.dumps({'r': 'DENIED:' + type(e).__name__ + ':' + str(e)}))")
    res = {}
    for target in (a["db"], b["db"]):
        res[target.split("/kanban/")[-1]] = as_uid(
            lab, A, code, env={"HERMES_KANBAN_DB": target}).get("r")
    check("env_override_HERMES_KANBAN_DB_cannot_reach_any_db", S,
          all(str(v).startswith("DENIED:") for v in res.values()), res)

    S = "user_isolation"
    r = as_uid(lab, A, "print(json.dumps(call(ARGS['sock'], {'capability': 'x'})))",
               args={"sock": b["sock"]})
    check("worker_a_cannot_connect_board_b_socket", S, r.get("reason") == "EACCES", r)
    r = as_uid(lab, OUT, "print(json.dumps(call(ARGS['sock'], {'capability': 'x'})))",
               args={"sock": a["sock"]})
    check("outsider_cannot_connect_any_socket", S, r.get("reason") == "EACCES", r)
    r = as_uid(lab, OUT, "print(json.dumps(call(ARGS['sock'], {'capability': ARGS['t']})))",
               groups=[A], args={"sock": a["sock"], "t": lab.tok(BOARD_A, "a_hb")})
    check("wrong_uid_in_worker_group_rejected_by_peer_uid", S,
          r.get("reason") == "peer_uid_not_bound", r)
    r = as_uid(lab, A, "print(json.dumps({'cfg': try_open(ARGS['cfg']),"
               " 'state': try_open(ARGS['state'] + '/ready'),"
               " 'backups': try_open(ARGS['bk'] + '/x')}))",
               args={"cfg": str(lab.cfg), "state": str(lab.state), "bk": str(lab.backups)})
    check("worker_cannot_read_broker_config_state_backups", S,
          r == {"cfg": "EACCES", "state": "EACCES", "backups": "EACCES"}, r)
    sleeper = subprocess.Popen(["setpriv", "--reuid", str(B), "--regid", str(B),
                                "--clear-groups", "/bin/sleep", "30"],
                               env={"HERMES_KANBAN_DB": "/secret/b.db", "PATH": "/usr/bin:/bin"})
    try:
        time.sleep(0.2)
        r = as_uid(lab, A, "print(json.dumps({p: try_open(p) for p in ARGS['p']}))",
                   args={"p": [f"/proc/{br.proc.pid}/environ", f"/proc/{br.proc.pid}/mem",
                               f"/proc/{sleeper.pid}/environ", f"/proc/{sleeper.pid}/mem"]})
    finally:
        sleeper.kill()
        sleeper.wait()
    check("worker_cannot_read_broker_or_peer_environ_mem", S,
          bool(r) and "_rc" not in r and all(v == "EACCES" for v in r.values()), r)


def sec_authz_nonce(lab: Lab) -> None:
    S = "authorization"
    a = lab.boards[BOARD_A]
    code = ("print(json.dumps([call(ARGS['sock'], {'capability': t}).get('reason') or 'OK'"
            " for t in ARGS['toks']]))")

    def probe(toks, uid=A, sock=None):
        return as_uid(lab, uid, code, args={"sock": sock or a["sock"], "toks": toks})

    forged = Issuer(iss=ISS, kid="k1")
    claims = dict(sub_uid=A, board=BOARD_A, tenant=TEN_A, project=PROJ, task="a_hb",
                  run_id=str(a["runs"]["a_hb"]), action="heartbeat", iss=ISS, kid="k1",
                  nonce="d" * 32, iat=int(time.time()), exp=int(time.time()) + 60)
    dup = canonical_bytes(claims).decode().replace('{"action"', '{"board":"agos-control","action"', 1)
    cases = {
        "forged_signature_same_kid": forged.mint(sub_uid=A, board=BOARD_A, tenant=TEN_A,
                                                 project=PROJ, task="a_hb", action="heartbeat",
                                                 run_id=str(a["runs"]["a_hb"])),
        "leaked_board_b_capability": lab.tok(BOARD_B, "b_hb"),
        "own_uid_but_board_b_claim": lab.tok(BOARD_A, "a_hb", board=BOARD_B),
        "cross_tenant": lab.tok(BOARD_A, "a_hb", tenant=TEN_B),
        "cross_project": lab.tok(BOARD_A, "a_hb", project="p_other"),
        "stale_run_id": lab.tok(BOARD_A, "a_hb", run_id=str(a["runs"]["a_complete"])),
        "foreign_task": lab.tok(BOARD_A, "missing_task", run_id="1"),
        "expired": lab.tok(BOARD_A, "a_hb", iat=int(time.time()) - 700, ttl=60),
        "duplicate_json_member": lab.k1.mint_raw(dup),
        "action_not_allowed": lab.tok(BOARD_A, "a_hb", action="read_sentinel"),
    }
    before = lab.nonces(BOARD_A)
    r = probe(list(cases.values()))
    got = dict(zip(cases, r if isinstance(r, list) else [r] * len(cases)))
    want_other = {"action_not_allowed": "action_not_allowed"}
    ok = all(v == want_other.get(k, "capability_rejected") for k, v in got.items())
    check("negative_capabilities_rejected", S, ok, got)
    check("rejections_consume_no_nonce_and_change_no_task", S,
          lab.nonces(BOARD_A) == before and lab.status(BOARD_A, "a_hb") == "running",
          {"nonces_before": before, "after": lab.nonces(BOARD_A)})
    r = as_uid(lab, A, "s = socket.socket(socket.AF_UNIX); s.connect(ARGS['sock'])\n"
               "s.sendall(struct.pack('>I', 1 << 20) + b'x' * 64)\n"
               "from agos_broker import wire\n"
               "print(json.dumps(wire.recv_frame(s)))", args={"sock": a["sock"]})
    check("oversized_frame_rejected", S, r.get("reason") == "framing_rejected", r)
    r = probe([lab.tok(BOARD_A, "a_complete", action="complete")])
    check("valid_complete_accepted", S, r == ["OK"] and
          lab.status(BOARD_A, "a_complete") == "done", r)
    run = lab.q(BOARD_A, "SELECT outcome, ended_at IS NOT NULL FROM task_runs WHERE id=?",
                a["runs"]["a_complete"])
    check("complete_closes_run_row", S, run == [("completed", 1)], run)

    S = "nonce"
    t = lab.tok(BOARD_A, "a_replay")
    r = probe([t, t])
    check("replay_same_capability_rejected", S, r == ["OK", "replay_rejected"], r)
    row = lab.q(BOARD_A, "SELECT state, exp - iat, kid FROM agos_broker_nonce "
                "WHERE task='a_replay'")
    check("nonce_history_row_persisted", S, row == [("applied", 60, "k1")], row)
    conc = ("from concurrent.futures import ThreadPoolExecutor\n"
            "import threading\nb = threading.Barrier(8)\n"
            "def go(t):\n b.wait(10); return call(ARGS['sock'], {'capability': t}).get('ok') is True\n"
            "with ThreadPoolExecutor(8) as ex: print(json.dumps(sum(ex.map(go, ARGS['toks']))))")
    same = lab.tok(BOARD_A, "a_conc_same")
    r = as_uid(lab, A, conc, args={"sock": a["sock"], "toks": [same] * 8})
    check("same_capability_8_concurrent_one_winner", S, r == 1, r)
    toks = [lab.tok(BOARD_A, "a_conc_distinct", action="complete") for _ in range(8)]
    r = as_uid(lab, A, conc, args={"sock": a["sock"], "toks": toks})
    check("distinct_capabilities_8_concurrent_one_task_winner", S,
          r == 1 and lab.status(BOARD_A, "a_conc_distinct") == "done", r)
    b = lab.boards[BOARD_B]
    tb = lab.tok(BOARD_B, "b_basic", action="complete")
    r = as_uid(lab, B, code, args={"sock": b["sock"], "toks": [tb, tb]})
    st = lab.q(BOARD_B, "SELECT state FROM agos_broker_nonce WHERE task='b_basic'")
    check("reserve_mode_complete_then_replay", S,
          r == ["OK", "replay_rejected"] and st == [("applied",)] and
          lab.status(BOARD_B, "b_basic") == "done", {"r": r, "rows": st})


def sec_restart(lab: Lab, br: Broker) -> None:
    S = "restart"
    a, b = lab.boards[BOARD_A], lab.boards[BOARD_B]
    code = ("print(json.dumps([call(ARGS['sock'], {'capability': t}).get('reason') or 'OK'"
            " for t in ARGS['toks']]))")
    t = lab.tok(BOARD_A, "a_restart")
    r1 = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t]})
    rc = br.stop()
    socks_gone = not os.path.exists(a["sock"]) and not os.path.exists(b["sock"])
    check("sigterm_graceful_exit_and_socket_cleanup", S, r1 == ["OK"] and rc == 0 and
          socks_gone, {"first": r1, "rc": rc, "sockets_removed": socks_gone})
    br.start()
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t]})
    check("replay_after_restart_rejected", S, r == ["replay_rejected"], r)
    br.stop()

    # -- SIGKILL inside the atomic transaction, after effect, before COMMIT --
    t = lab.tok(BOARD_A, "a_crash", action="complete")
    br.start(["--crash-task", "a_crash", "--crash-point", "atomic_after_effect"])
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t]})
    rc = br.wait_dead()
    stale = os.path.exists(a["sock"])
    state = (lab.status(BOARD_A, "a_crash"),
             lab.q(BOARD_A, "SELECT count(*) FROM agos_broker_nonce WHERE task='a_crash'")[0][0],
             lab.q(BOARD_A, "PRAGMA integrity_check")[0][0])
    check("sigkill_mid_atomic_txn_rolls_back_effect_and_nonce", S,
          rc == -9 and state == ("running", 0, "ok"),
          {"reply": r, "rc": rc, "status/nonce/integrity": state})
    br.start()
    check("restart_replaces_stale_socket_after_sigkill", S, stale and os.path.exists(a["sock"]),
          {"stale_socket_left_by_kill": stale})
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t, t]})
    check("same_capability_retry_after_atomic_crash_then_single_use", S,
          r == ["OK", "replay_rejected"] and lab.status(BOARD_A, "a_crash") == "done", r)
    br.stop()

    # -- reserve mode: crash after durable reserve, before the effect --------
    t = lab.tok(BOARD_B, "b_crash_reserve", action="complete")
    br.start(["--crash-task", "b_crash_reserve", "--crash-point", "reserve_after_reserve"])
    as_uid(lab, B, code, args={"sock": b["sock"], "toks": [t]})
    rc = br.wait_dead()
    st = (lab.status(BOARD_B, "b_crash_reserve"),
          lab.q(BOARD_B, "SELECT state FROM agos_broker_nonce WHERE task='b_crash_reserve'"))
    br.start()
    r = as_uid(lab, B, code, args={"sock": b["sock"],
                                    "toks": [t, lab.tok(BOARD_B, "b_crash_reserve", action="complete")]})
    check("reserve_crash_before_effect_fails_closed_then_fresh_cap_works", S,
          rc == -9 and st == ("running", [("reserved",)]) and r == ["replay_rejected", "OK"],
          {"rc": rc, "after_crash": st, "retry_same_then_fresh": r})
    br.stop()

    # -- reserve mode: crash after effect committed, before nonce marked -----
    t = lab.tok(BOARD_B, "b_crash_effect", action="complete")
    br.start(["--crash-task", "b_crash_effect", "--crash-point", "reserve_after_effect"])
    as_uid(lab, B, code, args={"sock": b["sock"], "toks": [t]})
    rc = br.wait_dead()
    st = (lab.status(BOARD_B, "b_crash_effect"),
          lab.q(BOARD_B, "SELECT state FROM agos_broker_nonce WHERE task='b_crash_effect'"))
    br.start()
    r = as_uid(lab, B, code, args={"sock": b["sock"],
                                    "toks": [t, lab.tok(BOARD_B, "b_crash_effect", action="complete")]})
    ended = lab.q(BOARD_B, "SELECT count(*) FROM task_runs WHERE task_id='b_crash_effect' "
                  "AND ended_at IS NOT NULL")[0][0]
    check("reserve_crash_after_effect_no_replay_no_double_effect", S,
          rc == -9 and st == ("done", [("reserved",)]) and
          r == ["replay_rejected", "capability_rejected"] and ended == 1,
          {"rc": rc, "after_crash": st, "retry_same_then_fresh": r, "ended_runs": ended})
    br.stop()

    # -- key rotation with revocation across restart -------------------------
    lab.write_config({"k1": lab.k1.public_bytes().hex(),
                      "k2": lab.k2.public_bytes().hex()}, ["k1"])
    br.start()
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [
        lab.tok(BOARD_A, "a_hb"), lab.tok(BOARD_A, "a_hb", issuer=lab.k2)]})
    check("key_rotation_revoked_k1_rejected_k2_accepted", S,
          r == ["capability_rejected", "OK"], r)
    br.stop()
    lab.write_config({"k1": lab.k1.public_bytes().hex()}, [])

    # -- preflight refuses unsafe layouts ------------------------------------
    S = "preflight"
    base = as_broker_tool(lab, "-m", "agos_broker.daemon", "--config", str(lab.cfg), "--check")
    check("preflight_ok_on_correct_layout", S, base.returncode == 0,
          base.stdout.strip() or base.stderr[-500:])
    db, sockdir = a["db"], os.path.dirname(a["sock"])

    def mutate(name, do, undo, needle):
        do()
        try:
            p = as_broker_tool(lab, "-m", "agos_broker.daemon", "--config", str(lab.cfg), "--check")
        finally:
            undo()
        check(f"preflight_refuses_{name}", S, p.returncode == 3 and needle in p.stderr,
              {"rc": p.returncode, "stderr": p.stderr[-400:]})

    mutate("db_mode_0644", lambda: os.chmod(db, 0o644), lambda: os.chmod(db, 0o600), "grants group/other")
    mutate("db_owned_by_worker", lambda: os.chown(db, A, A), lambda: os.chown(db, BROKER, BROKER), "owner 511")
    mutate("db_dir_0755", lambda: os.chmod(os.path.dirname(db), 0o755),
           lambda: os.chmod(os.path.dirname(db), 0o700), "db dir mode")
    mutate("socket_dir_0755", lambda: os.chmod(sockdir, 0o755), lambda: os.chmod(sockdir, 0o750), "socket dir mode")
    mutate("socket_dir_wrong_group", lambda: os.chown(sockdir, BROKER, B),
           lambda: os.chown(sockdir, BROKER, A), "socket dir group")
    mutate("config_group_writable", lambda: os.chmod(lab.cfg, 0o660), lambda: os.chmod(lab.cfg, 0o640),
           "config writable")
    marker = db + ".restore-intent.json"
    mutate("interrupted_restore_marker", lambda: Path(marker).write_text("{}"),
           lambda: os.unlink(marker), "interrupted restore")
    p = subprocess.run([PY, "-B", "-m", "agos_broker.daemon", "--config", str(lab.cfg), "--check"],
                       cwd=str(lab.pkg), env=lab.env(), capture_output=True, text=True)
    check("preflight_refuses_running_as_root", S, p.returncode == 3 and "root" in p.stderr,
          {"rc": p.returncode})


def sec_backup_restore(lab: Lab, br: Broker) -> None:
    S = "backup_restore_rollback"
    a = lab.boards[BOARD_A]
    code = ("print(json.dumps([call(ARGS['sock'], {'capability': t}).get('reason') or 'OK'"
            " for t in ARGS['toks']]))")

    # Negative control: why a plain file copy is not a backup under WAL.
    scratch = Path(tempfile.mkdtemp(prefix="sel433-walcopy-"))
    src = scratch / "w.db"
    c = sqlite3.connect(src)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("CREATE TABLE t(x)")
    c.executemany("INSERT INTO t VALUES (?)", [(i,) for i in range(100)])
    c.commit()
    shutil.copy(src, scratch / "naive.db")
    d = sqlite3.connect(scratch / "api.db")
    c.backup(d)
    naive = sqlite3.connect(scratch / "naive.db")
    try:
        n_naive = naive.execute("SELECT count(*) FROM t").fetchone()[0]
    except sqlite3.Error as e:
        n_naive = f"ERR:{e}"
    n_api = d.execute("SELECT count(*) FROM t").fetchone()[0]
    for x in (naive, d, c):
        x.close()
    shutil.rmtree(scratch)
    check("negative_control_naive_copy_loses_wal_commits", S,
          n_api == 100 and n_naive != 100, {"naive_copy": n_naive, "backup_api": n_api})

    br.start()
    p = as_broker_tool(lab, "-m", "agos_broker.backup", "backup", "--db", a["db"],
                       "--sock", a["sock"], "--out", str(lab.backups))
    check("backup_refused_while_broker_serving", S, p.returncode != 0 and
          "stop it before backup" in p.stderr, {"rc": p.returncode})
    t_pre = lab.tok(BOARD_A, "a_restore")       # minted BEFORE the backup
    br.stop()
    p = as_broker_tool(lab, "-m", "agos_broker.backup", "backup", "--db", a["db"],
                       "--sock", a["sock"], "--out", str(lab.backups))
    mans = sorted(Path(lab.backups).glob("*.backup.manifest.json"))
    man = json.loads(mans[-1].read_text()) if p.returncode == 0 and mans else {}
    bfile = man.get("backup", "")
    bst = os.lstat(bfile) if bfile else None
    check("backup_consistent_private_with_manifest", S,
          p.returncode == 0 and man.get("integrity_check") == "ok" and
          bst is not None and bst.st_uid == BROKER and (bst.st_mode & 0o777) == 0o600 and
          bk.sha256_file(bfile) == man.get("sha256"),
          {"rc": p.returncode, "nonce_rows": man.get("nonce_rows"),
           "stderr": p.stderr[-300:]})

    br.start()
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t_pre]})
    br.stop()

    # Demonstrate the restore-replay hazard on a COPY of the backup.
    hz = Path(tempfile.mkdtemp(prefix="sel433-hazard-")) / "copy.db"
    shutil.copy(bfile, hz)
    ring = Keyring(ISS, {"k1": lab.k1.public_bytes().hex()})
    claims = ring.verify(t_pre, peer_uid=A, board=BOARD_A)
    replayed = True
    try:
        NonceStore(str(hz)).consume_atomic(claims, lambda txn: None)
    except Exception:
        replayed = False
    shutil.rmtree(hz.parent)
    check("negative_control_restore_without_watermark_reopens_spent_nonce", S,
          r == ["OK"] and replayed, {"spent_after_backup": r, "replay_on_unwatermarked_copy": replayed})

    tampered = Path(lab.backups) / "tampered.backup"
    shutil.copy(bfile, tampered)
    shutil.copy(bfile + ".manifest.json", str(tampered) + ".manifest.json")
    with open(tampered, "ab") as fh:
        fh.write(b"\0")
    os.chown(tampered, BROKER, BROKER)
    p = as_broker_tool(lab, "-m", "agos_broker.backup", "restore", "--db", a["db"],
                       "--sock", a["sock"], "--backup", str(tampered))
    check("restore_refuses_tampered_backup", S, p.returncode != 0 and "sha256" in p.stderr,
          {"rc": p.returncode})

    # Leave a live WAL with a committed probe row (as after a crash), then
    # interrupt the restore at every step and resume.
    points = ["after_intent", "mid_stage", "after_stage", "after_wal_aside",
              "after_aside", "after_swap"]
    outcome = {}
    for pt in points:
        w = as_broker_tool(lab, "-c", (
            "import sqlite3, os\n"
            f"c = sqlite3.connect({a['db']!r}); c.execute('PRAGMA journal_mode=WAL')\n"
            "c.execute('CREATE TABLE IF NOT EXISTS lab_wal_probe(x)')\n"
            "c.execute('INSERT INTO lab_wal_probe VALUES (1)'); c.commit()\n"
            "os._exit(0)"))
        had_wal = os.path.exists(a["db"] + "-wal") and os.path.getsize(a["db"] + "-wal") > 0
        time.sleep(1.1)
        inj = as_broker_tool(lab, "-c", (
            "from agos_broker import backup\n"
            "try:\n"
            f" backup.restore({a['db']!r}, {a['sock']!r}, {bfile!r}, fail_at={pt!r})\n"
            " print('NO_INTERRUPT')\n"
            "except backup.RestoreError as e: print('INTERRUPTED', e)"))
        chk = as_broker_tool(lab, "-m", "agos_broker.daemon", "--config", str(lab.cfg), "--check")
        res = as_broker_tool(lab, "-m", "agos_broker.backup", "restore", "--db", a["db"],
                             "--sock", a["sock"], "--backup", bfile)
        probe = lab.q(BOARD_A, "SELECT count(*) FROM sqlite_master WHERE name='lab_wal_probe'")[0][0]
        integ = lab.q(BOARD_A, "PRAGMA integrity_check")[0][0]
        leftovers = sorted(x for x in os.listdir(os.path.dirname(a["db"]))
                           if "restore-" in x and "pre-restore" not in x)
        outcome[pt] = {"wal_before": had_wal, "interrupted": "INTERRUPTED" in inj.stdout,
                       "daemon_refused": chk.returncode == 3, "resume_rc": res.returncode,
                       "foreign_wal_applied": probe, "integrity": integ,
                       "leftovers": leftovers}
    ok = all(v["wal_before"] and v["interrupted"] and v["daemon_refused"] and
             v["resume_rc"] == 0 and v["foreign_wal_applied"] == 0 and
             v["integrity"] == "ok" and not v["leftovers"] for v in outcome.values())
    check("interrupted_restore_every_step_blocks_start_then_resumes_clean", S, ok, outcome)
    nodes = {s: (os.lstat(a["db"] + s).st_uid, oct(os.lstat(a["db"] + s).st_mode & 0o777))
             for s in ("", "-wal", "-shm") if os.path.exists(a["db"] + s)}
    check("restored_db_broker_owned_0600", S,
          all(v == (BROKER, "0o600") for v in nodes.values()), nodes)

    br.start()
    time.sleep(1.1)                         # iat has 1 s resolution
    t_post = lab.tok(BOARD_A, "a_restore")
    r = as_uid(lab, A, code, args={"sock": a["sock"], "toks": [t_pre, t_post]})
    check("restore_watermark_blocks_pre_restore_capability_fresh_one_works", S,
          r == ["freshness_rejected", "OK"], r)
    br.stop()

    # S-step rollback: hand a board back to its pre-migration owner.
    legacy = mk(lab.root / "legacy/board", OUT, OUT, 0o750)
    ldb = legacy / "kanban.db"
    c = sqlite3.connect(ldb)
    c.execute("PRAGMA journal_mode=WAL"); c.execute("CREATE TABLE t(x)"); c.commit()
    keep = sqlite3.connect(ldb); keep.execute("SELECT 1").fetchall()
    for s in ("", "-wal", "-shm"):
        if os.path.exists(str(ldb) + s):
            os.chown(str(ldb) + s, OUT, OUT); os.chmod(str(ldb) + s, 0o640)
    snap = bk.snapshot_owner(str(ldb))
    for p_ in snap["nodes"]:
        os.chown(p_, BROKER, BROKER); os.chmod(p_, 0o700 if os.path.isdir(p_) else 0o600)
    migrated = bk.snapshot_owner(str(ldb))
    bk.rollback_owner(snap)
    after = bk.snapshot_owner(str(ldb))
    keep.close(); c.close()
    check("ownership_rollback_restores_legacy_owner_and_modes", S,
          after == snap and migrated != snap and len(snap["nodes"]) == 4,
          {"nodes": len(snap["nodes"]), "restored_equal": after == snap})


def sec_adapter(lab: Lab, br: Broker) -> None:
    S = "hermes_adapter"
    a, b = lab.boards[BOARD_A], lab.boards[BOARD_B]
    br.start()
    bundle = dispatch.mint_bundle(lab.k1, worker_uid=A, board=BOARD_A, task="a_adapter",
                                  run_id=a["runs"]["a_adapter"], tenant=TEN_A,
                                  project=PROJ, heartbeats=2)
    cap = dispatch.write_bundle(bundle, a["caps"], A, A)
    st = os.lstat(cap)
    base = {"PATH": "/usr/bin:/bin", "HERMES_KANBAN_DB": b["db"], "OTHER": "kept"}
    env = dispatch.worker_env(base, sock_path=a["sock"], cap_file=cap, task="a_adapter",
                              run_id=a["runs"]["a_adapter"], board=BOARD_A)
    check("dispatcher_env_has_no_db_path_and_cap_file_private", S,
          "HERMES_KANBAN_DB" not in env and env["OTHER"] == "kept" and
          st.st_uid == A and (st.st_mode & 0o777) == 0o600,
          {"env_keys": sorted(env), "cap_owner": st.st_uid, "cap_mode": oct(st.st_mode & 0o777)})
    hostile = dict(env, HERMES_KANBAN_DB=b["db"])     # prompt-injected shell re-adds it
    before_b = lab.q(BOARD_B, "SELECT count(*), group_concat(status) FROM tasks")
    code = ("from hermes_adapter import client as c\n"
            "cl = c.BrokerKanbanClient.from_env()\n"
            "out = {'ignored_db_env': cl.ignored_db_env,\n"
            " 'hb1': json.loads(c.handle_kanban_heartbeat({}, cl)),\n"
            " 'hb2': json.loads(c.handle_kanban_heartbeat({'task_id': 'a_adapter'}, cl)),\n"
            " 'hb3': json.loads(c.handle_kanban_heartbeat({}, cl)),\n"
            " 'other_task': json.loads(c.handle_kanban_complete({'task_id': 'a_hb', 'summary': 's'}, cl)),\n"
            " 'complete': json.loads(c.handle_kanban_complete({'summary': 'synthetic done'}, cl)),\n"
            " 'complete_again': json.loads(c.handle_kanban_complete({'summary': 'again'}, cl))}\n"
            "print(json.dumps(out))")
    r = as_uid(lab, A, code, env=hostile)
    check("adapter_lifecycle_via_broker_with_hostile_db_env", S,
          r.get("ignored_db_env") is True and r.get("hb1", {}).get("ok") and
          r.get("hb2", {}).get("ok") and "exhausted" in r.get("hb3", {}).get("error", "") and
          "refusing to mutate a_hb" in r.get("other_task", {}).get("error", "") and
          r.get("complete", {}).get("ok") and
          "replay_rejected" in r.get("complete_again", {}).get("error", "") and
          lab.status(BOARD_A, "a_adapter") == "done" and
          lab.status(BOARD_A, "a_hb") == "running" and
          lab.q(BOARD_B, "SELECT count(*), group_concat(status) FROM tasks") == before_b, r)
    r = as_uid(lab, B, "print(json.dumps({'a_cap': try_open(ARGS['cap'])}))", args={"cap": cap})
    check("other_worker_cannot_read_capability_bundle", S, r == {"a_cap": "EACCES"}, r)
    r = as_uid(lab, A, "from hermes_adapter import client as c\n"
               "try:\n c.BrokerKanbanClient.from_env(); print(json.dumps('NO_ERROR'))\n"
               "except c.AdapterError as e: print(json.dumps(str(e)))",
               env={"HERMES_KANBAN_DB": a["db"]})
    check("adapter_has_no_direct_db_fallback", S, "refusing direct DB access" in str(r), r)
    try:
        dispatch.write_bundle(bundle, str(lab.backups), A, A)
        bad_dir = "WROTE"
    except PermissionError:
        bad_dir = "REFUSED"
    check("dispatcher_refuses_non_worker_private_cap_dir", S, bad_dir == "REFUSED", bad_dir)

    S = "availability"
    bb = dispatch.mint_bundle(lab.k1, worker_uid=B, board=BOARD_B, task="b_flood",
                              run_id=b["runs"]["b_flood"], tenant=TEN_B, project=PROJ,
                              heartbeats=40)
    flood = as_uid(lab, A, (
        "import time\nheld = []\n"
        "for _ in range(200):\n"
        " s = socket.socket(socket.AF_UNIX); s.connect(ARGS['sock']); held.append(s)\n"
        "time.sleep(1.0)\n"
        "r = call(ARGS['sock'], {'capability': ARGS['t']})\n"
        "time.sleep(4)\nprint(json.dumps({'held': len(held), 'own_extra': r.get('reason')}))"),
        args={"sock": a["sock"], "t": lab.tok(BOARD_A, "a_flood")}, background=True)
    time.sleep(1.5)
    r = as_uid(lab, B, "import time\nt0 = time.time()\n"
               "ok = sum(call(ARGS['sock'], {'capability': t}).get('ok') is True for t in ARGS['toks'])\n"
               "print(json.dumps({'ok': ok, 'secs': round(time.time() - t0, 2)}))",
               args={"sock": b["sock"], "toks": bb["heartbeat"]})
    fo, fe = flood.communicate(timeout=60)
    fr = parse(flood.returncode, fo, fe)
    check("board_b_40_of_40_under_board_a_flood", S, r.get("ok") == 40, {"b": r, "a": fr})
    check("flooding_worker_gets_busy_not_hang", S, fr.get("own_extra") == "busy", fr)
    br.stop()


def sec_final(lab: Lab) -> None:
    S = "sqlite_wal_shm"
    integ = {bd: lab.q(bd, "PRAGMA integrity_check")[0][0] for bd in lab.boards}
    check("integrity_check_both_boards_after_battery", S,
          all(v == "ok" for v in integ.values()), integ)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--keep", action="store_true", help="keep the temp tree")
    a = ap.parse_args()
    if os.geteuid() != 0 or sys.platform != "linux" or not shutil.which("setpriv"):
        ap.error("requires a disposable Linux lab as root with setpriv")
    uid_map = Path("/proc/self/uid_map").read_text().split()
    if not (int(uid_map[0]) == 0 and int(uid_map[2]) > 1000):
        a.output_dir.mkdir(parents=True, exist_ok=True)
        blocked = {"status": "BLOCKED_UID_MAP", "uid_map": " ".join(uid_map), "run": 0}
        (a.output_dir / "s1_battery_results.json").write_text(json.dumps(blocked) + "\n")
        print(json.dumps(blocked))
        return 2
    lab = Lab()
    br = Broker(lab)
    try:
        br.start()
        sec_sqlite_and_isolation(lab, br)
        sec_authz_nonce(lab)
        sec_restart(lab, br)
        sec_backup_restore(lab, br)
        sec_adapter(lab, br)
        sec_final(lab)
    finally:
        if br.proc and br.proc.poll() is None:
            br.stop()
        if not a.keep:
            shutil.rmtree(lab.root, ignore_errors=True)
    hashes = {str(p.relative_to(PKG_SRC)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(PKG_SRC.rglob("*.py")) if "__pycache__" not in p.parts}
    passed = sum(r["verdict"] == "PASS" for r in RESULTS)
    report = {
        "scope": "disposable Linux tree, numeric UIDs via setpriv, synthetic Hermes-shaped "
                 "boards; no accounts, no systemd, no installed Hermes",
        "uids": {"broker": BROKER, "worker_a": A, "worker_b": B, "outsider": OUT},
        "python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
        "kernel": platform.release(), "uid_map": " ".join(uid_map),
        "source_sha256": hashes, "run": len(RESULTS), "passed": passed,
        "failed": len(RESULTS) - passed, "results": RESULTS,
        "S1_ACCEPTED": False, "INDEPENDENT_ACCEPTED": False, "LIVE_CHANGED": False,
    }
    a.output_dir.mkdir(parents=True, exist_ok=True)
    out = a.output_dir / "s1_battery_results.json"
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({k: report[k] for k in ("run", "passed", "failed", "S1_ACCEPTED",
                                              "INDEPENDENT_ACCEPTED", "LIVE_CHANGED")}))
    return 0 if passed == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
