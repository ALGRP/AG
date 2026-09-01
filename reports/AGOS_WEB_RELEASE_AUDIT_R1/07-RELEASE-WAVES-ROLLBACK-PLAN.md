# 07 — Release Waves and Rollback Plan

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01.
This plan authorises nothing. Every wave starts with an Owner GO in the
`AGOS_GOV_01_OWNER_GO_TEMPLATE.md` format (sprint, target environment, allowed/forbidden actions,
backup, rollback, live sends, stop condition, expected output) logged in `OWNER_GO_LOG.md`.

## 0. Standing rules for every wave

1. **Backup first, checksum second, mutate third.** Page edits: save `content.raw` before/after with
   SHA256 (the SEL-121 precedent). Files: tar + `sha256sum` before copy. Databases: dump + checksum.
2. **Evidence or HOLD.** No wave closes without the evidence rows listed under "Exit gate".
3. **One wave, one risk class.** Never combine content edits, template/plugin changes and
   infrastructure changes in one GO.
4. **DOM counts, not string counts** for anything touching booking forms (record Risk 2).
5. **No real customer, driver or supplier message during any test.** Synthetic addresses and the
   `AGOS TEST DO NOT SERVICE` naming convention already used on 2026-08-13.

## 1. Wave map

| Wave | Name | Purpose | Blocks on | Sev of items cleared |
|---|---|---|---|---|
| W0 | **Stabilise the ground** | provider billing, backups, n8n patch + export, provenance baseline | nothing (owner actions + read-only captures) | P0 INF-01, INF-02, N8N-01, ALA-03 (baseline part), SUL-01 (baseline part) |
| W1 | **Facts and legal copy** | cancellation policy page, deposit wording removal, TÜRSAB proof + framing, distance/duration single source, Sultan legal pages | W0; owner provides TÜRSAB document and Sultan company data | P0 ALA-01, ALA-02, SUL-02 |
| W2 | **Booking engine RC6 (Alanya)** | canonical `[ag_booking_engine]` + aliases, seat-selection removal with capacity validation, optional email with CLE semantics, shuttle table 1–6, AYT↔GZP ban, private/VIP formulas with the dead-floor fixed, server-side authority | W0 baseline in git; W1 facts; staging `app.alanyagroup.com` running | P1 ALA-05/06/07, ALA-10 |
| W3 | **Automation hardening** | n8n pinned, workflows in git, HMAC + idempotency + DLQ + redaction, SLA re-tune, ops-link fix, execution reconciliation, second alert channel | W0 | P1 N8N-02..06, INF-03/04/05 |
| W4 | **SEO and coverage** | canonical/redirect hygiene (www, slash, `-2`, `?lang`), duplicate-intent consolidation, coverage batches B1→B5 with DOM verification, hreflang graph incl. AR/Scandinavian decision | W2 (engine must be canonical first) | P1 ALA-11/12, P2 ALA-17/18 |
| W5 | **Sultan release** | baseline capture → full audit (menu, cart, delivery, pickup, payments, RODO, allergens, PL/EN/DE) → staging → GO | W0 (Sultan baseline), W1 (legal pages) | P0 SUL-01/02, P1 SUL-04..07 |
| W6 | **Multi-domain factory F0–F4** | manifests, fact table, staging per domain, first satellite | W2, W4 | P1 MD-01..03 |
| W7 | **Hetzner cutover (Alanya)** | RC6 to Hetzner Docker WordPress, DNS switch | W2, W3, all gates PASS per AGOS-GATE-MATRIX | — |
| W8 | **AGOS Mobility Cloud pilot** | only after MC-01..04 fixed and a real supplier acceptance gate exists; never pointed at a money domain before that | W3, W6 | P0 MC-01..04 |

## 2. Wave detail

### W0 — Stabilise the ground (owner + read-only agent, 1–3 days)

Entry: none. Actions:
1. Owner confirms Hetzner, Cloudflare, Güzel Hosting, Brevo, Google Cloud accounts are paid and on
   auto-pay; records invoice ids (no card data) in the private platform repo. **Stop condition:** any
   account still suspended → nothing else proceeds.
