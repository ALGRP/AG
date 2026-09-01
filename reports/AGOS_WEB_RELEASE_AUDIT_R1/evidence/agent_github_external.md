# ALGRP GitHub inventory + external live-site evidence (read-only research)

Date of research: 2026-09-01. Scope: ALGRP/AG, ALGRP/AGOS, ALGRP/agos-infrastructure, ALGRP/agos-mobility-cloud, ALGRP/alanyagroup-platform. No GitHub object was created, edited, commented on, or closed. No local project file was modified.

Legend: **[V]** = verified directly from tool output (GitHub MCP, `git ls-remote`, local `git`, WebSearch result text, Semrush API rows). **[I]** = inference/interpretation by me.

---

## PART 1 — Git/GitHub inventory

### Cross-repo summary [V]

| Repo | Default branch | Branches (head sha) | Tags | Releases | PRs | Issues | Workflows | Branch `protected` flag |
|---|---|---|---|---|---|---|---|---|
| ALGRP/AG (public per PR#1 text) | `main` | `main` 4e0553c4121d5d7e60ca5194a9d6966bb16c7cd1; `claude/alanyagroup-final-completion-me48z5` 51ca976f128e242783b54773d9f232a379a947e1 | none | none | 1 (open, draft) | 0 | 0 | false / false |
| ALGRP/AGOS | `main` | `main` f420b0ececd0aff1025bb1ce0e1e54a5c80ad0ea; `sprint/AGDOCS-01-source-of-truth` 8d46d3fa2fcf8830ab2ab9e7dc35cbb84754cafb; `sprint/AGTERM-02-R1-defense-in-depth` fbf5dd6158d7b523b2fd8886588e31bdcd3c6a96; `sprint/AGTERM-02-worker-command-center` d5b434aaa6bffbae6eade8af3a772a47b0ad37f0; `sprint/AGWORKER-01-propose-only-runtime` 65c8d5fc84a0bf998f133aaea5030a3461d6af06 | none | none | 5 (all closed+merged) | 0 | 0 | all false |
| ALGRP/agos-infrastructure | `main` | `main` aeed46eec6da269fb9184603605e2903fb23de0d | `release-2-foundation-start` → aeed46ee (annotated tag object 604dcf3c74e2ef37fbab01113558c2cf7d966f2b per ls-remote) | none | 0 | 0 | 0 | false |
| ALGRP/agos-mobility-cloud | `main` | `main` ca9b7fcdc82e244455f7a6d480eae85453a4b84e | `agos-s1-baseline` → ca9b7fcd (annotated tag object efa62bde94f08506412903f183af0877e101aace) | none | 0 | 0 | 0 | false |
| ALGRP/alanyagroup-platform | `main` | `main` 5c1781b4b1264682f769cd698ddd74a55ba99191; `development` dffa430f3eccb16e745e41624cebb9aa33bcf871 | none | none | 0 | 0 | 0 | false / false |

Notes [V]:
- `actions_list list_workflows` returned `{"total_count":0}` for all five repos → no GitHub Actions workflows exist, therefore no workflow runs.
- Every branch object returned `"protected": false`. No repo has a `.github/workflows` directory. Only AGOS has `.github/` content (CODEOWNERS, PR template, issue template).
- `git ls-remote` from the local clones agrees with the GitHub API on every branch/tag head sha listed above.
- Local clones: `/home/user/AG` is a full clone (1 commit on `main`, plus a **local-only** branch `claude/agos-web-release-audit-azbaev` at 4e0553c which has no remote counterpart — `ls-remote` lists only `main` and `claude/alanyagroup-final-completion-me48z5`). The other four clones are shallow (depth 1), so `git log` locally shows only the tip commit; full history below comes from the GitHub API. Tracked file counts: AG 1, agos 427, agos-infrastructure 29, agos-mobility-cloud 162, alanyagroup-platform 19.
- The sprint branches in AGOS are all fully contained in `main` (each branch head is the PR head that was merged). The PR head refs `refs/pull/N/head` match the branch heads.

---

### 1. ALGRP/AG

**Default branch:** `main`. **Tags:** none. **Releases:** none. **Issues:** none. **Workflows:** none. **CODEOWNERS:** none.

**Commits on `main` (complete — 1 commit) [V]**

| sha | date (UTC) | author | message |
|---|---|---|---|
| 4e0553c4121d5d7e60ca5194a9d6966bb16c7cd1 | 2026-05-16T06:26:07Z | ALGRP | Initialize repository |

**Commits on `claude/alanyagroup-final-completion-me48z5` (3 ahead of main) [V]**

| sha | date | author (git) | message (subject) |
|---|---|---|---|
| 51ca976f128e242783b54773d9f232a379a947e1 | 2026-08-26T12:43:25Z | "Claude" <[email-redacted]> (no GitHub login attached) | Report: reconciled booking candidate V1 — stopped, baseline absent |
| e1750e1223352dd65d47c2cc39ce8507ee0cb1c8 | 2026-08-26T11:57:00Z | "Claude" | Report: site final remediation V1 — booking engine matrix delivered |
| 290945017e2974547178be61973dfc6f06d4bd99 | 2026-08-25T06:48:31Z | "Claude" | Report: AlanyaGroup final completion V1 blocked — decision pack |
| 4e0553c4… | 2026-05-16 | ALGRP | Initialize repository |

Commit-message content worth flagging [V] (quoted from the commit bodies):
- 51ca976: "0 of 24 tests run; none reported as passing. No candidate workspace created, no git repo initialized, no production contact, no messages sent, no credentials used."
- e1750e1: "No production change, no WordPress mutation, no n8n activation, no credential used, no WhatsApp message. **owner_go=false**." … "TURSAB remains unresolved (2165 vs 12892, neither published)" … "the phone number is corroborated (+905511606905 in an n8n config)".
- 2909450: "C3 (compliance): TURSAB licence given as 2165; record says 12892. Neither is verified, so neither may be published." … "C4/C5: shuttle and private/VIP pricing contradict the record (3pax EUR60 vs EUR70; non-Alanya private +EUR10..EUR22)" … "No test is reported as passing. **owner_go remains false**."
- All three carry trailer `Co-Authored-By: Claude Opus 5` and `Claude-Session: https://claude.ai/code/session_01UCFjkTi8ZA9pHnjc8bQ4wE`.

**Pull requests [V]**

| # | title | head → base | state | draft | merged_at | author |
|---|---|---|---|---|---|---|
| 1 | AlanyaGroup remediation reports — booking matrix, coverage findings, and reconciled-candidate preflight | `claude/alanyagroup-final-completion-me48z5` (51ca976) → `main` (4e0553c) | open | **yes** | — | ALGRP |

PR #1 body — 3-line summary [V]:
1. Three report packages (`reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/` ⛔ STOPPED, `reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/` ✅ matrix delivered, `reports/ALANYAGROUP_FINAL_COMPLETION_V1/` earlier decision pack); opens with "**No production change, no deployment, no messages sent, no credentials used.**"
2. Reconciled candidate stopped because baseline absent: target workspace is a macOS path `/Users/a1453/...`; all five ALGRP repos searched — `ag_hlp` 0 hits, CLE email module 0 hits, `ag-booking-core.php`, `ag-booking-component-v1.php`, `ag-home-booking-shortcode.php`, `ag-homepage-live-pilot/plugin.php`, `single-booking-engine-candidate/` all not found; "0 of 24 tests run; none reported as passing." Ships `tools/preflight_baseline_check.sh` (read-only, bash 3.2 compatible).
3. Coverage headline: "Across 906 verified URLs, all HTTP 200: duplicate form = 0 and raw shortcode = 0 … 384 of 587 money pages (65%) render no booking form at all". Engine table: none 699, `agsc-v6` 192, `ag_home` 13, `c6` 2. Open items: TÜRSAB "2165 (owner, stated twice) vs 12892 (platform record). Neither published"; shuttle table "1=30, 2=50, 3=60, 4=70, 5=80, 6=90"; private non-Alanya formula `max(50, 50 + …)` floor "can never bind — base likely meant to be 40"; 12 Scandinavian + Arabic pages outside EN→TR→DE→RU tiers; no IP-restricted Maps server key.

Flags for PR #1: claims **release candidate?** Yes — "reconciled booking candidate V1", explicitly **STOPPED**. **Artifact?** Report markdown + preflight script only (22 files, +1888/-0, 3 commits). **SHA256?** none mentioned in the body. **Owner GO?** Body says nothing explicit; the underlying commits say `owner_go=false` twice. **Live mutation?** Explicitly denied ("No production change, no deployment…"). Disclosure note in body: "`ALGRP/AG` is **public**; the other four ALGRP repos are **private**." `mergeable_state: clean`.

PR #1 files (22, all `added`) [V]: `README.md`; `reports/ALANYAGROUP_FINAL_COMPLETION_V1/{BLOCKERS_AND_CONFLICTS.md, BOOKING_ENGINE_MATRIX.md, EXECUTION_PLAN.md, TASK_STATUS.md, evidence/01_ag_repo_state.md, 02_platform_repo_state.md, 03_dependency_verification.md, 04_target_reachability.md}`; `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/{ABSENT_FILES_MANIFEST.md, README.md, TASK_STATUS.md, evidence/01_baseline_verification.md, tools/preflight_baseline_check.sh}`; `reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/{BOOKING_ENGINE_MATRIX.md, EXECUTION_PLAN.md, FINDINGS_AND_CONFLICTS.md, README.md, TASK_STATUS.md, data/README.md, evidence/01_booking_coverage_analysis.txt, evidence/analyze_booking_coverage.py}`.

---

### 2. ALGRP/AGOS

Repo description [V]: "AGOS / AGCOS — AI-Assisted Capability Operating System, governance, operations core, Command Center, and organizational source of truth."

**Default branch:** `main`. **Tags:** none. **Releases:** none. **Issues:** none. **Workflows:** none.

**Commits on `main` (complete — 17 commits, API returned all in one page) [V]**

| sha | date (UTC) | author login / email | message |
|---|---|---|---|
| f420b0ececd0aff1025bb1ce0e1e54a5c80ad0ea | 2026-07-11T01:45:05Z | ALGRP (committer GitHub web) | Merge PR #5: AGTERM-02-R1 defense-in-depth hardening — "Merge AGTERM-02-R1 after independent adversarial review PASS_WITH_NOTES. No blockers found; read-only, no-authority, no-mutation posture preserved." |
| fbf5dd6158d7b523b2fd8886588e31bdcd3c6a96 | 2026-07-10T21:40:13Z | ALGRP <info@alanyagroup.com> | AGTERM-02-R1: harden status, review and audit verification |
| fd1af876733bd45ddecf1035f8f40abdfc1bc4fb | 2026-07-10T21:11:15Z | ALGRP (GitHub web) | AGTERM-02: add read-only worker command center — "Merge PR #4 after independent adversarial review PASS_WITH_NOTES … Follow-up hardening items M1-M3 will be tracked separately." |
| d5b434aaa6bffbae6eade8af3a772a47b0ad37f0 | 2026-07-10T19:41:30Z | ALGRP | AGTERM-02: add read-only worker command center |
| aa7e541f0df41d263fd8fcb886832f5f0e098d5c | 2026-07-10T19:21:10Z | ALGRP (GitHub web) | Merge PR #3: AGWORKER-01 propose-only model-agnostic worker runtime — "Owner-approved merge after independent review, R1A/R1B remediation, R2 approval-claim closure, and 148-test verification." |
| 65c8d5fc84a0bf998f133aaea5030a3461d6af06 | 2026-07-10T16:00:49Z | ALGRP | AGWORKER-01-R2: close approval-claim detection variants |
| c6e2874be07f77d27a8bb43f00ca76c6f2187755 | 2026-07-10T15:14:02Z | ALGRP | AGWORKER-01-R1B: harden SQLite integrity and append-only records |
| ddeaabfade34183e9c1a956dd0243ed7a6db5ee3 | 2026-07-10T15:13:58Z | ALGRP | AGWORKER-01-R1A: block authority claims in artifact content |
| 70172f4a04f1fa97cbe6bf6df32ad8c0705454c8 | 2026-07-10T14:33:56Z | ALGRP | AGWORKER-01: add propose-only model-agnostic worker runtime |
| 58ff8e074995adad6cfb204a86ed1f6b72fbee92 | 2026-07-10T11:26:58Z | ALGRP (GitHub web) | Merge pull request #2 from ALGRP/sprint/AGDOCS-01-source-of-truth |
| 8d46d3fa2fcf8830ab2ab9e7dc35cbb84754cafb | 2026-07-10T11:11:18Z | ALGRP | AGDOCS-01: promote AGOS architecture and governance to source of truth |
| eca7e855f774118d8b7536e08b53f1b63f0d0896 | 2026-07-10T10:59:04Z | ALGRP (GitHub web) | Merge pull request #1 from ALGRP/sprint/AGGIT-02-github-bootstrap |
| fc5ee6a6b0b6f4e9c611269ba43ad7607bc05288 | 2026-07-10T10:47:37Z | ALGRP | AGGIT-02: establish private GitHub source-of-truth workflow |
| 39d19f038756b58cc80423e7610b9d3ab02eab8e | 2026-07-10T09:56:17Z | ALGRP | AGTERM-01: add read-only AGOS Command Center |
| bd262c7b075b0fd34c355e82781cca59bffbdfbb | 2026-07-10T09:34:22Z | ALGRP | AGCOS-CORE-01: add T0 capability operating system foundation |
| f9f8f1a6af5d70f0a355077aafa0f07719398bcc | 2026-07-09T18:40:26Z | ALGRP | AGGIT-01: harden Git baseline for AGOS source-of-truth |
| c89dfdd0e37ede2d9a04cb9c2d068d59a140b72e | 2026-07-03T05:14:43Z | ALGRP | SEL-204B baseline: local AGOS release foundation |
| 61f6cd0b3ad2d7db4d3c3fe0a24729a550b6c204 | 2026-07-03T05:14:01Z | ALGRP | SEL-204B baseline: local AGOS release foundation |

(The last two are two consecutive commits with identical subject 42 s apart [V]; [I] likely a re-commit/amend.)

**Non-default branches [V]** — every one is an ancestor of `main`; no commits exist outside `main`:
- `sprint/AGTERM-02-R1-defense-in-depth` head fbf5dd6 (history: fbf5dd6 → fd1af87 → d5b434a → aa7e541 → 65c8d5f …)
- `sprint/AGTERM-02-worker-command-center` head d5b434a (→ aa7e541 → 65c8d5f → c6e2874 → ddeaabf …)
- `sprint/AGWORKER-01-propose-only-runtime` head 65c8d5f (→ c6e2874 → ddeaabf → 70172f4 → 58ff8e0 …)
- `sprint/AGDOCS-01-source-of-truth` head 8d46d3f (→ eca7e85 → fc5ee6a → 39d19f0 → bd262c7 …)
- `sprint/AGGIT-02-github-bootstrap` — referenced as PR #1 head (fc5ee6a) but **the branch no longer exists** (not in `list_branches` nor `ls-remote`; only `refs/pull/1/head` remains). [I] Deleted after merge.

**Pull requests (5; all state=closed, merged=true, merged_by ALGRP, author ALGRP) [V]**

| # | title | head → base | created | merged_at | +/- files |
|---|---|---|---|---|---|
| 1 | AGGIT-02 — Establish private GitHub source-of-truth workflow | sprint/AGGIT-02-github-bootstrap (fc5ee6a) → main (39d19f0) | 2026-07-10T10:48Z | 2026-07-10T10:59:05Z | +214, 8 files, 1 commit |
| 2 | AGDOCS-01 — Promote AGOS architecture and governance to source of truth | sprint/AGDOCS-01-source-of-truth (8d46d3f) → main (eca7e85) | 2026-07-10T11:11Z | 2026-07-10T11:26:58Z | +1656, 39 files, 1 commit |
| 3 | AGWORKER-01 — Propose-only model-agnostic worker runtime | sprint/AGWORKER-01-propose-only-runtime (65c8d5f) → main (58ff8e0) | 2026-07-10T14:34Z | 2026-07-10T19:21:11Z | +3105/-27, 41 files, 4 commits, 2 comments |
| 4 | AGTERM-02: add read-only worker command center | sprint/AGTERM-02-worker-command-center (d5b434a) → main (aa7e541) | 2026-07-10T19:41Z | 2026-07-10T21:11:15Z | +899/-141, 14 files, 1 commit |
| 5 | AGTERM-02-R1: harden status, review and audit verification | sprint/AGTERM-02-R1-defense-in-depth (fbf5dd6) → main (fd1af87) | 2026-07-10T21:40Z | 2026-07-11T01:45:05Z | +834/-45, 9 files, 1 commit |

Note [V]: `list_pull_requests` (fields subset) reported `"merged": false` for all five, but `pull_request_read get` reports `"merged": true` with `merged_by: ALGRP` and `merged_at` set, and the `main` history contains the merge commits. [I] The list endpoint's `merged` field is unreliable in this MCP; the PRs are merged.

PR body summaries (3 lines each) [V]:

- **PR #1 AGGIT-02** — (1) Governance-only: adds `.github/pull_request_template.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/engineering-sprint.md`, `docs/git/{BRANCH-STRATEGY, PULL-REQUEST-RULES, GITHUB-SOURCE-OF-TRUTH, SOURCE-OF-TRUTH-GAPS}.md`, `.gitignore` hardening (`*.db`, `*.sqlite*`). (2) "Capability tier T0 … Environment LOCAL / NONE … Production impact NONE … no branch protection changes"; tests "72 PASS"; proof path `proof/AGGIT-02-20260710-131338/` git-ignored. (3) "Built by Claude Code … This is NOT fully independent review … Owner approval is the gate. Final status PASS — ready for Owner review. No merge performed."; checklist item "Owner approval before merge (pending)" unchecked. Flags: no release candidate, no artifact hash, no SHA256, no owner GO stated, no live mutation.
- **PR #2 AGDOCS-01** — (1) Promotes 38 frozen docs + 1 script into `architecture/`, `governance/`, `decision-ledger/`, `knowledge/`, `master-status/` (39 files, docs only). (2) "Knowledge Engine verification … promoted=38 OK=38 NOT_OK=0"; 72 tests PASS; T0; LOCAL/NONE; production impact NONE. (3) Residual noted honestly: `bootstrap.KNOWLEDGE_SEEDS` defaults still point at pre-promotion paths (not changed, out of scope). Flags: none of RC/SHA256/owner GO/live mutation; "Do NOT auto-merge".
- **PR #3 AGWORKER-01** — (1) Adds propose-only, model-agnostic worker runtime under `agcos-core/src/agcos/workers/**`, SQLite schema v2 (6 tables), CLI `worker` commands, AGTERM Workers screens; "no external APIs/SDKs/network code". (2) "136 PASS" at open; comments record R1A/R1B → 145 PASS and R2 → 148 PASS; merge commit says "Owner-approved merge after independent review … 148-test verification". (3) "Prompt-injection check PASS — and now structurally enforced: UNKNOWN provenance STOPs; authority claims inside ingested content produce PROMPT_INJECTION_CHECK=FAIL + STOP". Proof `proof/AGWORKER-01-20260710-173310/` ignored. Flags: **owner approval claimed in merge commit** ("Owner-approved merge"); no RC/SHA256/live mutation.
- **PR #4 AGTERM-02** — (1) Read-only Worker Command Center (12 screens) + `python -m agcos.cli term ...` fallback. (2) "SQLite is opened with URI mode=ro … Missing runtime DB reports HOLD and is not created … No mutation, approval, execution, production, network, or external model controls were added." Tests 148 → 156 OK. (3) "Security Status screen reports HOLD because existing proof evidence paths are incomplete"; proof `proof/AGTERM-02-20260710-223955/` not committed. Merge commit: "independent adversarial review PASS_WITH_NOTES … Follow-up hardening items M1-M3 will be tracked separately." Flags: none.
- **PR #5 AGTERM-02-R1** — (1) Defense-in-depth: status precedence `STOP > FAIL > HOLD > UNKNOWN > PASS`; forbidden run states `APPROVAL_REQUESTED`, `APPROVED`, `CAPABILITY_EXECUTING` surfaced; strict audit read states (empty/missing/corrupt/valid/tampered). (2) Tests 156 → 173 OK; "SQLite mode remains ro … Production capability present=false … Runtime/proof/cache tracked count=0." (3) "Do not merge until independent review passes." Proof `proof/AGTERM-02-R1-20260711-003900/` not committed. Flags: none.

**Governance files [V]**
- `.github/CODEOWNERS` (sha cd41762…): `* @ALGRP`, `/agcos-core/ @ALGRP`, `/.github/ @ALGRP`, `/docs/git/ @ALGRP`. Header: "Owner handle confirmed via `gh api user --jq .login` = ALGRP".
- `.github/pull_request_template.md`: mandatory sections Sprint ID / Purpose / Scope / Capability tier (T0–T4) / Environment (NONE/LOCAL/STAGING/PRODUCTION) / Files changed / Tests / Proof path / Security scan / Prompt-injection check / Rollback / Production impact / Owner approval requirement / Reviewer result / Final status (PASS/HOLD/STOP/FAIL) + 5-item checklist ("No production / SSH / Hetzner / WordPress / Docker / n8n access", "No force push, history rewrite, or auto-merge", …).
- `.github/ISSUE_TEMPLATE/engineering-sprint.md`: label `sprint`; sections incl. "Owner approval gate — what requires explicit Owner GO".
- Branch protection: **none visible** (`protected:false` on all branches; PR #1 body: "no branch protection changes"). [I] Merges were performed by the same account that authored, consistent with no required-reviewer rule.
- Local docs mentioning protection concepts: `/home/user/agos/AGCP_03_TRUST_AND_STALENESS_RULES.md`, `/home/user/agos/AGSEO_02_CANONICAL_OWNER_RULES.md` (matched grep for "protected branch|branch protection|required review"; not opened).

---

### 3. ALGRP/agos-infrastructure

**Default branch:** `main`. **Branches:** `main` only. **Tag:** `release-2-foundation-start` → aeed46ee (tip). **Releases:** none. **PRs:** none. **Issues:** none. **Workflows:** none. **CODEOWNERS:** none.

**Commits on `main` (complete — 8) [V]** — all authored by GitHub login `sultankebabkielce-create` (git identity "Alanya Group" <[email-redacted]>):

| sha | date (UTC) | message |
|---|---|---|
| aeed46eec6da269fb9184603605e2903fb23de0d | 2026-06-28T20:36:13Z | Route app staging WordPress through Caddy |
| 8a23cff335251cd06d1ae93dc4b09c9e1f4d4884 | 2026-06-28T20:24:47Z | Sprint 6 WordPress staging stack |
| 4251a0296cd91ef4661f22671e0a8bb19cbe31f7 | 2026-06-28T19:41:58Z | Route n8n through Caddy reverse proxy |
| f4c121b3779a2b76aec12f2452449710292c1734 | 2026-06-28T18:49:24Z | Sprint 5 n8n stack |
| 7eb6a98289d299119d3257587c71202a26283bba | 2026-06-28T18:38:13Z | Sprint 4 Cloudflare origin TLS for Caddy |
| 54a082cca3ff2d8f58888da99fd8669e88fb6bda | 2026-06-28T17:31:20Z | Sprint 3 Caddy reverse proxy |
| 47f57afae0a4e854c899c359c496e19524a0949c | 2026-06-28T17:25:03Z | AGOS Infrastructure v2 repository structure |
| 7880be0caea5411cc9c0f3aa4b1d7d5733184e59 | 2026-06-28T16:46:18Z | Sprint 2 database redis infrastructure |
| d02e85e7605015eaf94a33ec7c010eb36ede32bf | 2026-06-28T16:00:02Z | AGOS Infrastructure v1.0 - Foundation |

[I] A different GitHub account (`sultankebabkielce-create`) than the other four repos (`ALGRP`) — worth noting for access/ownership audits.

---

### 4. ALGRP/agos-mobility-cloud

**Default branch:** `main`. **Branches:** `main` only. **Tag:** `agos-s1-baseline` → ca9b7fcd (tip). **Releases:** none. **PRs/Issues/Workflows/CODEOWNERS:** none.

**Commits on `main` (complete — 9) [V]** — all ALGRP <info@alanyagroup.com>:

| sha | date (UTC) | message |
|---|---|---|
| ca9b7fcdc82e244455f7a6d480eae85453a4b84e | 2026-07-27T11:11:56Z | chore(baseline): capture AGOS implementation surface at 2026-07-27 |
| 4351d776b246b09e37386c48e16946e5b0e5f651 | 2026-07-27T11:08:56Z | chore(repo): strengthen ignore rules before baseline capture |
| 8a2dbd8d34fa55335bf89b70b356c4f6d79cc79f | 2026-07-21T08:37:27Z | Add automated return dispatch and U-ETDS routes |
| 7d793eb3d2005e6494ccc7fd5bdee08c4e483e12 | 2026-07-21T08:15:46Z | Harden live driver actions and interactive geofences |
| 990d1657b7248b1db4593884733b56e0c8d826fa | 2026-07-21T08:09:58Z | Add driver fleet shuttle and live trip controls |
| 1db90445b28aaa3f602b59724a272a96fc9ac5e1 | 2026-07-21T07:26:53Z | Expand AGOS into a multilingual global mobility platform |
| 220d695eb62cea29388d507fae87f51865da5924 | 2026-07-21T05:50:26Z | Add partner APIs commission rules and safe driver mode |
| c62ae014c92ab88146fddc188f85be7720541330 | 2026-07-21T05:30:58Z | Add mobility marketplace and automated dispatch |
| a3cdfe44ef662853a335e269585368e495b0e6d9 | 2026-07-21T05:04:25Z | Build AGOS Mobility Cloud operations platform |

[V] Local clone contains a `node_modules/` tree (Next.js, wrangler) — the grep for "2165" hit only vendored files there.

---

### 5. ALGRP/alanyagroup-platform

**Default branch:** `main`. **Branches:** `main` (5c1781b), `development` (dffa430). **Tags/Releases/PRs/Issues/Workflows/CODEOWNERS:** none.

**Commits on `main` (complete — 8) [V]** — all ALGRP:

| sha | date (UTC) | message |
|---|---|---|
| 5c1781b4b1264682f769cd698ddd74a55ba99191 | 2026-06-24T15:27:40Z | Record SEL-119 review loop |
| d15b67eb316ebc47829c25cb1092ce2e58c52691 | 2026-06-24T02:29:52Z | Record SEL-117 and SEL-118 command center status |
| 1e99bc100cdbfaadcf4e9838dcaf922af52a1e64 | 2026-06-24T01:28:43Z | chore(command-center): record AG_MASTER_VAULT_02B completion |
| 0312ab43622030909a177dc11d5b12eafe2a0a39 | 2026-06-24T00:42:00Z | Create AI_WORKFLOW_PROTOCOL.md |
| a85f94d3ba8d3d70e3c74cde5517c06073595fb5 | 2026-06-24T00:36:01Z | Add AI operating system folders and rules |
| 753efbf4b67f7cc6a40fc657bad4d5daec687076 | 2026-06-24T00:31:10Z | Add AI Command Center project memory |
| 22696a3e1ab03f41f060d352780cf2c327f058a3 | 2026-05-13T08:05:07Z | Initial AGMC Platform Architecture ("SEO reports, Night Ops structure, Plugin architecture, Staging environment, WordPress live sync folders, Design system, Deployment scripts") |
| 5e799e8a1a9547edd2d97f2336b53979f82ee09b | 2026-05-13T07:35:18Z | Initial commit |

**Commits on `development` (4; diverged from main after 22696a3) [V]**

| sha | date | message |
|---|---|---|
| dffa430f3eccb16e745e41624cebb9aa33bcf871 | 2026-05-13T19:14:26Z | AI War Room Foundation + Sprint Status Update |
| 75a1f01c954e94e7be8b436e8a0e0d1dafc3b879 | 2026-05-13T12:58:44Z | Sync V3.7.2 AGMC baseline artifacts |
| 22696a3e… / 5e799e8a… | shared with main | |

[I] `development` is 2 commits ahead of / 6 behind `main`; never merged (no PRs exist).

**Local cross-check [V]**: `/home/user/alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:18` contains: "**Business:** Alanya Group — Antalya (AYT) + Gazipaşa (GZP) airport transfers and tours. TÜRSAB licence 12892. WordPress + Kadence theme". This is the only occurrence of "12892" outside `node_modules` in any of the five clones, and the string "2165" does not appear in any tracked file. So the AG PR #1 phrase "12892 (platform record)" is corroborated; "2165 (owner, stated twice)" is not in any repo. Shuttle price text found in `/home/user/agos` (3 lines): "Shuttle pricing: 1 passenger one-way = 30 EUR; 2 passengers one-way = 50 EUR."

---

## PART 2 — External live-site evidence (indirect sources only)

Direct fetches of alanyagroup.com / sultankebabkielce.com / n8n.alanyagroup.com were not attempted (stated as egress-blocked). All items below come from WebSearch result text (search-engine snippets/summaries as returned by the tool) or Semrush API rows. Snippet text is the tool's rendering; where it paraphrases rather than quotes the page, I mark it [snippet-paraphrase].

### 2A. alanyagroup.com — WebSearch

**Indexed URLs seen [V]** (all `https://www.alanyagroup.com/...` unless noted): `/`, `/home-page/`, `/privacy-policy/`, `/faq/`, `/contact-us/`, `/news/`, `/sitemap/`, `/alanya-hotels/`, `/alanya-places-to-visit/`, `/antalya-airport-transfer` (**no trailing slash**), `/gazipasa-airport-transfer` (**no trailing slash**), `/antalya-airport-vip-transfer/`, `/antalya-flughafen-vip-transfer/`, `/nachrichten/antalya-flughafen-vip-transfer/`, `/alanya-private-transfer/`, `/private-vs-shared-transfer/`, `/antalya-transfer-booking/`, `/antalya-alanya-transfer/`, `/antalya-to-alanya-transfer-distance-duration-price-guide/`, `/transportation-from-antalya-to-alanya/`, `/antalya-airport-pickup-service-2/`, `/antalya-airport-transfer-guide/`, `/antalya-flughafentransfer/`, `/how-to-get-from-gazipasa-airport-to-alanya-2025-transfer-guide/`, `/how-far-is-it-from-antalya-to-belek/`, `/belek-airport-transfer/`, `/belek-rent-a-car/`, `/belek-autovermietung/`, `/de/side-autovermietung/`, `/antalya-car-rental/`, `/alanya-camping-equipment-rental/`, `/alanya-turkish-bath-and-massage/`, `/parasailing-in-alanya-7/`, hotel-transfer pages (`/utopia-world-hotel-transfer/`, `/lonicera-world-hotel-transfer/`, `/side-royal-dragon-hotel-transfer/`, `/eftalia-island-alanya-transfer/`, `/sherwood-exclusive-kemer-transfer/`, `/crystal-waterworld-hotel-transfer/`, `/hotel-side-su-transfer/`, `/grand-uysal-beach-hotel-transfer/`, `/alanya-long-beach-resort-transfer/`, `/club-hotel-phaselis-rose-transfer/`, `/selene-beach-transfer-alanya/`, `/news/side-hotel-transfer/`, `/news/labranda-alantur-alanya-transfer/`, `/news/alanya-wome-deluxe-transfer/`), `/?lang=tr`, and **non-www** variants: `https://alanyagroup.com/nachrichten/flughafen-antalya-24-7-transfer` (no trailing slash), `https://alanyagroup.com/дома` (Russian slug, non-www), plus `www.alanyagroup.com/nachrichten/antalya-7-24-flughafen-transfer/` and `/nachrichten/transfer-vom-flughafen-alanya-nach-antalya/`.

**(a) Raw HTML / shortcode / broken markup in snippets [V]:** None observed. Searches `site:alanyagroup.com "[ag_home_booking]" OR "[ag_booking" OR "[agsc" OR "[ag_transfer_booking_form]"` and `"alanyagroup.com" "[ag_" OR "ag_home_booking" OR "shortcode"` returned no alanyagroup.com snippet containing a bracketed shortcode; the tool stated "the specific code strings … do not appear to be explicitly shown in the visible page content of the results." One title-level oddity: page title `"**Stress-Free** Antalya Airport Transfer Guide (2025 Update)"` at `/antalya-airport-transfer-guide/` — literal `**` asterisks in the indexed `<title>` (markdown bold leaked into title) [V]. Another title inconsistency: `/nachrichten/antalya-7-24-flughafen-transfer/` carries the site-name suffix "Alanya Transfer - Tour - Investment - Real Estate - Car Rent" while other pages use "Alanya Transfer - 24/7 Antalya Airport Transfer" or "Alanya Group" [V] ([I] stale/inconsistent title template).

**(b) TÜRSAB numbers seen [V]:**
- "Alanya Group operates ground mobility services under TÜRSAB document no. **2165**, registered under Free Time Turizm (Alanya Şb.)" — returned for `site:alanyagroup.com TÜRSAB`, `"alanyagroup.com" TÜRSAB 2165`, and `"alanyagroup.com" TÜRSAB 12892` (sources listed: `/privacy-policy/`, `/contact-us/`, `/private-vs-shared-transfer/`, `/gazipasa-airport-transfer`, `/antalya-airport-transfer`, hotel-transfer pages).
- "AlanyaGroup.com is an initiative to gather TÜRSAB member agencies under one roof … Car rental, transfer rental, home, and hotel rental services … carried out by TÜRSAB approved companies … There is no charge for any agency membership or user membership." (privacy-policy snippet).
- **12892: not found anywhere on alanyagroup.com** by search; the tool explicitly said "search results consistently show … 2165, not 12892". → Contradicts the local repo record (`MASTER_PROJECT_STATUS.md`: "TÜRSAB licence 12892") and the AG PR#1 claim "Neither published" — [V] 2165 **is** published on the live site per snippets.
- Address seen: "Saray Mah. Alaaddinoğlu Sok. No: 3/A Alanya"; phone "+90 551 160 69 05"; email info@alanyagroup.com; "Google rating of 4.7 / 5 with an average of 2486 ratings" [V snippet].

**(c) AYT→Alanya distance/duration claims [V]:**
- "approximately **135 kilometers (84 miles)** … typically takes between **1.5 to 2 hours**" (`/antalya-to-alanya-transfer-distance-duration-price-guide/`, also `/faq/`).
- "the distance between Antalya and Alanya is **127 km** and has a transportation time of about **76 minutes**" (attributed by the tool to `/transportation-from-antalya-to-alanya/` or `/antalya-alanya-transfer/`).
- "approximately 135 km and typically takes around **2 hours**" (another page).
- Gazipaşa: "**40 kilometers (25 miles)** from Alanya city center … **40–50 minutes**" and "while Antalya Airport is 135 km away, Gazipaşa is only 40 km" (`/how-to-get-from-gazipasa-airport-to-alanya-2025-transfer-guide/`).
- Tool's own summary: "distances of 127-135 km and travel times of approximately 76 minutes to 2 hours". → **Inconsistent claims across pages** (127 km/76 min vs 135 km/1.5–2 h).

**(d) Cancellation wording [V snippet-paraphrase unless quoted]:**
- "Free cancellation is available up to **12 hours** before for some transfer bookings."
- Utopia World Hotel Transfer page: "free cancellation is available up to **24 hours** before pickup, but within 24 hours, a collected deposit may be **50% retained**; if the driver has already reached the pickup point, **no refund** is due, and a confirmed no-show is charged at **100%**."
- "Cancellation requests should be made through the official Alanya Group WhatsApp number or official email."
- "Cancellation terms are confirmed on WhatsApp before your booking is finalised, and you should not assume free cancellation until the team states the rule for your reservation and date."
- Camping rental: "you must inform us one day in advance, and there is no cancellation on the day of delivery."
→ [I] Three different cancellation regimes (12 h / 24 h / "confirmed on WhatsApp") coexist.

**(e) Shuttle / private / VIP prices [V]:**
- "Shuttle transfers start from **30 EUR** when seats and route are available."
- "shared seat support when the route, date and seat plan are available from 30 EUR"; "Child seat and booster seat options are available for **5 EUR** each".
- "private transfer options start from **80 EUR**, and VIP comfort-focused options start from **120 EUR** … VIP … accommodates up to 4 passengers".
- "Shuttle or shared support depends on available route and seat planning, and private and VIP transfers are priced by route quote."
- "The prices are always **per vehicle, not per person**" and "Alanya Group determines transfer fees based on distance with no fixed-position rates" (FAQ/guide pages).
- "Payment can be made in the vehicle where applicable with no online card charge."; "No online payment is required and no card is charged."
- Local repo (`/home/user/agos`) says "1 passenger = 30 EUR; 2 passengers = 50 EUR"; AG PR#1 records the owner table "1=30, 2=50, 3=60, 4=70, 5=80, 6=90" and notes private "starts from 80" was not part of that table → [I] the live "private from 80 EUR / VIP from 120 EUR" figures need reconciling with the private formula `max(50, 50 + …)` cited in PR#1.

**(f) Seat selection / email-required indications [V]:**
- Booking form text: users can "**select exactly 1 seat(s) for your shuttle request**" (appears on `/`, `/antalya-airport-transfer`, `/gazipasa-airport-transfer` per the tool).
- "WhatsApp is the final confirmation step for bookings. Final price and pickup details are confirmed by WhatsApp".
- "a 24/7 WhatsApp number is provided in your **confirmation email**" → [I] indicates an email address is collected and a confirmation email is sent; no snippet explicitly says "email required".
- Flight tracking "included for airport-linked transfers"; 24/7 including "late-night arrivals and early-morning departures".

**Languages visible [V]:** EN (default), DE (`/nachrichten/...`, `/antalya-flughafentransfer/`, `/de/side-autovermietung/`, `/belek-autovermietung/`), RU (`alanyagroup.com/дома`), TR (`/?lang=tr`). Mixed URL schemes: `/de/` prefix vs. German slugs at root vs. `?lang=tr` query param [V] → [I] at least three different language-routing conventions coexist (hreflang risk noted in PR#1).

**Third-party [V]:** Trustpilot `https://www.trustpilot.com/review/www.alanyagroup.com` — "4.3 TrustScore with 7 reviews … no recent history of asking for reviews"; Tripadvisor "Alanya Group Services" attraction page exists. Description on Trustpilot: "7/24 transfer service to Antalya, Alanya, Belek, Side, Kemer and all districts".

### 2B. sultankebabkielce.com — WebSearch

**`site:sultankebabkielce.com` → zero results from that domain [V].** The tool stated: "the specific website domain 'sultankebabkielce.com' either doesn't exist, isn't indexed by search engines, or is not currently accessible." `"sultankebabkielce"` exact search also returned no page on that domain. `sultankebabkielce.com regulamin` and `sultankebabkielce.com polityka prywatności` returned only unrelated sites (other kebab chains' policies, Google, KPMG). → **No indexed regulamin / privacy / RODO / allergen page on the domain could be found.**

Business identity via third parties [V]:
- Name: "Sultan Kebab & Pizza" / "Sultan Kebab Pizza Kielce". Address: "Henryka Sienkiewicza 49, 25-002 Kielce". (A *different* "Sułtan Kebab" is listed at "Sienkiewicza 36, 25-507 Kielce" on adreo.pl / misterwhat.pl — [I] possible name collision / older venue.)
- Instagram `@sultankebabpizza2025` ("256 followers and 73 posts"); Facebook page id 61586274502840 (videos titled "Sultan Kebab Pizza Kielce — Henryka Sienkiewicza 49"); TikTok `@sultankebabpizza`.
- Press: kielce.naszemiasto.pl "Nowy kebab w Kielcach. Sultan Kebab & Pizza wyróżnia się pitą i tortillą wypiekanymi na miejscu".
- **NIP / REGON: not found** in any snippet. Tool: "search results do not contain a specific NIP".

Menu / prices / delivery [V snippet]:
- "beef, chicken, mixed meat options, and pizza, including kebab pizza … kebab in bread, tortilla, or on a plate … vegetarian options … kebabs on fries, boxes, and hearty sets in kapsalon style"; "Pita and tortilla are baked and made fresh on-site."
- "Kebab in bread costs around **20-25 PLN**, with plate options being slightly more expensive."
- Pyszne.pl (`https://www.pyszne.pl/menu/sultan-kebab-pizza-2`): "minimum order of **35.00 zł** with a delivery cost of **7 zł**"; "4-star rating based on 60 reviews"; at crawl time "Delivery is currently unavailable, but you can order for personal pickup."
- Also listed on Uber Eats (`ubereats.com/pl/store/sultan-kebab-&-pizza/X2WzScetVqqLPOKSwKfDHQ`) and Glovo (`glovoapp.com/en/pl/kielce/stores/sultan-kebab-pizza-klc`).
- **Opening hours: not found** ("operates daily" only). **Delivery zones: not found** beyond "na terenie miasta Kielce". **Payment methods on own site: not found**; platform card payment implied only. **Languages: only Polish** seen (plus Glovo's English listing). **Phone: not found** in snippets.

### 2C. Semrush

**What ran [V]:**

| report | target / db | result |
|---|---|---|
| domain_rank | alanyagroup.com / **tr** | Rank 394,882; Organic Keywords **227**; Organic Traffic **81**; Organic Cost 4; Paid 0/0/0 |
| domain_rank | alanyagroup.com / **de** | Rank 5,401,485; Organic Keywords **59**; Organic Traffic 0; Paid 0 |
| domain_rank | alanyagroup.com / **us** | Rank 14,737,380; Organic Keywords **47**; Organic Traffic 0; Paid 0 |
| domain_rank | sultankebabkielce.com / **pl** | Rank 826,634; Organic Keywords **11**; Organic Traffic **18**; Organic Cost 5; Paid 0 |
| domain_rank | sultankebabkielce.com / us | `ERROR 50 :: NOTHING FOUND` |

**What failed [V]:** every subsequent call returned `403 ERROR 132 :: API UNITS BALANCE IS ZERO`: `domain_ranks` (both domains), `resource_organic` (alanyagroup tr, de; sultan pl), `resource_organic_unique` (same three), `backlinks_overview` (both). `list_projects` returned the Semrush notice: "the user has an active Semrush subscription, but does not have enough API units to complete this request … options at https://www.semrush.com/mcp-access". Consequently **no keyword list, no top-ranking URL list, no cannibalization (Antalya vs Gazipaşa / www vs non-www / trailing-slash / language-variant) analysis, no project list, and no site_audit could be obtained from Semrush.** I did not fabricate any of these.

[I] From the four rows that did return: alanyagroup.com's organic footprint is small and TR-centric (227 kw / ~81 visits/mo est. in TR; ~0 traffic in DE/US despite 59/47 keywords); sultankebabkielce.com **does exist in Semrush's PL index** (11 keywords, ~18 visits/mo) even though Google-side `site:` search returned nothing — consistent with a live but very thinly indexed site.

**Cannibalization/canonical hints available only from WebSearch (not Semrush) [V→I]:**
- www vs non-www both indexed: `https://alanyagroup.com/nachrichten/flughafen-antalya-24-7-transfer` and `https://alanyagroup.com/дома` (non-www) alongside `https://www.alanyagroup.com/...` (www).
- Trailing-slash inconsistency: `/antalya-airport-transfer`, `/gazipasa-airport-transfer`, `/nachrichten/flughafen-antalya-24-7-transfer` indexed without a slash; most other URLs with.
- Duplicate topical pages for AYT→Alanya: `/antalya-alanya-transfer/`, `/antalya-to-alanya-transfer-distance-duration-price-guide/`, `/transportation-from-antalya-to-alanya/`, `/antalya-airport-pickup-service-2/` (the `-2` suffix indicates a slug collision), `/antalya-airport-transfer-guide/`, `/antalya-airport-transfer` — six pages on the same intent with conflicting distance figures.
- German duplicates: `/antalya-flughafen-vip-transfer/` vs `/nachrichten/antalya-flughafen-vip-transfer/`; `/antalya-flughafentransfer/` vs `/nachrichten/antalya-7-24-flughafen-transfer/` vs `/nachrichten/flughafen-antalya-24-7-transfer`.
- Language routing mixes `/de/…`, root German slugs, `/nachrichten/…`, `?lang=tr`, and a Cyrillic root slug.

---

## Tool availability summary

- GitHub MCP: fully available; all listed calls succeeded (one `get_files` result exceeded the output cap and was parsed from the saved tool-result file).
- Local git: available; four of five clones are shallow (depth 1).
- WebSearch: available (US-only engine); 23 queries run.
- Semrush MCP: discovery + schema calls succeeded; **4 `domain_rank` executions succeeded, then the account's API unit balance hit zero and all further reports (organic_research, domain_ranks, backlinks, projects/site_audit) failed with ERROR 132**.
- Direct HTTP to the live sites: not attempted (declared egress-blocked).
