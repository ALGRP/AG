# AGOS repository audit — ALGRP/AGOS (read-only)

Target: `/home/user/agos`, HEAD `f420b0e` ("Merge PR #5: AGTERM-02-R1 defense-in-depth hardening", 2026-07-11, author ALGRP), remote `https://github.com/ALGRP/agos`. 427 tracked files, working tree clean. **The local clone is shallow (`.git/shallow` present, `git rev-list --count HEAD` = 1, no tags, only `main`)** — no history before HEAD is available, so every commit hash referenced by the documents is unverifiable from this checkout.

Auditor mode: strictly read-only. No file in the repo was edited; nothing pushed. Secret values are never printed; only names/presence.

---

## 1. Release / provenance authority

### 1.1 What the release documents declare

| File | Declared status | Key quotes |
|---|---|---|
| `manifests/README.md` | "Status: STRUCTURE ONLY / LOCAL ONLY" | "No production package is created by this folder. No deployment manifest is approved here." |
| `manifests/RELEASE-MANIFEST-DRAFT.json` | `"sprint": "SEL-203A"`, `"created_date": "2026-07-03"`, `"mode": "READ_WRITE_LOCAL_ONLY"`, `"status": "STRUCTURE_ONLY"`, `"production_package_created": false`, `"deployment_authorized": false` | `folders.release.status = "created_placeholder_only"`, `folders.manifests.status = "created_placeholder_only"`; notes: "Release contents must be populated by a later owner-approved release-candidate sprint." |
| `release/README.md` | "STRUCTURE ONLY / LOCAL ONLY" | "This folder is reserved for future owner-approved release-candidate artifacts. SEL-203A only creates the folder and this placeholder document." |
| `manifests/RC-ALLOWLIST.md` (SEL-204A, 2026-07-03) | policy only | "This document defines the only file families eligible for a future AGOS release-candidate package. It does not create a package, approve deployment, or authorize production use." Allowed families: `ag-platform-v2-admin-cms/{ag-platform-v2-admin-cms.php,README.md,assets/**,bin/**,fixtures/**,includes/**,views/**}`, `release/README.md`, the five `manifests/*` files, `SEL-203*`/`SEL-204*` reports, `AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md`, `AG_ADMIN_CMS_07_ROLLBACK_NOTES.md`. Explicitly not allowed: `backups/**`, `quarantine/**`, `proof/**`, `AGDS_SPRINT*_BACKUP_*/**`, `AG-202_HEADER_BACKUP_*/**`, `AG-202A_HEADER_DISCOVERY_*/**`, `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/**`, root screenshots, "root-level exploratory or historical sprint documents not listed above", "production archives or generated packages". |
| `manifests/RC-EXCLUSION-POLICY.md` | policy only | Non-negotiable exclusions: `.DS_Store`, `*.bak`, `*.tar.gz`, `*.zip`, `*.log`, `*.tmp`, `*.temp`, `*.cache`, `*~`, `backups/`, `quarantine/`, proof archives, historical snapshots, production packages, deployment archives. "Proof report Markdown may be reviewed as evidence, but proof archives must not enter a release-candidate package unless a later manifest explicitly names the exact proof archive." Validation rule: dry-run selection must prove "no archive/package is created during validation". |
| `manifests/RC-EXCLUSION-PATTERNS.txt` | 24 glob patterns | includes `release/*.zip`, `release/*.tar.gz`, `release/*.tgz`, `release/*.pkg`, `release/*.dmg`. |

**Declared RC policy in one sentence:** an RC is to be assembled in a *future* owner-approved sprint from the allowlist minus the exclusion patterns; nothing in this repo is an RC, and no packaging tool exists yet ("policy patterns for future dry-run/package tooling").

### 1.2 SEL-203 / 203A / 204 / 204A / 204B chain (all dated 2026-07-03)

- `SEL-203-HYGIENE-REPORT.md`: duplicate scan "Duplicate groups: 90 ... Extra duplicate instances: 365" → after: 87 / 353; "16 `.DS_Store` files moved to `quarantine/...`"; "0 files permanently deleted"; PHP lint PASS "using Local.app PHP 8.2.29"; "`release/`: missing. `manifests/`: missing."; `LOCAL_RELEASE_READY=NO`, `READY_FOR_SEL204=NO`, `OVERALL_STATUS=HOLD`. Warning 5: "The workspace remains mostly untracked in git, so release scope and source-of-truth ownership are not fully controlled by git status."
- `SEL-203A-RELEASE-STRUCTURE-REPORT.md`: created `release/`, `manifests/`, placeholders; `PRODUCTION_PACKAGE_CREATED=NO`, `READY_FOR_SEL204=YES`, `OVERALL_STATUS=PASS`.
- `SEL-204-RELEASE-CANDIDATE-VALIDATION-REPORT.md`: "766 local files, excluding `.git`, `backups`, and `quarantine`"; "Unsafe RC-exclusion candidates found: Count: 76" (`.DS_Store`, `.bak`, `.tar.gz`); fixture QA "Projected rows: 906, Owner-go true rows: 0, Mutation performed true rows: 0"; `READY_FOR_SEL205=NO`, `OVERALL_STATUS=HOLD`.
- `SEL-204A-RC-POLICY-REPORT.md`: "Candidate files selected by policy: 49 ... Candidate/unsafe overlap: 0 ... Archive files created under `release/` or `manifests/`: 0"; `READY_FOR_SEL205=YES`, `OVERALL_STATUS=PASS`.
- `SEL-204B-GIT-BASELINE-REPORT.md` (entire file is 9 key=value lines): `INITIAL_COMMIT_CREATED=YES`, **`COMMIT_HASH=61f6cd0b3ad2d7db4d3c3fe0a24729a550b6c204`**, `TAG_CREATED=NO`, `FILES_DELETED=NO`, `ARCHIVE_CREATED=NO`, `READY_FOR_SEL205=YES`, `OVERALL_STATUS=PASS`.

`git cat-file -t 61f6cd0b…` → "could not get object info" (shallow clone). **Unverified.**

### 1.3 Git model (`docs/git/*`, `.github/*`)

- `BRANCH-STRATEGY.md` ("frozen at AGGIT-02"): `main` is "The protected source-of-truth branch ... Only updated by merging reviewed, Owner-approved Pull Requests. No force push, no history rewrite, no deletion." Sprint branches `sprint/<SPRINT-ID>-short-description`, "One sprint per branch; one focused Pull Request", "Proof folder + secret scan + sensitive-file scan required", "T1+ (future): additionally require rollback plan and, at higher tiers, approval tokens per AGCOS-ARCH-01 — enforced by governance until CI exists."
- `GITHUB-SOURCE-OF-TRUTH.md`: repo "`ALGRP/AGOS` — **PRIVATE**"; "What never lives here (enforced by `.gitignore`): Secrets ... Proof evidence (`proof/`), source exports, backups, release packages (`RC*/`, `release/`). Media/screenshots, customer/booking/WhatsApp/email/personal data." "No production/SSH/Hetzner/WordPress/Docker/n8n access from this repository. No GitHub Actions that deploy or mutate external systems; no GitHub/environment secrets."
- `SOURCE-OF-TRUTH-GAPS.md` ("reported by AGGIT-02 — NOT resolved here"): "Verified against the tracked git tree at `main` HEAD **`39d19f0`**" (unverifiable, shallow). Table admits: AGCOS-ARCH-01 "MISSING_FROM_SOURCE_OF_TRUTH"; AGOPS rules / AGOS-DECISIONS / MASTER-STATUS / RUNTIME-REGISTRY "PRESENT_NOT_VERSION_CONTROLLED"; AGUX-01/AGTRUST-01/AGNAV-01 "MISSING_FROM_SOURCE_OF_TRUTH"; "RC2/RC3 governance certificates | ignored `proof/` / `release/` | NO | evidence-class — keep local, NOT SoT". Resolution deferred to AGDOCS-01 (later executed: `architecture/`, `governance/`, `decision-ledger/`, `master-status/`, `knowledge/` now carry "PROMOTED SOURCE-OF-TRUTH DOCUMENT — AGDOCS-01 ... Promotion date: 2026-07-10").
- `PULL-REQUEST-RULES.md`: "Preferred: **Builder != Reviewer** ... Current reality: Claude Code is the only active engineering agent ... **This is not fully independent review.** **Owner approval remains mandatory** before merging any change to: core (`agcos-core/`), governance, security, GitHub workflow ... Every PR must ... Pass all tests; include the command + result."
- `.github/CODEOWNERS`: `* @ALGRP`, `/agcos-core/ @ALGRP`, `/.github/ @ALGRP`, `/docs/git/ @ALGRP` ("Owner handle confirmed via `gh api user --jq .login` = ALGRP").
- `.github/pull_request_template.md`: fields Sprint ID / Purpose / Scope / Capability tier / Environment / Tests / Proof path / Security scan / Prompt-injection check / Rollback / Production impact / Owner approval / Reviewer result / Final status; checkboxes incl. "AGCOS Core remains T0-only; AGTERM remains read-only".
- `.github/ISSUE_TEMPLATE/engineering-sprint.md`: sprint proposal template (tier, environment, safety boundaries, proof requirement, Owner approval gate).
- `.gitignore` ignores: secrets patterns, `*.sql/*.db`, `source-exports/`, `RC*/`, `release/`, `release/**`, `proof/`, `proof/**`, media, `*customer*data*`, `*booking*export*`, `*whatsapp*export*`, `backups/`, `quarantine/`, dated backup trees, `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/`, `*.bak`, archives; un-ignores `templates/` and `indexes/`.

