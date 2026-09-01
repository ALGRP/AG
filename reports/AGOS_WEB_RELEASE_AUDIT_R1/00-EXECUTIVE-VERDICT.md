# 00 — Executive Verdict

**Audit:** AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1
**Date:** 2026-09-01 (UTC) · **Phase:** A, STRICT_READ_ONLY_PLAN · **Branch:** `claude/agos-web-release-audit-azbaev` (ALGRP/AG)
**Mutation statement:** no source edited, no database touched, no production or deployment action,
no order, booking, message or payment created. Only this report package was written.

```
AUDIT_COMPLETE=YES
SULTAN_RELEASE_READY=NO
ALANYA_RELEASE_READY=NO
N8N_FOUNDATION_READY=NO
MULTIDOMAIN_FACTORY_READY=NO
OPEN_P0=12
OPEN_P1=37
PRODUCTION_MUTATION=NO
NEXT_RECOMMENDED_CHILD_TASK=ALANYA_RC6_BASELINE_CAPTURE_01 — on the owner's Mac, read-only: run tools/preflight_baseline_check.sh (PR #1), then package the newest production pull, the six mu-plugin runtime files (ag-booking-core.php, ag-booking-component-v1.php, ag-home-booking-shortcode.php, ag-homepage-live-pilot/, ag-voucher.php, ag-control-panel.php), the CLE email module, `n8n export:workflow --all --pretty`, and `docker compose config` (secrets redacted) from the Hetzner host into ALGRP/AGOS branch candidate/rc6-baseline with SHA256SUMS; no production mutation, no credential values, no customer data.
```

## 1. Verdict in one paragraph

The program has strong governance paperwork and a working manual booking loop on alanyagroup.com, but
it has no release-grade candidate for either site: the WordPress booking runtime, the live n8n
workflows and the entire Sultan site exist only on the owner's machine and hosts, never in version
control, so nothing can be sealed, diffed, or rolled back with provenance. Meanwhile production is
already ahead of the record: an n8n instance is emitting ops alerts and SLA escalations on real
customer requests although every governance document still says "n8n HOLD", and the hosting, CDN and
Docker-host providers all sent non-payment suspension notices in August 2026. On the live Alanya site
the owner's five booking decisions (canonical engine, no seat selection, optional email, shuttle price
table, AYT↔GZP ban) are not implemented, and three factual contradictions (TÜRSAB framing,
AYT–Alanya distance/duration, cancellation/deposit wording) are indexed by search engines. The AGOS
Mobility Cloud app is a prototype that must not answer for any money domain in its current state.

## 2. Top P0 items (12, full list in `09-P0-P1-P2-BACKLOG.csv`)

| ID | Class | One line | Owner action needed |
|---|---|---|---|
| INF-01 | outage | Hetzner "services blocked" (08-25), Cloudflare paid services disabled (08-20), Güzel Hosting overdue (08-15..18) | confirm payments + auto-pay |
| INF-02 | data loss | n8n encryption key has one copy, on the host | store off-host |
| N8N-01 | authority | n8n live on real bookings with no recorded GO and no workflow exports in git | retroactive GO or deactivate; export |
| ALA-01 | legal / false pricing | four cancellation regimes and a "50 % deposit retained" clause coexist with cash-only | one policy text |
| ALA-02 | legal | TÜRSAB 2165 live "under Free Time Turizm" vs 12892 in record; no document filed | registry document |
| ALA-03 | irreversible deployment | no git-identified, SHA-sealed WordPress candidate; RC2 "golden artefact" unverifiable | approve baseline capture |
| SUL-01 | irreversible deployment | Sultan source, build and deploy descriptor exist nowhere reachable | push to private repo |
| SUL-02 | legal | Sultan regulamin / RODO / allergen / company identity not shown to exist | supply company data |
| MC-01 | wrong booking | AGOS app: no contact capture, fictitious driver offers, customer click auto-confirms, no notification | keep off money domains |
| MC-02 | security | AGOS app: first user becomes master admin; cross-tenant reads; unauthenticated admin console | — |
| MC-03 | false pricing | AGOS app: flat €96 private / €42 per seat, route-agnostic | pricing fact table |
| MC-04 | data loss | AGOS app: colliding reference ids, ad-hoc schema per route, past-date fallback | — |

