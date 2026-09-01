# 06 — Automation Reference Architecture (n8n production design)

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01 · Mode: read-only design.
Status of this document: **DESIGN / TARGET STATE**. Nothing here is deployed by this audit. Every
deployment step needs its own Owner GO.

## 0. Design constraints (owner-fixed, non-negotiable)

| # | Constraint | Source |
|---|---|---|
| C1 | n8n is never the source of truth, never the booking authority, never the supplier-assignment authority. | Task PROTECT; AGOS master status "Knowledge Objects are the source of truth" |
| C2 | n8n must never hold the only copy of a customer request. | Task IMMEDIATE ITEMS |
| C3 | A request becomes a confirmed booking only after manual (human) confirmation. | Task PROTECT; live "no customer message" policy observed in ops emails |
| C4 | Cash / pay-in-vehicle only; no online capture. | Owner decision (PR #1 record); AGOS "online payment deliberately closed" |
| C5 | Email is optional for customers; phone/WhatsApp is the primary identity. | Owner decision (PR #1 record) |
| C6 | Secrets live only in the n8n Credentials UI and the host `.env`, never in chat, git or workflow JSON. | alanyagroup-platform AI_OPERATING_RULES §8; agos-infrastructure README |
| C7 | Production mutation of WordPress, DNS, DB or Hetzner needs a separate explicit Owner GO. | OWNER_GO_LOG, AGOS master status |

## 1. Current state (what the evidence shows)

* An n8n instance **is already running against live bookings** (mailbox evidence, section E4 of
  `10-TEST-AND-EVIDENCE-INDEX.md`): a "booking.created" workflow emits an internal ops alert, and a
  timer workflow emits an "SLA escalation" at roughly 15 minutes when the driver status is still
  unassigned. The idempotency key format `booking.created+<postId>+v1` is already in use.
* The IaC for that host (`ALGRP/agos-infrastructure`) defines a Caddy edge, a MariaDB/Redis project,
  an n8n project with a dedicated Postgres 16 on an internal network, and a WordPress **staging**
  project. It does **not** define backups, monitoring, log shipping, WAF/rate limiting, image
  pinning, or restore drills. It also references n8n basic-auth variables that n8n 1.x ignores.
* The only n8n workflow exports under version control are dry-run designs in `ALGRP/AGOS`
  (`AG_PLATFORM_AUTOMATION_BRIDGE_02_WORKFLOW.json`, `WHATSAPP_03_N8N_WORKFLOW_DRY_RUN.json`,
  `AG_N8N_REVIEW_LOOP_01_WORKFLOW_DRY_RUN.json`, media-auditor). **The workflows that are live are not
  in git.** That is the single biggest automation-governance gap.

## 2. System-of-record boundaries

```
┌────────────────────────────┐   webhook (HMAC, idempotent)   ┌──────────────────────────┐
│  WordPress (alanyagroup.com)│ ─────────────────────────────▶ │  n8n (automation only)   │
│  SYSTEM OF RECORD for       │ ◀───────────────────────────── │  - notify ops            │
│  request/booking state,     │   REST write-back (status,     │  - timers / escalations  │
│  price authority, voucher   │   notes) via scoped app-pass   │  - supplier broadcast    │
└────────────────────────────┘                                 │  - retries, DLQ          │
              │                                                └──────────────────────────┘
              │ read-only projections                                       │
              ▼                                                             ▼
┌────────────────────────────┐                                 ┌──────────────────────────┐
│ AGOS / WJD / Driver Pool   │  assignment authority stays in  │ WhatsApp / Email / Sheets│
│ (agos-mobility-cloud)      │  the operator UI, never in n8n  │ (channels, not stores)   │
└────────────────────────────┘                                 └──────────────────────────┘
```

Rules that make the boundary real:

1. **Every event n8n receives is already persisted** in the WordPress booking post (or, for the
   Sultan vertical, in its own order store) **before** the webhook is fired. The webhook carries the
   record id, not the only copy of the data. If n8n is down, the request still exists and is visible
   in the admin list. (Satisfies C2.)
2. **n8n writes back only three things**: a status note, a "notified_at" meta flag, and an
   escalation flag. It never sets `confirmed`, never sets price, never sets `supplier_id`. Those
   fields are writable only by an authenticated human in the operations UI. (Satisfies C1, C3.)
3. **Supplier acceptance is recorded in the system of record**, not in n8n: n8n may broadcast a job
   offer and relay a "claim" callback, but the claim is validated and committed by the AGOS/WJD API
   (`/api/claim-job`, `/api/partner/v1/jobs`), which owns timeout and fallback. n8n only schedules
   the timeout reminder.
4. **Price shown to the customer is computed server-side** in the system of record
   (`multi-service-v1-20260805`, `ag-shuttle-network-v1` are the live rule ids). n8n never
   recomputes or overrides a price; it copies the quoted total for display.

## 3. Deployment topology (isolated Compose project)

Keep the existing three-project split and add what is missing.

```
/opt/agos/                         (git checkout of agos-infrastructure, no secrets)
  stacks/caddy/      project agos-caddy    ports 80/443           networks: agos_net
  stacks/n8n/        project agos-n8n      no host ports          networks: agos_net + n8n_net(internal)
      n8n            (main)  image pinned by digest, N8N_RUNNERS_ENABLED=true
      n8n-worker     (queue mode, optional at >1 rps)  EXECUTIONS_MODE=queue
      n8n-redis      (queue broker, internal only)      only if queue mode is enabled
      n8n-postgres   postgres:16.x pinned, internal only, own volume
      n8n-backup     sidecar: nightly pg_dump + n8n export:workflow/credential --backup → encrypted → off-host
  stacks/wordpress/  project agos-wordpress (staging today; production after cutover GO)
  compose/database/  project agos-db (MariaDB 11 + Redis 7)
```

Required changes to the current IaC (all P1 unless noted):

| Item | Current | Target |
|---|---|---|
| Image pinning | `n8nio/n8n:1` floating | pin to a patched release ≥ 1.123.73 (n8n advisory 2026-08-19, High severity) and record the digest; upgrade by PR |
| Authentication | `N8N_BASIC_AUTH_*` (ignored since n8n 1.0) | n8n user management with owner + operator accounts, `N8N_USER_MANAGEMENT_JWT_SECRET` set, MFA on owner; optional Caddy `basicauth` or Cloudflare Access in front of `/` while leaving `/webhook/*` open |
| Reverse proxy | Caddy `reverse_proxy agos-n8n:5678` with sec headers | keep; add `request_body { max_size 2MB }`, per-IP rate limit on `/webhook/*` (Caddy rate-limit module or Cloudflare rule), `X-Robots-Tag: noindex`, disable `/rest/*` from the public internet except behind Access |
| Encryption | `N8N_ENCRYPTION_KEY` generated into `.env`, single copy | same key, plus an offline copy in the owner password manager; document that losing it makes credentials unrecoverable (**P0 if not backed up**) |
| Database | dedicated `n8n` Postgres on internal network (good) | keep; add `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=336` (14 days), `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, `EXECUTIONS_DATA_SAVE_ON_ERROR=all`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false` |
| Backups | none automated | nightly `pg_dump` + `n8n export:workflow --backup` + `n8n export:credentials --backup --decrypted=false`, GPG-encrypt, ship off-host (Hetzner Storage Box or R2 on a paid, current account), 30-day retention, monthly restore drill into a throwaway compose project |
| Health | container healthcheck on `/healthz` | add external uptime probe on `https://n8n.alanyagroup.com/healthz` and on `/healthz/readiness`; alert on failure via a channel that does **not** depend on n8n |
| Monitoring | none | `N8N_METRICS=true` scraped by a small Prometheus + Grafana or by Uptime-Kuma; alerts: execution error rate, queue depth, disk, Postgres connections, cert expiry |
| Logs | stdout only | `N8N_LOG_LEVEL=info`, `N8N_LOG_OUTPUT=console`, Docker json-file with rotation (`max-size=50m,max-file=5`); ship to Loki or keep 14 days on host |
| Secrets | `.env` chmod 600, gitignored (good) | keep; add `docker compose config` check in CI that fails if any `CHANGE_ME` remains |

## 4. Environments and workflow promotion

| Env | Host | Base URL | DB | Credentials | Purpose |
|---|---|---|---|---|---|
| dev | owner laptop (Docker) | `http://localhost:5678` | local Postgres | dummy | build/edit workflows |
| staging | same Hetzner host, project `agos-n8n-stg` on port-less internal net, route `n8n-stg.alanyagroup.com` behind Access | own Postgres | staging creds (Brevo sandbox sender, WhatsApp test number, staging WP `app.alanyagroup.com`) | rehearsal against staging WordPress |
| prod | Hetzner, project `agos-n8n` | `https://n8n.alanyagroup.com` | own Postgres | real creds, entered only in UI | live |

Promotion is **git-first**:

1. Workflows are exported as JSON (`n8n export:workflow --all --pretty`) into a private repo path
   `automation/workflows/<name>.json`. Credentials are **never** exported with values; workflows
   reference credentials by name only.
2. A PR moves a workflow from `dev` to `staging`; CI validates JSON, forbids `active: true`, forbids
   any hard-coded host other than the environment variable placeholders, and runs a static check
   for the forbidden node types listed in §7.
3. Import to staging with `n8n import:workflow`, run the test plan (§8), attach execution ids to the
   PR.
4. Owner GO recorded in `OWNER_GO_LOG.md` → import to prod, activate, record workflow id + version
   hash in `07-RELEASE-WAVES-ROLLBACK-PLAN.md` wave log.
5. Rollback = re-import previous JSON version and deactivate the new one; the system of record is
   untouched either way.

## 5. Inbound contract (WordPress → n8n)

```
POST https://n8n.alanyagroup.com/webhook/<env>/booking-events
Headers:
  Content-Type: application/json
  X-AG-Event: booking.created | booking.updated | booking.cancelled | order.created (Sultan)
  X-AG-Event-Id: <uuid v4>                          # per event
  X-AG-Idempotency-Key: booking.created+<id>+v1     # already in use live
  X-AG-Timestamp: <unix seconds>
  X-AG-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>
Body: { "event": "...", "id": 35815, "reference": "AG-REQ-2026-A6B8D1",
        "tenant": "alanyagroup.com", "occurred_at": "...", "version": 1,
        "data": { minimal projection: service, pickup_at, from, to, pax, quoted_total,
                  language, phone_present, email_present, driver_status } }
```

Verification steps in the first n8n node (Code node, no external call):

1. Reject if `X-AG-Timestamp` is older than 300 s or in the future by more than 60 s (replay window).
2. Recompute the HMAC over `timestamp + "." + rawBody` with the shared secret from the credential
   store; constant-time compare; reject on mismatch with HTTP 401 and **no retry**.
3. Look up `X-AG-Idempotency-Key` in a small dedupe table (Postgres table `ag_event_dedupe` in the
   n8n database, or a Data Table); if present → respond 200 `{duplicate:true}` and stop.
4. Insert the key with a 7-day TTL, then continue.

Note: the body deliberately contains **no customer name, phone number or email**, only presence
flags. The ops alert links to the record in the system of record. This is the redaction rule that
keeps PII out of execution data (§9).

## 6. Retry, dead-letter and escalation

| Layer | Behaviour |
|---|---|
| Sender (WordPress) | Fire webhook from a queued action (Action Scheduler / WP-Cron), not inline in the request. Retry 5× with backoff 1, 5, 15, 60, 240 min on non-2xx. After 5 failures set `_ag_webhook_failed=1` on the post and show a red badge in the admin list. The booking itself is never lost. |
| n8n node level | "Retry On Fail" on every outbound node (Gmail/Brevo/WhatsApp/HTTP): 3 attempts, 2 s → 30 s. |
| Workflow error path | Global Error Workflow: writes a row to `ag_dlq` (event id, workflow, error, payload hash), notifies ops by a **second channel** (Telegram/Slack or plain SMTP from the host), and never re-raises to the customer. |
| Dead-letter replay | A manual-trigger "DLQ replay" workflow reads `ag_dlq`, re-runs the original event with the same idempotency key; duplicates are impossible because of §5 step 3. |
| SLA escalation | Timer workflow polls the system of record every 5 min for requests older than 15 min with `driver_status=UNASSIGNED` and `escalated_at=null`; escalates once, sets `escalated_at` via REST. Today's version escalates at 15 min for 100 % of sampled bookings, which means the SLA is not actionable; target: 15 min business-hours / 45 min night, and a second tier at 60 min to the owner's phone. |
| Supplier timeout | Owned by AGOS/WJD: offer TTL, "accepted by" uniqueness, fallback to next supplier. n8n only sends the reminder message and receives the callback. |

## 7. Forbidden and allowed node classes (enforced in CI on exported JSON)

* **Forbidden in prod**: Execute Command, SSH, FTP/SFTP, Git, generic "HTTP Request" to any host not
  in the allowlist (`www.alanyagroup.com/wp-json`, Brevo API, Meta WhatsApp Cloud API, Google APIs),
  WordPress node with `update/delete` on posts other than the booking CPT, any Postgres node against
  the WordPress database, Code nodes that call `require()` of non-allowlisted modules.
* **Allowed**: Webhook, Code (sandboxed, runners enabled), IF/Switch, Wait, Schedule, Gmail/Brevo
  send, WhatsApp Cloud API send template, Google Sheets append (projection only), HTTP Request to the
  allowlisted hosts, Data Table / Postgres against the n8n-owned database only.

## 8. Test plan before any activation (staging)

1. Signature: valid → 200; wrong secret → 401; stale timestamp → 401; replayed event id → 200
   duplicate, zero side effects.
2. Idempotency: send the same `booking.created` 5× in 10 s → exactly one ops email.
3. Outage: stop n8n, create a request in staging WP → request visible in admin, webhook retried, ops
   email arrives after n8n restart, no duplicate.
4. Escalation: request with driver unassigned → one escalation at T+15 min, none at T+20 min after
   status changed.
5. Redaction: dump executions table, grep for the test phone/email → 0 hits.
6. Restore drill: restore last night's Postgres dump + workflow export into a throwaway project;
   workflows import, credentials show as "needs re-entry" (expected).

## 9. Execution-data redaction and retention

* Payload carries flags, not PII (§5). Ops emails carry reference and record id only.
* `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` so successful runs keep no payload; errors keep data for
  14 days then prune.
* Workflow JSON exports are reviewed for literal phone numbers before merge (CI grep for `+9`, `+4`,
  `@` inside string literals).
* Retention statement to add to the privacy notices (KVKK for Türkiye, RODO/GDPR for Poland).

## 10. Open owner decisions for this architecture

| # | Decision | Default recommended |
|---|---|---|
| D1 | Commit live workflow exports to a private repo (`ALGRP/AGOS` → `automation/`) | Yes, immediately (read-only export, no activation change) |
| D2 | Pin n8n to a patched 1.x release now (security advisory) vs wait for v2 | Pin 1.x patched now; plan v2 in a later wave |
| D3 | Queue mode | Not yet; single main process is enough at current volume (≈1 booking/day) |
| D4 | Off-host backup target | Hetzner Storage Box (account must be current) |
| D5 | Second alert channel independent of n8n | Host-level cron + SMTP to owner phone-mail |