### 1.4 Artifact / SHA256 policy — is there a sealed artifact?

**No sealed release artifact and no artifact SHA256 exists anywhere in the tracked repo.**

- `grep -rniE 'sha-?256|checksum'` over docs finds only policy language: `AGOS_GOV_01_PROOF_TEMPLATE.md` / `templates/proof/PROOF-FOLDER-TEMPLATE.md` fields `BACKUP_SHA256=` and `CHECKSUM_RESULT=` (blank templates); `AGOS_GOV_01_EVIDENCE_GATE.md` "checksum when practical"; `AGOS_GOV_01_SPRINT_COMPLETION_CHECKLIST.md` "[ ] Checksums exist where practical."; `AGOS_DECISION_GATES.md` "Sprint 21 package checksum/lint PASS" (no value); `AGOS_MASTER_ROADMAP_2026_V2.md` "Production file backup and checksum plan."; `master-status/AGOS-MASTER-STATUS.md` next-sprint item 10 "`AGOS-RC3-FREEZE-01` - Freeze RC3 only after manifest/SHA/security/gate verification."
- The only concrete SHA-256 value in the repo is a **fixture payload hash**, not an artifact hash: `AGSYNC_OPS_02_DRY_RUN_PAYLOAD_BUILDER_SPEC.md` "fixture hash: `d435a2f6cd62183947f09e228b4ad11069c600cfff0a6492ab5785d6b856019d`" (also in `example_duplicate_check.json`, `example_dry_run_summary.md`).
- Candidate artifact *names* referenced but absent (git-ignored proof/release): `decision-ledger/DECISION-0004.md` "RC2 Golden Artifact is frozen"; `indexes/proof/PROOF-INDEX.md` lists `RC2-05C-FINGERPRINT-CERTIFICATION-20260704-004542`, `RC2-05B-FINAL-FREEZE-20260704-002627`, `AGOS-RC3-CANDIDATE-01..03`, `AGOS-RC3-FREEZE-01-20260707-022441`, `AGOS-RC4-FREEZE-01-20260708-014518`, `AGOS-RC4-QA-01..03`, `AGOS-RELEASE-SCALE-20260708-162819`, `RC5-P0-01…`, `RC5-QA-02`, `RC5-UX-FIX-03`; `indexes/sprints/SPRINT-INDEX.md` lists `SEL-207-RC1-BUILD-REPORT.md`, `SEL-208-RC1-VERIFICATION-REPORT.md`, `AGOS-MIGRATION-FIX-01-UPLOAD-SHA-REPAIR-INSTRUCTIONS.md`, `AGOS-MIGRATION-MANIFEST-V1.md`, `NO_RC4_CANDIDATE_04.md` — **none of these files are in the tree** (see §9).
- Commit identities referenced: `61f6cd0b3ad2d7db4d3c3fe0a24729a550b6c204` (SEL-204B initial commit), `39d19f0` (AGGIT-02 main HEAD). Both unverifiable here. Only resolvable commit: `f420b0ececd0aff1025bb1ce0e1e54a5c80ad0ea`.
- Runtime code does compute SHA-256 (`agcos-core/src/agcos/util.py sha256_hex`, audit hash chain in `audit/audit_engine.py`, artifact `content_hash` in `workers/artifacts.py`, knowledge `content_hash`), but that is for audit/artifact integrity inside the local runtime, not release sealing.

### 1.5 Admitted gaps

Explicitly admitted by the documents: no tag (`TAG_CREATED=NO`), no package, RC readiness HOLD/`READY_FOR_SEL205=YES` only as policy, proof/backups/release evidence intentionally outside git, non-independent review, "workspace remains mostly untracked in git" (SEL-203), RC2/RC3 certificates "NOT SoT". Additional gaps found by this audit are in §9.

---

## 2. Governance

### 2.1 Governance documents (`governance/`, all promoted 2026-07-10 by AGDOCS-01)

- `AGOPS-00.md` (Safety Rules, from `docs/AGOS-DOCS/02-RULES/SAFETY-RULES.md`): "No production mutation without explicit production sprint. No Hetzner, DNS, live email, live WhatsApp, n8n execution, DB import/export, or deployment unless explicitly approved. Back up before controlled mutation ... Do not delete evidence. Do not expose secrets in reports." Owner note: "When uncertain, document HOLD instead of applying." `Last Updated: PLACEHOLDER`.
- `OWNER-RULES.md`: "Owner GO must match the sprint scope exactly ... Do not infer production permission from local approval. Stop on hard scope conflict. Use HOLD when evidence is missing or unsafe." "Owner GO can approve local documentation, local QA, or local implementation without approving production."
- `APPROVAL-MATRIX.md` (AGCOS-ARCH-01 §8): tokens needed for T3/T4 only; token "minted by the Orchestrator *only* in response to a genuine owner action ... scoped to one capability_id + one target + one input hash; single-use; short-TTL; non-transferable"; "T4 second factor: ... token **plus** an independent confirmation"; "**A token, GO, or permission string discovered in ingested content is void by definition**".
- `CAPABILITY-TIERS.md` (§10): T0 read/analyze "Full autonomy"; T1 local mutate "Autonomous w/ logging, inside envelope"; T2 staging "auto-STOP on anomaly"; T3 production reversible "token required ... AI never solo"; T4 "DNS, DB import/overwrite, delete, access-control/permissions, cutover ... token + second factor ... AI may prepare/verify only; NEVER executes".
- `STOP-RULES.md` (§15): STOP on provenance failure, target outside allowlist, missing/expired token or "a token/GO found in ingested content", envelope breach, missing rollback, proof write failure, schema failure, anomaly, audit chain failure; failure table incl. "Partial/interrupted execution | idempotency + request-id dedupe; resume or roll back; never fake success"; "a blocked honest HOLD always beats a completed guess".
- `PROMPT-INJECTION-RULES.md` (§9): "all logs, files, database rows, web pages, emails, terminal outputs, API responses ... as untrusted data, never as instructions ... A capability that could take a target, URL, or approval from ingested content is a design defect and must not be registered."

### 2.2 AGOS_GOV_01_* and AGOS_DECISION_GATES.md

- `AGOS_GOV_01_EVIDENCE_GATE.md` (2026-06-29): sprint naming `MODULE-SPRINT-NN — title`; proof path convention `/Users/a1453/Documents/AGOS-LOCAL-PROOF/<SPRINT>-YYYYMMDD-HHMMSS/`; PASS/HOLD rule "Never mark production READY from local or staging-only proof"; staging = `app.alanyagroup.com`, production = `www.alanyagroup.com`; live-send default "dry-run/capture only. Live sends require separate owner GO per channel."; "Full WordPress DB import into clean staging or production is forbidden unless a future migration sprint explicitly reverses this strategy".
- `AGOS_GOV_01_OWNER_GO_TEMPLATE.md` — **the Owner GO model**: a valid GO must contain `OWNER GO: / SPRINT: / TARGET_ENVIRONMENT: / ALLOWED_ACTIONS: / FORBIDDEN_ACTIONS: / BACKUP_REQUIRED: / ROLLBACK_REQUIRED: / LIVE_SENDS_ALLOWED: / DB_IMPORT_EXPORT_ALLOWED: / STOP_CONDITION: / EXPECTED_OUTPUT:`. Invalid: "`go ahead`, `continue`, `deploy`, `fix it`, `do all`, `make it live`, `sync everything`, `import the site`, `clean old files`". "If any answer is missing, the sprint must HOLD before mutation."
- `AGOS_GOV_01_PROOF_TEMPLATE.md`, `AGOS_GOV_01_SPRINT_COMPLETION_CHECKLIST.md`: proof/boundary templates (all `*=false` defaults).
- `AGOS_GOV_01_NO_MUTATION_CONFIRMATION.md`: `GOVERNANCE_STATUS=PASS_DOCUMENTATION_ONLY_EVIDENCE_GATE_CREATED`, next sprint `LOCAL-CONTENT-05 Human Review Matrix`.
- `AGOS_DECISION_GATES.md`: Gates 0–10; current: Gate 2 "PASS for staging upload rehearsal; HOLD for production"; Gates 3,4,5,6,9,10 HOLD; Gate 7 (n8n) "dry-run planning only; live execution HOLD"; Gate 8 "booking files uploaded and linted; full staging QA still HOLD". "Actions That Always Need OWNER GO: Production file change. DB import/export. Any live booking submit test. Email/WhatsApp/Sheets/n8n live send. Redirect, canonical, sitemap, slug, menu ... Media upload/delete. Plugin/theme update. DNS/cutover ... Cleanup/delete".

