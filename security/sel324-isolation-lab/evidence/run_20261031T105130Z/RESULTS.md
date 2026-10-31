# SEL-324 comparative isolation battery — results

- Host: `Linux vm 6.18.44-fc-v185`
- Python: `3.12.3`  SQLite: `3.45.1`
- Run: `20261031T105130Z`  (2026-10-31 10:51:30 UTC)
- Real separate UIDs: broker 450, worker-A 511, worker-B 512, outsider 520

`PASS` = the control behaved as a security control must. `FAIL` = the attack succeeded (negative control) or the legitimate path broke (positive control). `NA` = not applicable to that design.

| # | Control | Expected | **A** | **B** | **D** | **C** |
|---|---------|----------|----|----|----|----|
| 1 | Worker A opens board B's kanban.db<br>`cross_board_db_read` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 2 | Worker A reads board B's -wal/-shm sidecars<br>`cross_board_wal_shm_read` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 3 | Worker A repoints HERMES_KANBAN_DB at board B<br>`env_override_db_path` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 4 | Worker A reads the capability signing key<br>`issuer_key_read` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 5 | Worker A reads board B's capability<br>`other_capability_file_read` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 6 | Symlink at the DB pathname -> board B<br>`leaf_symlink` | BLOCKED | PASS | PASS | PASS | PASS |
| 7 | Symlinked grandparent directory -> board B<br>`ancestor_symlink` | BLOCKED | PASS | FAIL | PASS | PASS |
| 8 | Hard link to board B's DB<br>`hardlink_to_forbidden` | BLOCKED | PASS | PASS | PASS | PASS |
| 9 | Two-step ABA rename across the check/open window<br>`aba_rename_swap` | BLOCKED | FAIL | PASS | PASS | PASS |
| 10 | Raw sqlite3.connect, guard never called<br>`direct_connect_bypass` | BLOCKED | FAIL | FAIL | PASS | PASS |
| 11 | Worker forges its OWN board state, no capability<br>`self_board_tamper` | BLOCKED | FAIL | FAIL | FAIL | PASS |
| 12 | Worker A reads worker B's /proc/<pid>/environ<br>`read_proc_environ` | BLOCKED | PASS | PASS | PASS | PASS |
| 13 | Capability with an invalid Ed25519 signature<br>`forged_signature` | BLOCKED | NA | NA | NA | PASS |
| 14 | Board B's valid capability replayed by UID A<br>`leaked_capability_wrong_peer` | BLOCKED | NA | NA | NA | PASS |
| 15 | Capability past its exp<br>`expired_capability` | BLOCKED | NA | NA | NA | PASS |
| 16 | Validly signed payload with a duplicated board member<br>`duplicate_json_member` | BLOCKED | NA | NA | NA | PASS |
| 17 | Capability for board B presented on board A's socket<br>`cross_board_capability` | BLOCKED | NA | NA | NA | PASS |
| 18 | Second use of an already-consumed nonce<br>`replay_same_nonce` | BLOCKED | NA | NA | NA | PASS |
| 19 | Nonce replayed after the broker restarts<br>`replay_after_restart` | BLOCKED | NA | NA | NA | PASS |
| 20 | Unrelated UID connects to board A's socket<br>`foreign_uid_socket` | BLOCKED | NA | NA | NA | PASS |
| 21 | Privileged non-bound UID passes the dir gate<br>`early_peer_rejection` | BLOCKED | NA | NA | NA | PASS |
| 22 | 8 MiB declared frame length<br>`oversized_frame` | BLOCKED | NA | NA | NA | PASS |
| 23 | Legitimate task completion still works<br>`own_board_lifecycle` | ALLOWED | PASS | PASS | PASS | PASS |
| 24 | 8 concurrent uses of one capability -> exactly 1<br>`concurrent_single_winner` | ALLOWED | NA | NA | NA | PASS |
| 25 | Board B serves 40/40 while A floods<br>`flood_isolation` | ALLOWED | NA | NA | NA | PASS |

## Verdict per approach

- **A  in-process stat guard (pinned SEL-324 shape)** — PASS 5, FAIL 8, NA 12, ERROR 0
- **B  fd-bound (O_NOFOLLOW + procfs reopen)** — PASS 5, FAIL 8, NA 12, ERROR 0
- **D  per-board UID, no broker** — PASS 12, FAIL 1, NA 12, ERROR 0
- **C  per-board instance + UID broker (SEL-433 target)** — PASS 25, FAIL 0, NA 0, ERROR 0

## Failures in detail

### A  in-process stat guard (pinned SEL-324 shape)

- `cross_board_db_read` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  read /tmp/sel324_lab/A/kanban/agos-continuous/kanban.db
- `cross_board_wal_shm_read` → outcome **ALLOWED** (expected BLOCKED)  
  opened sidecars: ['-wal', '-shm']
- `env_override_db_path` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  env-supplied path honoured
- `issuer_key_read` → outcome **ALLOWED** (expected BLOCKED)  
  read issuer private key at /tmp/sel324_lab/A/issuer.key
- `other_capability_file_read` → outcome **ALLOWED** (expected BLOCKED)  
  read peer capability at /tmp/sel324_lab/A/cap_board_b.json
- `aba_rename_swap` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  post-open re-check passed while the fd read the forbidden inode
- `direct_connect_bypass` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  guard bypassed entirely
- `self_board_tamper` → outcome **ALLOWED** (expected BLOCKED)  
  forged own-board state to done/forged_by_worker

### B  fd-bound (O_NOFOLLOW + procfs reopen)

- `cross_board_db_read` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  read /tmp/sel324_lab/B/kanban/agos-continuous/kanban.db
- `cross_board_wal_shm_read` → outcome **ALLOWED** (expected BLOCKED)  
  opened sidecars: ['-wal', '-shm']
- `env_override_db_path` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  env-supplied path honoured
- `issuer_key_read` → outcome **ALLOWED** (expected BLOCKED)  
  read issuer private key at /tmp/sel324_lab/B/issuer.key
- `other_capability_file_read` → outcome **ALLOWED** (expected BLOCKED)  
  read peer capability at /tmp/sel324_lab/B/cap_board_b.json
- `ancestor_symlink` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  ancestor symlink traversed despite O_NOFOLLOW
- `direct_connect_bypass` → outcome **ALLOWED** (expected BLOCKED) — read sentinel `FORBIDDEN_B`  
  guard bypassed entirely
- `self_board_tamper` → outcome **ALLOWED** (expected BLOCKED)  
  forged own-board state to done/forged_by_worker

### D  per-board UID, no broker

- `self_board_tamper` → outcome **ALLOWED** (expected BLOCKED)  
  forged own-board state to done/forged_by_worker

### C  per-board instance + UID broker (SEL-433 target)

None.

