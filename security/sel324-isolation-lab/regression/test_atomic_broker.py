"""Fault injection against PR#5 source. Fake peer, real signatures and SQLite."""
from __future__ import annotations
import contextlib
import argparse
import io
import json
from pathlib import Path
import socket
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('variant',choices=['baseline','candidate'])
parser.add_argument('--source-root',type=Path)
args=parser.parse_args()
variant=args.variant
source_root=args.source_root or ROOT/variant
if not source_root.is_dir():
    if variant=='baseline':parser.error('baseline requires --source-root pointing to the pinned original checkout')
    source_root=ROOT.parent
sys.path.insert(0,str(source_root))
from lab.approach_c_broker import BoardBroker,send_frame,recv_frame
from lab.capability import Issuer,Verifier
from lab.nonce_ledger import NonceLedger

class AtomicBroker(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='sel433-fake-')
        self.addCleanup(self.tmp.cleanup)
        self.db=str(Path(self.tmp.name)/'board.db')
        with sqlite3.connect(self.db) as c:
            c.executescript("CREATE TABLE tasks(task_id TEXT PRIMARY KEY,board TEXT,tenant TEXT,project_id TEXT,state TEXT,run_id TEXT); CREATE TABLE board_identity(k TEXT PRIMARY KEY,v TEXT);")
            c.execute("INSERT INTO tasks VALUES ('t1','boardA','tenantA','projectA','claimed','run1')")
            c.execute("INSERT INTO board_identity VALUES ('sentinel','FAKE_A')")
        # PR#5 uses a separate ledger DB. The corrected broker's migration
        # requires the ledger table in the same physical DB as task effects.
        self.ledger_path=(str(Path(self.tmp.name)/'ledger.db') if variant=='baseline' else self.db)
        self.ledger=NonceLedger(self.ledger_path)
        self.issuer=Issuer()
        self.broker=BoardBroker(board='boardA',db_path=self.db,sock_path=str(Path(self.tmp.name)/'unused.sock'),bound_uid=511,verifier=Verifier(self.issuer.public_bytes()),ledger=self.ledger,worker_gid=511,manage_dir=False)

    def token(self,**changes):
        p=dict(sub_uid=511,board='boardA',tenant='tenantA',project='projectA',task='t1',run_id='run1',action='complete')
        p.update(changes)
        return self.issuer.mint(**p)

    def call(self,token):
        client,server=socket.socketpair()
        client.settimeout(3)
        # Authentication is deliberately test-injected. These tests prove
        # transaction/CAS behavior, never real UID or peer authentication.
        def handle():
            with contextlib.redirect_stderr(io.StringIO()):
                self.broker._handle(server)
        with patch('lab.approach_c_broker.peer_uid',return_value=(123,511,511)):
            t=threading.Thread(target=handle,daemon=True);t.start()
            try:
                send_frame(client,{'capability':token});client.shutdown(socket.SHUT_WR)
                reply=recv_frame(client)
            finally:
                client.close();t.join(timeout=4)
            self.assertFalse(t.is_alive(),'handler did not finish')
        return reply

    def state(self):
        with sqlite3.connect(self.db) as c:return c.execute("SELECT state FROM tasks WHERE task_id='t1'").fetchone()[0]

    def count(self):
        with sqlite3.connect(self.ledger_path) as c:return c.execute('SELECT count(*) FROM nonce_ledger').fetchone()[0]

    def test_complete_commits_effect_and_nonce(self):
        self.assertTrue(self.call(self.token())['ok'])
        self.assertEqual(self.state(),'done');self.assertEqual(self.count(),1)

    def test_failure_after_effect_rolls_back_effect_and_nonce(self):
        original=self.broker._apply
        def fail_after_effect(*args):
            original(*args)
            raise RuntimeError('INJECTED_AFTER_EFFECT_BEFORE_NONCE_COMMIT')
        self.broker._apply=fail_after_effect
        reply=self.call(self.token())
        self.assertEqual(reply['reason'],'internal_fail_closed')
        self.assertEqual(self.state(),'claimed')
        self.assertEqual(self.count(),0)

    def test_effect_not_visible_before_nonce_commit(self):
        original=self.broker._apply;seen=[]
        def observe_after_effect(*args):
            result=original(*args)
            seen.append((self.state(),self.count()))
            return result
        self.broker._apply=observe_after_effect
        self.assertTrue(self.call(self.token())['ok'])
        self.assertEqual(seen,[('claimed',0)])
        self.assertEqual((self.state(),self.count()),('done',1))

    def test_same_token_replay_denied(self):
        token=self.token()
        self.assertTrue(self.call(token)['ok'])
        self.assertEqual(self.call(token)['reason'],'replay_rejected')
        self.assertEqual(self.count(),1)

    def test_fresh_nonce_cannot_complete_finished_task(self):
        self.assertTrue(self.call(self.token())['ok'])
        reply=self.call(self.token())
        self.assertFalse(reply['ok']);self.assertEqual(reply['reason'],'capability_rejected')
        self.assertEqual(self.count(),1)

    def test_fresh_nonce_cannot_block_finished_task(self):
        self.assertTrue(self.call(self.token())['ok'])
        self.assertFalse(self.call(self.token(action='block'))['ok'])
        self.assertEqual(self.state(),'done');self.assertEqual(self.count(),1)

    def test_signed_wrong_tenant_denied_without_consumption(self):
        self.assertFalse(self.call(self.token(tenant='otherTenant'))['ok'])
        self.assertEqual((self.state(),self.count()),('claimed',0))

    def test_signed_wrong_project_denied_without_consumption(self):
        self.assertFalse(self.call(self.token(project='otherProject'))['ok'])
        self.assertEqual((self.state(),self.count()),('claimed',0))

    def test_stale_run_denied_without_consumption(self):
        self.assertFalse(self.call(self.token(run_id='oldRun'))['ok'])
        self.assertEqual((self.state(),self.count()),('claimed',0))

    def test_missing_task_denied_without_consumption(self):
        self.assertFalse(self.call(self.token(task='missing'))['ok'])
        self.assertEqual((self.state(),self.count()),('claimed',0))

    def test_eight_distinct_capabilities_have_one_task_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        barrier=threading.Barrier(8)
        claims=[self.broker.verifier.verify(self.token(),peer_uid=511,board='boardA') for _ in range(8)]
        def attempt(claim):
            barrier.wait(timeout=5)
            try:
                def effect(tx):
                    if variant=='baseline':return self.broker._apply(claim)
                    return self.broker._apply(claim,tx)
                self.ledger.consume_and_apply(claim,effect)
                return True
            except Exception:
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            winners=sum(pool.map(attempt,claims))
        self.assertEqual(winners,1)
        self.assertEqual(self.count(),1)
        self.assertEqual(self.state(),'done')

result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AtomicBroker))
print(json.dumps({'variant':variant,'run':result.testsRun,'passed':result.testsRun-len(result.failures)-len(result.errors),'failures':len(result.failures),'errors':len(result.errors)}))
raise SystemExit(0 if result.wasSuccessful() else 1)