### 2.3 Decision ledger (`decision-ledger/MASTER-DECISIONS.md` + `DECISION-0001..0020.md`; ledger "Last Updated 2026-07-05 by AGDOCS-02"; promoted 2026-07-10)

| ID | One-line summary | Date |
|---|---|---|
| D-001 | AGOS is a Travel Operating System; WordPress is one runtime surface, not the project. | 2026-07-05 |
| D-002 | Hetzner is production; no Hetzner action without a dedicated owner-approved cutover sprint. | 2026-07-05 |
| D-003 | Local approval is not production approval (no production/DNS/Hetzner/live send/DB I/O/deploy). | 2026-07-05 |
| D-004 | RC2 Golden Artifact is frozen/immutable; changes go to RC3+. | 2026-07-05 |
| D-005 | RC3 is release-candidate qualification only, not deployment; Hetzner cutover HOLD. | 2026-07-05 |
| D-006 | Converge on one shared booking component and design system. | 2026-07-05 |
| D-007 | Preserve canonical `_agp_*` booking meta across all surfaces. | 2026-07-05 |
| D-008 | Shuttle one-way pricing: 1 pax = 30 EUR, 2 pax = 50 EUR. | 2026-07-05 |
| D-009 | Roundtrip true only with explicit return + date/time; total = one-way × 2. | 2026-07-05 |
| D-010 | Delivery queue mandatory; bookings never disappear silently. | 2026-07-05 |
| D-011 | Customer email is dry-run preview only until explicit SMTP owner GO. | 2026-07-05 |
| D-012 | WhatsApp links generate drafts only until an owner-approved live-send sprint. | 2026-07-05 |
| D-013 | n8n execution HOLD until an automation sprint defines live gates, retries, failure handling. | 2026-07-05 |
| D-014 | Knowledge Objects are the fact source; consumers must not invent facts. | 2026-07-05 |
| D-015 | One intent = one canonical money page; redirect/noindex need owner-approved apply sprint. | 2026-07-05 |
| D-016 | RC2-04A owner legal/company values are the active legal baseline. | 2026-07-05 |
| D-017 | Missing live-export evidence is "unavailable", not implementation failure. | 2026-07-05 |
| D-018 | Living Documentation is a product layer; `AGOS-MASTER-STATUS.md` updated after every sprint. | 2026-07-05 |
| D-019 | Write/Live-Send/Restore/Observability/Idempotency gates must pass before production cutover. | 2026-07-05 |
| D-020 | Code surface inventory (AGOS-CODE-SURFACE-01) precedes any hardening/refactor. | 2026-07-05 |

The ledger labels these "Permanent Decisions ... that future sessions must not re-litigate without owner approval". `master-status/AGOS-MASTER-STATUS.md` "Current Owner Decisions" restates D-002/004/005/008/009/010/011-014/015 and adds four *pending* decisions: homepage direct `wp_mail()` path, tours webhook/n8n, legacy booking aliases, "GTM/dataLayer, Google Places, Investor Vault, and AGWP render pilot".

### 2.4 Master status / indexes / knowledge

- `master-status/AGOS-MASTER-STATUS.md` ("FROZEN by AGDOCS-03", 2026-07-05): Current Sprint "AGDOCS-03"; Blocked: production, Hetzner, SMTP, WhatsApp, n8n, DB import, "RC3 candidate build: HOLD"; "RC3 is not ready ... Production is not ready ... Hetzner remains HOLD." Gate table: Write PARTIAL, Live-Send HOLD, Restore PARTIAL, Observability PARTIAL, **Idempotency PARTIAL ("webhook/retry safety pending")**, Release Scope PARTIAL, Legal/KVKK PARTIAL. P0 blockers: "Homepage live pilot direct `wp_mail()`", "Tours webhook/n8n path must be gated under Live-Send and Idempotency rules", "Tours submit AJAX tied to live-capable integration". Runtime paths are all local Mac paths (`/Users/a1453/Local Sites/alanyagroup-local/...`).
- `master-status/CURRENT-SPRINT.md` says "AGDOCS-02 is active" (conflicts with master status "AGDOCS-03"); `master-status/ROADMAP.md` recommends "AGOS-CODE-SURFACE-02" as next while master status lists SEL-239 / AGOS-CODE-SURFACE-02 as *completed*. Stale.
- `indexes/proof/PROOF-INDEX.md` (generated 2026-07-09) lists ~200 proof folders (git-ignored) including post-freeze work the master status does not know about: `AGOS-RC3-FREEZE-01-20260707`, `AGOS-RC4-FREEZE-01-20260708`, `AGOS-HETZNER-PREFLIGHT-01/02`, `AGOS-HETZNER-REHEARSAL-01..03`, `AGOS-HETZNER-SAFE-PREP-01`, `AGOS-HOSTED-QA-01..08A`, `RC5-*` (2026-07-09), `AGOS-UNIFIED-RUNTIME-01`, `AGGIT-00`.
- `indexes/sprints/SPRINT-INDEX.md` (2026-07-09) lists 300+ documents; **115 of them do not exist in the tracked tree** (e.g. `AGOS-AUDIT-03-EXECUTIVE-REVIEW.md`, `AGOS-CODE-SURFACE-01/02.md`, `SEL-205*..SEL-209*`, `CLONE-*`, `RECOVERY-*`, `REDIRECT-*`, `AGVOUCHER-v1.0-FREEZE.md`, `CHROME-LAYER-v1.0-FREEZE.md`, `AGOS-MIGRATION-*`, `SOURCE_IDENTITY_PROOF.md`, `STAGING_BACKUP_PROOF.md`).
- `knowledge/KNOWLEDGE-SOURCES.md`: "Total promoted documents: 35"; `knowledge/verify-promotion.py` run here: `promoted=38 OK=38 NOT_OK=0 KNOWLEDGE_ENGINE_STATUS=OK` (38 because it also counts `knowledge/*.md`).
- `architecture/AGCOS-ARCH-01.md` ends with `AGCOS_ARCH_01_STATUS=READY_FOR_OWNER_REVIEW`, `READY_FOR_CODEX_IMPLEMENTATION=NO`, `NEXT_REQUIRED_ACTION=OWNER_REVIEW_AND_ARCHITECTURE_FREEZE`, while its promotion header claims "Original approval: Owner architecture freeze (AGCOS-ARCH-01 → READY_FOR_OWNER_REVIEW, frozen)". Appendix asks the owner to freeze A1–A7 (authority in Capability Layer, deterministic orchestrator, tier table, injection rule, maturity lifecycle, build order, interfaces inherit gate).

**Which owner decisions are recorded as final:** D-001..D-020 (ledger) and the master-status "Current Owner Decisions". Everything else (RC3 scope, live sends, Hetzner, Option A/B/C booking rollout, AGCOS-ARCH freeze) is recorded as pending/HOLD or as "owner-governed" promotion, not as an explicit dated owner GO text. No verbatim Owner GO statement in the template format exists anywhere in the repo.

---

## 3. Alanya booking evidence (`AG_BOOKING_*`)

### 3.1 Inventory statistics (computed from the CSVs, matching the summaries)

`AG_BOOKING_COVERAGE_INVENTORY.csv` (SEL-123, 2026-06-24): 906 rows; `http_status` 200 = 906; `booking_engine`: none 699, agsc-v6 192, ag_home 13, c6 2; `coverage_status`: NO_RENDERED_BOOKING_FORM_REVIEW 699, COVERED_TEMPLATE_AGSC_V6_STANDARDIZATION_CANDIDATE 192, COVERED_CANONICAL_AG_HOME 13, COVERED_LEGACY_C6_MIGRATION_CANDIDATE 2; `page_type`: post 633, page 273; `owner_go=false` ×906, `mutation_performed=false` ×906. Evidence source values include "SEL-121 apply + SEL-122 rendered monitor overlay: exactly one ag_home form" (2 rows: 34004, 33975).

