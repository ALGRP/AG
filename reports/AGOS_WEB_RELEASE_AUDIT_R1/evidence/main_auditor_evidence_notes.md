# Main-auditor evidence notes (PII-redacted). Captured 2026-09-01.

## E1 Network / reachability
- curl + WebFetch to sultankebabkielce.com, www., alanyagroup.com, www., n8n.alanyagroup.com -> 403 from egress proxy (host_not_allowed / EGRESS_BLOCKED). Live sites NOT observable from this session.
- docker CLI present but no daemon socket; no compose files on host; no /Users tree. Owner Mac workspace not mounted.
- WordPress.com MCP: user-sites ability disabled in MCP settings (cannot enumerate).

## E2 Repos (all 5 ALGRP repos attached; shallow clones)
- ALGRP/AG (public): main=4e0553c (.gitkeep only). Branch claude/alanyagroup-final-completion-me48z5 @51ca976 = 3 report commits (PR #1 open draft, mergeable clean). Audit branch claude/agos-web-release-audit-azbaev @4e0553c.
- ALGRP/alanyagroup-platform (private) @5c1781b 2026-06-24: 19 markdown files (AI Command Center). owner_go=false. MASTER_PROJECT_STATUS compiled 2026-06-24.
- ALGRP/AGOS (private) @f420b0e 2026-07-11 "Merge PR #5: AGTERM-02-R1": 427 files; specs, decision ledger, ag-platform-v2-admin-cms PHP (read-only plugin), agcos-core python, n8n workflow JSON dry-runs, RC manifests.
- ALGRP/agos-infrastructure (private) @aeed46e 2026-06-28: IaC for Hetzner-class Ubuntu host: stacks caddy/n8n/wordpress + compose/database(MariaDB 11 + Redis 7). Network agos_net (external) + n8n_net (internal). Caddyfile routes: :80 healthz, app.alanyagroup.com -> agos-wordpress:80 (noindex), n8n.alanyagroup.com -> agos-n8n:5678; origin TLS from Cloudflare origin certs (stacks/caddy/certs, gitignored); admin off; sec headers.
- ALGRP/agos-mobility-cloud (private) @ca9b7fc 2026-07-27: Next.js 16/vinext/Cloudflare worker/D1 sqlite drizzle (19 migrations 0000-0018), OpenAI Sites hosting (project appgprj_...), domain-registry with 8 managed domains incl. sultankebabkielce.com (restaurant_booking, pl, Europe/Warsaw) and alanyagroup.com.
- NOT in any repo: WordPress booking runtime (ag-booking-core.php etc.), CLE email module, Sultan ordering site source, Payload CMS, any Sultan menu/cart code, any n8n production workflow export matching live emails.

## E3 Infra IaC observations (agos-infrastructure)
- n8n env template sets N8N_BASIC_AUTH_ACTIVE/USER/PASSWORD -> these vars were removed in n8n 1.x (basic auth deprecated); ineffective; relies on n8n user management. Image tag n8nio/n8n:1 floating (no pin). N8N_ENCRYPTION_KEY generated in .env (gitignored) -> single copy on host, no documented off-host backup besides `grep` in rollback doc.
- No backup automation, no monitoring, no log shipping, no fail2ban/WAF, Watchtower removed. bootstrap/install.sh placeholder. tests/ empty.
- WordPress staging image wordpress:6.8.1-php8.3-apache pinned; WP_HOME app.alanyagroup.com; DISALLOW_FILE_EDIT; AUTOMATIC_UPDATER_DISABLED.
- Postgres 16 for n8n only, internal network. Task mentions "PostgreSQL, Payload" shared services -> Payload not present in IaC => drift between IaC and actual host (unverifiable).
- docs/AGOS-INFRA-CURRENT-STATUS.md says only Sprint 2 done + Portainer 9443 public; later sprint docs (3,5,6) exist; status doc stale.
- Sprint-05 doc says reverse_proxy n8n:5678 but Caddyfile says agos-n8n:5678 (container_name) -> doc/Caddyfile mismatch (Caddyfile correct).

## E4 Gmail (owner mailbox; PII redacted; read-only)
- LIVE BOOKING PIPELINE ON alanyagroup.com: 19 "New transfer request AG-REQ-2026-XXXXXX" emails from info@alanyagroup.com to itself between 2026-08-07 and 2026-09-01 (1 explicit test AG-REQ-2026-EFB5F2 "AGOS TEST DO NOT SERVICE"). Fields: Request ID, Customer, Phone, Email, Pickup, Destination, Date/time, Return date/time, Passengers, Vehicle (Private Transfer | Shuttle Transfer | Sprinter / Minibus), Service region, Flight, Luggage, Price, Start fee, Route distance km, Chargeable km, Per-km rate, Shuttle tier, Pricing rule, Notes, Admin link (WP post IDs 35765..35815).
  - Pricing rules observed: `multi-service-v1-20260805` (private: start fee 40, chargeable km = route km - 30, per-km 0.4; AYT->Alanya route 133.4 km => 81.36 EUR) and `ag-shuttle-network-v1` (tier 1 = 30 EUR one-way; 60 EUR with return; shuttle offered to Okurcalar and Kemer => broader than "Alanya<->Antalya only" record). 16-pax Sprinter request: "Price: Final price confirmed by WhatsApp", service region "other".
  - Email field populated in every sampled request (cannot tell required vs optional from email alone).
- n8n IS LIVE IN PRODUCTION: 17 "AGOS OPS New Booking" + matching "AGOS OPS SLA Escalation" emails sent via n8n Gmail node from [email-redacted] to [email-redacted] + info@alanyagroup.com (footer "This email was sent automatically with n8n"). Payload: Booking reference, Booking ID, Service, Pickup, From, To, Passengers, Quoted total, Language, Driver status, Phone present, Email present, Ops link, Idempotency `booking.created+<postId>+v1`, Execution number (105 on 2026-09-01). SLA escalation fires at TIME_SINCE_BOOKING 901-902s with DRIVER_STATUS UNASSIGNED for 100% of sampled bookings.
  - Reconciliation window 2026-08-07..09-01: 19 WP request mails vs 17 n8n New Booking mails (search-estimated); at least 2 mismatches (WP mail without n8n alert on 08-17/08-19; n8n alert without WP mail on 08-22 08:24) -> needs execution-log reconciliation. UNVERIFIED which side dropped.
  - Ops/Admin links render as "post.php?post5815&action�it" in plaintext (looks like quoted-printable '=3' '=ed' corruption). UNVERIFIED whether artefact of MCP plaintext conversion or real; if real, every ops link is broken.
  - Execution count 105 by 09-01 vs ~17 bookings => other workflows/executions running (SLA timers count separately).
  - No customer-facing confirmation/voucher emails found in mailbox (search for voucher/confirmation: none). Consistent with "no customer message" policy.
- BILLING / OUTAGE RISK (P0 candidates):
  - Hetzner: Payment Reminder 07-13, Payment Warning 07-17, Payment Reminder 08-13, Payment Warning 08-19 (pay by 08-21), "Final Payment Warning / Services blocked" 08-25. Login verification codes 08-26 and 09-01 (owner accessed account). Payment status after 08-25 UNVERIFIED. Recipients include [email-redacted] (Hetzner account also tied to Sultan).
  - Cloudflare: "Pay by Aug 20 or services will be downgraded" 08-15/08-18; "[Action required] Paid services disabled due to non-payment" 08-20: account downgraded to free; Workers limited; R2/D1/KV data "may become inaccessible and is subject to removal". Invoice $0.00 on 08-26 (suggests free plan now). => any Cloudflare-paid dependency (R2, D1 paid, Workers paid) at risk.
  - Güzel Hosting (guzel.net.tr, TR host; customer "AG ALANYA GROUP İNŞAAT EMLAK Tic. Ltd. Şti."): credit card payment failed 08-15; overdue notices 08-16, 08-18 for invoice due 15.08.2026. Likely the cPanel host of alanyagroup.com (docroot /home/alanyagr/public_html per record). Status after 08-18 UNVERIFIED.
- n8n security update 2026-08-19: High severity advisories; fixed in v1.123.73 / v2.35.4. Running version UNVERIFIED (image tag n8nio/n8n:1 floating).
- Sultan: domain sultankebabkielce.com registered 2026-06-25 via isimtescil.net (1 year, expires 26.06.2027). Google Maps notice "Sultan Pizza Kebab Kielce" business exists (2026-08-01). No order/menu/deploy emails; no repo; no Drive docs. Sultan production existence/state UNVERIFIED.
- Company identity in mail: "AG ALANYA GROUP İNŞAAT EMLAK Tic. Ltd. Şti." (Güzel hosting customer name). Owner persona: [owner name redacted] (domain registrant, n8n newsletter). Hetzner account name differs (another person) — flag as account-ownership hygiene item (no PII in report).

## E5 Google Drive (owner)
- AGOS-RC5-RELEASE-GOVERNANCE-SUMMARY.md (2026-07-11): Architecture=PASS; Runtime/Documentation/Security/Manifest/Production/Hetzner = HOLD; Owner GO=YES required. Details: PHP parse validation never executed; JS network scan inconclusive; CONTEXT layer governs RC3, no RC5 artifact exists, 45+ placeholders; 3x nopriv AJAX public write paths + voucher/confirmation public data routes lack validation evidence; manifest 187/189 stale vs two tours templates; Hetzner cutover requires all mandatory gates PASS + dedicated cutover sprint (AGOS-GATE-MATRIX). => Owner intent: WordPress candidate to be cut over to Hetzner Docker stack after gates.
- Alanya Group Rezervasyon Formu Teknik Şartnamesi v1 (2026-04-23): fields pickup, destination, date/time, passenger count; km-based dynamic pricing; Google Places/Yandex autocomplete; mobile single column; payment "credit card (Iyzico, Stripe) AND pay in vehicle" (older intent; superseded by cash-in-vehicle only decision).
- Reservation Interface Design (2026-06-30): tabbed Private Transfer / Tours; fields Guest Name, Date/Time, Origin/Destination, conditional Flight No. No email field, no seat map in spec.
- Alanya_Group_Master_Yol_Haritasi.md (2026-06-03): roadmap; "TURSAB + Bakanlık belgesi öne çıkar"; Sept 2026 "Online ödeme entegre et (iyzico)" (conflicts with cash-only policy); Oct 2026 n8n reservation->Sheets->WhatsApp; hreflang for en/de/ru/ar; "İptal politikası sayfası ekle" (cancellation page still TODO as of June).
- Domainlerimiz sheet: domains antalyagettransfer.com, antalyaairporttransfers.net, konakhomes.com, antalyaflughafen.com, safelinetravel.com, alanyagroup.com + long AGHTH UMVE / Central Hub M1 spec (provider/consumer multi-domain, wp_ag_entities UUID, REST /wp-json/ag-hub/v1, n8n hooks placeholder, no auto-publish, JSON-LD precompute, currency matrix, language/domain scope). => owner's multi-domain intent = WordPress "AG Central Hub" provider/consumer; agos-mobility-cloud domain-registry = second, parallel multi-domain implementation (Cloudflare/OpenAI Sites). Two competing site-factory designs.
- No Sultan documents in Drive. Slack workspace empty of project content.

## E6 Prior reports (ALGRP/AG PR #1 branch) — owner decisions recorded 2026-08-26
- Canonical shortcode [ag_booking_engine], renderer ag_hlp_render_booking_engine(); aliases [ag_home_booking], [ag_transfer_booking_form], [agp_booking_engine].
- Shuttle table 1=30,2=50,3=60,4=70,5=80,6=90 (server-side authority).
- AYT<->GZP shuttle prohibited both directions (private/VIP allowed).
- Cash in vehicle; email optional with CLE semantics; seat selection removed, capacity validation kept.
- TÜRSAB 2165 stated twice by owner vs 12892 in platform record (2026-06-24). Unresolved documentary proof.
- Private formulas (task text): Alanya max(55, 40+(km-30)*0.40); other max(50, 50+max(0,km-30)*0.60) (dead floor); VIP max(90, private*1.30). LIVE rule multi-service-v1-20260805 matches Alanya formula shape (40 + (km-30)*0.4) for AYT->Alanya.
- Owner workspace: /Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04/ (Mac; not in git).

## E7 Additional signals (2026-09-01)
- Brevo: "Security Alert: Verify a new IP" x7 (07-12, 07-16, 07-20, 07-23, 07-26, 07-29, 08-02) => API/SMTP calls from previously unseen IPs (live SMTP usage from rotating/unknown IPs; contradicts record "Live SMTP send: HOLD" unless owner-approved after 07-05). "API Keys marked inactive" 07-10; "SMTP key brevoapinew unused 3 months -> inactive" 07-29. Which system sends via Brevo: UNVERIFIED.
- Google Maps Platform: "Maps Demo Key" created 2026-07-28 (testing-only key, limited daily quota, project gmp-demo-project-...). Google Cloud payments received 07-17 (small amounts). No evidence of a domain/IP-restricted production key => if live site uses demo key: quota/outage risk (P1). ToS update effective 2026-09-28.
- Google Calendar: search "AG-REQ transfer booking" -> 0 events on primary calendar. No calendar handoff live. Calendars present: primary, "AHG güneş" (Alanya Group shared), Bodrum Villa x2, Aile.
- Meta Business: "Confirm your email address" 08-23 (WhatsApp Business/Meta account setup in progress, unconfirmed).
- AGOS master status (repo, frozen 2026-07-05): Hetzner = production target; RC2 frozen; RC3 not ready; owner decisions: shuttle 1 pax=30, 2 pax=50, roundtrip = one-way x2 with explicit return; "Live email, WhatsApp, n8n ... require separate explicit owner GO"; P0: homepage live pilot direct wp_mail(), tours webhook/n8n path ungated.
- AGOS SEL-204 (2026-07-03): local RC validation HOLD: 76 unsafe files (.DS_Store/.bak/.tar.gz), 766 files inventory, no package created; SEL-204B initial local git commit 61f6cd0 (local, not on GitHub). RELEASE-MANIFEST-DRAFT.json = 887-byte placeholder, 0 sha256 entries. => No sealed artifact with SHA256 exists in any reachable repo.
- SOURCE-OF-TRUTH-GAPS: frozen architecture/governance docs, RC2/RC3 certificates only in ignored proof/ or untracked docs/ on owner's Mac.
