# SEL-324 comparative isolation lab

Four candidate ways to close the Hermes native tenant/board isolation finding,
measured against **one shared battery of 25 controls**, with **real separate
operating-system UIDs**.

> Read [`SCOPE.md`](SCOPE.md) first. `G0=HOLD`, `LIVE_CHANGED=NO`,
> `INDEPENDENT_ACCEPTED=NO`. Synthetic boards only.

## The four approaches

| | Approach | Where the authority lives |
|---|---|---|
| **A** | In-process pathname `stat` identity guard | Library code, same UID as the worker. The shape of the pinned `sel324_authz.py` / `_file_identity` candidate. |
| **B** | fd-bound identity — `O_NOFOLLOW` + `fstat` + procfs reopen, plus `SQLITE_OPEN_NOFOLLOW` via the C API | Still library code, same UID. |
| **D** | Per-board directory `0700`, owned by **that board's own worker UID** | The kernel. No guard in the path. |
| **C** | Per-board Hermes instance + **UID broker** over a per-board unix socket, `SO_PEERCRED`, Ed25519 capability, durable single-use nonce | The kernel *and* a separate trust domain the worker cannot enter. The SEL-433 target. |

## Headline results

```
A  in-process stat guard ............ PASS  5   FAIL 8   NA 12
B  fd-bound identity ................ PASS  5   FAIL 8   NA 12
D  per-board UID, no broker ......... PASS 12   FAIL 1   NA 12
C  per-board instance + UID broker ... PASS 25  FAIL 0   NA  0
```

Latest matrix and per-failure detail: [`evidence/`](evidence/).

### What the numbers mean

1. **A and B score identically.** The fd-bound rework fixes the ABA/TOCTOU
   leak (control 9) but *introduces* an ancestor-symlink miss (control 7),
   because `O_NOFOLLOW` only guards the final path component. Net gain: zero.

2. **An in-process guard cannot solve this at all.** Controls 1–5 and 10 fail
   for A and B for the same reason: the worker shares a UID with the data, so
   it can simply **not call the guard** (`direct_connect_bypass`) or point
   `HERMES_KANBAN_DB` wherever it likes. This is the concrete form of the
   `DIRECT_CONNECT_SITES.txt` concern raised in SEL-333 — with 25 raw
   `sqlite3.connect` sites, the guarded path is optional for an attacker.

3. **`SQLITE_OPEN_NOFOLLOW` does work — as a flag.** Passed to
   `sqlite3_open_v2` through `ctypes`, a symlinked database pathname is
   refused with `SQLITE_CANTOPEN` (rc=14). The Fable 5.1 suggestion recorded
   in SEL-324 was wrong in *mechanism* (the URI parameter `nofollow=1` does
   not exist) but right in *principle*. Both halves of that belong in the
   record.

4. **B's ABA fix is Linux-only.** It works by reopening the inode through
   `/proc/self/fd/N`. macOS has no `/proc`, so this does not port to the Mac
   leg of SEL-433. It also forces `mode=ro`, because SQLite cannot create
   `-wal`/`-shm` beside a procfs path — so it is not a drop-in for a writer.

5. **D is the cheap 80 %.** Giving each board its own worker UID and a `0700`
   directory closes 11 of the 12 applicable controls with *no application
   code in the path*. It fails exactly one: a worker still **owns its own
   board DB**, so it can forge its own state (`state='done'`,
   `run_id='forged_by_worker'`) with no capability at all, bypassing any CAS
   or approval logic that lives inside the compromised process.

6. **Only C closes authority as well as access.** Signature, peer-UID
   binding, expiry, scope, duplicate-member rejection, replay (including
   across a broker restart), single-winner concurrency under 8 racers, and
   40/40 availability for board B while board A floods.

## Layout

```
lab/capability.py        Ed25519 capability: mint, verify, duplicate-member rejection
lab/nonce_ledger.py      durable single-use nonce; consume + effect in one BEGIN IMMEDIATE
lab/approach_a_stat.py   A — pathname stat guard (with the TOCTOU hooks)
lab/approach_b_fdbound.py B — O_NOFOLLOW/fstat/procfs + SQLITE_OPEN_NOFOLLOW via ctypes
lab/approach_c_broker.py C — per-board broker, SO_PEERCRED, fail-closed request path
lab/approach_d_diruid.py D — per-board UID; also demonstrates the self-tamper gap
lab/broker_main.py       broker entry point, launched as the real broker UID
lab/probe.py             the attacker/worker, run as a REAL separate UID
lab/runner.py            builds all four layouts, runs the battery, emits the matrix
lab/boards.py            synthetic two-board fixtures
evidence/run_<UTC>/      results.json + RESULTS.md per run
```

## What this does not settle

Everything in [`SCOPE.md`](SCOPE.md) §"Limitations", and in particular: the
macOS leg is untested, no installed-Hermes adapter was written, and the author
of a candidate cannot accept it. SEL-333 (independent technical review) and
SEL-326 (independent security acceptance) remain open, and `G0` stays `HOLD`.
