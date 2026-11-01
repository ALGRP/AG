"""Fast unit tests: real SQLite (WAL), real Ed25519, TEST-INJECTED peer UID.

These prove request-path, nonce-history and freshness logic. They do NOT
prove OS isolation; run_s1_battery.py does that with real separate UIDs.
"""
from __future__ import annotations

import hashlib
import json
import os
import socket
import sqlite3
import struct
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

PKG = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG))

from agos_broker import wire                                   # noqa: E402
from agos_broker.backends import LabNativeBackend, create_native_fixture  # noqa: E402
from agos_broker.capability import CapabilityError, Issuer      # noqa: E402
from agos_broker.config import BoardConfig, Config, preflight   # noqa: E402
from agos_broker.keyring import Keyring                         # noqa: E402
from agos_broker.ledger import (FreshnessError, NonceStore, ReplayError,  # noqa: E402
                                RETENTION, connect, set_meta)
from agos_broker.service import BoardService                    # noqa: E402

LAB_CAPABILITY = PKG.parent / "sel324-isolation-lab" / "lab" / "capability.py"
UID = 511


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sel433-s1-unit-")
        self.addCleanup(self.tmp.cleanup)
        self.db = os.path.join(self.tmp.name, "kanban.db")
        self.runs = create_native_fixture(self.db, [
            {"id": "t1", "tenant": "AGOS", "project": "p1"},
            {"id": "t2", "tenant": "AGOS", "project": "p1"}])
        self.issuer = Issuer(iss="agos-dispatcher", kid="k1")
        self.keyring = Keyring("agos-dispatcher", {"k1": self.issuer.public_bytes().hex()})
        self.board = BoardConfig(board="agos-control", db_path=self.db,
                                 sock_path=os.path.join(self.tmp.name, "x.sock"),
                                 bound_uid=UID, worker_gid=UID, tenant="AGOS")
        self.svc = BoardService(self.board, self.keyring)

    def tok(self, issuer=None, **kw):
        p = dict(sub_uid=UID, board="agos-control", tenant="AGOS", project="p1",
                 task="t1", run_id=str(self.runs["t1"]), action="complete")
        p.update(kw)
        return (issuer or self.issuer).mint(**p)

    def call(self, request, raw: bytes | None = None, peer=(1, UID, UID)):
        a, b = socket.socketpair()
        a.settimeout(3)
        with patch("agos_broker.wire.peer_cred", return_value=peer):
            t = threading.Thread(target=self.svc.handle, args=(b,), daemon=True)
            t.start()
            try:
                if raw is not None:
                    a.sendall(raw)
                else:
                    wire.send_frame(a, request)
            except BrokenPipeError:
                pass    # early peer rejection may close before we finish sending
            try:
                reply = wire.recv_frame(a)
            finally:
                a.close()
                t.join(3)
        return reply

    def q(self, sql, *args):
        c = sqlite3.connect(self.db)
        try:
            return c.execute(sql, args).fetchone()
        finally:
            c.close()

    def nonces(self):
        return self.q("SELECT count(*) FROM agos_broker_nonce")[0]

    def status(self, tid="t1"):
        return self.q("SELECT status FROM tasks WHERE id=?", tid)[0]


