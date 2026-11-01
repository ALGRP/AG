#!/bin/sh
# SEL-433 S1 evidence run. Disposable lab only: temp trees, numeric UIDs,
# synthetic boards. Installs nothing, creates no accounts, starts no units.
#
#   sudo sh security/sel433-s1-broker/run_all.sh [OUT_DIR]
#
# Exit 0 only if every suite passes. G0=HOLD regardless of the result.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
LAB="$HERE/../sel324-isolation-lab"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=${1:-$HERE/evidence/run_$STAMP}
PY=${PYTHON:-python3}
mkdir -p "$OUT"
rc=0
run() { name=$1; shift; echo "== $name"; "$@" >"$OUT/$name.log" 2>&1; r=$?;
        tail -n 1 "$OUT/$name.log"; echo "$name exit=$r" >>"$OUT/exit_codes.txt";
        [ $r -eq 0 ] || rc=1; }

{
  echo "utc=$STAMP"; uname -srm; $PY -V
  $PY -c 'import sqlite3, cryptography; print("sqlite", sqlite3.sqlite_version, "cryptography", cryptography.__version__)'
  echo "uid_map: $(cat /proc/self/uid_map | tr -s ' ')"
  (cd "$HERE" && git rev-parse HEAD 2>/dev/null) || echo "git: n/a"
  systemd-analyze --version 2>/dev/null | head -1
} >"$OUT/environment.txt" 2>&1

run lab_regression_16 sh -c "cd '$LAB' && $PY -B regression/test_atomic_broker.py candidate"
run lab_uid_28 sh -c "cd '$LAB' && $PY -B regression/run_broker_uid.py --output-dir '$OUT/lab_uid'"
run s1_unit sh -c "cd '$HERE' && $PY -B tests/test_unit.py"
run s1_battery sh -c "cd '$HERE' && $PY -B tests/run_s1_battery.py --output-dir '$OUT'"
run s1_mutation sh -c "cd '$HERE' && $PY -B tests/mutation_check.py --output-dir '$OUT'"
if command -v systemd-analyze >/dev/null 2>&1; then
  run systemd_verify sh -c "cd '$HERE/deploy' && systemd-analyze verify --man=no ./agos-broker.service ./agos-hermes-worker@.service && echo VERIFY_OK"
  run systemd_security sh -c "cd '$HERE/deploy' && systemd-analyze security --offline=yes ./agos-broker.service | tail -n 1 && systemd-analyze security --offline=yes ./agos-hermes-worker@.service | tail -n 1"
fi

(cd "$HERE/.." && find sel433-s1-broker sel324-isolation-lab/lab sel324-isolation-lab/regression \
   -type f \( -name '*.py' -o -name '*.service' -o -name '*.conf' -o -name '*.json' -o -name '*.diff' -o -name '*.sh' \) \
   -not -path '*/evidence/*' -not -path '*/__pycache__/*' -not -path '*/coordination_*' | LC_ALL=C sort | xargs sha256sum) >"$OUT/source_sha256.txt"
(cd "$OUT" && find . -type f -not -name SHA256SUMS | LC_ALL=C sort | xargs sha256sum) >"$OUT/SHA256SUMS"
printf 'G0=HOLD\nS1_ACCEPTED=NO\nINDEPENDENT_ACCEPTED=NO\nLIVE_CHANGED=NO\nSUITES_ALL_PASS=%s\n' \
  "$([ $rc -eq 0 ] && echo YES || echo NO)" >"$OUT/STATUS.txt"
cat "$OUT/STATUS.txt"
echo "evidence: $OUT"
exit $rc