`AG_BOOKING_PRIORITY_MATRIX.csv` (SEL-124): 699 rows (posts 629, pages 70). `AG_BOOKING_PRIORITY_SUMMARY.md`: MUST_HAVE_BOOKING 466, SHOULD_HAVE 124, NO_BOOKING_NEEDED 92, EXCLUDE_SYSTEM 17; batches: B1 top revenue 94, B2 hotel transfer 321, B3 tours 51, B4 destination guides 16, B5 optional 108; language scope EN 521 / NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE 178. `AG_BOOKING_BATCHES.md`: "These batches are not approved for execution." `AG_BOOKING_COVERAGE_BATCH_PLAN.md`: Batch 0 evidence holds all 0; Batch 1 preserve 13 canonical; Batch 2 legacy c6 (31925, 31889); Batch 3 agsc-v6 192.

### 3.2 Did a live WordPress mutation happen? **Yes — one, scoped, on 2026-06-24 (SEL-121).**

`AG_BOOKING_OPTION_B_APPLY_01_REPORT.md` ("Mode: OWNER GO scoped only to the two approved URLs below"):
- Targets: `/grand-okan-hotel-alanya-transfer/` → page **34004**, `wp/v2/pages/34004`; `/tours/alanya/atv-safari/` → page **33975**, `wp/v2/pages/33975`.
- Inserted block: `<!-- wp:shortcode -->[ag_home_booking context="transfer_landing" default_service="transfer" layout="compact"]<!-- /wp:shortcode -->`.
- "Only `content` was updated through authenticated WordPress REST. No other REST fields were sent." REST 200; modified "2026-06-24 19:56:41 / GMT 16:56:41" (34004) and "19:56:42 / 16:56:42" (33975); raw length 13,792→13,927 and 11,349→11,485; "Canonical marker count 1; Ends with inserted block yes".
- Before-DOM gate: both 0 forms, "PASS"; after-DOM: exactly 1 distinct `ag_home` form, no literal shortcode, "PASS".
- Backups/rollback: `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/34004_...before.content.raw.txt`, `...rollback.content.raw.txt`, `33975_atv-safari.before/rollback...`, `MANIFEST.json`, `READBACK_AFTER.json`, `planned-after`, `after` files. **This directory is git-ignored (`.gitignore`: `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/`) and is not in the repo.** SEL-204 confirms it existed locally ("rollback raw-content files inside `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/`").
- Owner GO evidence: the report asserts "OWNER GO was used only for the two approved URLs in this task" but **no Owner GO text, ID, or timestamp is quoted or stored** anywhere in the repo. `AG_BOOKING_OPTION_B_OWNER_GO_TEMPLATE.md` still says `owner_go=false / approved_ids=[] / status=HOLD` and `AG_BOOKING_OWNER_DECISION_CHECKLIST.md` still has "[x] No option selected yet." — both same date. **Owner GO for SEL-121: asserted, unverified.**

Verification after apply: `AG_BOOKING_OPTION_B_PILOT_MONITOR_01_REPORT.md` (SEL-122, 2026-06-24): desktop 1366×900 and mobile 390×844, HTTP 200, exactly one `ag_home` form, 0 console errors, no horizontal overflow, "PASS"; warning: "google.maps.places.Autocomplete is not available to new customers" deprecation; note "`/grand-okan-hotel-alanya-transfer/` still has an empty rendered H1".

Other AG_BOOKING files are read-only: `AG_BOOKING_OPTION_B_PREFLIGHT_01.md` (SEL-120, read-only DOM protocol + JS helper), `AG_BOOKING_OPTION_B_DOM_VERIFY_REPORT.md` (controls 4/4 PASS, gaps 4/4 confirmed 0 forms, old-c6 2/2), `AG_BOOKING_OPTION_B_TARGETS.csv` (10 rows, all `owner_go=false`), `AG_BOOKING_OWNER_DECISION_01.md` (Options A/B/C; recommends "Option B first"; "Current status: HOLD / owner_go=false"), `AG_BOOKING_OWNER_DECISION_RISK_MATRIX.md`.

### 3.3 Rollback

`AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md` is a SEL-120 *pre*-plan: "No rollback artifact is created by SEL-120 ... Restore the saved original `content.raw`. Re-run rendered DOM verification." The real rollback material for the SEL-121 mutation exists only in the ignored local folder. No rollback was executed. `AG_ADMIN_CMS_07_ROLLBACK_NOTES.md` covers only local plugin deactivation (with hard-coded Local.app socket paths).

---

## 4. `agbooking_hero_transfer_tour_final.html` (17,386 bytes)

Static hero mock-up; `<title>AGOS Transfer + Tours Booking Hero</title>`. **There is no `<form>` element, no `action=`, no `type="submit"`, no `fetch`/XHR, no `href`, no `tel:`/`mailto:`/`wa.me` link** (grep confirmed). Both CTA buttons are `type="button"` with no JS handler.

Fields (Transfer panel, `#panelTransfer`): `#from` text "Pickup location"; `#to` text "Drop-off location"; `#transferDate` `datetime-local` (min/default = now); `#passengers` readonly text "1 Adult" with −/+ buttons, limits `{min:1,max:60}`; "+ Add Return" popover with `#returnDate` (date) and `#returnTime` (time); CTA "Search Transfer →". Tour panel (`#panelTour`): `#hotel` text "Select hotel or area"; `#activity` select options "All Activities, Jeep Safari, Boat Trip, Rafting, Buggy / Quad, Land of Legends"; `#tourDate` date; `#adults` (min 1, max 60, default 2); `#children` (min 0, max 60); CTA "Search Tours →".

- **Email field: none. Nothing is `required`.** No name/phone field either.
- **Seat selection / seat map: none.**
- **Pricing logic/JS: none.** JS only handles tab switching, the return popover, date defaults, and passenger counters. No shuttle tiers, no private/VIP prices, no currency.
- Payment wording: subtitle "Comfortable, reliable and confirmed by WhatsApp. Pay in vehicle where applicable."; trust strip "💳 Pay in vehicle — No online payment", "🛡️ Confirmed by WhatsApp — Final details checked", "✈️ Flight tracking — Airport pickups monitored", "🎧 Local experts — Professional support".
- Copy: kicker "Private, VIP & Shuttle"; H1 "Antalya Airport Transfers" (tour mode: "Tours & Activities in Alanya"; "Choose your tour, hotel pickup and guest count. Send one structured request for availability.").
- **TÜRSAB number: none. Phone number: none. Distance/duration claims: none. Cancellation wording: none.**
- External dependencies: two Unsplash background images (`https://images.unsplash.com/photo-1436491865332-...`, `...photo-1507525428034-...`) — third-party hotlinks, no rights note.

---

## 5. n8n / WhatsApp / operations architecture (TRANSFER, INBOX, WHATSAPP, BRIDGE, REVIEW_LOOP, AGSYNC, SEL-149..156)

### 5.1 Intended architecture (summary)

