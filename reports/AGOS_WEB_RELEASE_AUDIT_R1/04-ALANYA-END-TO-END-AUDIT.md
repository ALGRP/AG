# 04 — Alanya Group End-to-End Audit

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01 · Mode: STRICT_READ_ONLY.
Targets: https://alanyagroup.com (live WordPress), the local candidate intended for production (owner
Mac, not in git), the AGOS Mobility Cloud app (`agos-mobility-cloud`), and the AGOS/WJD/Driver Pool
boundary.

Evidence classes used: **[L]** live behaviour inferred from production request/alert emails and
indexed search snippets (host itself egress-blocked); **[R]** project record and prior reports;
**[C]** code in `agos-mobility-cloud`; **[O]** owner decisions (PR #1 record, AGOS master status,
Drive). Customer identities seen in emails are deliberately not reproduced.

## 1. Verdict

**ALANYA_RELEASE_READY = NO.** The live site is taking real requests and the operations chain works
end-to-end at a basic level (request → WP post → ops mail → n8n alert → SLA timer), but: the owner's
five booking decisions (canonical engine, no seat selection, optional email, shuttle table, AYT↔GZP
ban) are **not yet on production**; three factual contradictions (TÜRSAB, distance/duration,
cancellation) are live; pricing authority is split across two rule sets and three documents; the
candidate that would fix this has no git identity; and the hosting/CDN accounts were in suspension
notices in August.

## 2. Booking UX (live vs owner intent)

| Aspect | Live [L] | Owner intent [O] | Gap |
|---|---|---|---|
| Entry form | fields observed in request mail: pickup, destination, date/time, return date/time, passengers, vehicle (Private / Shuttle / Sprinter-Minibus), service region, flight, luggage, notes, name, phone, email | date → guests → Places → name + WhatsApp → notes (record §3); email optional | email presence: every sampled request has an email; **required-ness unverified** — search snippet references "your confirmation email", implying email is collected as a channel |
| Shuttle seat selection | form copy "select exactly 1 seat(s) for your shuttle request" is indexed | **remove** seat selection, keep capacity validation | **P1 gap confirmed live** |
| Confirmation | "WhatsApp is the final confirmation step"; ops mails say "no customer message"; no customer confirmation/voucher mail found | manual confirmation before a request becomes a booking | consistent — keep |
| Payment | "Payment can be made in the vehicle … no online card charge"; but a Utopia-page snippet mentions "deposit may be 50 % retained" | cash / pay-in-vehicle only | **contradiction**: a deposit implies prepayment |
| Large groups | 16 pax request → "Price: Final price confirmed by WhatsApp", vehicle "Sprinter / Minibus", region "other" | quote-by-WhatsApp acceptable | fine, but no capacity cap or vehicle-class rule visible |

## 3. Route and pricing authority

| Rule | Live [L] | Record 2026-06-24 [R] | Owner 2026-08-26 [O] | AGOS master status 2026-07-05 [O] |
|---|---|---|---|---|
| Shuttle 1 pax | €30 (`ag-shuttle-network-v1`, tier 1) | €30 | €30 | €30 |
| Shuttle 2 pax | — | €50 | €50 | €50 |
| Shuttle 3 / 4 / 5 / 6 pax | — | €70 / €80 / – / – | €60 / €70 / €80 / €90 | — |
| Shuttle round trip | €60 for 1 pax with return | — | — | one-way × 2 with explicit return |
| Shuttle scope | AYT→Okurcalar, AYT→Kemer requests accepted as shuttle | Alanya↔Antalya only | AYT↔GZP **forbidden** both directions; Okurcalar/Avsallar/Türkler in GZP scope | — |
| Private AYT→Alanya | `multi-service-v1-20260805`: 40 + (km − 30) × 0.40; 133.4 km → €81.36 | €40 base first 20 km then €0.20–0.50 bands; "from €77" | `max(55, 40 + (km−30)×0.40)` → 81.36 ✔ | — |
| Private other destinations | not sampled | Belek €43, Kemer €48, Side €52, Manavgat €55 | `max(50, 50 + max(0,km−30)×0.60)` — floor can never bind (spec defect) | — |
| VIP | "from €120" (snippet) | — | `max(90, private × 1.30)` | — |
| Site copy | "shuttle from 30 EUR", "private from 80 EUR", "VIP from 120 EUR", child seat €5, "per vehicle, not per person" | "from €77" Alanya | — | — |

