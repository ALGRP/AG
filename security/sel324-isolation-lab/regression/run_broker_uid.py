"""Run only candidate C's existing battery with numeric UIDs in a disposable lab.

No user/group accounts are created. No system service or native Hermes is used.
This reproduces lab controls, not S1 service or independent acceptance.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, required=True)
args = parser.parse_args()
if os.geteuid() != 0 or sys.platform != 'linux':
    parser.error('requires a disposable Linux lab as root')
if shutil.which('setpriv') is None:
    parser.error('setpriv is required; nothing will be installed')

# A container may report uid 0 while mapping only uid 0. Detect that before
# creating fixtures; never treat inability to switch UID as a security PASS.
def mapped(identifier: int, filename: str) -> bool:
    return any(int(start) <= identifier < int(start) + int(count)
               for line in Path(filename).read_text().splitlines()
               for start, outside, count in [line.split()])

required = (0, 450, 511, 512, 520)
uid_map = Path('/proc/self/uid_map').read_text().strip()
gid_map = Path('/proc/self/gid_map').read_text().strip()
if not all(mapped(i, '/proc/self/uid_map') and
           mapped(i, '/proc/self/gid_map') for i in required):
    blocked = {'status': 'BLOCKED_UID_MAP', 'uid_map': uid_map,
               'gid_map': gid_map, 'run': 0, 'passed': 0,
               'S1_ACCEPTED': False, 'INDEPENDENT_ACCEPTED': False,
               'LIVE_CHANGED': False}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'uid_results.json').write_text(
        json.dumps(blocked, indent=2) + '\n')
    print(json.dumps(blocked))
    raise SystemExit(2)

source = Path(__file__).resolve().parents[1]
source_hashes = {
    str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted((source / 'lab').glob('*.py'))
}
with tempfile.TemporaryDirectory(prefix='sel433-coordination-') as tmp:
    root = Path(tmp)
    root.chmod(0o755)
    shutil.copytree(source / 'lab', root / 'lab',
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    sys.path.insert(0, str(root))
    from lab import runner
    from lab.capability import Issuer
    runner.PY = sys.executable
    # Do not call runner.main()/ensure_users(): setpriv accepts numeric IDs.
    results = []
    layout = runner.build_broker_layout(str(root / 'C'))
    issuer = Issuer()
    broker = runner.BrokerProcess(layout, issuer)
    try:
        broker.start()
        runner.run_fs_battery(layout, results)
        runner.run_broker_battery(layout, issuer, broker, results)
    finally:
        broker.shutdown()
    controls = [r.control for r in results]
    passed = sum(r.verdict == 'PASS' for r in results)
    accepted = (len(controls) == len(set(controls)) == len(runner.BATTERY)
                and set(controls) == set(runner.BATTERY)
                and passed == len(runner.BATTERY))
    report = {
        'scope': 'disposable Linux synthetic broker lab, no system accounts',
        'uids': {'broker': 450, 'worker_a': 511, 'worker_b': 512, 'outsider': 520},
        'python': sys.version.split()[0],
        'source_sha256': source_hashes,
        'run': len(results), 'passed': passed,
        'failed': sum(r.verdict != 'PASS' for r in results),
        'results': [asdict(r) for r in results],
        'S1_ACCEPTED': False, 'INDEPENDENT_ACCEPTED': False,
        'LIVE_CHANGED': False,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'uid_results.json').write_text(
        json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps({k: report[k] for k in ('run', 'passed', 'failed',
                     'S1_ACCEPTED', 'INDEPENDENT_ACCEPTED', 'LIVE_CHANGED')}))
    for r in results:
        if r.verdict != 'PASS':
            print(r.control, r.verdict, r.detail)
    raise SystemExit(0 if accepted else 1)
