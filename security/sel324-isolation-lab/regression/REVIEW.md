# SEL-433 — Broker task effects must share the nonce transaction

PR #5 at commit `76a9638983d4955af3062d10a249f38195c43367` used one SQLite connection for the nonce transaction and a separate connection/commit for task effects. Injecting an exception after the task commit left `state=done` with zero consumed nonces. A second connection could observe the completed task before the nonce committed. Validly signed wrong-tenant/project capabilities also changed the task, and fresh nonces could repeatedly complete or block a finished task.

The patch passes the ledger transaction connection into `_apply`, stores the nonce table in the board database, and checks board/tenant/project/run/active state before applying effects. Completion/block updates repeat these checks in a conditional UPDATE. An incompatible separate-ledger configuration now fails closed. The lab's active state is `claimed`; this is not an implementation of the native Hermes adapter.

## Validation

Linux Python 3.12.14, real SQLite and ephemeral Ed25519 signatures, synthetic tasks only:

| Source | Tests | Exit |
| --- | --- | --- |
| Pinned original | 4 pass, 7 fail | 1 |
| Patched candidate | 11 pass, 0 fail | 0 |

The additional concurrent test sends eight different valid capabilities for one task and requires exactly one committed task transition and one consumed nonce. Fault injection occurs after `_apply` and before nonce COMMIT; it is not a SIGKILL/power-loss test. Peer identity is explicitly test-injected; these results do not attest OS UID isolation. The first 10-test logs are retained separately; the eleventh test was added after the first candidate passed, with no weakening of expectations.

The initial local directory-copy setup raised FileNotFoundError before candidate creation. Directory setup was corrected; no source/test failure was hidden. No installed Hermes, real boards, users, services, transport, credentials, approvals or production settings changed.

Run the candidate from the lab root:

```bash
python3 -B regression/test_atomic_broker.py candidate
```

To reproduce the original failures, extract/check out the pinned original commit into a separate directory and pass its lab root explicitly:

```bash
python3 -B regression/test_atomic_broker.py baseline --source-root /path/to/original/security/sel324-isolation-lab
```

## Remaining acceptance work

- The full 25-control real-UID battery was not rerun. It currently completes the same task before later replay/concurrency probes, so those probes need independent active task fixtures and exact rejection assertions. Do not weaken the new active-state check to preserve that fixture reuse.
- Existing 25/25 evidence belongs to the original commit; it does not cover these new checks or the patched commit.
- Moving from a separate ledger to an in-board nonce table changes storage. This lab patch does not migrate an existing ledger. A real rollout must preserve used nonces or explicitly invalidate all earlier capabilities before switching. Do not apply directly to a running deployment.
- Native Hermes adapter, actual systemd staging, worker isolation, macOS peer path, issuer custody and separate authorized security acceptance remain outside this patch.
- Framing EOF enforcement, connection limits and complete claim validation remain separate review areas; this patch makes no claim to close them.

Revert this review branch's changes to undo the candidate. No deployment rollback is needed because nothing was installed.

`CODE_CHANGED=REVIEW_BRANCH_ONLY; LIVE_CHANGED=NO; INDEPENDENT_ACCEPTED=NO; G0=HOLD`.
