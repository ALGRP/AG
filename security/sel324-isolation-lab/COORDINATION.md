# SEL-433 consolidated review candidate — 31 October 2026

The owner asked to consolidate concurrent Claude, ChatGPT and Codex work and
manage one path to Hermes automation. The integration candidate is PR #6,
stacked on PR #5; neither is production acceptance. Other chats have not been
stopped, messaged or locked by this session.

## Inputs and preservation

- Claude PR #5: `80bcf905ff7ecc2a4d03240264467745b6393bcf`.
- Codex PR #6 before consolidation: `cc6c4c66f0ec58fb2f02e6f6863dc8370cfcc921`.
- Original insecure source: `76a9638983d4955af3062d10a249f38195c43367`.

Keep Claude's BoardLedger, one-file transaction, transaction-first effect API,
claimed/running state CAS, runner and historical evidence. Preserve Codex's
same-database configuration check and full task/scope/run/state check on ALL
actions, including heartbeat and sentinel reads. Merely taking PR #5's latest
broker would have dropped those PR #6 controls. The combined runner resets its
synthetic task after the completion probe so heartbeat tests get an active task.

Adapt the regression suite to BoardLedger and the transaction-first API. Add
five tests for mismatched ledger, heartbeat scope, sentinel scope, running
tasks and a wrong-board task row. Original logs remain historical, not evidence
for the consolidated source.

## Verification actually executed

See `regression/coordination_20261031/` and its source hash manifest.

| Source | Same 16 regression tests | Exit |
| --- | --- | --- |
| Original insecure source | 5 pass / 11 fail | 1 |
| Consolidated candidate | 16 pass / 0 fail | 0 |

Python 3.12.14, actual SQLite and ephemeral Ed25519; synthetic tasks, test-injected
peer identity. Earlier 11-test comparisons were also 4/7 versus 11/0. These are
regression results, not independent acceptance or proof of OS isolation.

The numeric-UID runner was attempted in this session. Fixture chown failed
with EINVAL because this environment maps only UID/GID 0 (`0 0 1`). A preflight
now reports `BLOCKED_UID_MAP`, exit 2, zero tests, before fixture creation.
No account or group was created, and no VM was purchased or provisioned.
The existing PR #5 28/28 evidence belongs to its old source, not this candidate.
The modified runner's real-UID happy path has NOT run here.

Mac process inventory showed Claude and Codex processes. Process existence and
CPU samples do not establish task progress or Claude quota exhaustion. No quota
status was available and no process was stopped or restarted.

## One shared execution queue

| Work | Coordination record | Required completion evidence |
| --- | --- | --- |
| Consolidated implementation | SEL-433, this Codex review branch | One pinned PR #6 head; no competing integration candidate |
| Technical review | SEL-333 | Separate reviewer examines exact consolidated bytes and negatives; author tests cannot accept it |
| Separate S1 Linux target | SEL-433 | Reachable disposable target, authorized service/UID setup and one pinned installation package |
| Real-UID battery and Hermes adapter | SEL-433 S1/S2 | Same candidate; native schema, two boards, service manager, issuer, WAL/SHM, nonce history and restore/rollback proofs |
| Independent security acceptance | SEL-326 | Authorized independent result on that exact candidate and environment |
| One-board automation rollout | SEL-433 S4 | Existing Owner L3 gate, explicit scope and working rollback; then observe before the second board |

Codex owns this integration change. Claude outputs are review inputs; new code
changes should be taken into this same candidate in sequence. This is a recorded
coordination rule, not proof that every other running chat has adopted it.
SEL-435 SQL-surface, SEL-436 nonce and interrupted-restore issues remain explicit
acceptance items. No new completion percentage or ETA is inferred from test counts.

## Rollback and limits

Both input commits are preserved as commit parents. Revert the consolidation
commit to recover PR #6's previous tree; no production rollback is required.
No merge to main, deployed Hermes change, native DB, UID/ACL, service, cron,
customer message, payment or advertisement change is part of this work.

`G0=HOLD; S1_ACCEPTED=NO; INDEPENDENT_ACCEPTED=NO; LIVE_CHANGED=NO`.