- **TRANSFER_01..04 (SEL-135..139, 2026-06-25):** read-only transfer-domain projection over the 906-row registry: entities `ag_transfer_route_profile`, `ag_hotel_transfer_profile`, `ag_transfer_booking_owner_state`, `ag_transfer_owner_go_packet`; "One page has one booking owner"; "No global owner-go flag should exist"; Hook 4 n8n dry-run router "workflow inactive; manual trigger only; no WordPress nodes; no HTTP/Webhook nodes; no DB nodes; no credentials". TRANSFER_02 projection: 200 route candidates, 430 hotel candidates, 5 draft packets. TRANSFER_04 browser QA: "BROWSER AUTH BLOCKED", installed plugin copy lacked the transfer files.
- **INBOX_01..04 (SEL-145..148):** one Operations Inbox over WhatsApp/Gmail/website forms/phone notes/manual imports; "The Operations Inbox is not a messaging system in phase 1. It is an evidence and review layer."; 13 queues, 14 statuses; forbidden transitions "to `MESSAGE_SENT`, `SHEET_WRITTEN`, `BOOKING_CONFIRMED`, `PAYMENT_CONFIRMED`, `WORKFLOW_ACTIVE`, `WORDPRESS_UPDATED`"; INBOX_02 fixture = 11 WhatsApp samples + 3 synthetic phone notes = 14 items, 28 missing-info fields, 0 safety violations (independently cross-checked by "Claude ... 77 checks, 0 failures").
- **WHATSAPP_01..05 (SEL-140..144):** classifier routes `NEW_RESERVATION_DRAFT, QUOTE_REQUEST, MISSING_INFO, CHANGE_REQUEST, CANCELLATION_REQUEST, PAYMENT_REVIEW_REQUIRED, URGENT_ACTIVE_TRIP, SUPPLIER_OR_INTERNAL, NON_BOOKING_SUPPORT, SPAM_OR_UNRELATED, OWNER_REVIEW_REQUIRED, BLOCKED`; Google Sheets tabs spec'd (`INBOX_QUEUE_DRAFT`, `RESERVATION_DRAFTS`, `MISSING_INFO_QUEUE`, `OWNER_REVIEW_QUEUE`, `AUDIT_LOG_DRY_RUN`) but "No Google Sheets write"; WHATSAPP_04: "BLOCKED BEFORE IMPORT ... n8n MCP ... `Auth error: OAuth authorization required` ... `curl: (7) Failed to connect to localhost port 5678`"; WHATSAPP_05 options A (manual redacted payload, recommended) → E (webhook receiver, "conflicts with the current rule: No webhook activation").
- **AG_PLATFORM_AUTOMATION_BRIDGE_01..03 (SEL-130/131):** `AG Platform Registry -> n8n router dry-run payload -> Codex/Review -> Owner GO packet draft`; routes `DRAFT_OWNER_GO_PACKET / NEEDS_EVIDENCE / OWNER_GO_REQUIRED / BLOCKED / EXCLUDED_NO_ACTION`; BRIDGE_03: "BLOCKED BEFORE IMPORT" (same OAuth/localhost blockers).
- **AG_N8N_REVIEW_LOOP_01 (SEL-119, 2026-06-24):** review of Codex reports → `READY_NEXT_PROMPT / NEEDS_EVIDENCE / OWNER_GO_REQUIRED / BLOCKED`, "prepares a Linear comment draft. It does not post the comment and does not call Linear."
- **AGSYNC_OPS_01/02 (`PASS_NO_MUTATION`):** "Every successful booking must follow this order: 1. Persist in Booking DB. 2. Sync to Master Operations Sheet. 3. Sync to the matching Category Sheet. 4. Sync to the matching Supplier / Driver / Operator Sheet. If Booking DB persistence fails, no downstream sync is allowed." Statuses `New → Assigned → Sent to Supplier → Supplier Confirmed → Driver Assigned → Customer Confirmed → Voucher Ready → Completed | Cancelled | Problem`. 13 category sheets. Fixture booking `AG-REQ-2026-000136` (post 305, AYT→Alanya, 2 pax, standard, 150 EUR, `payment_method pay_in_vehicle`, `notification_mode dry_run`).
- **SEL-149..156:** SEL-149 "AUTH PROFILE ISOLATED"; SEL-150 PASS via Local.app one-click admin (`localwp_auto_login=1`) — 14 rows, 28 copy buttons, 0 POST forms; SEL-151 FAIL (390px overflow, plugin width 1226px); SEL-152 PASS (CSS/view patch); SEL-153 PASS recheck; SEL-154 classification QA PASS; SEL-155 pipeline QA PASS (14→14→14 packets, 8 owner-review rows, 0 duplicate IDs); SEL-156 "MILESTONE 01 CERTIFIED ... local read-only Operations Inbox Foundation only ... Production Ready: NOT READY".

### 5.2 Answers to the specific questions

| Question | Finding (with evidence) |
|---|---|
| System of record | Booking DB (WordPress `agp_booking` post type per AGSYNC_OPS_02 fixture) is "the first durable persistence point"; "Master Operations Sheet is the operational queue"; "n8n is orchestration, not source of truth"; "Supplier sheets ... must not become booking source of truth" (`AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md`). Entity layer: "AGOS entity registry is the source of truth. WordPress is a publishing layer." (`AGENTITY_01_ENTITY_GOVERNANCE.md`); "Knowledge Objects are the fact source" (D-014). For the WhatsApp/inbox intake there is **no persistent store designed at all** — items live in CSV/JSON fixtures and "local markdown/CSV/JSON review artifacts" (WHATSAPP_05 privacy retention). |
| Does n8n hold the only copy of a customer request anywhere? | By design no: workflows are "Manual Trigger ... Code ... NoOp" with embedded samples; no persistence node, no queue. But the *future* Option C/D/E intake paths (`WHATSAPP_05_N8N_INTEGRATION_OPTIONS.md`) read from email/WhatsApp into "Draft payloads only" with no defined durable sink — so if built as specified, the n8n execution log would be the only copy. Gap, see §9. |
| HMAC / signature verification | **None.** `grep -rniE 'hmac|signature|signed'` over all md/json returns nothing. Webhook receivers are explicitly excluded ("No webhook activation"), so no inbound verification design exists; also no signing for outbound payloads. |
| Idempotency / replay protection | Spec-only: `request_id` is "the canonical dedupe key across all sync targets"; `booking_payload_hash` (sha256 over 13 canonical fields); `sync_attempt` increments; "Payload hash mismatch sets `sync_status=Hold` and `status=Problem`"; duplicate states `UNVERIFIED_NO_SHEET_READ`, `DUPLICATE_IN_MASTER_PREVIEW`, `CONFLICTING_PAYLOAD_HASH` (`AGSYNC_OPS_01_DUPLICATE_PREVENTION_PLAN.md`, `AGSYNC_OPS_02_...SPEC.md`). Inbox collision key "`source_channel + source_evidence_ref + thread_id + message_id`" (`WHATSAPP_05_GOOGLE_SHEETS_WRITE_GATE.md`). Master status: "Idempotency Gate PARTIAL — webhook/retry safety pending". Nothing implemented. |
| Retry / dead-letter | No dead-letter concept anywhere (grep `dead-?letter` empty). Retry only as rules: "A row may be retried only with the same `request_id` and an incremented `sync_attempt`"; D-013: "n8n execution is HOLD until a dedicated owner-approved automation sprint defines live execution gates, retries, and failure handling." STOP-RULES: "Worker unavailable/errors → task HOLD; no silent skip". |
| Redaction | Specified: masking standards "+90 *** *** 1234", "jo***@gmail.com", booking ref last 3–4 chars, "do not ingest attachment files; do not OCR receipt images" (`WHATSAPP_05_PRIVACY_AND_DATA_MINIMIZATION.md`); INBOX privacy filter blocks credentials/tokens/webhook URLs/card/passport data. Implemented only as a keyword check inside `WHATSAPP_03` Code node ("secretMarkers = ['api_key','apikey','access_token','bearer ','client_secret','password=','private_key','webhook_url']") and in `agcos-core` `util.redact()`. Fixture phones are masked (`+90 *** *** 1001`). |
| Supplier acceptance / timeout / fallback | Statuses `Sent to Supplier → Supplier Confirmed`; SLA flags "`sla_supplier_unconfirmed_over_30m`, `sla_driver_unassigned_24h_before_pickup`, `sla_customer_unconfirmed_12h_before_pickup`, `problem_open_over_15m`" ("planning defaults and require owner review"). **No timeout action, no fallback supplier, no re-dispatch or escalation automation is defined**; "Driver assignment may be manual first. Automated assignment remains HOLD". |
| Manual confirmation gate | Yes, pervasive: every artifact carries `owner_go=false`; "`Customer Confirmed`: Customer-facing confirmation approved/sent after OWNER GO"; "Sent to Supplier: Future live send completed after OWNER GO"; D-011/D-012 email dry-run / WhatsApp draft defaults; INBOX forbids `MESSAGE_SENT`/`BOOKING_CONFIRMED`/`PAYMENT_CONFIRMED` transitions. |

### 5.3 Workflow JSON inspection (parsed with Python; credentials by name only)