2. Owner copies `N8N_ENCRYPTION_KEY` to the password manager; agent documents the custody rule.
3. Read-only capture on the Mac: `tools/preflight_baseline_check.sh` (PR #1), then tar the newest
   production pull + the six mu-plugin files + `n8n export:workflow --all` + `docker compose config`
   (secrets redacted) → `sha256sum` → push to private repo `ALGRP/AGOS` branch
   `candidate/rc6-baseline` (never to public `ALGRP/AG`).
4. `n8n --version` captured; if < 1.123.73 schedule the pin in W3 (upgrade itself is a W3 action
   with backup + rollback, not a W0 action).
5. Execution-log reconciliation query for 2026-08-07 → 09-01 exported (post ids vs execution ids).

Exit gate: billing confirmations ×5; `SHA256SUMS` for the baseline tarball; workflow export diff
reviewed for secrets/PII; reconciliation table. Rollback: none needed (no mutation).

### W1 — Facts and legal copy (content-only, page-level GO)

Entry: W0 exit; owner supplies TÜRSAB registry document and the legal entity for each site; owner
decides the single cancellation policy (recommended: one page, WhatsApp-confirmed, no deposit language
anywhere, consistent with cash-in-vehicle).
Actions: edit the affected pages/blocks only (privacy policy, contact, FAQ, distance guide,
Utopia/camping pages, footer); Sultan: publish regulamin, polityka prywatności (RODO), alergeny, dane
firmy (NIP/REGON/address).
Exit gate: per-page before/after `content.raw` + SHA256; rendered-DOM screenshot; grep of the full
site export for "deposit", "12 hours", "24 hours", "127 km", "135 km", "12892" → expected counts;
TÜRSAB number appears once per page with the verified framing.
Rollback: restore `content.raw` from backup per page (< 5 min per page).

### W2 — Booking engine RC6 (Alanya)

Entry: baseline in git (W0), W1 facts, staging WordPress running with a copy of the live DB
**minus** customer data (or synthetic bookings), Maps production key restricted by referrer/IP.
Actions (staging first, then production under a separate GO):
1. Register `[ag_booking_engine]` → `ag_hlp_render_booking_engine()`; alias the three legacy names.
2. Remove the seat-selection UI; keep server-side capacity check per departure.
3. Make email optional; CLE received/confirmed mails go out only when an email exists; ops
   notification never depends on email.
4. Pricing endpoint: shuttle table 1–6, roundtrip ×2 with explicit return, AYT↔GZP shuttle
   rejected server-side both directions (private/VIP allowed), private Alanya
   `max(55, 40+(km−30)×0.40)`, private other with the corrected base (owner decision 0.4), VIP
   `max(90, private×1.30)`; client price never trusted; rule id bumped to `multi-service-v2-<date>`.
5. Public form: nonce + idempotency token per render, duplicate-submit guard, rate limit.
Exit gate (staging): the 24-test matrix from the prior task run and recorded (1/2/3/4/6 pax, AYT/GZP,
one-way/return, empty/valid/invalid email, Places ok/fail, double-submit, price bounds, console
errors, overflow, single form per money page); all PASS or explicit HOLD.
Production GO: page-by-page or plugin-level, with checksum of the plugin bundle recorded in
`SHA256SUMS`. Rollback: restore previous mu-plugin files from the W0 tarball (checksummed) and clear
object cache; verify DOM count = 1 on the 13 canonical URLs.

### W3 — Automation hardening

Entry: W0. Actions in order, each with its own GO: (a) pin n8n image and upgrade (backup Postgres +
export first; rollback = previous image tag + restore dump); (b) import workflows from git to
staging, verify HMAC/idempotency/DLQ per document 06 §8; (c) production: replace the live workflows
with the git versions, deactivate old ones (keep exports for rollback); (d) retune SLA; (e) fix ops
link encoding; (f) configure execution retention and pruning; (g) nightly backup job + restore drill;
(h) uptime probe + second alert channel.
Exit gate: `n8n --version` ≥ patched; `SHA256SUMS` of workflow exports; staging test log; restore
drill log; two consecutive days of zero-mismatch reconciliation.
Rollback: re-import the previous workflow JSON and reactivate; DB restore from pre-upgrade dump.

### W4 — SEO and coverage

Entry: W2 in production. Actions: redirect map (non-www → www, no-slash → slash, `-2` slug,
`?lang=tr` → path or noindex) applied in Rank Math/htaccess with a backup of `.htaccess` and the Rank
Math redirection export; consolidate duplicate-intent URLs to the canonical owner (D-015) with 301s;
coverage fill Batch 1 (94 URLs) → Batch 5 with DOM verification before and after each batch;
hreflang graph from the manifest (document 08) once the AR/Scandinavian decision exists.
Exit gate: crawl export shows one 200 canonical per intent; Search Console coverage report attached;
DOM count = 1 on every touched URL; no raw shortcode text.
Rollback: restore redirect export and `.htaccess`; per-page `content.raw` restore.

### W5 — Sultan release

Entry: Sultan baseline in private git with SHA256SUMS (W0 item 3 extended to the Sultan stack), legal
pages (W1). Actions: run the Mandatory Work C audit against staging (menu/modifiers/prices, cart,
delivery zones/fees/minimum, pickup, hours source of truth, cash/pay-on-delivery policy, order
persistence + idempotency key, kitchen notification with retry, tracking, PL/EN/DE, mobile, a11y,
performance, SEO, RODO consent); fix P0/P1; then production GO.
Exit gate: synthetic order transcript (test flag) showing persistence id, notification, tracking,
duplicate-submit result; legal pages rendered; Lighthouse mobile ≥ 80; allergen data per item.
Rollback: previous container image + DB dump (Payload/Postgres) restored; Caddy route unchanged.

### W6 — Multi-domain factory

See document 08 §7 (F0–F4). Rollback = symlink switch to previous release per domain.

### W7 — Hetzner cutover (Alanya)

Entry: W2, W3 done; Restore/Observability/Idempotency/Live-Send/Write gates PASS
(AGOS-GATE-MATRIX); rehearsal on `app.alanyagroup.com` with the production DB copy; DNS TTL lowered
24 h before. Actions: freeze content on cPanel, final DB export + checksum, import to
`agos-wordpress`, switch Cloudflare origin, monitor 48 h. Rollback: switch origin back to cPanel
(< 5 min), restore any bookings created during the window from the WP export diff.

### W8 — AGOS Mobility Cloud pilot

Entry: MC-01..MC-04 fixed and re-audited; real supplier acceptance with timeout/fallback; tenant
isolation tests; legal pages; a paid, current Cloudflare account. Pilot on `agos.tr` or a test
domain only; **never** on `alanyagroup.com` or `sultankebabkielce.com` until W2/W5 are complete.

## 3. Rollback catalogue (all layers)

| Layer | Backup artefact | Restore command / action | Time |
|---|---|---|---|
| WordPress page content | `content.raw` before-file + SHA256 | REST `POST /wp/v2/pages/<id>` with saved content (same-origin admin session) | < 5 min |
| WordPress mu-plugins / theme | tar of `wp-content/mu-plugins` + `SHA256SUMS` | untar to docroot, `sha256sum -c`, flush cache | < 10 min |
| WordPress DB (cPanel) | `mysqldump` + checksum | import via cPanel/CLI; then re-apply bookings created after dump from WP export | 30–60 min |
| Redirects / Rank Math | Rank Math redirection export + `.htaccess` copy | re-import / restore file | < 10 min |
| n8n workflows | `n8n export:workflow --all` (git) | `n8n import:workflow`, deactivate replaced versions | < 10 min |
| n8n database / image | `pg_dump` + previous image digest | `docker compose down`, restore dump, set `N8N_IMAGE`, `up -d` | 15–30 min |
| Caddy | previous `Caddyfile` in git | `caddy validate` then `docker compose up -d` (or `caddy reload`) | < 5 min |
| Docker stacks | volumes untouched by `compose down` | `docker compose up -d` previous tag | < 10 min |
| Sultan stack | image digest + Postgres dump | redeploy previous digest, restore dump | 15–30 min |
| DNS / Cloudflare origin | previous origin record | switch back | < 5 min + TTL |
| AGOS Mobility Cloud | previous git tag; D1 export | redeploy tag; D1 restore (`wrangler d1 export/import`) | 15 min |
| This audit package | git history on `claude/agos-web-release-audit-azbaev` | `git revert` or close PR | — |
