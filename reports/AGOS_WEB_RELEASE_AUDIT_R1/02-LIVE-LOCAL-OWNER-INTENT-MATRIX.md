# 02 — LIVE vs LOCAL vs OWNER-INTENT Matrix

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01.
Columns: **LIVE** = production behaviour as evidenced (request/alert emails, indexed snippets, Semrush);
**LOCAL** = the candidate intended for production (owner Mac RC chain, `agos-mobility-cloud`, AGOS repo
designs); **OWNER INTENT** = latest recorded owner decision (PR #1 record 2026-08-26 > AGOS decision
ledger 2026-07-05 > platform record 2026-06-24 > Drive specs). **Gap** names the finding id.
`?` = not verifiable from this session.

## A. alanyagroup.com

| # | Aspect | LIVE | LOCAL candidate | OWNER INTENT | Gap / Sev |
|---|---|---|---|---|---|
| A1 | Booking engine identity | `ag_home_booking` on 13 URLs, `agsc-v6` template on 192, `c6` on 2, none on 699 (June inventory); Aug request mails prove one engine posts to WP | Mac: `ag-booking-core.php` + `ag-home-booking-shortcode.php` + `ag-homepage-live-pilot/` (not in git); canonical renderer `ag_hlp_render_booking_engine()` not found anywhere | `[ag_booking_engine]` canonical, legacy names aliased to the same renderer | ALA-03 P0 (no git identity); ALA-11 P1 (coverage) |
| A2 | Shuttle seat selection | "select exactly 1 seat(s) for your shuttle request" indexed | ? (owner Mac) — AGOS app keeps seat maps for capacity | remove customer seat selection, keep capacity validation | ALA-05 P1 |
| A3 | Email | field present in every request; "confirmation email" referenced; required-ness ? | ? | optional; CLE with/without email; ops notification without email | ALA-06 P1 |
| A4 | Shuttle price table | tier 1 = €30 one-way, €60 with return (`ag-shuttle-network-v1`) | — | 1/2/3/4/5/6 = 30/50/60/70/80/90; roundtrip = one-way × 2 with explicit return | ALA-07 P1 (tiers 3–6 unevidenced) |
| A5 | Shuttle scope | shuttle accepted AYT→Okurcalar, AYT→Kemer | — | AYT↔GZP shuttle forbidden both directions; GZP scope incl. Okurcalar/Avsallar/Türkler | ALA-07 P1 (ban not evidenced server-side) |
| A6 | Private price AYT→Alanya | `multi-service-v1-20260805`: 40 + (133.4 − 30) × 0.40 = €81.36 | — | `max(55, 40 + (km−30)×0.40)` → 81.36 ✔ | consistent; but site copy "from €80", record "from €77" → ALA-07 P1 |
| A7 | Private other / VIP | "private from €80", "VIP from €120", child seat €5 | — | other: `max(50, 50+max(0,km−30)×0.60)` (dead floor); VIP `max(90, private×1.30)` | ALA-07 P1 (spec defect; not evidenced live) |
| A8 | Payment | "pay in vehicle, no online card charge" **and** "deposit 50 % retained" on one page | — | cash / pay in vehicle only | ALA-01 P0 |
| A9 | Manual confirmation | WhatsApp final step; ops mails "no customer message" | AGVOUCHER + delivery queue dry-run (local) | manual confirmation before booking | consistent ✔ |
| A10 | Cancellation | 12 h / 24 h+50 % / no refund en route / 100 % no-show / "confirmed on WhatsApp" | — | one policy page (June roadmap TODO) | ALA-01 P0 |
| A11 | TÜRSAB | 2165 "under Free Time Turizm (Alanya Şb.)" | AGOS repo: none | 2165 (stated twice); platform record 12892 | ALA-02 P0 |
| A12 | AYT→Alanya distance/time | 135 km & 1.5–2 h / 127 km & 76 min / 133.4 km (engine) | — | single fact table (Knowledge Objects D-014) | ALA-08 P1 |
| A13 | Persistence | WP post per request (ids 35765–35815, Aug) | `_agp_*` meta canonical (D-007) | WP = system of record | ✔ |
| A14 | Ops notification | WP mail from `info@` + n8n Gmail alert; ops link possibly corrupted | delivery queue dry-run (D-010/D-011) | delivery never silent; SMTP live only after GO | N8N-04/06 P1 |
| A15 | SLA / driver assignment | escalation at 15 min, 100 % unassigned; assignment manual off-system | AGSYNC statuses `Sent to Supplier → Supplier Confirmed → Driver Assigned` (design) | manual first; automation HOLD | N8N-02 P1; no supplier timeout/fallback live |
| A16 | n8n governance | live, ≥ 2 workflows, exec #105 | dry-run JSONs (inactive) in AGOS repo | n8n HOLD until automation sprint (D-013) | N8N-01 P0 |
| A17 | Voucher / calendar | none in mailbox; 0 calendar events | AGVOUCHER v1.0 local | voucher after manual confirmation | ALA-15 P2 |
| A18 | Flight / hotel data | free text | flight_watches (AGOS app, no provider) | flight tracking "monitored" (copy) | ALA-16 P2 |
| A19 | Analytics | ? (GA4/GTM undocumented) | GTM/dataLayer pending owner decision | consent-mode analytics | ALA-13 P1 |
| A20 | Canonical / redirects | www+non-www, slash variants, `-2` slug, `?lang=tr`, ≥ 6 same-intent URLs, DE dupes | AGSEO canonical owner matrix (planning only) | one intent = one canonical page (D-015) | ALA-12 P1 |
| A21 | Languages | EN edited; TR/DE/RU/AR WPML-reserved; 12 Scandinavian pages | AGINTL: language subdomains | EN→TR→DE→RU tiers | ALA-17 P2 |
| A22 | Hosting | cPanel (Güzel) + Cloudflare, both with Aug non-payment notices | Hetzner Docker (staging `app.alanyagroup.com`) | Hetzner = production target after gates (D-002) | INF-01 P0 |
| A23 | Release artefact | none | RC2 frozen (Mac), RC5 HOLD, manifest placeholder | RC freeze with manifest/SHA (item 10 of next sprints) | ALA-03 P0 |
| A24 | Maps key | ? (demo key created 07-28) | Places deprecation warning in SEL-122 | IP-restricted server key (owner blocker) | ALA-14 P1 |

