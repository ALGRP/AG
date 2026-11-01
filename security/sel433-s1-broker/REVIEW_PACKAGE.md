# Review package — SEL-333 technical review / SEL-326 independent acceptance

Author: this Claude Code session (SEL-433 S1/S2 preparation).
**The author cannot accept this work.** Every PASS below is author evidence.

```text
G0=HOLD  S1_ACCEPTED=NO  INDEPENDENT_ACCEPTED=NO  LIVE_CHANGED=NO
```

## 1. Exact bytes under review

- Base: PR #6 head `75a07c943ca6ff891498a0ea3e0f40b63dc21077` (unchanged lab).
- Candidate: the head commit of the PR that adds `security/sel433-s1-broker/`
  (stacked on PR #6). Pin it with `git rev-parse HEAD` before reviewing.
- Per-file SHA-256: `evidence/run_<UTC>/source_sha256.txt` (covers this
  package, `sel324-isolation-lab/lab/` and `regression/`). Key files:

| File | SHA-256 |
| --- | --- |
| `agos_broker/capability.py` (= `lab/capability.py`) | `67f116461eb28dbc10d1e8c0ec4593fc23b7e712614a6eae81b7a7f055ce2062` |
| `agos_broker/ledger.py` | `e19630475d0b7728c76a243ab9f2ba7081264d68224c9098701fcbe4d83d49d7` |
| `agos_broker/service.py` | `11bfd99f0fd7977871d2080900a20fbb291fdc8340f968867427d5df4a2b9865` |
| `agos_broker/backup.py` | `31dfaae86b8e78e8178740f6335f40a55f726d3301f75aef24240a32fe1b1087` |
| `agos_broker/keyring.py` | `a22e98e3cc121cdcdd8abd57d16b16a8f2e7e9173897c8ae7688f649a0445954` |
| `agos_broker/config.py` | `c05e2b73be0ae77f2cf98709048998418632c89737ec5e591dca5450e44c232f` |
| `agos_broker/backends.py` | `25dbff02571f9466453ec40c1bc489c5acc7b1a9889575d9795aa28f5a394657` |
| `agos_broker/wire.py` | `191fd42df2a56878853e7a55d2df51e48b442a6f399530afb5415a45dc3109b1` |
| `agos_broker/daemon.py` | `df04eaf83df969a50188c7a958c7715ba95a70d1f54921c9db23d300b5818045` |
| `hermes_adapter/client.py` | `6cd9deef08d10814f93b927a1020057aae3081b074abeed84b802940a4bf582d` |
| `hermes_adapter/dispatch.py` | `055b704ba6d4d102a86de0c093d3c0f25f65c5c6bca9a3a7c70b23f940af314a` |
| `hermes_adapter/UPSTREAM_PATCH_c419cf7c.diff` | `431b5050be5d5d6e868f855097c0b97a3aca11fc3e34a84489f8f0d0ff4770bd` |
| `tests/run_s1_battery.py` | `733d352a93a4d1792eeb4c71187679ffb085d0423b5a0d47d8d22554eb194fbf` |
| `tests/test_unit.py` | `85f66565261f442c38d26bd0dbf4745d884d814997f8a7f34b234ff4fac89608` |
| `tests/mutation_check.py` | `ab6e28dbd97c98da94c57e93f88933635729a76ba9b71d5352aefa1ea88db355` |
| `tests/crash_harness.py` | `cf550c12b426deae5737494639ba3d65241ba4b0f38e888ed9f31b56e210073b` |
| `deploy/agos-broker.service` | `4a2bcd9f50ce5be158b8aa97ae28a2cfca6bd5c6e6575bff5e7958dda9ad7099` |
| `deploy/agos-hermes-worker@.service` | `a83c2fcd640f769c32371983825fbfa9d18dc2bbcd3eb9662187f4a32732a008` |
| `run_all.sh` | `e8c06ff4a4ef8f23742c4e802b0087f28988ac87c98a6fa7ed5f095459497abd` |

- Upstream reference: `NousResearch/hermes-agent@c419cf7c864ac0ee511dbd9f7091a8bba0b567ee`
  (`tools/kanban_tools.py` `e5f48cb0…d02f`, `hermes_cli/kanban_db.py`
  `d843c4a5…1b10`, `hermes_cli/kanban_db_dispatch.py` `8ead0acc…59fb`,
  `gateway/session_kanban.py` `5b3a7596…f998`,
  `hermes_cli/kanban_db_connect.py` `4b6e14bd…ccbc`). Read, never executed.

## 2. Reproduce

```sh
sudo sh security/sel433-s1-broker/run_all.sh /tmp/sel433-evidence
```

Needs: disposable Linux, root, full UID map (`/proc/self/uid_map` not `0 0 1`),
`setpriv`, Python ≥ 3.12 with `cryptography`. Author run (this container,
Ubuntu 24.04, Python 3.13.18, SQLite 3.53.1, cryptography 50.0.1):

| Suite | Result |
| --- | --- |
| PR #6 lab regression (unchanged) | 16/16 |
| PR #6 lab real-UID battery (unchanged) | 28/28 |
| S1 package unit (test-injected peer) | 29/29 |
| S1 package real-UID battery | 56/56 |
| Mutation check (control removed → suite must fail) | 9/9 killed |
| `systemd-analyze verify` | OK |
| `systemd-analyze security --offline` | broker 0.4 SAFE, worker 2.0 OK |

Not yet run on S1 itself for this candidate — see `S1_RUNBOOK.md` gate T.

## 3. SEL-433 acceptance criteria → evidence

| Criterion (SEL-433) | Evidence | Status |
| --- | --- | --- |
| Worker A cannot see own/other DB, B's capability, issuer key | battery `*_cannot_read_write_or_plant_db_wal_shm`, `other_worker_cannot_read_capability_bundle`, `worker_cannot_read_broker_config_state_backups`; lab 28 `issuer_key_read` | author PASS (temp tree) |
| Changing `HERMES_KANBAN_DB` does not reach a DB | `env_override_HERMES_KANBAN_DB_cannot_reach_any_db`, `adapter_lifecycle_via_broker_with_hostile_db_env` | author PASS |
| Leaked B capability, forged signature, replay (incl. restart), 8-way single winner | `negative_capabilities_rejected`, `replay_*`, `*_8_concurrent_*` | author PASS |
| ptrace / `/proc/B/environ` denied | `worker_cannot_read_broker_or_peer_environ_mem` (`/proc/<pid>/mem` uses the same `ptrace_may_access` gate; no direct `PTRACE_ATTACH`) | partial |
| Out-of-namespace same-UID process / foreign UID | foreign UID: PASS. Same-UID outside the systemd namespace: **not run** (no systemd here) | OPEN |
| B 40/40 under A's flood | `board_b_40_of_40_under_board_a_flood` | author PASS |
| Functional complete/block/heartbeat, dispatcher, Telegram | lab-native backend only; native Hermes not executed; Telegram not touched | OPEN |
| WAL/SHM protection | `wal_shm_created_broker_owned_0600`, `restored_db_broker_owned_0600`, preflight mutations | author PASS |
| Restore / rollback (SEL-436 restore leg) | 9 `backup_restore_rollback` controls incl. 6 interruption points | author PASS |

## 4. Findings made while building this (review these first)

1. **Native nonce atomicity is impossible as specified.** Upstream
   `write_txn` raises on nesting; `complete_task` has post-commit hooks. The
   lab claim "nonce + effect in one `BEGIN IMMEDIATE`" holds only for the
   lab/emulated backend. Proposed: `reserve` mode (ledger.py docstring).
   Question for reviewer: is "fail closed, lose liveness on crash between
   reserve and effect" acceptable for Hermes run lifecycle?
2. **Restore reopens spent nonces** unless a watermark is applied
   (`negative_control_restore_without_watermark_reopens_spent_nonce`).
3. **Plain copy of `kanban.db` under WAL drops committed rows**
   (`negative_control_naive_copy_loses_wal_commits`, 0/100). The SEL-433
   rollback text "DB + -wal/-shm together, service stopped" is correct only if
   all three are copied atomically; this package uses the backup API instead.
4. **Reserve-mode audit misclassification** (fixed during this work): a
   spent capability on a finished task was reported `capability_rejected`
   instead of `replay_rejected`. Caught by the battery.
5. **Same-second restore edge** (fixed): `iat` has 1 s resolution, so the
   watermark check is `iat <= not_before_iat`.

## 5. Open items (not solved here)

1. `HermesKanbanBackend` (native calls) **not executed**; connector helper
   (`kbc._sqlite_connect`) is private upstream API — pin against installed bytes.
2. Capability TTL ≤ 600 s vs. long runs: renewal must be dispatcher-side.
3. Broker mode covers only `complete`/`block`/`heartbeat`. The patch makes
   every other worker DB path fail closed (`_board()` raises) — `kanban_comment`,
   `attach`, `show`, `list`, `request_review`, `request_changes`, `schedule`
   need broker actions or remain disabled for workers.
4. Goal-mode judge gate, block `kind` validation, `metadata`/`artifacts`/
   `created_cards` are not carried over the broker protocol.
5. Tasks with `project_id IS NULL` (861 legacy rows) are refused by
   `spawn_env` — backfill decision needed.
6. systemd hardening is static only; `MemoryDenyWriteExecute=yes` with
   cryptography/cffi, namespace isolation and `NOTIFY_SOCKET` under
   `ProtectSystem=strict` must be verified on S1 gate I.
7. Signing-key custody/rotation procedure; revocation needs a restart (no reload).
8. `HermesKanbanBackend.precheck` → `complete_task` window: run CAS covers
   `current_run_id`, tenant/project are re-checked only in precheck.
9. SEL-435 (ATTACH / VACUUM INTO / FD binding): workers have no SQL surface
   here; orchestrator/CLI paths are out of scope. SEL-436's specific 88
   double-spend scenario was not read by this author — map it explicitly.
10. macOS (`getpeereid`, launchd, Seatbelt) untested.
11. Backup encryption-at-rest and retention not addressed.
12. Worker template network policy (model API egress) is an S2 decision;
    worker unit is `ExecStart=/usr/bin/false` by design.

## 6. Reviewer checklist (adversarial)

- [ ] `keyring.py`: `kid` is read pre-signature only to select a key; confirm
      the lab `Verifier` re-checks `kid`/`iss` after signature (kid-swap test).
- [ ] `ledger.py`: every path that admits a capability runs watermark, clock
      guard and nonce insert in ONE write txn; `prune` never deletes `reserved`.
- [ ] `service.py`: peer UID check precedes any read; request members
      whitelisted; `args` unsigned but schema/size bounded and stored only.
- [ ] `backends.py`: every UPDATE repeats status/run/tenant/project predicates.
- [ ] `backup.py`: walk each `fail_at` point; confirm no state leaves a db next
      to a foreign `-wal`, and the marker blocks `daemon --check`.
- [ ] `config.py`: preflight cannot be satisfied by symlinks/hardlinks;
      think about TOCTOU between preflight and first open (dirs are broker-owned 0700).
- [ ] `UPSTREAM_PATCH_c419cf7c.diff`: no remaining worker path to `kbc.connect`
      in broker mode; `session_kanban` never exports the DB in broker mode.
- [ ] Run `mutation_check.py`; propose a mutant that survives.
- [ ] Re-run on S1 (gate T) and compare `source_sha256.txt` byte-for-byte.
