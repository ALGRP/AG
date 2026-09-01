# Technical Audit — `agos-mobility-cloud` (HEAD `ca9b7fc`, shallow, 1 commit "chore(baseline): capture AGOS implementation surface at 2026-07-27")

Read-only audit. No files modified. Build evidence gathered by running `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test` (which runs `vinext build` + `node --test`). No `.env`/secret values were read or printed (none exist in the repo; `.gitignore` excludes `.env*` and `.dev.vars`).

---

## 0. Executive summary

* This repository is a **Next.js 16 app compiled by `vinext` into a Cloudflare Worker**, hosted through the **OpenAI "Sites" hosting layer** (`.openai/hosting.json` + `build/sites-vite-plugin.ts`), with **Cloudflare D1 (sqlite)** as the *only* real persistence. There is **no in-memory store** for bookings — everything is written to D1 — but every route lazily executes `CREATE TABLE IF NOT EXISTS` at request time, and the Drizzle migrations are not the runtime source of truth.
* The **alanyagroup.com public booking flow** (`/customer` → `WhiteLabelBookingPortal` → `POST /api/reservation-marketplace`) creates a request with **no customer name, phone or e-mail**, immediately attaches **three hard-coded, fictitious "verified driver" offers** (`ahmet.driver@agos.invalid` etc.), lets the customer "accept" one, and then a single client-side button moves the request to `driver_assigned` **without any operator/supplier gate**. The only link between customer and reservation is a token in `sessionStorage`. No email/SMS/WhatsApp is ever sent (no outbound provider exists). This is not a real booking pipeline.
* **Pricing is hard-coded and route-agnostic** in the operator form (`private = €96` flat, `shared = €42 × pax`, shuttle tiers 30/50/60/+10) and in the public portal (net €72/€68/€82 × capacity factor + 12 %). There is no AYT-vs-GZP rule, no distance table, no zone pricing in any booking path; only the partner "global availability" API derives price from haversine distance × rate.
* **Security**: SIWC identity comes from a trusted header (`oai-authenticated-user-email`) injected by the hosting dispatcher; the first real user to hit any tenant API on an empty DB becomes **master_admin** (`establishFirstMaster`). The Master Admin UI at `/` is served to anonymous visitors (data calls 401). Several list endpoints leak cross-tenant data to any signed-in user. Partner API has proper HMAC + timestamp + idempotency + rate limit, but the bearer token doubles as the HMAC key.
* **Restaurant vertical (sultankebabkielce.com)**: only a **table-reservation white-label form** (`VerticalReservationPortal` → `POST /api/domain-reservations`). **No menu, cart, order, delivery, pickup, modifier, allergen, RODO or NIP code exists.** This repo does **not** contain a Sultan Kebab ordering site.
* **Build**: `vinext build` succeeds; the 23 "tests" pass but they are **regex assertions over source files**, not runtime tests. `npm run lint` **fails** (2 errors). Standalone `tsc` **fails** (40 errors; no Cloudflare worker types configured).
* **Docs** are candid: status is "İşlevsel prototip / MVP altyapısı hazır; kontrollü gerçek pilot öncesi geliştirme gerekiyor" and list P0 gaps (live data, tenant isolation, GPS, Maps, U-ETDS, flight, PWA, KVKK). The README is the untouched `vinext-starter` README.

---

## 1. Architecture map

### 1.1 Runtime / hosting

| Piece | Evidence |
|---|---|
| Worker entry | `worker/index.ts:28-45` — `fetch()` handles `/_vinext/image` via `env.IMAGES`, else `handler.fetch(request, env, ctx)` from `vinext/server/app-router-entry`. `Env` declares `ASSETS`, `DB: D1Database`, `IMAGES` (`:5-15`). Note: the `FILES` R2 binding used by `app/api/profile-media/route.ts:12,65,80` and `app/api/vehicle-media/route.ts:13` is **not** in this interface (cast via `env as unknown as {FILES}`). |
| Sites packaging | `build/sites-vite-plugin.ts:27-43` — after Vite `closeBundle`, copies `.openai/hosting.json` and the whole `drizzle/` folder to `dist/.openai/`. |
| Hosting descriptor | `.openai/hosting.json` — `{ "project_id": "<appgprj_…>", "d1": "DB", "r2": "FILES" }` (identifier only, not a secret). |
| Vite config | `vite.config.ts:14-34` — builds a *local* wrangler-style config with a placeholder D1 id `00000000-0000-4000-8000-000000000000` and bucket `site-creator-r2`; `:50-56` plugins `vinext()`, `sites()`, `cloudflare({viteEnvironment:{name:"rsc"…}})`. |
| Generated | `dist/server/wrangler.json` (build artifact; `compatibility_date: "2026-05-15"`, `nodejs_compat`, one D1 + one R2 binding, `no_bundle: true`, `assets.directory`). |
| DB client | `db/index.ts:5-13` — `drizzle(env.DB, {schema})` from `cloudflare:workers`; throws if `env.DB` missing. **`getDb()` is imported by no route** — every route uses raw `env.DB.prepare(...)`. |
| Drizzle | `drizzle.config.ts` dialect `sqlite`, schema `db/schema.ts` (1445 lines, **97 `sqliteTable`s**), migrations `drizzle/0000…0018` (**19 files**, journal timestamps 2026-07-21 → 2026-07-24). Set of tables in migrations == set in `schema.ts` (97 = 97). |
| Postgres file | `db/postgresql-master-modules.sql` (171 lines): `pgcrypto`, `vehicle_configurations`, `vehicle_media`, `supplier_tours`, `fallback_share_links`, `external_driver_claims`, `integration_event_outbox`, `global_booking_seat_assignments` with RLS. **Referenced by nothing at runtime**; it exists so a test can assert `/ENABLE ROW LEVEL SECURITY/` (`tests/rendered-html.test.mjs`, test "implements the master vehicle…"). It is a design artefact, not a persistence layer. |

**Which persistence is real?** Only **D1/sqlite** via `env.DB`. There is no in-memory booking store; `previewOffers`/`fallbackJobs` in components are UI placeholders, not stores. Bookings written by `/api/bookings`, `/api/reservation-marketplace`, `/api/domain-reservations`, `/api/v1/global/bookings` all land in D1 tables. **Caveat**: the runtime schema is created ad hoc — 50+ distinct `CREATE TABLE IF NOT EXISTS` statements are scattered across routes (e.g. `audit_events` defined 6×, `organizations` 5×, `fleet_vehicles` 5× with *differing* column defaults — compare `app/server/master-modules.ts:44-52` `driver_name … DEFAULT 'Atanmadı'` vs `app/server/driver-access.ts:114-121` no default). Whichever route runs first wins; migrations in `drizzle/` are only packaged, never applied by app code.

### 1.2 App routes (from `vinext build` output)

Pages: `/` (OperationsApp, **no auth**), `/admin/domains` (requireChatGPTUser), `/claim-job/:jobId`, `/customer`, `/customer/reservation/:reference`, `/driver` (requireChatGPTUser + verified driver), `/representative/apply`, `/track/:token`, `/r/:code` (redirect + attribution), `manifest.webmanifest`.

