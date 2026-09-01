# 10 — Test and Evidence Index

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Captured 2026-09-01 (UTC).
Session: Linux container, egress-restricted; repositories cloned fresh; no production system touched.

## A. Evidence files in this package (`evidence/`)

| File | What it is | Proves |
|---|---|---|
| `main_auditor_evidence_notes.md` | main auditor's redacted notes E1–E7 | reachability, repo facts, mailbox signals, Drive docs, prior owner decisions |
| `repo_snapshot.md` | `git` facts for the five repos at capture time | HEAD shas, branches, file-type counts, clean worktrees |
| `agent_github_external.md` | GitHub API inventory of 5 repos (commits, PRs, tags, workflows) + web-search snippets for both domains + Semrush rows | branch/PR history, TÜRSAB 2165 live, distance/cancellation contradictions, seat-selection copy, Sultan third-party facts |
| `agent_mobility_cloud.md` | line-level audit of `agos-mobility-cloud` @ ca9b7fcd | booking/pricing/security/i18n defects; build results |
| `agent_agos_repo.md` | audit of `ALGRP/AGOS` @ f420b0e | release/provenance policy, governance, live mutation SEL-121, workflow JSON inspection, PHP/Python results |
| `mobility_cloud_npm-ci.log`, `mobility_cloud_lint.log`, `mobility_cloud_tsc.log`, `mobility_cloud_test.log` | raw tool output | §C results |