| File | active | Nodes (type) | HTTP/webhook | Credentials referenced | Hard-coded hosts/URLs | Secrets embedded |
|---|---|---|---|---|---|---|
| `AG_PLATFORM_AUTOMATION_BRIDGE_02_WORKFLOW.json` ("AG_PLATFORM_AUTOMATION_BRIDGE_02 (DRY_RUN manual bridge)") | false | 7: stickyNote, manualTrigger, code×4 (Load sample payload / Validate schema / Apply routing rules / Build Owner GO packet drafts), noOp | none | none (`credentials` absent on every node) | none | none; words "secret/token" appear only inside a detection regex (`use.{0,20}(credential|secret|token)`) |
| `WHATSAPP_03_N8N_WORKFLOW_DRY_RUN.json` ("WHATSAPP_03 (Manual DRY_RUN sample classifier)") | false | 10: stickyNote, manualTrigger, code×7, noOp | none | none | none | none; `api_key/apikey/bearer/password` appear only in the `secretMarkers` denylist array |
| `AG_N8N_REVIEW_LOOP_01_WORKFLOW_DRY_RUN.json` | false | 8: stickyNote, manualTrigger, set v3.4 ("Sample Codex Report", pinData 4 items), code×4, noOp ("Linear Comment Draft (No Send)") | none | none | none | none |
| `AG_N8N_AI_COMMAND_CENTER_02_WORKFLOW_B_MEDIA_LIBRARY_AUDITOR_DRY_RUN.json` ("Workflow B (Media Library Auditor, DRY-RUN)") | false | 8: manualTrigger, code ("Config (DRY-RUN)"), **httpRequest v4.3 "Read Media"**, **wordpress v1 "Read Pages"**, **wordpress v1 "Read Posts"**, code ("Audit Engine"), noOp "Email Report — configure SMTP (DISABLED)" `disabled:true`, noOp "WhatsApp — configure Meta (DISABLED)" `disabled:true` | **Yes: HTTP GET `https://www.alanyagroup.com/wp-json/wp/v2/media`** with `authentication: genericCredentialType`, `genericAuthType: httpBasicAuth`, query `per_page=100`, `context=edit`, pagination `updateAParameterInEachRequest` until `responseIsEmpty`, `limitPagesFetched: false`; WordPress nodes `authType: basicAuth`, `operation: getAll`, `limit 60`, `options.context: edit` | No credential object bound; notes say "TODO: Owner attaches a Generic Basic Auth credential for the WordPress Application Password in the n8n Credentials UI" (README: "`Read Media`: attach a Generic Basic Auth credential containing the WordPress Application Password"). **Credential name is not fixed; value absent.** | `site_base_url: 'https://www.alanyagroup.com'` (**production host**) | **No secrets, but PII is embedded in the Config node: `report_email` = a personal `@hotmail.com` address (value present, not reproduced here) and `report_whatsapp` = an unmasked `+90 5…` mobile number** (the only unmasked phone in the repo). `folder_keyword_map` for alanya/antalya/belek; `approved_ids: []`. |
| `AG_PLATFORM_AUTOMATION_BRIDGE_01_N8N_DRY_RUN_PAYLOADS.json` | n/a (payload file, not a workflow) | 5 sample packets | none | none | none | none |

Mutation nodes: none in any workflow (no wordpress update/create, no sheets append, no emailSend, no whatsApp, no executeWorkflow). Repo-wide scan for secret-shaped strings (`sk-…`, `AKIA…`, `ghp_…`, `xox…`, JWT, PEM blocks): **0 hits**.

---

## 6. `ag-platform-v2-admin-cms/` PHP plugin

**What it is:** "AG Platform V2 Admin CMS — Local/staging read-only registry screen for AG Platform V2 fixture review", version 0.1.0, "Requires PHP: 8.1", `define('AG_PLATFORM_V2_ADMIN_CMS_READ_ONLY', true)`. It loads bundled CSV/JSON fixtures (`fixtures/AG_BOOKING_COVERAGE_INVENTORY.csv` 359 KB, `fixtures/AG_BOOKING_PRIORITY_MATRIX.csv` 366 KB, `fixtures/INBOX_02_*`) into memory and renders 8 admin screens under a top-level "AG Platform" menu: Read-Only Registry, Transfer Overview, Transfer Routes, Hotel Transfers, Booking Owner Review, Draft Owner-GO Packets, Evidence Detail, Operations Inbox. Interactions: GET filters (`$_GET['engine'|'status'|'priority'|'s'|'paged'|'work_class'|'route'|'target'|'source_type'|'queue'|'classification_route']`, all through `sanitize_text_field(wp_unslash(...))`), pagination (50 rows/page), and clipboard copy (`assets/admin.js`, `.agcms-copy[data-copy]`).

**Environment guard** (`includes/class-environment-guard.php`): `ALLOWED_TYPES = ['local','development','staging']`; type from `wp_get_environment_type()` or `WP_ENVIRONMENT_TYPE`, else `'unknown'`. If not allowed: `register_menu()` returns early (no menu), `render()` calls `wp_die('AG Platform registry is read-only and unavailable for this context.')`, and an `admin_notices` warning "AG Platform registry is disabled outside local/staging safety mode." is printed on every admin page.

**Capabilities** (`class-capabilities.php`): single capability `manage_options`, checked via `current_user_can` at menu registration and render time.

**Hooks** (`class-plugin.php`): only `admin_menu`, `admin_enqueue_scripts`, `admin_notices`, guarded by `is_admin()`. No activation/deactivation hook, no `init`, no REST, no AJAX, no cron, no nonces (not needed: GET-only reads). Read-only confirmed by scan: no `wp_update_post/wp_insert_post/update_option/$wpdb->…/wp_remote_post/wp_mail/register_rest_route/admin_post_/wp_ajax_/add_shortcode/…` in `includes/`, `views/`, `assets/`.

**Scripts:** `bin/safety-scan.php` = denylist string scan (36 markers) over `ag-platform-v2-admin-cms.php`, `includes/`, `views/`, `assets/`; `bin/qa-local.php` = loads fixtures, projects, validates, exercises transfer/inbox projectors, prints JSON, exit 1 on non-PASS.

**Results in this environment (PHP 8.4.19 CLI, no WordPress):**
- `php -l` on all 26 PHP files (1 main, 2 bin, 12 includes, 11 views): **"No syntax errors detected" ×26.**
- `php bin/qa-local.php`: **`"status": "PASS"`, exit 0** — projected_rows 906, rows_per_page 50, coverage 906/priority 699/joined 699/unjoined 0, owner_go_true 0, mutation_performed_true 0, write_status_not_read_only 0, ag_home 13 / c6 2 / agsc-v6 192 / none 699, registry_status BLOCKED_UNSAFE 14 / EXCLUDED_SYSTEM 17 / OWNER_REVIEW_ONLY 682 / READY_READ_ONLY 193; transfer screens 200 routes / 430 hotels / 906 owner-state rows / 5 packets; operations inbox 14 items, 14 evidence rows, 13 queue rows, 14 packets.
- `php bin/safety-scan.php`: **`"status": "PASS"`, `"hits": []`, exit 0.**

**Could it run on production?** It can be *installed and activated* on production (no activation-time guard, no fatal), but with `WP_ENVIRONMENT_TYPE` unset/`production` the UI is disabled and it performs no reads beyond fixture files, no writes, no network. Residual concerns: (a) it ships ~725 KB of production URL/ID/title inventory as plugin fixtures; (b) a production site misconfigured as `staging` would expose the screens to any `manage_options` user; (c) the guard is a UI gate, not an execution gate. It is genuinely read-only.

---

## 7. `agcos-core/` (Python)

**What it is:** "AGCOS Core — Capability Operating System (T0 Foundation) ... **T0 read-only only.** No production, no network, no mutation of anything outside its own ignored runtime tree." Deterministic orchestrator (`orchestrator/orchestrator.py`, `state_machine.py`) implementing the AGCOS-ARCH-01 state machine; typed capability contracts + registry (registry "refuses to register any executable capability above T0"); SQLite state store; hash-chained Audit Engine; metadata-only Knowledge Engine; three T0 capabilities (`git.repo_status`, `proof.index_summary`, `system.local_health`); AGWORKER-01 propose-only worker layer (5 deterministic local adapters, provenance gating, injection detection); AGTERM read-only console (`src/agterm/`, SQLite `mode=ro`); CLI `python -m agcos.cli`. `pyproject.toml`: `requires-python = ">=3.12"`, `dependencies = []`, dev `pytest>=8` "NOT installed ... no-network boundary". Environment here: Python 3.11.15 (below declared minimum; tests still import).

**Test run (honest result):**
- `python3 -m pytest -q` → `No module named pytest` (not installed).
- `PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"` → **`Ran 104 tests ... FAILED (failures=4, errors=15)`**.
- Root cause of all 19: **`ModuleNotFoundError: No module named 'agcos.proof'`**. `src/agcos/proof/` does not exist in the repo, yet it is imported by `src/agcos/bootstrap.py:12`, `orchestrator/orchestrator.py:26`, `workers/runtime.py:25`, `tests/test_proof_engine.py`, `tests/test_worker_runtime.py`, and `ARCHITECTURE.md` documents `proof/proof_engine.py (7 canonical files, redacted)`.
- Why it is missing: `git check-ignore -v --no-index agcos-core/src/agcos/proof/proof_engine.py` → **`.gitignore:56:proof/`** — the evidence-folder ignore rule matches the Python package directory, so the proof engine was never committed.
- Consequence: `python3 -m agcos.cli status` fails at import; 7 test modules fail to import (`test_agterm_console_app`, `test_agterm_data`, `test_agterm_r1_hardening`, `test_agterm_screens`, `test_proof_engine`, `test_worker_cli_agterm`, `test_worker_runtime`); 8 `test_t0_capabilities.TestT0Capabilities` errors; 4 `TestCliSmoke` failures (`AssertionError: 1 != 0`). The remaining 85 tests (audit engine, capability contract, knowledge engine, registry, state machine, state store, worker artifacts/assignment/contracts) pass.
- `knowledge/verify-promotion.py` (uses only `agcos.knowledge` + `agcos.state`) works: `promoted=38 OK=38 NOT_OK=0`.