class Capability(Base):
    def test_vendored_capability_is_byte_identical_to_s1_verified_lab_file(self):
        mine = hashlib.sha256((PKG / "agos_broker" / "capability.py").read_bytes()).hexdigest()
        self.assertEqual(mine, "67f116461eb28dbc10d1e8c0ec4593fc23b7e712614a6eae81b7a7f055ce2062")
        if LAB_CAPABILITY.exists():
            self.assertEqual(mine, hashlib.sha256(LAB_CAPABILITY.read_bytes()).hexdigest())

    def test_unknown_kid_rejected(self):
        other = Issuer(iss="agos-dispatcher", kid="k9")
        r = self.call({"capability": self.tok(other)})
        self.assertEqual((r["reason"], self.nonces()), ("capability_rejected", 0))
        self.assertIn("unknown key id", r["detail"])

    def test_revoked_kid_rejected(self):
        self.svc.keyring = Keyring("agos-dispatcher",
                                   {"k1": self.issuer.public_bytes().hex()}, ["k1"])
        r = self.call({"capability": self.tok()})
        self.assertIn("revoked", r["detail"])
        self.assertEqual(self.status(), "running")

    def test_rotated_key_accepted_alongside_old(self):
        k2 = Issuer(iss="agos-dispatcher", kid="k2")
        self.svc.keyring = Keyring("agos-dispatcher", {
            "k1": self.issuer.public_bytes().hex(), "k2": k2.public_bytes().hex()})
        self.assertTrue(self.call({"capability": self.tok(k2)})["ok"])

    def test_kid_swap_to_other_key_fails_signature(self):
        # Token signed by k1's key but claiming kid=k2 must not verify under k2.
        k2 = Issuer(iss="agos-dispatcher", kid="k2")
        self.svc.keyring = Keyring("agos-dispatcher", {
            "k1": self.issuer.public_bytes().hex(), "k2": k2.public_bytes().hex()})
        forged = Issuer(iss="agos-dispatcher", kid="k2")
        forged._sk = self.issuer._sk
        r = self.call({"capability": self.tok(forged)})
        self.assertEqual(r["reason"], "capability_rejected")

    def test_noncanonical_run_id_rejected(self):
        for bad in ("0" + str(self.runs["t1"]), "abc", "-1", "0"):
            with self.subTest(run_id=bad):
                r = self.call({"capability": self.tok(run_id=bad)})
                self.assertEqual(r["reason"], "capability_rejected")
        self.assertEqual(self.nonces(), 0)


class RequestPath(Base):
    def test_complete_ok_updates_task_and_run(self):
        r = self.call({"capability": self.tok(), "args": {"summary": "done"}})
        self.assertTrue(r["ok"], r)
        self.assertEqual(self.status(), "done")
        self.assertEqual(self.q("SELECT outcome, summary FROM task_runs WHERE id=?",
                                self.runs["t1"]), ("completed", "done"))
        self.assertEqual(self.q("SELECT state FROM agos_broker_nonce")[0], "applied")

    def test_scope_rejections_do_not_consume_nonce(self):
        for kw in ({"tenant": "OTHER"}, {"project": "p2"}, {"task": "missing"},
                   {"run_id": str(self.runs["t2"])}, {"task": "t2"}):
            with self.subTest(kw=kw):
                self.assertFalse(self.call({"capability": self.tok(**kw)})["ok"])
        self.assertEqual((self.status(), self.status("t2"), self.nonces()),
                         ("running", "running", 0))

    def test_board_tenant_pin(self):
        r = self.call({"capability": self.tok(tenant="OTHER")})
        self.assertIn("tenant not served", r["detail"])

    def test_fresh_nonce_cannot_redo_finished_task(self):
        self.assertTrue(self.call({"capability": self.tok()})["ok"])
        for action in ("complete", "block", "heartbeat"):
            self.assertFalse(self.call({"capability": self.tok(action=action)})["ok"])
        self.assertEqual((self.status(), self.nonces()), ("done", 1))

    def test_replay_rejected(self):
        t = self.tok()
        self.assertTrue(self.call({"capability": t})["ok"])
        self.assertEqual(self.call({"capability": t})["reason"], "replay_rejected")

    def test_action_allow_list(self):
        for action in ("read_sentinel", "delete", "sql"):
            self.assertEqual(self.call({"capability": self.tok(action=action)})["reason"],
                             "action_not_allowed")

    def test_args_schema(self):
        for args in ({"summary": "x" * 8193}, {"sql": "DROP TABLE tasks"},
                     {"summary": 5}, ["summary"]):
            with self.subTest(args=str(args)[:30]):
                self.assertEqual(self.call({"capability": self.tok(), "args": args})["reason"],
                                 "args_rejected")
        self.assertEqual((self.status(), self.nonces()), ("running", 0))

    def test_unexpected_request_member(self):
        r = self.call({"capability": self.tok(), "db_path": "/x"})
        self.assertEqual(r["reason"], "framing_rejected")

    def test_duplicate_request_member(self):
        body = ('{"capability":%s,"capability":"x"}' % json.dumps(self.tok())).encode()
        r = self.call(None, raw=struct.pack(">I", len(body)) + body)
        self.assertEqual(r["reason"], "framing_rejected")

    def test_wrong_peer_rejected_before_parsing(self):
        r = self.call(None, raw=b"\xff\xff\xff\xff", peer=(1, 512, 512))
        self.assertEqual(r["reason"], "peer_uid_not_bound")

    def test_heartbeat_extends_claim(self):
        before = self.q("SELECT claim_expires FROM tasks WHERE id='t1'")[0]
        time.sleep(1.05)
        self.assertTrue(self.call({"capability": self.tok(action="heartbeat")})["ok"])
        self.assertGreater(self.q("SELECT claim_expires FROM tasks WHERE id='t1'")[0], before)
        self.assertEqual(self.status(), "running")

    def test_block_then_no_complete(self):
        self.assertTrue(self.call({"capability": self.tok(action="block"),
                                   "args": {"reason": "needs input"}})["ok"])
        self.assertFalse(self.call({"capability": self.tok()})["ok"])
        self.assertEqual(self.status(), "blocked")

    def test_mismatched_store_rejected(self):
        other = os.path.join(self.tmp.name, "other.db")
        sqlite3.connect(other).close()
        with self.assertRaises(ValueError):
            BoardService(self.board, self.keyring, store=NonceStore(other))


