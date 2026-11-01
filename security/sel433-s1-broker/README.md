# SEL-433 S1 broker service + Hermes adapter (staging package)

Builds on PR #6 head `75a07c943ca6ff891498a0ea3e0f40b63dc21077`. The four
S1-hash-verified lab files (`lab/approach_c_broker.py`, `lab/nonce_ledger.py`,
`lab/capability.py`, `regression/run_broker_uid.py`) are **unchanged**.
`agos_broker/capability.py` is a byte-identical copy of `lab/capability.py`
(SHA-256 `67f11646…2062`, asserted by a unit test).

```text
G0=HOLD
S1_ACCEPTED=NO
INDEPENDENT_ACCEPTED=NO
LIVE_CHANGED=NO
SERVICE_INSTALLED=NO        # unit/tmpfiles/sysusers are templates only
NATIVE_HERMES_EXECUTED=NO   # upstream patch is a reviewed-text proposal
```

## What is here

| Path | Purpose |
| --- | --- |
| `agos_broker/` | Production-shaped broker: config + fail-closed preflight, keyring (kid, rotation, revocation), per-board socket service, nonce history in the board DB, backup / resumable restore / ownership rollback, systemd `Type=notify` daemon |
| `hermes_adapter/` | Worker client + upstream-shaped tool handlers; dispatcher bundle minting, private capability file, DB-free worker env; `UPSTREAM_PATCH_c419cf7c.diff` |
| `deploy/` | `agos-broker.service`, `agos-hermes-worker@.service`, tmpfiles, sysusers, example config — **not installed** |
| `tests/test_unit.py` | 29 fast tests (real SQLite/Ed25519, test-injected peer) |
| `tests/run_s1_battery.py` | 56 controls with **real separate numeric UIDs** (450/511/512/520) in a disposable tree |
| `tests/mutation_check.py` | 9 mutants, each removes one control; suites must fail |
| `run_all.sh` | One command: lab 16 + lab 28 + unit + battery + mutation + systemd static checks → `evidence/run_<UTC>/` |
| `S1_RUNBOOK.md` | Owner-run S1 steps, split by approval gate |
| `REVIEW_PACKAGE.md` | SEL-333 technical review / SEL-326 independent acceptance hand-off |

## Design decisions that differ from the lab

1. **Native Hermes cannot share the nonce transaction.** Upstream
   `kanban_db_connect.write_txn` (c419cf7c) refuses nesting and
   `complete_task` has post-commit side effects. The broker therefore has two
   modes: `atomic` (nonce + effect in one `BEGIN IMMEDIATE`, lab contract) and
   `reserve` (nonce durably reserved first, effect in its own txn, then
   marked). Reserve mode is fail-closed: a crash at any point leaves the nonce
   spent; the native status/`current_run_id` CAS prevents a double effect.
   Both crash points are exercised with SIGKILL against real processes.
2. **Restore re-opens spent nonces.** Restoring an older DB loses nonce rows
   spent after the backup (shown by a negative control). Restore stamps
   `not_before_iat`; every capability minted at or before the restore is
   refused. A clock-regression guard (`high_water_time`) fails closed.
3. **A plain file copy is not a WAL backup** (negative control: 0/100 rows).
   Backups use the SQLite backup API with the service stopped; restore is
   staged, resumable, never leaves a foreign `-wal` next to the restored DB,
   and the daemon refuses to start while a restore marker exists.
4. **Socket node** is `0660 broker:<worker-group>` (lab used `0666` behind the
   `0750` directory); the broker needs `SupplementaryGroups=` for the chgrp.
5. **Keeper connection** keeps `-wal`/`-shm` broker-created and `0600` for the
   service lifetime.

Run: `sudo sh security/sel433-s1-broker/run_all.sh` (disposable Linux, root,
full UID map, `setpriv`, Python 3.12+ with `cryptography`).
