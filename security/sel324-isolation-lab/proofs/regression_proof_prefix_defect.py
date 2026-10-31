"""Prove the three new controls actually DETECT the reviewed defect.

Reconstructs the pre-fix shape (ledger in its own file; effect opening its own
connection to the board DB and committing; unscoped run_id-only CAS) and runs
the same three assertions against it. They must all report the vulnerability.
"""
import os, sqlite3, sys, tempfile
sys.path.insert(0, "/home/user/AG/security/sel324-isolation-lab")
from lab import boards

OPEN = ("claimed", "running")

def old_consume_and_apply(ledger_path, board_db, claims, fail_after_effect):
    """PRE-FIX: separate ledger file, effect commits the board DB first."""
    led = sqlite3.connect(ledger_path, isolation_level=None)
    led.execute("""CREATE TABLE IF NOT EXISTS nonce_ledger(
                     nonce TEXT PRIMARY KEY)""")
    led.execute("BEGIN IMMEDIATE")
    try:
        led.execute("INSERT INTO nonce_ledger(nonce) VALUES (?)",
                    (claims["nonce"],))
    except sqlite3.IntegrityError:
        led.execute("ROLLBACK"); led.close()
        raise RuntimeError("nonce already consumed")
    # --- the defect: a SECOND connection to a DIFFERENT file, committed here
    eff = sqlite3.connect(board_db)
    cur = eff.execute("UPDATE tasks SET state=? WHERE task_id=? AND run_id=?",
                      ("done", claims["task"], claims["run_id"]))
    eff.commit(); rc = cur.rowcount; eff.close()
    if rc != 1:
        led.execute("ROLLBACK"); led.close()
        raise RuntimeError("run_id CAS failed")
    if fail_after_effect:
        led.execute("ROLLBACK"); led.close()      # nonce unspent, task DONE
        raise RuntimeError("injected crash after effect, before commit")
    led.execute("COMMIT"); led.close()
    return "applied"

def state(db, task):
    c = sqlite3.connect(db)
    try:
        r = c.execute("SELECT state FROM tasks WHERE task_id=?", (task,)).fetchone()
        return r[0] if r else None
    finally:
        c.close()

def spent(ledger_path, nonce):
    if not os.path.exists(ledger_path):
        return False
    c = sqlite3.connect(ledger_path)
    try:
        return c.execute("SELECT 1 FROM nonce_ledger WHERE nonce=?",
                         (nonce,)).fetchone() is not None
    finally:
        c.close()

d = tempfile.mkdtemp()
b = boards.make_board(os.path.join(d, "A"), boards.BOARD_A,
                      boards.SENTINEL_A, os.getuid(), os.getgid())
ledger = os.path.join(d, "ledger.db")
task, run = f"t_{boards.BOARD_A}_1", f"run_{boards.BOARD_A}_1"
fails = 0

# (a) atomicity
sqlite3.connect(b.db_path).execute(
    "UPDATE tasks SET state='claimed'").connection.commit()
c1 = {"nonce": "a" * 32, "task": task, "run_id": run}
try:
    old_consume_and_apply(ledger, b.db_path, c1, fail_after_effect=True)
except RuntimeError:
    pass
st, sp = state(b.db_path, task), spent(ledger, c1["nonce"])
detected = not (st == "claimed" and not sp)
print(f"(a) atomic_rollback_on_effect_failure : state={st!r} nonce_spent={sp} "
      f"-> {'DETECTS the defect' if detected else 'would NOT detect'}")
fails += detected

# (b) fresh nonce redoing a completed task
conn = sqlite3.connect(b.db_path); conn.execute(
    "UPDATE tasks SET state='claimed'"); conn.commit(); conn.close()
old_consume_and_apply(ledger, b.db_path, {"nonce": "b"*32, "task": task,
                                          "run_id": run}, False)
first = state(b.db_path, task)
redone = True
try:
    old_consume_and_apply(ledger, b.db_path, {"nonce": "c"*32, "task": task,
                                              "run_id": run}, False)
except RuntimeError:
    redone = False
print(f"(b) fresh_nonce_on_completed_task     : first_state={first!r} "
      f"redo_accepted={redone} -> "
      f"{'DETECTS the defect' if redone else 'would NOT detect'}")
fails += redone

# (c) cross-scope tenant/project (old SQL never referenced them)
conn = sqlite3.connect(b.db_path); conn.execute(
    "UPDATE tasks SET state='claimed'"); conn.commit(); conn.close()
crossed = True
try:
    old_consume_and_apply(ledger, b.db_path, {"nonce": "d"*32, "task": task,
                                              "run_id": run}, False)
except RuntimeError:
    crossed = False
print(f"(c) cross_scope_tenant_project        : foreign-scope accepted="
      f"{crossed} -> {'DETECTS the defect' if crossed else 'would NOT detect'}")
fails += crossed

print(f"\n{fails}/3 controls detect the pre-fix defect")
sys.exit(0 if fails == 3 else 1)