Findings: the live private rule already matches the owner's Alanya formula, so the pricing endpoint
exists on production; the shuttle table beyond 2 pax and the AYT↔GZP prohibition are **not** evidenced
as enforced; the site copy "from 80 EUR" and the record's "from 77" and the engine's 81.36 are three
different numbers for the same intent (**P1 false-pricing signal**). There is no single versioned
fact table for distance → price.

## 4. AYT / GZP rules and factual consistency

| Fact | Values found live [L] | Engine [L] | Owner/record |
|---|---|---|---|
| AYT → Alanya distance | 135 km / 127 km | 133.4 km (route distance in request mail) | cluster distance data on owner Mac |
| AYT → Alanya duration | 1.5–2 h / 76 min / ~2 h | — | — |
| GZP → Alanya | 40 km, 40–50 min | — | record: GZP km data missing |
| TÜRSAB | **2165** published: "under TÜRSAB document no. 2165, registered under Free Time Turizm (Alanya Şb.)"; also "initiative to gather TÜRSAB member agencies under one roof … no charge for any agency membership" | — | record: 12892 (2026-06-24); owner: 2165 (stated twice, Aug 2026) |
| Cancellation | 12 h free (some bookings) · 24 h free then 50 % deposit retained · no refund once driver en route · 100 % no-show · "terms confirmed on WhatsApp, do not assume free cancellation" · camping "one day in advance" | — | June roadmap: "İptal politikası sayfası ekle" (still to do) |

Findings: ALA-01 (P0) — three cancellation regimes and a deposit clause coexist with a cash-only
policy; this is a consumer-law and dispute exposure, not a copy nit. ALA-02 (P0, legal) — the TÜRSAB
number is now consistent between live and owner (2165) but contradicts the platform record and is
framed as operating "under" another agency's document; documentary proof and the correct legal framing
must be filed before release copy is frozen. ALA-03 (P1) — distance/duration triple.

## 5. Booking persistence, idempotency, notifications, operations handoff

| Item | Observation | Sev |
|---|---|---|
| Persistence | Every request becomes a WordPress post (ids 35765–35815 in Aug 2026) **before** any mail; system of record = WordPress. n8n never holds the only copy. ✔ | — |
| Idempotency | n8n side uses `booking.created+<postId>+v1`; WordPress side: double-submit behaviour untested (prior report: BLOCKED); no evidence of nonce/rate limit on the public form (RC5: "3× nopriv AJAX public write paths lack validation evidence") | P1 |
| Restaurant/ops notification | ops mail from `info@` + n8n alert from a personal Gmail; both to shared inboxes | P1 (personal mailbox dependency) |
| Ops link | rendered as `post.php?post5815&action…` in plaintext — probable quoted-printable corruption of `=` | P1 (verify) |
| SLA | escalation at ~15 min, 100 % of sampled bookings unassigned at that point | P1 (mis-tuned) |
| Reconciliation | 19 WP request mails vs 17 n8n alerts in the window; ≥ 2 mismatches | P1 |
| Driver assignment | `DRIVER_STATUS: UNASSIGNED` in every sampled alert; assignment happens outside any observable system (WhatsApp) | P1 (no supplier acceptance/timeout/fallback in the live path) |
| Calendar | 0 events for `AG-REQ` on the owner's calendars | P2 (documented handoff not live) |
| Voucher | AGVOUCHER v1.0 exists locally (record); no customer-facing voucher mail in production mailbox | P2 (not live; acceptable under manual confirmation) |
| Flight / hotel data | flight number is a free-text field (e.g. "ent453"); no validation; hotel = free text or Places string | P2 |
| Analytics | GA4/GTM state undocumented in all repos and prior reports; RC5 lists GTM/dataLayer as an owner decision | P1 (no measurement baseline for a release) |