## B. sultankebabkielce.com

| # | Aspect | LIVE | LOCAL candidate | OWNER INTENT | Gap / Sev |
|---|---|---|---|---|---|
| B1 | Site existence | indexed by Semrush (11 kw); 0 web-search results | none in git | production ordering site with menu, cart, delivery, pickup | SUL-01 P0 |
| B2 | Menu / modifiers / prices | ? | none | full menu with modifiers | SUL-07 P1 |
| B3 | Delivery / pickup / hours | Pyszne.pl: min 35 zł, delivery 7 zł, "delivery currently unavailable" | none | delivery + pickup with runtime-verified hours | SUL-04 P1 |
| B4 | Payments | ? | none | cash/pay-on-delivery policy (by analogy) | ? |
| B5 | Order persistence / idempotency / notification / tracking | ? ; no order mails in mailbox | none | persisted orders, dedupe, kitchen notification, tracking | UNVERIFIED |
| B6 | PL/EN/DE | ? | AGOS registry `pl` only | PL primary + EN/DE | UNVERIFIED |
| B7 | RODO / regulamin / allergens / NIP | not found | none | statutory pages present | SUL-02 P0 |
| B8 | Which app answers the host | ? | AGOS registry maps host to a **table-reservation** portal with Alanya logo | ordering site | SUL-05 P1 |
| B9 | Hosting | Hetzner (inferred), suspension notice 08-25 | `agos-infrastructure` has no Sultan/Payload stack | Payload + Postgres + Caddy on shared host | INF-01 P0; INF-06 P1 |

## C. AGOS Mobility Cloud (`agos-mobility-cloud` @ ca9b7fcd) vs owner intent

| # | Aspect | Code (LOCAL) | OWNER INTENT | Gap / Sev |
|---|---|---|---|---|
| C1 | Customer request | no name/phone/email captured; token in sessionStorage | phone/WhatsApp mandatory, email optional | MC-01 P0 |
| C2 | Offers | 3 hard-coded fictitious "verified drivers" (`@agos.invalid`) at fixed net prices | real supplier acceptance | MC-01 P0 |
| C3 | Confirmation | customer click → `driver_assigned`; operator `confirmed` instantly; partner `CONFIRMED`; micro-shuttle `AUTO_ACCEPTED` | manual confirmation gate | MC-01 P0 |
| C4 | Pricing | private €96 flat, shared €42/pax, shuttle 30/50/60/+10; partner API haversine × rate | server-side authority, AYT/GZP aware | MC-03 P0 |
| C5 | Tenant isolation | first user becomes master_admin; cross-tenant GET leaks; admin console unauthenticated | strict tenant isolation (docs P0.2) | MC-02 P0 |
| C6 | References | last-6-digit-of-ms ids with UNIQUE → collisions → 500 | stable ids | MC-04 P0 |
| C7 | Webhooks | HMAC with bearer token as key, ±300 s, idempotency key; replay possible with new key | HMAC + replay protection | MC-05 P1 |
| C8 | Notifications | none (no provider); outbox never drained | WhatsApp/email after GO | MC-06 P1 |
| C9 | i18n / SEO | `<html lang="tr">` for all domains; no robots/sitemap/canonical/hreflang; identical content on 6 domains; `?domain=` host override | one canonical per intent/language | MC-07 P1 |
| C10 | Seat map | required for shuttle in operator form (4×4 grid, fake occupancy) | seats for capacity only, never customer-chosen | MC-08 P1 |
| C11 | Build health | build OK; 23 regex tests pass; lint fails (2); tsc fails (40) | CI-gated | MC-09 P1 |
| C12 | Data platform | Cloudflare D1/R2 on an account downgraded for non-payment (08-20) | durable store | INF-01 P0 |

## D. Infrastructure & automation

| # | Aspect | LIVE | IaC / LOCAL | OWNER INTENT | Gap |
|---|---|---|---|---|---|
| D1 | n8n version | ? | `n8nio/n8n:1` floating | patched, pinned | INF-04 P1 |
| D2 | n8n auth | ? | basic-auth vars (no-op in 1.x) | authenticated editor, open webhooks | INF-03 P1 |
| D3 | Backups | ? (none evidenced) | manual dump commands only | backup + restore rehearsal before cutover (D-019 Restore gate) | INF-05 P1 |
| D4 | Encryption key custody | ? | `.env` only | off-host copy | INF-02 P0 |
| D5 | Monitoring/alerting | ? | none | observability gate (D-019) | INF-05 P1 |
| D6 | Shared services list | task: Caddy, Docker, Postgres, Payload, WordPress | IaC: Caddy, MariaDB, Redis, Postgres (n8n only), WP staging | single IaC = reality | INF-06 P1 |