The HEAD commit is "Merge PR #5: AGTERM-02-R1 defense-in-depth hardening" whose PR rules require "Pass all tests; include the command + result" — as merged, the tracked tree cannot pass its own suite.

---

## 8. Roadmap and spec families

**`AGOS_MASTER_ROADMAP_2026_V2.md` (2026-06-29):** "AGOS remains a rebuild-and-migrate operating system, not a direct clone of the old WordPress site." 21 modules (AGDS, AGSEO, AGMEDIA, AGCONTENT, AGSCHEMA, AGBOOKING, AGAI, AGN8N, AGVIDEO, AGVOICE, AGSOCIAL, AGMIG, AGDEPLOY, AGINTL, AGDAM, AGSILO, AGREGION, AGACTIVITY, AGHOTEL, AGCANONICAL, AGREDIRECT). Evidence baseline: booking Sprint 17–22 ("`PASS_STAGING_UPLOAD_REHEARSAL_COMPLETE_HOLD_FOR_NEXT_OWNER_GO`"), LOCAL-CONTENT-04 "Live inventory: 339 pages, 634 posts, 2636 attachments. Local inventory: 86 pages, 1 post, 11 attachments ... Decision: `HOLD_IMPORT`". AGDEPLOY: "Hetzner server exists. Docker stack exists. Caddy routes `app.alanyagroup.com` to `agos-wordpress` ... MariaDB, Redis, n8n, Portainer exist." Final verdict lists HOLD items and "What Needs OWNER GO".

**`AGOS_NEXT_30_SPRINTS.md`:** 30 planning sprints (GOV-01 … AGMIG cutover readiness), every one "Forbidden: production/live sends"; Sprint 14 "AGN8N Workflow Registry", Sprint 15 "AGN8N Booking Notification Dry-run Harness".

**`AGOS_MODULE_STATUS_MATRIX.csv`:** 21 rows; production_readiness = HOLD for all; AGBOOKING `STAGING_UPLOAD_REHEARSAL_PASS / READY_FOR_STAGING_QA`; AGN8N `DRY_RUN_ONLY`; AGINTL `DECISION_RECORDED (SEL-191)`; AGDEPLOY `STAGING_INFRA_EXISTS / PARTIAL`.

**`AGOS_RISK_REGISTER_V2.md`:** R1–R20; Critical: R1 content parity, R2 bulk DB import, R6 redirects/canonical, R13 DNS cutover; R5 "Notifications could accidentally send live messages", R10 "n8n credentials or workflows could mutate production", R16 "Booking coverage gaps remain across 699 URLs", R18 "Staging proof can be mistaken for production readiness".

**AGENTITY (AGENTITY_01_*):** universal entity model — "WordPress is not the source of truth. WordPress is one publishing layer"; 24 prefixed entity IDs (`brand_`, `dest_`, `region_`, `airport_`, `route_`, `vehicle_`, `hotel_`, `activity_`, … `workflow_`), lifecycle, relationship graph, governance ("No proof means no production"), `AGENTITY_01_ENTITY_FIELDS.csv`.

**AGGRAPH (AGGRAPH_01_*):** Neo4j-style conceptual graph, `NODE_TYPE_COUNT=38`, edge types CSV (e.g. `USES_PRICE_MATRIX … NEEDS_SOURCE, "live fare change"`), read-only queries; "It does not deploy Neo4j".

**AGMEDIA (AGMEDIA_01..03):** enterprise media library taxonomy (8 taxonomy rows, 12 asset types, 22 required fields, 8 policies); "No old media bulk import"; AI media boundary; rights/proof model; package completeness; classification templates; "Production remains HOLD".

**AGSEO (AGSEO_01/02):** master silo map (`SILO_COUNT=10`, 12 page types, 14 internal-link rules), canonical owner matrix/rules ("One intent equals one canonical owner"), URL dependency matrix, manual review queue, action candidates (`keep_existing_local … manual_review`, all `planning_only`, `requires_owner_go_before_apply=yes`); "The direct diff/classification files were not present in the repository root".

**AGCP (AGCP_01..04):** Visual Control Panel design — 11 screens, widget/data contracts, read-only API concept ("must not expose POST/PUT/PATCH/DELETE"), permission model (6 roles, "AGCP-01 has no mutation permissions"), trust/staleness states (`verified/stale/missing/conflicting/unreviewed`), OWNER GO Center field list, interaction/keyboard/search specs.

### 8.1 Requested mention extraction

- **Sultan Kebab / restaurant / Kielce / Poland:** Sultan Kebab appears only as a brand example: `AGOS_ENTITY_MODEL_MATRIX.csv:2` ("Alanya Group, Safe Line Travel, Sultan Kebab, Konak Homes"), `AGMEDIA_01_MEDIA_TAXONOMY.csv:2`, `AGENTITY_01_UNIVERSAL_ENTITY_MODEL.md:187`, `AGCP_04_FILTER_SPEC.md:14`, `AGOS_MASTER_ROADMAP_2026_V2.md:104` ("Define brand variation rules for Safe Line Travel, Sultan Kebab, Konak Homes, and future brands."). **Kielce: no mention. Poland: only `AGOS_MASTER_ROADMAP_2026_V2.md:307` "`pl.alanyagroup.com`: Polish."** "Restaurant" appears only as Antalya restaurant blog-post URLs in the coverage inventory (e.g. `/korean-restaurants-in-antalya/` 31033, which oddly is `COVERED_CANONICAL_AG_HOME`).
- **WJD / driver pool / job distribution:** no "WJD", "driver pool" or "job distribution" anywhere. Closest: `AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md` "## Driver Assignment Model ... `assignment_id, request_id, driver_id, supplier_id, vehicle_id, pickup_datetime, pickup_location, dropoff_location, driver_status, operator_notes` ... Driver assignment may be manual first. Automated assignment remains HOLD"; `AGSYNC_OPS_01_DRIVER_SHEET_SCHEMA.csv`; routing priority "1. `booking_category` 2. `vehicle_class` ... 5. `preferred_supplier_id` 6. `availability_status` 7. `manual_operator_override`".
- **Seat map / seat selection:** none. Only `AGSYNC_OPS_01_ROUTING_MATRIX.csv:2` "Route and pax count determine shuttle supplier and seat workflow" and `:8` "Provider routing by tour date pickup region and seat capacity"; `child_seat_count` fields in WHATSAPP models.
- **Email optional/mandatory:** no rule for the booking form. `AGSYNC_OPS_02` required fields for a booking: `request_id, booking_db_id, customer_name, customer_phone, booking_category, route_or_activity, pickup_datetime, passenger_count, price_amount, price_currency` (**email not required**), yet voucher generation requires "Price, pickup, dropoff, customer name, phone, **email**, date/time, passenger count, and request ID are present" (`AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md`). WHATSAPP/INBOX models: `customer_email_masked ... no / Only if supplied`. `WHATSAPP_05_REAL_INBOX_READ_ONLY_PLAN.md`: `"from_email_masked": "optional_masked_email"`. Hero HTML: no email field.
- **Shuttle / private / VIP pricing numbers:** D-008 / `master-status`: "Shuttle pricing: 1 passenger one-way = 30 EUR; 2 passengers one-way = 50 EUR." D-009 roundtrip ×2. `AGSYNC_OPS_02` fixture: `stored_price_amount 150`, `EUR`, vehicle `standard`, 2 pax, with return datetime. **No private or VIP price numbers anywhere.** `TRANSFER-R09`: "Route pricing displayed without verified source ... Mark pricing as `unknown` or `needs_verified_source`."
- **TÜRSAB numbers:** **none** (grep `türsab|tursab` empty).
- **AYT–Alanya distance/duration:** **no numeric claims.** Only fields: `AG_ADMIN_CMS_01_DATA_MODEL.md` "`distance_km` | decimal | Must distinguish AYT and GZP distances."; `duration` on `ag_tour`; risk `CMS-R08` "Gazipasa routes inherit Antalya distances/prices."
- **Cancellation policy:** no policy text. Only routing: `CANCELLATION_REQUEST` "Always human review. No cancellation confirmation is allowed" (`WHATSAPP_01_MESSAGE_CLASSIFICATION.md`); "Locate booking manually and review cancellation/refund policy" (`WHATSAPP_02_OPERATOR_REVIEW_PACKETS.md`); INBOX `CANCELLATION_REVIEW` "same business day".
- **n8n boundaries:** `AGSYNC_OPS_01`: "n8n is orchestration, not source of truth"; "Future n8n must remain inactive and dry-run until OWNER GO"; `AGOS_MASTER_ROADMAP`: "Keep all workflows inactive by default ... Gate: no active workflow, webhook, WhatsApp, email, Sheets write, or WordPress mutation without explicit owner GO"; `AGOS_ROADMAP_V2_ENTITY_SYNC_NOTES.md`: "AGN8N | Workflows consume approved entity packets and remain dry-run by default"; `docs/git/GITHUB-SOURCE-OF-TRUTH.md`: "No production/SSH/Hetzner/WordPress/Docker/n8n access from this repository"; `AG_N8N_REVIEW_LOOP_01_ARCHITECTURE.md`: "SEL-118 established the safe orchestrator model: decision-only workflow; no mutation-capable nodes; `active:false`; no secrets"; D-013.
- **Multi-domain / site factory / domain manifests:** **no mention** of any of those terms. Closest: AGINTL "use multilingual subdomains, not WPML primary architecture" (`www/de/ru/pl/tr/ar.alanyagroup.com`; "no automatic IP/language redirect ... each language needs own sitemap, GSC property, canonical, hreflang") and the multi-brand `Brand` entity ("owns destinations; owns channels; owns language sites").