API (all `force-dynamic`): `activities, bookings, claim-job, domain-reservations, ecosystem, fallback-engine, fleet-control, geo-pricing, global-directory, identity, marketplace, mobility, operations-reservations, partner/v1/jobs, partner/v1/openapi, platform-foundation, profile-media, reservation-marketplace, supplier-tours, v1/driver/seat-offers, v1/finance/self-billing, v1/global/availability, v1/global/bookings, v1/global/bookings/:id, …/cancel, …/wifi, v1/global/openapi, v1/global/outbound/availability, v1/global/status, v1/global/webhooks/flight-update, v1/global/webhooks/partner-update, v1/micro-shuttle/match, v1/micro-shuttle/matches/:id/complete, v1/sla/events/:id/review, v1/webhooks/flight-update, v1/webhooks/partner-update, v5-safety, vehicle-media, vehicle-studio`.

### 1.3 `app/server/*.ts`

* `tenant-access.ts` — `requireTenantAccess(request, permission?, orgId?)` (`:85-169`): SIWC user or `localhost` preview; runs `ensureTenantAccessSchema`, `ensureConfiguredMaster` (if `AGOS_MASTER_EMAIL` matches), `adoptPreviewMaster`, `establishFirstMaster`; resolves membership; `master_admin` bypasses permission checks and can select any org via `x-agos-organization-id` header (`:115-142`).
* `driver-access.ts` — `getVerifiedDriverContext(email, orgId?)` (`:19-102`): `driver_profiles.verification_status='verified'`, assigned vehicle via `vehicle_assignments` or fallback by `lower(driver_name)=lower(display_name)` (`:71-75`).
* `global-integration.ts` — partner auth/HMAC/idempotency/rate-limit + schema for global hub (`:22-290`), pricing helpers `calculateFloorBand` (`:433`), `calculateCommissionFromNet` (`:440`).
* `master-modules.ts` — seat-map parser (`:200`), AES-GCM Wi-Fi password encryption using `WIFI_ENCRYPTION_KEY` (`:267-295`), WhatsApp share text (`:302`), `randomClaimToken` (`:331`).
* `global-directory.ts` — OurAirports fetch + demo seeds (`:120`, `:199-230`).

### 1.4 `app/domain-registry.ts` (multi-domain white-label)

Static array `managedDomains` (`:39-144`) of 7 domains: `antalyaairporttransfers.net` (en), `antalyaflughafen.com` (de), `antalyagettransfer.com` (en), `agos.tr` (tr), `alanyagroup.com` (tr), `sultankebabkielce.com` (**vertical:"restaurant", reservationMode:"restaurant_booking", defaultLocale:"pl", timeZone:"Europe/Warsaw"**, `:105-117`), `konakhomes.com` (real_estate/en). Resolution:

```ts
// app/domain-registry.ts:150-154
export function resolveManagedDomain(host, previewDomain?) {
  const requested = normalizeDomain(previewDomain) || normalizeDomain(host);
  return managedDomains.find((entry) => entry.domain === requested)
    ?? managedDomains.find((entry) => entry.domain === "alanyagroup.com")!;
}
```

Any unknown host (including the hosting preview URL) renders **alanyagroup.com**. `?domain=` query overrides host (`app/customer/page.tsx:15,24`). `DomainNetworkAdmin.tsx:85` admits: "Dış domainleri canlı AGOS sayfasına yönlendirmek için … her domainin DNS/hosting bağlantısı ayrıca doğrulanmalıdır."

---

## 2. Booking flow — alanyagroup.com tenant

### 2.1 Customer page → `WhiteLabelBookingPortal`

`app/customer/page.tsx:22-27`: `site.vertical !== "mobility"` → `VerticalReservationPortal`, else `WhiteLabelBookingPortal({brand})`.

**Fields** (`WhiteLabelBookingPortal.tsx:202-215`): From (default "Antalya Airport (AYT)"), To (default "Alanya") / chauffeur duration, date, time, passengers 1–16, optional return date/time. **There is no name, phone, e-mail, flight number, hotel, luggage or payment field.** E-mail is therefore **not required — it is not even collected**.

**Client validation** (`:67-74`):
```ts
if (!pickup.trim() || !date || !time) throw new Error("Please select pickup, date and time.");
if (mode === "transfer" && !dropoff.trim()) throw new Error("Please select a drop-off location.");
if (date < today) throw new Error("Past dates cannot be selected.");
…
const pickupAt = `${date}T${time}:00+03:00`;      // offset hard-coded, brand.timeZone ignored
```

**Payload** (`:78-88`): `{action:"create_request", pickup, dropoff, pickupAt, returnPickupAt, passengers, serviceType: "transfer"|"chauffeur", requirements, sourceDomain}`.

**Payment wording**:
* `:217` — "By sending a request, you confirm the passenger details are accurate and agree to the Privacy Policy, Data Processing Notice and Terms & Conditions. Final booking and bank-transfer terms require operator confirmation." (links to no actual policy pages — none exist).
* `:223-229` — trust row: "Price confirmed before booking", "**Pay in vehicle where applicable**", "WhatsApp confirmation", "**No online card charge**", "Flight details reviewed".
* `:292` — heading `<b>3 verified offers</b>` is hard-coded regardless of offers.
* `:305` — sticky WhatsApp button is a `<button>` with **no handler/href**.

**Preview offers** (`:28-32`): before any request the page already shows 3 fake offers (Vito €80.64, Caravelle €76.16, Sprinter €91.84).

### 2.2 `POST /api/reservation-marketplace` (`action:"create_request"`)

* Domain gate `:174-177`: source must be a managed **mobility** domain, else 422.
* Anonymous allowed: `:179-184` rate limit **5 requests/minute per sha256(ip|user-agent)** (`:330-351`), then `actor = public-<hash16>@agos.booking`.
* **Required fields** `:185`: `if (!body.pickup?.trim() || !body.dropoff?.trim() || !body.pickupAt || Number(body.passengers) < 1) → 422 "Rota, tarih ve yolcu zorunludur."` — **no contact data of any kind**.
* Reference `:197`: `` `REQ-${String(Date.now()).slice(-6)}` `` → **6-digit ms suffix, cycles every 1000 s**; column is `UNIQUE` (`:35`) → collision throws unhandled → 500.
* Token `:199-200`: 32 random bytes hex (`randomReservationToken` `:488-491`), stored as sha256 (`hashToken` `:493-496`). Returned in plaintext once.
* **Offers are synthetic** `:203` + `:383-412`:

```ts
function instantOffers(requestId, passengers) {
  const capacityFactor = passengers >= 7 ? 1.28 : passengers >= 4 ? 1.14 : 1;
  return [
    instantOffer(requestId, "vehicle-ag-101", "Mercedes Vito Tourer", "Ahmet Y.", 4.92, 6, 72, "Best match", …, "ahmet.driver@agos.invalid", capacityFactor),
    instantOffer(requestId, "vehicle-vip-34", "VW Caravelle Highline", "Selin A.", 4.87, 11, 68, "Best price", …, "selin.driver@agos.invalid", capacityFactor),
    instantOffer(requestId, "vehicle-sh-242", "Mercedes Sprinter", "Mert K.", 4.76, 17, 82, "More luggage", …, "mert.driver@agos.invalid", capacityFactor),
  ];
}
function instantOffer(…, netEur, …, factor) {
  const driverNetMinor = Math.round(netEur * factor * 100);
  const platformFeeMinor = Math.round(driverNetMinor * 0.12);   // 12 % of net
  …customerTotalMinor: driverNetMinor + platformFeeMinor
```

Price is **independent of route, date, distance, airport (AYT vs GZP)** — AYT→Alanya and AYT→Kemer and "4-hour chauffeur service" all price identically. Currency always EUR.

* Duplicate prevention: **none** beyond the rate limit. No idempotency key, no dedupe on phone/date (no phone exists). Same visitor can create unlimited requests over time.
* `place_offer` `:260-273`: real drivers (SIWC) can add offers; fee = `commission_rate_bps` (1200 default) on net.
* `accept_offer` `:275-290`: owner (or token holder via `actorFromReservationToken` `:353-381`) accepts; request → `accepted`, other offers → `declined`, conversation created between customer email and **`…@agos.invalid`** driver email; response says `settlementMethod: "bank_transfer"`.
* `confirm_booking` `:292-313`: **owner/token holder alone** moves `accepted` → `driver_assigned`. Response: "Yolculuk bilgileri onaylandı; seçilen şoför ve araç görevlendirildi." **No supplier acceptance, no operator confirmation, no notification.** → A request becomes "driver assigned" fully automatically, against a fictitious driver.
* `send_message` `:315-328`: blocks phone/email/WhatsApp mentions (`detectContactSharing` `:505-510`), logs `moderation_events`.

**GET** `:85-160`: with `?reference=` needs `x-agos-reservation-token` or ownership; without it, **any SIWC user gets the last 50 requests + 100 offers of all tenants/domains** (`:156-159`) including `created_by_email`.

### 2.3 `/customer/reservation/[reference]` → `ReservationConfirmationView`

* Token read from `sessionStorage` (`:59`) — closing the tab/opening on another device → "The secure reservation session is missing or expired."
* Shows fake vehicle data from `instantVehicleById` (`route.ts:414-486`) including **hard-coded Wi-Fi passwords in source** (`:436 "AGOS101VIP"`, `:459 "VIP34AGOS"`, `:482 "SHUTTLE242"`) rendered on-page (`View:202-208`).
* Header says "CONFIRMED" (`:150`) immediately after accept; button "Confirm journey & assign driver" (`:230`); copy "No online card payment will be taken. Your confirmation moves the booking to driver assignment." (`:229`).
* Chat "＋" attachment button has no handler (`:237`).

### 2.4 Operator quick booking → `POST /api/bookings` (`OperationsApp.tsx:175-187`)

`BookingInput` (`route.ts:6-21`): organizationId, pickup, dropoff, serviceType `private|shared|shuttle`, passengers, selectedSeats, travelDate, travelTime, departureId, source*. **No passenger name/phone/e-mail.**

Validation `:148-166`:
```ts
if (!body.pickup?.trim() || !body.dropoff?.trim() || !serviceType || passengers < 1 || passengers > 16) → 422
if (serviceType === "shuttle" && selectedSeats.length === 0) → 422 "Shuttle rezervasyonu için en az bir koltuk seçin."
if (serviceType === "shuttle" && selectedSeats.length !== passengers) → 422 "…yolcu sayısı kadar koltuk seçin."
if (serviceType === "shuttle" && selectedSeats.some((seat) => !/^[1-4][A-D]$/.test(seat))) → 422
```
→ **Seat selection IS required for shuttle**, seats are a fixed 4×4 grid `1A…4D` (`OperationsApp.tsx:59`) with **fake baseline occupancy** `["1A","1B","2D","3C","4A"]` (`:60`) merged with D1 (`:120`). Default `departureId = "departure-ayt-0930"` (`route.ts:191`), seeded as `2026-07-22T09:30` (`api/mobility/route.ts:46`).

Pricing `:168-172`:
```ts
const totalCents = serviceType === "private"
  ? 9600
  : serviceType === "shared"
    ? passengers * 4200
    : passengers === 1 ? 3000 : passengers === 2 ? 5000 : passengers === 3 ? 6000 : 6000 + (passengers - 3) * 1000;
```
Mirrored client-side (`OperationsApp.tsx:146-153`) and in docs §9.1 (1→€30, 2→€50, 3→€60, 4→€70, 5→€80, +€10). **Private/VIP = flat €96 for any route; no AYT/GZP distinction; no distance data.** UI labels: "Özel VIP … €96", "Paylaşımlı VIP … €42 / kişi", "Shuttle … €30'dan" (`:352-355`).

* Status `:189`: `serviceType === "shuttle" ? "shared_pool" : "confirmed"` → **private/shared bookings are `confirmed` instantly** with no supplier/operator gate.
* Date default `:203-204`: `body.travelDate ?? "2026-07-22"`, `body.travelTime ?? "09:30"` — hard-coded past date fallback.
* Reference `:188` `` `AG-${String(now).slice(-6)}` `` (same collision class). Pool ref `SHP-` 7 digits.
* Seat double-booking prevented by `UNIQUE (departure_id, seat_number)` (`:78`) + batch → 409 (`:276-284`). No lock, but batch is atomic in D1.
* Auth: `requireTenantAccess(request,"jobs:write", organizationId)` (`:175`). Attribution row + `audit_events` written.
* Commission: `seller_commission_minor = totalCents × shuttle_commission_rate_bps(1500)/10000` (`:194-195`).

### 2.5 Partner "global" bookings — `POST /api/v1/global/bookings`

* Auth = `authenticateGlobalPartner(…, "global:bookings")` + `beginIdempotentOperation` (**Idempotency-Key required**, `global-integration.ts:377-379`).
* Required `:60-69`: `partner_code, external_booking_id, search_id, offer_id, passenger.name`. **Phone optional (masked via `maskPhone`), e-mail not accepted at all.** `flight_number` optional, `selected_seat_ids` optional (`validateSelectedSeats:252 if (!requested?.length) return [];`) → **seat selection not required even for micro-shuttle**, validated against `vehicle_configurations.seat_map_layout` when provided.
* Duplicates: `UNIQUE (partner_organization_id, external_booking_id)` (`global-integration.ts:96`) + idempotency table; `operation_locks` 30 s (`:83-105`).
* Price = offer from `/api/v1/global/availability`: non-shuttle `netFare = max(minimumFare, ceil(haversine×1.18 × ratePerKm))` with `ratePerKm VIP 165 / PRIVATE 125 / SHUTTLE 55 (minor units per km)`, minimums `6500/4500/3000` (`availability/route.ts:84,162-164`), commission `calculateCommissionFromNet(net,1500)` → `total = ceil(net×10000/8500)` (15 % of total ≈ 17.6 % markup on net).
* Status written **`CONFIRMED`** immediately (`:151`), vehicle set `assigned`, webhook outbox row queued — **but no dispatcher ever reads `partner_webhook_outbox`** (grep: only INSERT/CREATE). Cancel: free before `pickup − 4 h`, else 25 % penalty (`cancel/route.ts:163-164`).