class Ledger(Base):
    def claims(self, **kw):
        return self.keyring.verify(self.tok(**kw), peer_uid=UID, board="agos-control")

    def test_atomic_failure_after_effect_rolls_back_both(self):
        c = self.claims()
        def boom(txn):
            LabNativeBackend().apply_atomic(txn, c, {})
            raise RuntimeError("INJECTED")
        with self.assertRaises(RuntimeError):
            self.svc.store.consume_atomic(c, boom)
        self.assertEqual((self.status(), self.nonces()), ("running", 0))

    def test_reserve_mode_effect_failure_burns_nonce(self):
        c = self.claims()
        def boom():
            raise RuntimeError("INJECTED")
        with self.assertRaises(RuntimeError):
            self.svc.store.consume_reserved(c, boom)
        self.assertEqual(self.svc.store.row(c["nonce"])[0], "rejected")
        with self.assertRaises(ReplayError):
            self.svc.store.consume_reserved(c, lambda: None)

    def test_reserve_mode_precheck_failure_does_not_consume(self):
        c = self.claims()
        def deny(_):
            raise CapabilityError("scope")
        with self.assertRaises(CapabilityError):
            self.svc.store.consume_reserved(c, lambda: None, precheck=deny)
        self.assertEqual(self.nonces(), 0)

    def test_restore_watermark_rejects_older_capability(self):
        c = self.claims()
        conn = connect(self.db)
        set_meta(conn, "not_before_iat", c["iat"] + 1)
        conn.close()
        with self.assertRaises(FreshnessError):
            self.svc.store.consume_atomic(c, lambda t: None)
        self.assertEqual(self.nonces(), 0)

    def test_clock_regression_fails_closed(self):
        now = [time.time()]
        store = NonceStore(self.db, clock=lambda: now[0])
        store.consume_atomic(self.claims(), lambda t: None)
        now[0] -= 3600
        with self.assertRaises(FreshnessError):
            store.consume_atomic(self.claims(task="t2", run_id=str(self.runs["t2"])),
                                 lambda t: None)
        with self.assertRaises(FreshnessError):
            store.prune()

    def test_prune_keeps_recent_and_reserved(self):
        now = [time.time()]
        store = NonceStore(self.db, clock=lambda: now[0])
        a = self.claims()
        b = self.claims(task="t2", run_id=str(self.runs["t2"]))
        store.consume_atomic(a, lambda t: None)
        conn = connect(self.db)
        conn.execute("BEGIN IMMEDIATE")
        store._admit(conn, b, "reserved", int(now[0]))
        conn.execute("COMMIT")
        conn.close()
        self.assertEqual(store.prune(), 0)
        now[0] += RETENTION + 700
        self.assertEqual(store.prune(), 1)
        self.assertEqual(store.row(b["nonce"])[0], "reserved")
        self.assertIsNone(store.row(a["nonce"]))

    def test_eight_distinct_capabilities_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        tokens = [self.tok() for _ in range(8)]
        barrier = threading.Barrier(8)
        def go(t):
            barrier.wait(5)
            return self.call({"capability": t})["ok"]
        with ThreadPoolExecutor(8) as ex:
            self.assertEqual(sum(ex.map(go, tokens)), 1)
        self.assertEqual((self.status(), self.nonces()), ("done", 1))


