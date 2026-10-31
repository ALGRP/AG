# Authorization boundary — read before running anything here

This lab exists to answer **one** question for AGOS SEL-324 / SEL-433:
*which candidate architecture actually holds when a Hermes worker is hostile
and the operating system is the only thing standing in its way?*

## What this lab does NOT touch

- No installed Hermes. No real board DB, `-wal`, `-shm` or key material.
- No gateway, cron, LaunchAgent/LaunchDaemon, systemd unit, or service config.
- No Telegram, WhatsApp, booking, payment, customer or driver data.
- No credentials, no API keys, no paid API calls, no network egress.
- No UID, ACL or account change outside the disposable container it runs in.
- No git push to anything but the designated review branch; no deploy.

## What it DOES do, and where

Everything runs inside a **disposable Linux container** as root, against
**synthetic boards** whose only contents are the sentinel strings
`APPROVED_A` and `FORBIDDEN_B`. It creates four throwaway UIDs
(450 / 511 / 512 / 520) *in that container only*, mints **ephemeral**
Ed25519 keys per run, and deletes the tree on the next run.

The container has no route to the Owner's Mac, to Hetzner, or to any AGOS
host. Nothing here can reach the installed system even by accident.

## Status flags

```text
G0=HOLD
LIVE_CHANGED=NO
PATCH_INSTALLED=NO
INDEPENDENT_ACCEPTED=NO        # author cannot accept their own work
REAL_TWO_UID_RUN=YES (Linux container, synthetic boards only)
REAL_TWO_UID_RUN_MACOS=NO
```

`REAL_TWO_UID_RUN=YES` is the one genuinely new capability here: the
separate-UID battery that Owner L3-A has been gating on the Mac runs freely in
a throwaway container, because there is nothing of value in it to protect.
It is evidence about the **architecture**, not acceptance of any deployment.

## Limitations that must travel with every result

1. **Linux only.** Approach C's broker uses `SO_PEERCRED`; macOS has no
   `SO_PEERCRED` (it uses `LOCAL_PEERCRED` / `getpeereid`) and **no `/proc`**,
   which is what approach B's fix depends on. The macOS leg of the SEL-433
   table is **untested**.
2. **This is not the installed Hermes.** The broker here is written from
   scratch to the SEL-433 contract. The adapter work in SEL-433
   ("Hermes uyarlaması", `kanban_db_dispatch.py`, `kanban_tools.py`,
   `session_kanban.py`) has **not** been written or tested.
3. **Synthetic schema.** `tasks` + `board_identity` only. The 861 legacy
   `project_id IS NULL` rows are not involved and were not backfilled.
4. **No service manager.** The broker was started with `setpriv`, not as a
   systemd unit or LaunchDaemon. systemd namespace hardening and Seatbelt
   profiles were **not** exercised.
5. **The ABA hooks are instrumentation.** `after_check_hook` /
   `after_open_hook` are deterministic synchronization barriers standing in
   for an attacker that wins the race. They prove the **window exists**; they
   say nothing about how often an attacker would win it in the wild.
6. **Approaches C and D block the ABA control for a different reason** — the
   probe cannot obtain write access to stage the attack at all. That makes
   the ABA moot by construction; it is not a demonstration that a
   same-trust-domain ABA was defeated.
7. **Author's own work.** Nothing here is independent review (SEL-333) or
   independent security acceptance (SEL-326).

## How to run

```bash
# inside a disposable Linux container, as root
cd security/sel324-isolation-lab
/usr/bin/python3.12 -m lab.runner        # writes evidence/run_<UTC>/
```

Requires Python 3.12 with a working `cryptography` (Ed25519) and
`libsqlite3.so`. Do **not** run it on a host you care about: it creates
system users and writes under `/tmp/sel324_lab`.