### 2.6 Operations view — `GET /api/operations-reservations`

Aggregates `bookings`, `reservation_requests`, `marketplace_jobs`, `global_partner_bookings` (`:39-62`); master sees everything, non-master filtered by tenant/actor (`:33-37`). Returns `moneyMovement:"DISABLED", settlementMode:"BANK_TRANSFER_LEDGER_ONLY"` (`:95-96`). `ReservationOperationsView.tsx:155-157` shows passenger/flight/"Müşteriden alınacak" — for customer-portal requests these are always the placeholders "Rezervasyon yolcusu / Platform içi iletişim / Uçuş bilgisi yok" because no such data is captured.

### 2.7 Tracking, voucher, calendar, flight, hotel, analytics

| Item | Finding |
|---|---|
| Tracking `/track/[token]` | `app/track/[token]/page.tsx:21-25` — sha256(token) lookup in `live_tracking_links` joined to **`bookings`** (operator bookings only, not `reservation_requests`), 36 h expiry created by `/api/v5-safety` (`:112-151`). Shows static text "Aracınız operasyon tarafından hazırlanıyor" — no GPS. Turkish-only. |
| Voucher / PDF / e-mail confirmation | **None.** No email/SMS/WhatsApp provider; only outbound `fetch` in the app is OurAirports (`global-directory.ts:120`). |
| Calendar | None (no ICS, no calendar API). |
| Flight data | `flight_watches` rows created with `provider 'credentials_required'`; only updated by partner webhook `flight-update`. No live provider. |
| Hotel data | None in booking paths; `directory_businesses` demo seeds (`global-directory.ts:199-205`). |
| Analytics | `/r/[code]` writes `attribution_events` (`app/r/[code]/route.ts:24-25`) with sha256(ip|ua|date); `booking_attributions` per operator booking. Dashboard metrics on `/` are hard-coded strings (`OperationsApp.tsx:412-415`, `:440-497`). |

---

## 3. Supplier / driver side

### 3.1 Driver job pool (`/driver` → `DriverJobPoolView`)