## 6. AGOS / WJD / Driver Pool integration boundary (`agos-mobility-cloud` @ ca9b7fcd)

This section is completed from the code audit agent's report; see the addendum file
`evidence/agent_mobility_cloud.md` for line-level detail. Summary of the boundary as designed vs as
deployed:

* The app models bookings, marketplace jobs, seat offers, micro-shuttle matching, claim-job links,
  partner API, flight/partner webhooks and a fallback engine, persisted in Cloudflare D1 via 19 drizzle
  migrations; it is deployed only as a private OpenAI Sites instance and is **not connected to the live
  WordPress booking flow** (no reference to `AG-REQ` ids, no WordPress client, no shared secret names).
* Therefore the live supplier/driver handoff is manual (WhatsApp); the "Driver Pool" is a prototype
  with its own store. Owner constraint "n8n must not become assignment authority" is satisfied today
  only because nothing automated assigns.
* Seat maps and seat selection are first-class in the app (`public/vehicles/seat-maps/*`, seat-offer
  routes) — the owner's "remove seat selection" decision applies to the WordPress shuttle form; the
  AGOS app keeps seat inventory for capacity, which is compatible **if** customers are never asked to
  pick a seat.
* Build/test status and defect list: document 10 §C and `evidence/agent_mobility_cloud.md`.
* Concrete blockers before this app may ever answer for a money domain (all line-referenced in the
  evidence file): the public portal collects **no name, phone or email** and keeps the only customer
  handle in `sessionStorage`; every request is answered with **three fictitious "verified driver"
  offers** at fixed net prices (+12 %) regardless of route; a customer click alone moves a request to
  `driver_assigned` and the page says "CONFIRMED" while **no notification of any kind is sent**;
  operator bookings price private transfers at a **flat €96** and shared at €42/pax with no AYT/GZP
  or distance rule; the **first signed-in user becomes master_admin**; two list endpoints return
  **all tenants' reservations** to any signed-in user; the admin console renders unauthenticated;
  reference ids derived from the last six millisecond digits collide against UNIQUE constraints;
  webhook HMAC uses the bearer token as key and can be replayed within 300 s with a new idempotency
  key; `lint` and `tsc` fail; the 23 tests are regex checks over source text.

## 7. Email optionality and seat selection (task IMMEDIATE ITEMS)

* "Alanya live flow still exposes exact seat selection and required email" — **seat selection:
  CONFIRMED live** (indexed form copy). **Email required: NOT PROVEN** from this session; every sampled
  request had an email, and the site references a confirmation email. Treat as P1 until a form-level
  check (required attribute / server validation) is done from an allow-listed host.

## 8. Canonical, redirects, SEO cannibalization

Observed in the index [L]: non-www and www URLs both indexed (`alanyagroup.com/nachrichten/…`);
trailing-slash and no-slash variants (`/antalya-airport-transfer`, `/gazipasa-airport-transfer`);
`-2` slug collision (`/antalya-airport-pickup-service-2/`); RU content at a Cyrillic path on non-www;
TR via `?lang=tr` query; the same intent split over ≥ 6 URLs (`/antalya-alanya-transfer/`,
`/antalya-to-alanya-transfer-distance-duration-price-guide/`, `/transportation-from-antalya-to-alanya/`,
`/antalya-airport-transfer-guide/`, …); German duplicates between root slugs and `/nachrichten/`; a
`<title>` containing literal markdown `**Stress-Free**`. Semrush (TR db): 227 keywords, ~81 visits/month;
DE: 59 keywords, 0 traffic. Record: strong Antalya/Gazipaşa cross-cluster duplication; 384 of 587 money
pages have no booking form; 12 Scandinavian and AR pages outside the language tiers.