Prior evidence reused without modification (branch `claude/alanyagroup-final-completion-me48z5`, PR #1):
`reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/evidence/01_booking_coverage_analysis.txt` (906-URL DOM
inventory aggregates), `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/evidence/01_baseline_verification.md`
(runtime files absent), `tools/preflight_baseline_check.sh`.

## B. Verification methods and their reach

| Method | Used for | Reach |
|---|---|---|
| `git` + GitHub MCP API (read) | inventory, history, PRs, tags | full for all 5 repos (shallow local clones; API for history) |
| Filesystem read of clones | code/spec audit | full |
| `npm ci` / `npm run lint` / `npx tsc --noEmit` / `npm test` | agos-mobility-cloud build health | executed in session (§C) |
| `php -l`, `php bin/safety-scan.php`, `php bin/qa-local.php` | AGOS admin plugin | executed (PHP 8.4 CLI, no WordPress) |
| `python3 -m unittest discover` | agcos-core | executed (Python 3.11; pytest absent) |
| Gmail (read-only, owner mailbox) | live pipeline, provider notices, credentials lifecycle | full; PII excluded from package |
| Google Drive (read-only) | owner governance docs and specs | 40 hits reviewed, 6 read |
| Google Calendar (read-only) | booking calendar handoff | 0 events |
| Slack (read-only) | project traces | workspace empty of project content |
| WebSearch (indirect) | live copy snippets | 23 queries |
| Semrush MCP | organic metrics | 4 domain-rank rows, then API units exhausted (no keyword/URL lists, no site audit) |
| curl / WebFetch to live hosts | direct verification | **blocked (403 egress policy)** |
| Docker / host access | runtime state | **not available** (no daemon, host not mounted) |
| WordPress.com MCP | site list | ability disabled in account settings |

## C. Test results (executed in this session)

| Suite | Command | Result |
|---|---|---|
| agos-mobility-cloud install | `npm ci` | exit 0 |
| agos-mobility-cloud lint | `npm run lint` | **exit 1 — 2 errors** (`react-hooks/set-state-in-effect` in GlobalDirectoryView.tsx:78; `@next/next/no-html-link-for-pages` in representative/apply/page.tsx:36) |
| agos-mobility-cloud types | `npx tsc --noEmit` | **exit 2 — 40 errors** (33× missing `cloudflare:workers` types, `Fetcher`/`D1Database` undeclared, 5 implicit-any) — not part of any npm script |
| agos-mobility-cloud tests | `npm test` (vinext build + node:test) | exit 0 — build OK, 23/23 pass; tests are regex assertions over source, not behaviour |
| AGOS admin plugin syntax | `php -l` ×26 | 26/26 no syntax errors |
| AGOS admin plugin safety | `php bin/safety-scan.php` | PASS, 0 hits |
| AGOS admin plugin QA | `php bin/qa-local.php` | PASS (906 projected rows; owner_go true = 0; mutation true = 0) |
| agcos-core | `PYTHONPATH=src python3 -m unittest discover -s tests` | **104 run, 4 failures, 15 errors** — all `No module named 'agcos.proof'` (package git-ignored); 85 pass |
| agcos-core knowledge | `python3 knowledge/verify-promotion.py` | promoted=38 OK=38 |
| Prior 906-URL inventory (June, reused) | `analyze_booking_coverage.py` | duplicate form = 0; raw shortcode = 0; HTTP 200 = 906/906; money pages without form = 384/587 |

Tests **not** run (no target or no source): the 24-row Alanya booking matrix (1/2/3/4/6 pax, AYT/GZP,
return, email variants, Places, double-submit, price bounds, console, overflow), any Sultan test, any
n8n webhook/HMAC/idempotency test, any restore drill, any Lighthouse/a11y run against live hosts.
None is reported as passing.

## D. Mailbox-derived evidence (E4/E7 in notes; PII withheld)

| Signal | Count / date | Used in |
|---|---|---|
| WordPress "New transfer request" mails | 19 (2026-08-07 → 09-01; 1 explicit test) | 04 §2–5, 05 §5 |
| n8n "AGOS OPS New Booking" alerts | 17 (same window) | 05 §5 |
| n8n "SLA Escalation" alerts | 17, all at 901–902 s, all UNASSIGNED | 05 §5 |
| Pricing rule ids observed | `multi-service-v1-20260805`, `ag-shuttle-network-v1` | 04 §3 |
| Hetzner reminders/warnings/blocked | 07-13, 07-17, 08-13, 08-19, **08-25 blocked**; logins 08-26, 09-01 | 05 §6 |
| Cloudflare downgrade | 08-15/18 warnings; **08-20 paid services disabled**; 08-26 $0 invoice | 05 §6 |
| Güzel Hosting overdue | 08-15 card failure; 08-16, 08-18 overdue | 05 §6 |
| Brevo | 7 new-IP alerts Jul 12–Aug 2; API keys inactive 07-10; SMTP key inactive warning 07-29 | 05 §5 |
| n8n security bulletin | 2026-08-19, six High advisories, fixed 1.123.73 | 05 §4 |
| Google Maps demo key | created 2026-07-28 | 04 §9 |
| Meta Business email confirmation pending | 2026-08-23 | 05 §6 |
| Sultan domain registration | 2026-06-25, expires 2027-06-26 | 03 §2 |
| Google Business review reply "Sultan Pizza Kebab Kielce" | 2026-08-01 | 03 §2 |

## E. Drive-derived evidence

| Document | Date | Used in |
|---|---|---|
| AGOS-RC5-RELEASE-GOVERNANCE-SUMMARY.md | 2026-07-11 | 01 §2/§8, 04 §5 (Security HOLD, manifest 187/189, no RC5 artefact) |
| Alanya Group Rezervasyon Formu Teknik Şartnamesi v1 | 2026-04-23 | 02 (older payment intent incl. card) |
| Alanya Group Reservation Interface Design | 2026-06-30 | 02 (no email/seat in spec) |
| Alanya_Group_Master_Yol_Haritasi.md | 2026-06-03 | 04 §4 (cancellation page TODO; iyzico intent conflicts with cash-only) |
| Domainlerimiz (sheet) incl. AGHTH UMVE / Central Hub M1 spec | 2026-05 | 08 §1 |

## F. Items explicitly UNVERIFIED (must not be reported as pass or fail)

1. Live HTML/DOM of either site (email required attribute, seat UI, legal pages, hours, robots).
2. Current payment status of Hetzner / Cloudflare / Güzel Hosting after the August notices.
3. Running n8n version and workflow list; execution retention settings.
4. Whether the corrupted ops links are real or a rendering artefact of the read tool.
5. Existence and contents of `proof/`, `backups/`, RC2/RC3/RC5 artefacts on the owner's Mac.
6. Which application answers `sultankebabkielce.com`; whether Payload/Postgres run on the host.
7. Whether the OpenAI Sites dispatcher strips client-supplied identity headers (AGOS app auth).
8. GA4/GTM presence on alanyagroup.com.

## G. Package integrity

`SHA256SUMS` in this directory covers every file of the package; verify with:

```
cd reports/AGOS_WEB_RELEASE_AUDIT_R1 && sha256sum -c SHA256SUMS
```