* Gate: `requireChatGPTUser("/driver")` + `getVerifiedDriverContext(user.email)` (`driver/page.tsx:10-11`).
* Component initial state is **fake jobs** `fallbackJobs` (`DriverJobPoolView.tsx:44-48,51`, e.g. `passenger_name:"Rachel Brooksbank"`); replaced only on a successful `GET /api/marketplace?scope=driver`; on non-401/403 failure the fake list stays visible (`:89-95`).
* `GET /api/marketplace` (`:244-332`) requires `jobs:read` membership; driver scope re-checks verified profile (`:249-256`); hides `sale_price_minor` for other tenants (`:264`); passenger PII revealed only when `details_unlocked` (accepted assignment by driver's tenant) or master (`:289-311`).
* Actions `place_bid` / `buy_now` require `bids:write` + verified driver + the vehicle to be **actively assigned** to that driver (`:343-357`, `authorizeDriverVehicle`).
* `buy_now` (`:451-546`): 30 s `operation_locks` on job + vehicle, re-check status, atomic batch → job `claimed`, vehicle `assigned`, `dispatch_assignments accepted`, transaction with **5 % + 5 % on PASS** (`:464-467`), ledger rows `pending_completion`.
* `create_job` (`:379-424`): after insert, `findBestVehicle` (`:840-859`) scores by haversine, route alignment, capacity, rating; **auto-assigns** if `distanceKm <= 35 && score >= 78` (`:415-419`) → status `matched`. **Assignment authority for marketplace jobs = whichever verified driver clicks "Hemen al" first, or the auto-dispatch heuristic; no operator approval step.**
* Timeouts: none for bids/offers (docs P1.5 "Teklif süresi ve otomatik sona erme" is listed as missing). Pickup-based urgency only (`:299-301`).

### 3.2 Partner job intake `POST /api/partner/v1/jobs`

Zones limited to 8 hard-coded labels (`:24-33`: AYT, ALANYA, SIDE, GZP, BELEK, KEMER…); validation `:130`; reference `API-` 7 digits; no auto-dispatch here.

### 3.3 Micro-shuttle & seat offers

* `POST /api/v1/driver/seat-offers` (tenant `fleet:manage`): validates polyline ≥ 2 points, window, seats ≤ capacity, VIP lock overlap (`:92-102`), price must be inside `calculateFloorBand(distanceKm, seats)` = `min = max(€10, ceil(km×18)×1.35/seats)`, `max = max(€30, 3×min)` (`global-integration.ts:433-438`), commission 15 % from net (`:115`), corridor fixed 2000 m, `is_auto_accept=1`.
* `POST /api/v1/micro-shuttle/match` (partner `micro_shuttle:write`): picks best ACTIVE auto-accept offer within origin radius/corridor, deviation ≤ 5 min (`:71-75`), decrements seats and writes `micro_shuttle_matches` status **`AUTO_ACCEPTED`** (`:115`). **Authority = algorithm; the driver is never asked.**

### 3.4 Fallback engine / external claim

* `POST /api/fallback-engine action:"scan"` (tenant `jobs:write`): jobs with pickup in `[-5 min, +60 min]` and idle vehicles get a one-time WhatsApp share link (`:84-87`, `:129-163`); token 32 random bytes base64url, stored as sha256; expiry `min(now+70m, max(now+10m, pickup+10m))` (`:148-151`). Message template `master-modules.ts:302-329`.
* `POST /api/claim-job` (**unauthenticated**, `:16`): needs `job_id`, token ≥ 32 chars, plate `^[A-Z0-9]{5,14}$`, phone 10–15 digits (`:28`); max 10 attempts (`:44-46`, default `max_attempts 10`); plate must already exist in `fleet_vehicles` and be `available` (`:49-57`); locks, then claims job + creates `uetds_manifests` with `status 'credentials_required'` and outbox `BLOCKED_CREDENTIALS` (`:125-148`). Phone stored as sha256 + mask. Note `share.attempt_count` is incremented **before** the plate/vehicle checks, so an attacker can burn a link's 10 attempts (denial) with any junk plate.

**Who is the assignment authority?** There is no single one: (a) customer portal — the customer's own click (`confirm_booking`); (b) marketplace — first driver `buy_now` or heuristic auto-dispatch; (c) micro-shuttle — algorithm `AUTO_ACCEPTED`; (d) global partner bookings — partner's POST → `CONFIRMED` instantly; (e) fallback — anyone holding a WhatsApp link + a registered plate. Operators only *observe* via `/api/operations-reservations`; there is no "operator approves/declines" endpoint anywhere.

---

## 4. Webhooks

* `app/api/v1/webhooks/flight-update/route.ts:1` and `…/partner-update/route.ts:1` are one-line re-exports of the `v1/global/webhooks/*` handlers.
* Both are **inbound** endpoints from partners (not signed outbound calls). Auth chain (`global-integration.ts:327-370`):
  1. `Authorization: Bearer agos_live_…` (`:334`), sha256 looked up in `api_clients` (`:337-342`), scope `global:webhooks` required (`:355`).
  2. **HMAC-SHA256** over `` `${timestamp}\n${METHOD}\n${pathname}\n${rawBody}` `` (`:515-538`) with **the bearer token itself as the key** (`:527-533`), header `x-agos-signature` (64 hex), constant-time compare (`:590-597`).
  3. **Timestamp** header `x-agos-timestamp` must be within **±300 s** (`:519`).
  4. **Idempotency-Key** mandatory `^[A-Za-z0-9._:-]{8,128}$`, stored 24 h with request hash; same key + same body → cached replay with `idempotent-replay: true`; different body → 409 (`:372-407`).
  5. Rate limit **120 req/min per client** in `api_rate_limits` (`:541-558`).
* **Replay protection gaps**: there is no nonce; a captured request can be replayed within the 300 s window with a *different* Idempotency-Key and will be processed again (signature does not cover the key). Token-as-HMAC-key means anyone with the bearer token can forge signatures (no separate signing secret).
* `flight-update` (`:39-45`): requires `booking_id, flight_number, scheduled_at, estimated_at, flight_status ∈ {scheduled,delayed,landed,cancelled,diverted}`; shifts `pickup_at` by delay (`:58-63,82-84`) — pickup only ever moves later, never earlier, and re-applying an update re-adds delay to an already-shifted pickup (idempotency only guards identical bodies).
* `partner-update` (`:126-133`): status machine; `DRIVER_NO_SHOW` penalty 50 %, `LATE` 10 % → `sla_events pending_review` (`:188-192`).
* **Secrets expected (names only)**: `AGOS_MASTER_EMAIL` (`tenant-access.ts:172`), `WIFI_ENCRYPTION_KEY` (`master-modules.ts:268,281`), `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (ReturnAutomationView), Cloudflare bindings `DB`, `FILES`, `ASSETS`, `IMAGES`; partner bearer tokens `agos_live_*` generated by `/api/ecosystem create_api_client` (`:87-106`, shown once, stored hashed). No webhook-signing secret variable exists.

---

## 5. Restaurant vertical — sultankebabkielce.com

* Registry entry `domain-registry.ts:105-117`: `vertical:"restaurant"`, `reservationMode:"restaurant_booking"`, `defaultLocale:"pl"`, strapline "RESTAURACJA · REZERWACJA · ODBIÓR", heading "Zarezerwuj stolik w Sultan Kebab", `timeZone:"Europe/Warsaw"`, but **logo/hero reused from Alanya Group** (`common.logoUrl:"/brand/alanya-group-emblem.png"`, `heroUrl:"/brand/alanya-group-airport-transfer-hero.webp"` `:32-37`).
* Rendered by `VerticalReservationPortal` (`:6-32`): Polish labels only for badge/date/time/people/reference/name/contact/note/submit/success; the rest of the page is English/Turkish ("AGOS source tracking · secure confirmation" `:84`, trust row "✓ Domain source recorded ✓ Tenant-scoped access ✓ No online card charge ✓ Secure confirmation" `:98`, nav link "AGOS Network" → `/customer`). Brand mark is the literal string "SK" (`:77`).
* Form fields: date, time, guests 1–12, "Preferowana strefa / okazja", **name (required)**, **"Telefon lub e-mail" (required, single free-text)**, notes. Submits `preferredAt: \`${date}T${time}:00\`` **without timezone** (`:57`).
* API `POST /api/domain-reservations` (`:59-119`): rejects mobility domains; `partySize 1–50`, `customerName 2–100`, `contact 4–160`; 5/min rate limit; stores raw `customer_name`, `contact_value`, `note` in `domain_service_reservations` with `status 'pending_confirmation'`; reference `DOM-` 6 digits. **No confirmation is ever sent** (message: "Talep, ilgili domain ve tenant kaynağıyla oluşturuldu."). `GET` (`:49-57`) lists the last 100 reservations **of all tenants** to **any** SIWC user (no tenant check; contact fields omitted).
* Grep for `menu|cart|order|delivery|pickup(time)|modifier|allergen|RODO|NIP|dostawa|zamów|koszyk` across `app/`, `db/`, `docs/`: hits are only `ActivityCommerceView` "orders" (activity cross-sell), `master-menu-head` (admin sidebar CSS), a demo directory business with `{"delivery":true}` metadata (`global-directory.ts:205`), and `docs` listing "Restoran" under *future* cross-sell that "Şimdilik kapalı kalmalı" (`AGOS-V7-EKSIKLER…:296-305`).
* **Conclusion: this repo contains only a generic table-reservation white-label form for Sultan Kebab. There is no menu, cart, ordering, delivery/pickup, modifiers, allergens, RODO consent, NIP/invoice, or Polish legal content. It is not the Sultan ordering site.**

---

## 6. Security

| Area | Finding | Evidence |
|---|---|---|
| Identity | Trusts `oai-authenticated-user-email` header injected by the hosting dispatcher; no session/cookie handling in app. Fine *only* if the platform strips client-supplied headers. | `chatgpt-auth.ts:10,19-36` |
| Master bootstrap | On a DB with no `master_admin`, **the first non-preview actor becomes master_admin** (`candidateEmail = existing?.user_email ?? actor`) and any preview master is transferred to that first real user. Race: first person to log in owns the platform. Optional `AGOS_MASTER_EMAIL` override. | `tenant-access.ts:257-285`, `:208-255`, `:171-174` |
| Local bypass | `hostname === "localhost"` → `local-preview@agos.invalid` treated as authenticated/owner in many routes (`reservation-marketplace.ts:80-83,282,300,320`, `identity.ts:17-20`, `mobility.ts:59`). Safe only if never reachable via Host: localhost. | |
| Admin UI | `/` renders the full "Master Admin" console to anonymous users (`app/page.tsx:5-7`, no `requireChatGPTUser`); hard-coded "Emre Akın · Super Admin" (`OperationsApp.tsx:283`). Data fetches 401, but the UI, seat map, prices, and workflow are public. `/admin/domains` only requires *any* SIWC user (`admin/domains/page.tsx:12`). | |
| Cross-tenant reads | `GET /api/reservation-marketplace` (no ref) → all requests/offers + emails to any SIWC user (`:156-159`). `GET /api/domain-reservations` → all tenants (`:49-57`). `GET /api/operations-reservations` for non-master filters `reservation_requests` by `created_by_email` only (`:36`). | |
| Rate limiting | Public create endpoints: 5/min per (ip|ua) hash — trivially rotated by UA string (`reservation-marketplace.ts:330-351`, `domain-reservations.ts:121-142`). Partner APIs: 120/min per client. Authenticated internal APIs: none. `/api/claim-job`: 10 attempts per link, no IP limit. | |
| Input validation | Consistent manual checks; no schema library. Free-text pickup/dropoff unbounded length in `reservation-marketplace` (no max). `note` capped 1000, `message` 1000. SQL is parameterised throughout (no string interpolation found except `global/status` `${table}/${column}` from a fixed internal list). | |
| Secrets | No secrets in repo. Wi-Fi passwords AES-GCM with key derived `sha256(WIFI_ENCRYPTION_KEY)` (`master-modules.ts:344-347`); **but** demo Wi-Fi credentials are literal in `reservation-marketplace.ts:436,459,482` and shown to customers. Partner tokens hashed; bearer token doubles as HMAC key. | |
| CORS / CSRF | No CORS headers anywhere (same-origin only). All state-changing APIs are JSON POST relying on SIWC header — no CSRF token, no Origin check; if the dispatcher forwards identity on cross-site POSTs, CSRF is possible (unverified, depends on hosting). | grep `access-control` → none |
| PII in logs | No `console.*` calls. PII persisted: `created_by_email` on every row, `domain_service_reservations.contact_value` plaintext, `attribution_events.session_hash` = sha256(ip|ua|date). `audit_events` stores actor emails. `public/sw.js:160-167` caches **every same-origin GET including `/api/*` JSON** in Cache Storage (cache-first only on network failure) — authenticated data lands in browser cache. | |
| Tokens | Reservation/tracking/claim tokens: 32 random bytes, sha256-stored, compared via DB equality (fine). Reservation token persisted in **sessionStorage** and sent as header (`ReservationConfirmationView.tsx:59-64`). | |

---

## 7. i18n / SEO

* `app/layout.tsx:51` — `<html lang="tr">` for **every** domain (English, German, Polish sites included). Root metadata title/description are Turkish AGOS marketing text (`:26-27`), OG `locale: "tr_TR"` (`:37`), same `og-activity-commerce.png` for all domains. `app/customer/page.tsx:13-20` overrides only `title`/`description` per brand.
* `manifest.ts` — name "AGOS Mobility Cloud", `lang: "tr"`, `icons: []` for all domains.
* Locale field `brand.locale` / `defaultLocale` is **never used to switch UI language** (grep: only `DomainNetworkAdmin.tsx:19,54` for display). `WhiteLabelBookingPortal` body copy is 100 % English for all 6 mobility domains (including alanyagroup.com and agos.tr whose brand heading is Turkish), while API error strings are Turkish (e.g. "Rota, tarih ve yolcu zorunludur."). `VerticalReservationPortal` mixes Polish labels with English/Turkish chrome.
* `OperationsApp.tsx:271` has a TR/EN/DE/RU/AR switcher that only translates ~17 nav labels (`:62-67`) and sets `document.documentElement.lang/dir` (`:93-96`); no PL. `supported_locales` seed in `platform-foundation` is data only.
* **No `robots.txt`, `sitemap.*`, canonical, `alternates`/hreflang anywhere** (grep returns only HMAC "canonical" variables). `find` shows no robots/sitemap files.
* **Duplicate-content risk: high.** Six domains render byte-identical component trees (same process section, trust row, offer cards, images, "AGOS White-Label Website Package" note `:301`) differing only in H1/eyebrow/description/accent; `?domain=` lets every host render every other brand (`resolveManagedDomain`), so `alanyagroup.com/customer?domain=antalyaflughafen.com` serves the German brand under the Turkish host; unknown hosts fall back to Alanya Group. `/customer/reservation/*` and `/track/*` are unbranded "AGOS Mobility Cloud".

---

## 8. Tests — `tests/rendered-html.test.mjs` (765 lines, 23 `test()`s)

* Every test does `readFile()` on source files (`app/**/*.tsx`, `app/api/**/*.ts`, `db/schema.ts`, `drizzle/00xx.sql`, `.openai/hosting.json`, `package.json`, `public/sw.js`) and one build artefact (`dist/server/index.js`), then `assert.match(text, /regex/)` — e.g. `assert.match(route, /commissionRateBps = 500/)`, `assert.match(bookingPortal, /No online card charge/)`, `assert.match(postgres, /ENABLE ROW LEVEL SECURITY/)`, `assert.doesNotMatch(page + workspace, /codex-preview|Your site is taking shape/)`.
* **No HTTP request, no D1, no rendering, no business-logic execution.** They are presence-of-string checks that lock marketing copy and identifiers, not behaviour. A pricing or validation regression would not be caught.
* Run result: `npm test` → `vinext build` OK, then `# tests 23 / # pass 23 / # fail 0` (`TEST_EXIT=0`).

---

## 9. Deployment & build evidence

* **Hosting**: OpenAI Sites (`.openai/hosting.json`, `dist/.openai/{hosting.json,drizzle/}` packaged by `build/sites-vite-plugin.ts`). README: "This starter does not use `wrangler.jsonc`" — confirmed; there is **no `wrangler.toml/jsonc`** in the repo (only the generated `dist/server/wrangler.json`). Cloudflare Vite plugin emulates D1/R2 locally with placeholder ids.
* **CI**: none (`find` shows no `.github/`, no `*.yml`). **Dockerfile**: none. **No `.env*`, `.dev.vars`** committed.
* **Migrations**: `drizzle/` copied into the bundle for the platform; app itself never runs them and instead `CREATE TABLE IF NOT EXISTS` on every request.
* **Environment variable / binding names referenced**: `DB`, `FILES`, `ASSETS`, `IMAGES`, `AGOS_MASTER_EMAIL`, `WIFI_ENCRYPTION_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`, plus tooling `WRANGLER_LOG_PATH`, `WRANGLER_WRITE_LOGS`, `MINIFLARE_REGISTRY_PATH`, `CODEX_SANDBOX`, `HTTPS_PROXY` (build-time only). Request headers used as auth: `oai-authenticated-user-email`, `oai-authenticated-user-full-name(-encoding)`, `x-agos-organization-id`, `x-agos-reservation-token`, `x-agos-timestamp`, `x-agos-signature`, `idempotency-key`, `authorization`.
* **Build results (this session, Node v22.22.2, npm 10.9.7)**:
  * `npm ci` — exit 0.
  * `npm run lint` — **exit 1, 2 errors**: `app/components/GlobalDirectoryView.tsx:78:26 react-hooks/set-state-in-effect`; `app/representative/apply/page.tsx:36:9 @next/next/no-html-link-for-pages`.
  * `npx tsc --noEmit -p tsconfig.json` — **exit 2, 40 errors**: 33× `TS2307: Cannot find module 'cloudflare:workers'`, `worker/index.ts:6-7 Cannot find name 'Fetcher' / 'D1Database'` (no `@cloudflare/workers-types` / `worker-configuration.d.ts`), plus implicit-any errors in `operations-reservations/route.ts:75,78`, `supplier-tours/route.ts:35`, `vehicle-studio/route.ts:43`, `global-integration.ts:283`, `tenant-access.ts:114,128`. (`tsc` is not part of any npm script; `vinext build` does not type-check, so this is latent.)
  * `npm test` (`vinext build` + node:test) — **exit 0**; build emitted route table shown in §1.2; warning "Some routes could not be classified".
* Fonts: `next/font/google` (Geist) requires network at build (`layout.tsx:2,10-18`).

---

## 10. Docs (`docs/*.md`, Turkish)

* **`AGOS-V7-EKSIKLER-VE-SONRAKI-ADIMLAR.md`** (391 lines, 2026-07-23). Line 4: "**Durum:** İşlevsel prototip / MVP altyapısı hazır; kontrollü gerçek pilot öncesi geliştirme gerekiyor." P0 gaps: P0.1 screens still on sample data (`:23-25`), P0.2 tenant isolation not uniform (`:36-38`), P0.3 no real GPS (`:51-53`), P0.4 Google Maps keys (`:67-69`), P0.5 U-ETDS not submitted to ministry (`:84-86`), P0.6 no live flight provider (`:100-102`), P0.7 driver PWA missing (`:114-116`), P0.8 KVKK/legal/security (`:130-144`, explicitly "API hız sınırı, idempotency anahtarı ve webhook imzası"). P1.2: "gerçek WhatsApp OTP ve mesaj sağlayıcısı bağlı değil" (`:162-164`), "E-posta, push ve isteğe bağlı SMS" listed as to-do (`:170`). P1.6 shuttle: "Aynı koltuğun iki kez satılmasını engelleyen kilit" listed as missing (`:216`) even though `/api/bookings` has a UNIQUE constraint. P2.2 n8n production flows (`:250-258`). P2.6: restaurant/real-estate cross-sell "Şimdilik kapalı kalmalı" (`:296-305`). "Mevcut testler derleme ve ana kaynak sözleşmelerini kontrol ediyor" (`:332`) — consistent with §8. No mention of Sultan, WJD, or a "driver pool" beyond Sprint A/B.
* **`AGOS-A-DAN-Z-YE-MASTER-SISTEM-RAPORU-2026-07-23.md`** (2620 lines). §5 status legend (`:322-338`): "Çalışan çekirdek / Hibrit / Arayüz prototipi / Entegrasyon bekliyor / Bilinçli olarak kapalı", with the key sentence "gerçek pilot öncesinde bütün ekranların canlı veriye bağlanması, tenant izolasyonu, gerçek GPS, Google Maps, uçuş, bildirim ve hukuk/güvenlik katmanlarının tamamlanması gerekir." §7 labels most screens "Arayüz prototipi"/"Hibrit"; §7.17 "Müşteri Teklif Pazarı — Çalışan çekirdek + **örnek teklif listesi**" (matches the synthetic offers). §9 pricing (`:904-978`): shuttle table 30/50/60/70/80/+10; job hand-off 5 %+5 %; customer offer market "%12 hizmet bedeli … nihai iş kararı değildir"; member shuttle 15 %; activity 15 % of gross margin; online payment "alınmaz; banka havalesi; cari; cüzdan; dekont". §31 P0 list (`:1992-2010`) repeats live D1, tenant isolation, atomic seat lock, idempotency, PWA, GPS, Maps, flight, notifications, KVKK, audit, secrets, finance, backup. §24 n8n workflows, §23 Gmail/e-posta are design-only. Ends with a prompt template asking "other AIs" for critique (`:2244+`). Seat map: §41.1 "Araç ve vektörel koltuk stüdyosu". No Sultan/WJD mention.
* **`AGOS-RAKIP-ANALIZI-VE-AKTIVITE-CROSS-SELL-2026-07-23.md`** (202 lines): competitor notes (Maxirez, GetTransfer, Suntransfers, 724Transfer, ATM, Bizim, AlanyaTransfer) and the activity cross-sell data model derived from `AlanyaGroup_Master (1).xlsx`. No Sultan/WJD/n8n content.
* **README.md** is the stock `vinext-starter` README ("`db/schema.ts` starts intentionally empty", "`examples/d1/`") — stale and misleading relative to the 97-table schema.

---

## 11. Defect list

### P0 — data loss / false pricing / wrong booking / security / legal / authority

| # | Defect | Evidence |
|---|---|---|
| P0-1 | **Public booking captures no customer identity or contact** (no name/phone/email); the only handle is a sessionStorage token. Operator cannot contact the passenger; passenger loses the reservation on tab close/device change. | `WhiteLabelBookingPortal.tsx:202-215,163`; `reservation-marketplace.ts:185`; `ReservationConfirmationView.tsx:59` |
| P0-2 | **Fictitious "verified drivers/offers"** are generated for every request (`@agos.invalid` emails, fixed prices, fake ETA/rating). Customers "accept" and are told "CONFIRMED" / "DRIVER ASSIGNED" with vehicle, plate-less driver, and Wi-Fi password. | `reservation-marketplace.ts:383-412,414-486`; `WhiteLabelBookingPortal.tsx:28-32,292`; `ReservationConfirmationView.tsx:150,156` |
| P0-3 | **No manual confirmation / supplier acceptance gate**: `confirm_booking` (customer click) sets `driver_assigned`; `/api/bookings` sets `confirmed`; `/api/v1/global/bookings` sets `CONFIRMED`; micro-shuttle `AUTO_ACCEPTED`. Portal copy promises "operator confirmation" that never happens. | `reservation-marketplace.ts:292-313`; `bookings.ts:189`; `global/bookings.ts:151`; `micro-shuttle/match.ts:115`; `WhiteLabelBookingPortal.tsx:217` |
| P0-4 | **Route-agnostic / false pricing**: private €96 flat, shared €42/pax, portal offers €72/68/82 × factor + 12 % regardless of AYT vs GZP, distance, date, vehicle. No pricing table for the alanyagroup tenant exists. | `bookings.ts:168-172`; `OperationsApp.tsx:146-153`; `reservation-marketplace.ts:384-400` |
| P0-5 | **No outbound notification of any kind** (email/SMS/WhatsApp/webhook dispatcher). `partner_webhook_outbox` is written but never delivered. "WhatsApp confirmation" claim in UI is false. | grep: only outbound fetch is `global-directory.ts:120`; `WhiteLabelBookingPortal.tsx:226` |
| P0-6 | **Reference collisions → 500**: `REQ-`/`AG-`/`DOM-` use last 6 ms digits (cycle 1000 s), `MKT-` last 5 (cycle 100 s); all UNIQUE; no retry. Guaranteed failures at modest volume. | `reservation-marketplace.ts:197`; `bookings.ts:188`; `domain-reservations.ts:89`; `marketplace.ts:397` |
| P0-7 | **First-user-becomes-master_admin** bootstrap and preview-master adoption; no allow-list unless `AGOS_MASTER_EMAIL` set. | `tenant-access.ts:257-285,208-255` |
| P0-8 | **Cross-tenant data exposure** to any signed-in user: all reservation requests/offers (+creator emails), all domain reservations. | `reservation-marketplace.ts:156-159`; `domain-reservations.ts:49-57` |
| P0-9 | **Legal**: consent text references Privacy Policy / Data Processing Notice / T&Cs that do not exist; Polish site stores name+contact with no RODO clause; no KVKK text; no cookie/consent handling. | `WhiteLabelBookingPortal.tsx:217`; `VerticalReservationPortal.tsx:83-96`; docs P0.8 |
| P0-10 | **Schema drift**: runtime tables created ad hoc per route with differing definitions; migrations not applied by app. Later `ALTER`s wrapped in try/catch. Risk of silent column/default mismatch across environments. | e.g. `master-modules.ts:44-52` vs `driver-access.ts:114-121`; `reservation-marketplace.ts:66-71` |
| P0-11 | **Hard-coded past date fallback** `travelDate ?? "2026-07-22"` writes a stale date into confirmed bookings when the field is absent. | `bookings.ts:203-204,227` |

### P1 — release-blocking functional / UX / SEO / ops

| # | Defect | Evidence |
|---|---|---|
| P1-1 | Restaurant/real-estate `preferredAt` has no timezone; server past-check uses UTC; Warsaw bookings off by 1–2 h. | `VerticalReservationPortal.tsx:49,57`; `domain-reservations.ts:72,76` |
| P1-2 | `<html lang="tr">`, Turkish root metadata, `tr_TR` OG, Turkish manifest for EN/DE/PL domains; no hreflang/canonical/robots/sitemap; identical content across 6 domains; `?domain=` lets any host serve any brand. | `layout.tsx:26-51`; `manifest.ts`; `domain-registry.ts:150-154` |
| P1-3 | Portal UI language never follows `brand.locale`; body copy English on Turkish/German/Polish sites; API errors Turkish. | `WhiteLabelBookingPortal.tsx` (no locale use); `reservation-marketplace.ts` messages |
| P1-4 | Sultan Kebab site uses Alanya Group logo/hero image and AGOS transfer chrome; "SK" text logo. | `domain-registry.ts:32-37,116`; `VerticalReservationPortal.tsx:77,84,98` |
| P1-5 | `npm run lint` fails (2 errors); `tsc` fails (missing Cloudflare types + implicit any); tests are regex-only. | §9, §8 |
| P1-6 | Master Admin console served unauthenticated at `/`; hard-coded "Emre Akın · Super Admin", fake KPIs ("84 rezervasyon", "13 araç") and fake trips. | `app/page.tsx`; `OperationsApp.tsx:53-57,283,412-415` |
| P1-7 | Driver pool shows fake jobs incl. a fake passenger name on load/failure. | `DriverJobPoolView.tsx:44-48,51,89-95` |
| P1-8 | Shuttle seat map is a fixed 16-seat `1A–4D` grid with hard-coded baseline occupancy; single seeded departure `departure-ayt-0930` on 2026-07-22; no departure calendar. | `OperationsApp.tsx:59-60`; `bookings.ts:164,191`; `mobility.ts:46` |
| P1-9 | Webhook replay possible within 300 s with a different Idempotency-Key; HMAC key = bearer token; flight-update re-applies delay cumulatively. | `global-integration.ts:372-407,515-538`; `flight-update.ts:58-63,82-84` |
| P1-10 | `/api/claim-job` increments attempt counter before validating plate → link can be exhausted by anyone; unauthenticated. | `claim-job.ts:44-57` |
| P1-11 | Public rate limit keyed on IP+User-Agent (rotatable); no limit on authenticated APIs; D1 write per request for limiting. | `reservation-marketplace.ts:330-351` |
| P1-12 | Service worker caches all same-origin GETs including authenticated `/api/*` JSON. | `public/sw.js:160-167` |
| P1-13 | Non-functional controls: sticky WhatsApp button, chat attachment "＋", header "My Offers" link before request; "3 verified offers" static label. | `WhiteLabelBookingPortal.tsx:305,292`; `ReservationConfirmationView.tsx:237` |
| P1-14 | Tracking page joins only `bookings`; customer-portal reservations (`reservation_requests`) can never get a tracking link; page is Turkish-only, no GPS. | `track/[token]/page.tsx:21-25` |
| P1-15 | Commission base inconsistent across modules (12 % of net; 15 % of total; 15 % of gross margin; 5 %+5 % of PASS) and hard-coded rather than tenant-configured for the customer market. | `reservation-marketplace.ts:396`; `global-integration.ts:440-443`; `activities.ts:231-235`; `marketplace.ts:464-467` |
| P1-16 | `fleet_vehicles`/driver mapping falls back to `lower(driver_name)=lower(display_name)` string match — wrong vehicle attribution when names collide. | `driver-access.ts:71-75` |
| P1-17 | `partner_webhook_outbox`, `integration_event_outbox`, `uetds_manifests (credentials_required)` accumulate with no worker/cron to process them (no `triggers` in generated wrangler.json). | grep; `dist/server/wrangler.json` `triggers: []` |

### P2 — post-launch

| # | Defect | Evidence |
|---|---|---|
| P2-1 | README is stock vinext-starter; docs partly out of date (e.g. say seat lock missing while UNIQUE exists). | `README.md`; docs `:216` |
| P2-2 | `db/index.ts` / Drizzle ORM unused at runtime; `db/postgresql-master-modules.sql` dead artefact. | §1.1 |
| P2-3 | `/admin/domains` visible to any SIWC user (static registry). | `admin/domains/page.tsx:12` |
| P2-4 | `worker/index.ts` `Env` lacks `FILES`; routes cast around it. | `worker/index.ts:5-15` |
| P2-5 | Hard-coded demo seeds in production routes (vehicles, jobs, reviews, airports, businesses, driver profiles) executed on every request via `INSERT OR IGNORE`. | `marketplace.ts:205-215`; `mobility.ts:36-47`; `global-directory.ts:199-230`; `fleet-control.ts:157-160` |
| P2-6 | 2026-07-2x dates hard-coded in UI defaults (`travelDate "2026-07-25"`). | `OperationsApp.tsx:80`; `MobilityExpansion.tsx:73,77` |
| P2-7 | Hard-coded Wi-Fi SSIDs/passwords in source and rendered to customers. | `reservation-marketplace.ts:436,459,482` |
| P2-8 | `x-agos-organization-id` lets a master pick any org; non-master requesting another org gets 403 — fine, but header is undocumented. | `tenant-access.ts:115-142` |
| P2-9 | Manifest `icons: []`; PWA install icon missing. | `manifest.ts:13` |
| P2-10 | `+03:00` hard-coded in portal instead of `brand.timeZone`; harmless today (all mobility brands Istanbul) but breaks for any non-TR mobility tenant. | `WhiteLabelBookingPortal.tsx:71-72` |

### Unverified / out of scope
* Whether the OpenAI Sites dispatcher strips client-supplied `oai-authenticated-user-*` headers and whether it applies workspace access policy to `/` (README §"Workspace Auth Headers" implies yes) — could not be verified from the repo.
* Whether the live D1 database contains data created by earlier `CREATE TABLE` variants (would confirm P0-10 in production).
* CSRF exposure depends on how the dispatcher forwards identity on cross-site requests — not testable offline.