No raw HTML fragment or literal shortcode was found in search snippets (task IMMEDIATE ITEM
"possible raw HTML fragment"): **NOT REPRODUCED** in 15 queries; the markdown-in-title is the nearest
artefact. Keep open as P2 until a full crawl is possible.

## 9. Findings register (Alanya)

| ID | Sev | Finding |
|---|---|---|
| ALA-01 | **P0** | Contradictory cancellation/deposit wording live; deposit clause conflicts with cash-only policy. |
| ALA-02 | **P0** | TÜRSAB licence identity (2165 live/owner vs 12892 record) and "operating under Free Time Turizm's document" framing lack documentary proof; legal exposure. |
| ALA-03 | **P0** | No git-identified, SHA-sealed candidate exists for the production WordPress change set; owner decisions cannot be deployed with provenance or rolled back deterministically. |
| ALA-04 | **P0** | Hosting/CDN suspension notices (Güzel Hosting, Cloudflare) in August; site availability depends on unverified payment state. |
| ALA-05 | **P1** | Shuttle seat selection still live; owner decision not implemented. |
| ALA-06 | **P1** | Email required-ness unverified; owner decision (optional) not evidenced. |
| ALA-07 | **P1** | Pricing authority split: three "from" prices for AYT→Alanya (77 / 80 / 81.36), shuttle tiers 3–6 undefined live, AYT↔GZP ban not evidenced, private "other" formula has a dead floor. |
| ALA-08 | **P1** | Distance/duration triple (127/133.4/135 km; 76 min/1.5–2 h). |
| ALA-09 | **P1** | SLA escalation mis-tuned (fires for 100 %); ops links possibly corrupted; 2 unreconciled events. |
| ALA-10 | **P1** | Public form write paths lack validation/idempotency evidence (RC5 Security HOLD). |
| ALA-11 | **P1** | 65 % of money pages have no booking form (coverage), 2 legacy c6 pages, 192 template-injected agsc-v6 pages. |
| ALA-12 | **P1** | Canonical hygiene: www/non-www, slash variants, `-2` slug, query-string TR, duplicate intents. |
| ALA-13 | **P1** | No analytics baseline (GA4/GTM undocumented). |
| ALA-14 | **P1** | Google Maps: only a demo key evidenced; production Places/Distance calls may be on a testing quota. |
| ALA-15 | **P2** | Calendar and voucher handoffs documented but not live. |
| ALA-16 | **P2** | Flight number free text, no validation; no flight-tracking provider. |
| ALA-17 | **P2** | Scandinavian/AR pages outside language tiers; hreflang rebuild risk. |
| ALA-18 | **P2** | Markdown asterisks in an indexed `<title>`. |

## 10. Mandatory Work D coverage

| D-item | Covered in | Status |
|---|---|---|
| booking UX | §2 | partial (live inferred) |
| route and pricing authority | §3 | contradictions documented |
| AYT/GZP rules | §3, §4 | ban not evidenced live |
| shuttle/private/VIP behaviour | §3 | partial |
| email optionality | §7 | unverified |
| removal of seat selection | §7 | not done live |
| flight and hotel data | §5 | free text |
| analytics | §5 | no baseline |
| booking persistence | §5 | OK (WordPress SoR) |
| WhatsApp/manual confirmation | §2 | OK |
| operational handoff | §5, §6 | manual; n8n alert only |
| supplier acceptance, timeout, fallback | §6 | not in live path; prototype in AGOS app |
| calendar and voucher | §5 | not live |
| canonical, redirects, SEO cannibalization | §8 | multiple defects |
| factual consistency (distance, duration, price, cancellation, TÜRSAB) | §4 | contradictions confirmed |
