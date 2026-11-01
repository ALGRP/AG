"""Negative control for the test suites themselves.

Each mutant deliberately removes ONE security control from a throwaway copy
of the package; the unit suite and/or the real-UID battery must then FAIL.
A mutant that survives means the suites do not actually guard that control.

  sudo python3 -B tests/mutation_check.py --output-dir DIR
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PKG = Path(__file__).resolve().parents[1]

MUTANTS = [
    ("no_early_peer_uid_reject", "agos_broker/service.py",
     "if uid != self.board.bound_uid:", "if False:"),
    ("no_nonce_insert_replay_possible", "agos_broker/ledger.py",
     "        except sqlite3.IntegrityError as exc:\n            raise ReplayError",
     "        except sqlite3.IntegrityError as exc:\n            pass\n        if False:\n            raise ReplayError"),
    ("no_restore_watermark", "agos_broker/backup.py",
     'ledger.set_meta(conn, "not_before_iat", t)', "pass"),
    ("restore_keeps_foreign_wal", "agos_broker/backup.py",
     'for s in ("-wal", "-shm", ""):', 'for s in ("",):'),
    ("commit_effect_before_nonce", "agos_broker/ledger.py",
     "                result = effect(conn)\n                conn.execute(\"COMMIT\")",
     "                conn.execute(\"COMMIT\")\n                conn.execute(\"BEGIN IMMEDIATE\")\n"
     "                result = effect(conn)\n                conn.execute(\"COMMIT\")"),
    ("no_scope_check_and_no_cas_tenant", "agos_broker/backends.py",
     "    if tenant != claims[\"tenant\"] or project != claims[\"project\"]:",
     "    if False:"),
    ("socket_dir_mode_not_checked", "agos_broker/config.py",
     "if (st.st_mode & 0o777) != 0o750:", "if False:"),
    ("adapter_leaks_db_env", "hermes_adapter/dispatch.py",
     'DB_ENV_VARS = ("HERMES_KANBAN_DB",)', "DB_ENV_VARS = ()"),
    ("clock_regression_ignored", "agos_broker/ledger.py",
     "        if now + CLOCK_SKEW < hw:\n            raise FreshnessError(\n                f\"clock regression",
     "        if False:\n            raise FreshnessError(\n                f\"clock regression"),
]
# The tenant mutant also needs the CAS predicate gone, otherwise the UPDATE's
# own tenant/project predicate (defence in depth) still blocks it.
EXTRA = {"no_scope_check_and_no_cas_tenant": [(
    "agos_broker/backends.py",
    '        cas = ("WHERE id=? AND status=\'running\' AND current_run_id=? "\n'
    '               "AND tenant=? AND project_id=?")\n'
    '        cas_args = (tid, run, claims["tenant"], claims["project"])',
    '        cas = "WHERE id=? AND status=\'running\' AND current_run_id=?"\n'
    '        cas_args = (tid, run)')]}


def run(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    tail = (p.stdout.strip().splitlines() or [""])[-1]
    fails = [l[:160] for l in p.stdout.splitlines() if l.startswith("[FAIL]")]
    return p.returncode, tail, fails


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", type=Path, required=True)
    a = ap.parse_args()
    report = []
    for name, rel, old, new in MUTANTS:
        tmp = Path(tempfile.mkdtemp(prefix=f"sel433-mut-{name}-"))
        dst = tmp / "pkg"
        shutil.copytree(PKG, dst, ignore=shutil.ignore_patterns("__pycache__", "evidence"))
        edits = [(rel, old, new)] + EXTRA.get(name, [])
        for f, o, n in edits:
            text = (dst / f).read_text()
            if text.count(o) != 1:
                raise SystemExit(f"mutant {name}: anchor not unique/absent in {f}")
            (dst / f).write_text(text.replace(o, n))
        u = run([sys.executable, "-B", "tests/test_unit.py"], dst)
        b = run([sys.executable, "-B", "tests/run_s1_battery.py", "--output-dir",
                 str(tmp / "out")], dst)
        killed = u[0] != 0 or b[0] != 0
        report.append({"mutant": name, "killed": killed, "unit_rc": u[0], "unit": u[1],
                       "battery_rc": b[0], "battery": b[1], "battery_fails": b[2]})
        print(f"[{'KILLED' if killed else 'SURVIVED'}] {name}: unit={u[1]} battery={b[1]}",
              flush=True)
        shutil.rmtree(tmp, ignore_errors=True)
    a.output_dir.mkdir(parents=True, exist_ok=True)
    (a.output_dir / "mutation_results.json").write_text(json.dumps(
        {"mutants": len(report), "killed": sum(r["killed"] for r in report),
         "results": report}, indent=2) + "\n")
    return 0 if all(r["killed"] for r in report) else 1


if __name__ == "__main__":
    sys.exit(main())
