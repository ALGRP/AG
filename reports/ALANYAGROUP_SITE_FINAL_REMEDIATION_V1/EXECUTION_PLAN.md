# Execution Plan — SITE_FINAL_REMEDIATION_V1

The blocking set shrank since the last package: the inventory now exists, so STEP 2 of the previous
plan is **done**. What remains is one decision and one access problem.

---

## STEP 0 — Decisions (blocking)

| # | Question | Why it blocks | Ref |
|---|---|---|---|
| **0.1** | **Canonical engine: confirm `ag_home_booking`.** The task says `[ag_booking_engine]`; that string exists in no repo, while two independent sources name `ag_home_booking`. | Inserting a non-existent shortcode into 384 pages prints raw text and yields 0 working forms. | **C1** |
| 0.2 | **Coverage authority:** template/post-type injection, or per-page shortcode? | Determines whether 384 pages are one template release or 384 content edits. AGOS recommends template injection where the page family is predictable. | matrix §3 |
| 0.3 | **Pricing:** confirm the new numbers supersede the record, and fix the non-Alanya formula (dead €50 floor — base meant to be 40?). | Rewrites "from €X" sitewide incl. DE pages. | **C3** |
| 0.4 | **TÜRSAB 2165** — supply the registry document. | Legal/regulatory exposure. | **C2** |
| 0.5 | **Scandinavian + Arabic pages:** in scope, leave as-is, or noindex? | hreflang rebuild would otherwise orphan 12+ live money pages. | **C5** |

## STEP 1 — Access (blocking)

One of these is required before any code work:

- **1a — commit the booking engine source** (`ag-homepage-pilot` / the `ag_home_booking` plugin) to
  `ALGRP/AG` or `ALGRP/AGOS`. **This alone unblocks Workstreams 2 and 3** (email optional, seat
  removal, D-M-Y, return trip, Places fallback, server-side pricing authority) — they are pure code
  changes and need no live target.
- **1b — provide a staging environment** with docroot + DB, host allowlisted for egress. Required
  for the 15 test-matrix rows that cannot otherwise run, and by `MODE=LOCAL_OR_STAGING_FIRST`.
- **1c — minimum viable:** allowlist `www.alanyagroup.com` for read-only egress, enough to refresh
  the inventory and verify raw HTML after SEO edits. Permits auditing, not implementing.

`ag-platform-v2-admin-cms` is **not** a candidate host for this work: its `safety-scan.php`
blocklist fails the build on `add_shortcode`, by design.

## STEP 2 — Phase 0 inventory ✅ DONE

906-URL rendered-DOM inventory + 699-URL priority matrix already exist in `ALGRP/AGOS`.
Analysed in `BOOKING_ENGINE_MATRIX.md`. **Refresh before mutating** — the data is ~2026-06 and the
live site could not be re-scanned from here.

---

## STEP 3+ — Sequencing

| # | Work | Prereq | Notes |
|---|---|---|---|
| 1 | **Coverage-fill pilot** | 0.1, 0.2, 1 | The real Workstream 1. Pilot **one** flat hotel page + **one** tour page. Verify exactly one form before and after. Then Batch 1 (94 top-revenue), Batch 2 (321 hotel), Batch 3 (51 tours), Batch 4 (16 destinations), Batch 5 (108 optional). |
| 2 | **Legacy c6 migration** | 1 | Only **2 pages**: `/alanya-transfer/` (31925), `/antalya-alanya-transfer/` (31889). One page per GO. Neither is broken today. |
| 3 | **Booking UX** (WS2) | 0.1, 1a | Email optional across UI/backend/API; remove seat step; D-M-Y; return-trip flow; Places failure → manual address. Confirm first whether these already hold on the live engine — they may target the dev build. |
| 4 | **Pricing** (WS3) | 0.3, 1a | Server-side authority first; reject client-supplied prices. Verify boundaries: 1/2/3/4/6 pax, km = 29/30/31, the €55/€90 floors. AYT↔GZP shuttle **prohibited**. Then update displayed "from €X". |
| 5 | **agsc-v6 standardization** | 1,2 stable | 192 URLs behind one template. Engineering release, not a content edit: staging build, PHP lint, checksum, rollback, DOM verification on AYT/GZP parent + child. Highest blast radius — do last, alone. |
| 6 | **Content/template cleanup** (WS4) | 1 | `.ft-wrap{...}` residue on `/tours/alanya/boat-trip/` (which also has **no** booking form — coverage-fill it in the same pass). Footer links, Contact/Privacy/Terms. Phone `+90 551 160 69 05` is corroborated. |
| 7 | **SEO** (WS5) | 1c, 6 | Rank Math audit, duplicate schema, canonical conflicts, sitemap hygiene. Raw-HTML verify after **every** save. No bulk permalink change — protect DE organic. |
| 8 | **Languages** (WS6) | 0.5, 7 | EN→TR→DE→RU + a decision on Scandinavian/Arabic. English fallback. No bulk machine translation. |
| 9 | **Notifications & voucher** (WS7) | 1a, credentials | Idempotency is designable now; delivery testing needs SMTP/Brevo. Synthetic addresses only. Empty email must never block a booking. |
| 10 | **Analytics** (WS8) | 1c | GA4/GTM discovery first — state is undocumented. No PII in payloads. **No GTM publish.** |
| 11 | **Maps** (WS9) | owner | **OWNER BLOCKER**: no IP-restricted server key recorded. Report, don't work around. Never use the browser key server-side; never embed a key in code. |

## Standing constraints

- `owner_go=false`; AGOS decision package status is **HOLD**. Documentation never implies authorization.
- Verify by **rendered DOM counts, never string counts**. Target: exactly one form per money page.
- The dominant risk in coverage-fill is *creating* the duplicate-form condition that does not
  currently exist — check each URL for template-injected `agsc-v6` before inserting anything.
- Never combine coverage, migration and template standardization in one live action.
- Backup + rollback before every mutation; one page per GO for content edits.
- Secrets only in the n8n Credentials UI — never in chat, never in git.
- No real WhatsApp message to a real driver or customer group. WhatsApp Job Distribution stays off.
