# Absent Files Manifest — ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1

The task instructs: *"If the production pull is incomplete, stop and report exactly which
required runtime files are absent. Do not invent missing source."*

This is that report. **Every required input is absent from this environment.** Not "incomplete" —
absent. Nothing was implemented, and no source was invented.

## Why: the workspace is on a machine this session cannot reach

The task's target path is **`/Users/a1453/Documents/...`** — a macOS path on your local machine.
This session runs in a Linux container: the entire `/Users` tree does not exist
(`ls: cannot access '/Users': No such file or directory`). The working folder, the production
pulls, `single-booking-engine-candidate/`, the backups and the proof folders are all on your Mac,
not in git and not mounted here.

All five ALGRP repositories are now attached and were searched. None contains the booking runtime.

## Required inputs and their status

| # | Required input | Status | Evidence |
|---|---|---|---|
| 1 | Workspace root `/Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04/` | ❌ **ABSENT** | `/Users` does not exist |
| 2 | Newest verified **production pull** (baseline) | ❌ **ABSENT** | no `wp-content` or `*production-pull*` anywhere on disk |
| 3 | `single-booking-engine-candidate/` | ❌ **ABSENT** | 0 files in 5 repos |
| 4 | `single-booking-engine-candidate/ag-homepage-live-pilot/` | ❌ **ABSENT** | referenced in AGOS docs only |
| 5 | **Production CLE received/confirmed email module** | ❌ **ABSENT** | 0 hits across all 5 repos |
| 6 | Canonical renderer `ag_hlp_render_booking_engine()` | ❌ **ABSENT** | `ag_hlp` prefix: **0 hits** anywhere |

## Required runtime source files — searched by exact filename across all five repos

Paths taken from `AGOS-MASTER-STATUS.md:104` and `AGOS_MASTER_ROADMAP_2026_V2.md:174-176`:

| Runtime file | Status |
|---|---|
| `wp-content/mu-plugins/ag-booking-core.php` | ❌ NOT FOUND |
| `wp-content/mu-plugins/ag-booking-component-v1.php` | ❌ NOT FOUND |
| `wp-content/mu-plugins/ag-home-booking-shortcode.php` | ❌ NOT FOUND |
| `wp-content/mu-plugins/ag-homepage-live-pilot/plugin.php` | ❌ NOT FOUND |
| `wp-content/mu-plugins/ag-voucher.php` (related) | ❌ NOT FOUND |
| `wp-content/mu-plugins/ag-control-panel.php` (related) | ❌ NOT FOUND |

> The AGOS documents **name** these paths; the files themselves are in none of the repositories.
> A path in a status document is not source.

## Repositories searched

| Repo | HEAD | Files | PHP | Booking runtime? |
|---|---|---:|---:|---|
| `ALGRP/AG` | `e1750e1` | reports only | 0 | no |
| `ALGRP/alanyagroup-platform` | `5c1781b` | 19 | 0 | no |
| `ALGRP/AGOS` | `f420b0e` | 427 | 26 | no — the 26 PHP files are `ag-platform-v2-admin-cms`, a read-only admin plugin whose `safety-scan.php` **fails the build on `add_shortcode`** |
| `ALGRP/agos-mobility-cloud` | `ca9b7fc` | 162 | 0 | no — Next.js/TypeScript SaaS |
| `ALGRP/agos-infrastructure` | `aeed46e` | 29 | 0 | no |

## Stop conditions triggered

All four of the task's stated stop conditions are met:

- ✅ *"the production pull is not a complete enough baseline"* — there is no production pull at all
- ✅ *"the CLE module cannot be located"* — 0 hits
- ✅ *"booking, pricing or notification source files required for a safe reconciliation are missing"* — all missing
- ✅ *"reconciliation would require guessing production behavior"* — it would require **authoring** it

Proceeding would mean writing a booking engine, a pricing authority and a CLE email module from
scratch and calling them a "reconciliation" of production code I have never seen. That is precisely
what *"Do not invent missing source"* forbids, and the CLE regression requirement — *"Production CLE
received/confirmed email behavior must not regress"* — is unverifiable against a module that cannot
be read.

## What to do next

Either path works; the first is faster:

**Option 1 — run the preflight on your Mac** (recommended)

```bash
chmod +x preflight_baseline_check.sh
./preflight_baseline_check.sh
```

`tools/preflight_baseline_check.sh` is read-only, touches nothing inside the root, and works on
macOS's default bash 3.2. It prints `BASELINE_COMPLETE=YES|NO`, identifies the newest production
pull as `BASELINE_SOURCE`, and lists exactly what is absent. Exit codes: `0` complete, `1`
incomplete, `2` root not found. If it reports YES, the reconciliation can proceed there.

**Option 2 — bring the source into git**

Commit the booking runtime (`ag-booking-core.php`, `ag-booking-component-v1.php`,
`ag-home-booking-shortcode.php`, `ag-homepage-live-pilot/`) and the CLE module to a **private**
repo — `AGOS` or `alanyagroup-platform`, not the public `AG`. That makes the reconciliation
reviewable and diffable, and this task becomes executable here in full.

Whichever you choose, the authoritative decisions you gave are recorded in `TASK_STATUS.md` and
will be applied unchanged once a baseline exists.