## 3. What is actually working (keep it)

* WordPress is the system of record: every request becomes a post before any mail; n8n never holds
  the only copy (task requirement satisfied today).
* Manual confirmation before booking, cash/pay-in-vehicle, WhatsApp as final step — all live and
  consistent with owner intent.
* The live private pricing rule (`multi-service-v1-20260805`: 40 + (km − 30) × 0.40) already equals
  the owner's Alanya formula; shuttle tier 1 = €30 matches every record.
* The n8n alert payload carries presence flags, not PII, and an idempotency key — a good base for
  document 06.
* `agos-infrastructure` is a clean skeleton: isolated Compose projects, internal-only databases,
  Caddy with security headers, secrets outside git.
* The read-only WordPress admin plugin in `ALGRP/AGOS` passes lint, safety scan and fixture QA.
* Prior reports on PR #1 are accurate and are reused, not redone; their owner decisions are
  carried forward unchanged.

## 4. Where the evidence stops

Live hosts are egress-blocked from this session, the production host is not mounted, and the
owner's Mac workspace is not in git. Everything marked UNVERIFIED in document 10 §F stays
unverified; nothing was assumed to pass. The strongest live evidence comes from the owner's mailbox
(request/alert emails, provider notices) and from indexed search snippets; customer identities seen
there are not reproduced anywhere in this package.

## 5. Immediate next steps (order matters)

1. Owner: settle the three provider accounts (INF-01) and copy the n8n key (INF-02). Nothing else
   is safe before this.
2. Run the recommended child task (baseline capture). It unblocks ALA-03, SUL-01, N8N-01 and every
   later wave without touching production.
3. Owner decisions still open: cancellation text, TÜRSAB document, private-"other" formula base
   (50 vs 40), AR/Scandinavian language scope, factory A vs B for satellites, SLA thresholds.
4. Then Waves W1–W3 of `07-RELEASE-WAVES-ROLLBACK-PLAN.md`.

## 6. Disclosure note

`ALGRP/AG` is a **public** repository. This package contains no credentials, no customer data and no
personal names, but it does describe provider accounts, suspension notices, internal hostnames and
security weaknesses. Recommendation: mirror the package into the private `ALGRP/AGOS` (or
`alanyagroup-platform/REPORTS/`) and decide deliberately whether it should ever be merged into the
public `main`. The prior report packages on PR #1 applied the same rule.

## 7. Package contents

| File | Purpose |
|---|---|
| `00-EXECUTIVE-VERDICT.md` | this verdict |
| `01-AUTHORITATIVE-SYSTEM-INVENTORY.md` | repos, branches, live vs local versions, Docker/Caddy/DB, env names, commands, provenance |
| `02-LIVE-LOCAL-OWNER-INTENT-MATRIX.md` | per-aspect matrix for both sites, the AGOS app and infra |
| `03-SULTAN-END-TO-END-AUDIT.md` | Sultan verdict, findings, inputs needed |
| `04-ALANYA-END-TO-END-AUDIT.md` | Alanya booking, pricing, facts, ops, SEO, AGOS boundary |
| `05-INFRASTRUCTURE-AND-N8N-AUDIT.md` | IaC inventory, live n8n, provider hygiene |
| `06-AUTOMATION-REFERENCE-ARCHITECTURE.md` | target n8n production design |
| `07-RELEASE-WAVES-ROLLBACK-PLAN.md` | W0–W8 with gates and rollback catalogue |
| `08-MULTIDOMAIN-SITE-FACTORY.md` | manifests, cores, pipeline |
| `09-P0-P1-P2-BACKLOG.csv` | 61 items with evidence refs and waves |
| `10-TEST-AND-EVIDENCE-INDEX.md` | methods, results, unverified list |
| `evidence/` | agent reports (redacted), notes, build logs |
| `SHA256SUMS` | seal over every file above |