class DispatcherHook(Base):
    def setUp(self):
        super().setUp()
        from cryptography.hazmat.primitives import serialization
        self.key = os.path.join(self.tmp.name, "issuer.key")
        raw = self.issuer._sk.private_bytes(serialization.Encoding.Raw,
                                            serialization.PrivateFormat.Raw,
                                            serialization.NoEncryption())
        fd = os.open(self.key, os.O_WRONLY | os.O_CREAT, 0o600)
        os.write(fd, raw); os.close(fd)
        self.caps = os.path.join(self.tmp.name, "caps")
        os.mkdir(self.caps, 0o700)
        self.cfg = os.path.join(self.tmp.name, "broker-mode.json")
        with open(self.cfg, "w") as fh:
            json.dump({"iss": "agos-dispatcher", "kid": "k1", "signing_key_file": self.key,
                       "heartbeats": 3, "boards": {"agos-control": {
                           "worker_uid": os.getuid(), "worker_gid": os.getgid(),
                           "sock_path": "/run/x.sock", "cap_dir": self.caps}}}, fh)

    def test_spawn_env_strips_db_and_bundle_verifies(self):
        from hermes_adapter import dispatch
        env = dispatch.spawn_env({"HERMES_KANBAN_DB": "/db", "KEEP": "1"},
                                 board="agos-control", task_id="t1",
                                 run_id=self.runs["t1"], tenant="AGOS", project="p1",
                                 cfg_path=self.cfg)
        self.assertNotIn("HERMES_KANBAN_DB", env)
        self.assertEqual(env["KEEP"], "1")
        with open(env["HERMES_KANBAN_CAPABILITY_FILE"]) as fh:
            bundle = json.load(fh)
        self.assertEqual(len(bundle["heartbeat"]), 3)
        claims = self.keyring.verify(bundle["complete"], peer_uid=os.getuid(),
                                     board="agos-control")
        self.assertEqual((claims["task"], claims["run_id"], claims["action"]),
                         ("t1", str(self.runs["t1"]), "complete"))
        self.assertEqual(os.stat(env["HERMES_KANBAN_CAPABILITY_FILE"]).st_mode & 0o777, 0o600)

    def test_spawn_env_refuses_unscoped_task_and_loose_key(self):
        from hermes_adapter import dispatch
        with self.assertRaises(ValueError):    # legacy project_id IS NULL rows
            dispatch.spawn_env({}, board="agos-control", task_id="t1", run_id=1,
                               tenant="AGOS", project=None, cfg_path=self.cfg)
        os.chmod(self.key, 0o644)
        with self.assertRaises(PermissionError):
            dispatch.spawn_env({}, board="agos-control", task_id="t1", run_id=1,
                               tenant="AGOS", project="p1", cfg_path=self.cfg)


class Preflight(Base):
    def test_refuses_root_and_duplicate_uids(self):
        dup = BoardConfig(board="agos-continuous", db_path=self.db + "2",
                          sock_path=self.board.sock_path + "2", bound_uid=UID,
                          worker_gid=UID, tenant="AGOS")
        cfg = Config(iss="x", keys={"k1": "00" * 32}, revoked_kids=(),
                     boards=(self.board, dup))
        problems = preflight(cfg, euid=0)
        self.assertTrue(any("root" in p for p in problems))
        self.assertTrue(any("duplicate uid" in p for p in problems))


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=2).result
    print(json.dumps({"suite": "sel433-s1-unit", "run": result.testsRun,
                      "failures": len(result.failures), "errors": len(result.errors)}))
    sys.exit(0 if result.wasSuccessful() else 1)