---

## 9. Defects, conflicts and gaps

### P0
1. **`agcos-core` is broken as committed: `src/agcos/proof/` missing because `.gitignore:56 proof/` swallows the Python package.** 19/104 tests fail/error, CLI (`python -m agcos.cli status`) cannot import, `ARCHITECTURE.md`/`SECURITY.md` describe a Proof Engine that is not in the source-of-truth. The PR rules ("Pass all tests") were not satisfiable by the tracked tree at HEAD `f420b0e`. Evidence: `git check-ignore -v --no-index agcos-core/src/agcos/proof/proof_engine.py` → `.gitignore:56:proof/`.
2. **Source-of-truth is materially incomplete for release/rollback claims.** D-004 "RC2 Golden Artifact is frozen" but no artifact, manifest, fingerprint or SHA256 is tracked; RC2/RC3/RC4/RC5 freeze/fingerprint/certification proof folders and the SEL-207/208 RC1 build/verification reports exist only in git-ignored `proof/`/`release/` or are absent (115 `SPRINT-INDEX` entries missing). Nothing in the repo can prove what RC2 is.

### P1
3. **Live production mutation (SEL-121, 2026-06-24, pages 34004 & 33975) has no reproducible rollback in the repo**: `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/` is git-ignored; Owner GO text is asserted but never quoted/stored; `AG_BOOKING_OPTION_B_OWNER_GO_TEMPLATE.md` (`approved_ids=[]`) and `AG_BOOKING_OWNER_DECISION_CHECKLIST.md` ("No option selected yet") were never updated, contradicting the apply report.
4. **PII committed:** `AG_N8N_AI_COMMAND_CENTER_02_WORKFLOW_B_MEDIA_LIBRARY_AUDITOR_DRY_RUN.json` Config node contains a personal `@hotmail.com` email and an unmasked `+90 5…` phone — violates `GITHUB-SOURCE-OF-TRUTH.md` ("personal data ... never lives here") and WHATSAPP_05 masking rules.
5. **Media auditor workflow targets production** (`https://www.alanyagroup.com/wp-json/wp/v2/media`, WordPress nodes with `context=edit`, unbounded pagination `limitPagesFetched:false`, `per_page=100`) and its README instructs attaching a WordPress Application Password credential — read-only but a production-touching artifact in a repo that declares "No production ... n8n access from this repository", and inconsistent with `WHATSAPP_01_N8N_DRY_RUN_FLOW.md` "Forbidden node types: HTTP Request ... WordPress".
6. **Master status is stale versus later evidence.** `AGOS-MASTER-STATUS.md` (frozen 2026-07-05) says "RC3 candidate build: HOLD", "Hetzner remains HOLD", while `PROOF-INDEX.md` (2026-07-09) records `AGOS-RC3-FREEZE-01-20260707`, `AGOS-RC4-FREEZE-01-20260708`, `AGOS-HETZNER-REHEARSAL-01..03`, `AGOS-HOSTED-QA-01..08A`, `RC5-*`. D-018 says the master status is updated after every sprint; it was not. `CURRENT-SPRINT.md` ("AGDOCS-02 is active") and `ROADMAP.md` (next = AGOS-CODE-SURFACE-02, already completed) also contradict it.
7. **No HMAC/signature, retry, dead-letter or timeout/fallback design exists for any inbound or outbound integration**; idempotency is spec-only (`request_id` + payload hash) and the Idempotency Gate is self-reported "PARTIAL". D-013 defers all of this. Any future WhatsApp/email intake (Options C–E) has no durable sink other than "local JSON/CSV" artifacts, so n8n execution data would become the only copy of a customer request.
8. **Review independence not achieved**: `PULL-REQUEST-RULES.md` admits "Claude Code is the only active engineering agent ... This is not fully independent review"; CODEOWNERS is a single handle.
9. **`.gitignore` vs release policy conflict**: `release/` and `RC*/` are ignored while `release/README.md` is tracked (force-added) and `RC-ALLOWLIST.md` lists `release/README.md` as RC content; `GITHUB-SOURCE-OF-TRUTH.md` says release packages never live in git. There is no defined, tracked location where a future RC manifest/SHA could be committed without overriding ignores.
10. **Referenced commits unverifiable / shallow clone**: `61f6cd0b…` (SEL-204B) and `39d19f0` (AGGIT-02) are not in the object store; no tags; history begins at the merge commit. Provenance chain cannot be audited from this checkout.

### P2
11. `architecture/AGCOS-ARCH-01.md` ends `AGCOS_ARCH_01_STATUS=READY_FOR_OWNER_REVIEW ... NEXT_REQUIRED_ACTION=OWNER_REVIEW_AND_ARCHITECTURE_FREEZE` while its promotion header (and `APPROVAL-MATRIX.md`, `CAPABILITY-TIERS.md`, `STOP-RULES.md`, `PROMPT-INJECTION-RULES.md`) claims "Owner architecture freeze ... frozen". The freeze is not evidenced in-repo.
12. `AGOPS-00.md` and `OWNER-RULES.md` carry "Last Updated: PLACEHOLDER: update after each sprint." in a "promoted verbatim" source-of-truth document.
13. Hero HTML (`agbooking_hero_transfer_tour_final.html`): no `<form>`, no submit wiring, no email/name/phone fields, no validation, passenger max 60 while D-008 defines shuttle pricing only for 1–2 pax; trust claims ("Flight tracking", "Pay in vehicle") and Unsplash hotlinked images have no source/rights proof (contrary to AGMEDIA rights policy). It is a mock-up, not a booking component, and does not reference the canonical `[ag_home_booking]` engine (D-006).
14. Email requirement inconsistency: booking required-field list omits `customer_email`; voucher generation requires email; hero form has no email — no single rule.
15. `KNOWLEDGE-SOURCES.md` says 35 promoted docs; `verify-promotion.py` counts 38 (includes `knowledge/*.md`) — minor index drift.
16. `agcos-core/pyproject.toml` requires Python ≥3.12; the audit environment is 3.11 (tests still run) — CI/runtime expectation undocumented for other environments.
17. Plugin ships 725 KB of production inventory as fixtures duplicated from the repo root (`ag-platform-v2-admin-cms/fixtures/*.csv` = root `AG_BOOKING_*.csv`), with no sync/drift check; environment guard is UI-only (plugin activates anywhere). SEL-203 already noted "Identical fixture mirrors between root files and `ag-platform-v2-admin-cms/fixtures`".
18. `SEL-156` "MILESTONE 01 CERTIFIED" certifies a fixture-only, Local.app-one-click-auth (`localwp_auto_login=1`) surface; it explicitly is not production or staging certification but the word "CERTIFIED" is used without a scope qualifier in the title.
19. Coverage inventory oddity: `/korean-restaurants-in-antalya/` (31033) is classified `COVERED_CANONICAL_AG_HOME` while sibling restaurant posts are no-form — flagged for manual review, not resolved.
20. Hard-coded local Mac paths (`/Users/a1453/...`, Local.app MySQL sockets) throughout governance, master status, and rollback notes — rollback procedures are not portable.
21. `AGOS_GOV_01_PROOF_TEMPLATE.md` / `PROOF-FOLDER-TEMPLATE.md` define `BACKUP_SHA256=` and `CHECKSUM_RESULT=` but no tracked proof fills them; checksums are "when practical", not mandatory.

### Unverified items (explicitly)
- Existence/content of any `proof/`, `backups/`, `quarantine/`, `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/` folder (all git-ignored).
- Owner GO text for SEL-121; the SEL-204B initial commit; the AGGIT-02 HEAD `39d19f0`; whether PR #5 tests passed in the author's environment (where `proof/` exists untracked).
- Live state of `www.alanyagroup.com` / `app.alanyagroup.com` today (no network calls were made by this audit).
