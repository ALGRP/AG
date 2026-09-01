# 01 — Authoritative System Inventory

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Captured 2026-09-01 (UTC) · Mode: STRICT_READ_ONLY.
Everything below was read from git, the GitHub API, the owner's mailbox/Drive (read-only), or the
session filesystem. Values of secrets were never read; only variable names are listed.

## 1. Repositories, branches, commits, worktrees

| Repo (visibility) | Default | HEAD @ capture | Last commit | Branches / tags | Tracked files | Worktree in session |
|---|---|---|---|---|---|---|
| `ALGRP/AG` (**public**) | main | `4e0553c4121d5d7e60ca5194a9d6966bb16c7cd1` | 2026-05-16 "Initialize repository" (.gitkeep only) | `main`; `claude/alanyagroup-final-completion-me48z5` @ `51ca976f…` (3 report commits, PR #1 open draft, mergeable clean); `claude/agos-web-release-audit-azbaev` (this audit, based on 4e0553c); tags: none | 1 (main) / 23 (report branch) | `/home/user/AG`, full clone, clean |
| `ALGRP/alanyagroup-platform` (private) | main | `5c1781b4b1264682f769cd698ddd74a55ba99191` | 2026-06-24 "Record SEL-119 review loop" | `main` (8 commits); `development` @ `dffa430f…` (+2 unmerged, 2026-05-13 "AI War Room Foundation", "Sync V3.7.2 AGMC baseline"); tags: none | 19 (17 md) | `/home/user/alanyagroup-platform`, shallow, clean |
| `ALGRP/AGOS` (private) | main | `f420b0ececd0aff1025bb1ce0e1e54a5c80ad0ea` | 2026-07-11 "Merge PR #5: AGTERM-02-R1 defense-in-depth hardening" | `main` (17 commits from 2026-07-03 SEL-204B baseline `61f6cd0b`); sprint branches `AGDOCS-01-source-of-truth`, `AGTERM-02-R1-defense-in-depth`, `AGTERM-02-worker-command-center`, `AGWORKER-01-propose-only-runtime` (all ancestors of main); PRs #1–#5 merged (self-merged, no branch protection); tags: none | 427 (262 md, 69 py, 26 php, 20 json) | `/home/user/agos`, shallow, clean |
| `ALGRP/agos-infrastructure` (private) | main | `aeed46eec6da269fb9184603605e2903fb23de0d` | 2026-06-28 "Route app staging WordPress through Caddy" (author login `sultankebabkielce-create`) | `main` (9 commits, all 2026-06-28); tag `release-2-foundation-start` → aeed46ee | 29 | `/home/user/agos-infrastructure`, shallow, clean |
| `ALGRP/agos-mobility-cloud` (private) | main | `ca9b7fcdc82e244455f7a6d480eae85453a4b84e` | 2026-07-27 "chore(baseline): capture AGOS implementation surface" | `main` (9 commits 2026-07-21 → 07-27); tag `agos-s1-baseline` → ca9b7fcd | 162 (86 ts/tsx, 19 drizzle migrations) | `/home/user/agos-mobility-cloud`, shallow, clean (node_modules present after audit `npm ci`) |

GitHub Actions: 0 workflows in all five repos. CODEOWNERS only in AGOS (`* @ALGRP`). Branch protection:
none visible. Parents: every non-default branch above is a descendant of its repo's `main` except
`alanyagroup-platform/development` (diverged 2026-05-13).

**Not in any repository (confirmed by filename and identifier search across all five):** the WordPress
booking runtime (`ag-booking-core.php`, `ag-booking-component-v1.php`, `ag-home-booking-shortcode.php`,
`ag-homepage-live-pilot/`, `ag-voucher.php`, `ag-control-panel.php`), the CLE email module, the
canonical renderer `ag_hlp_render_booking_engine()`, the live n8n workflow exports, the Sultan
ordering site, any Payload CMS project, the RC2/RC3/RC5 proof packages and certificates
(`proof/`, `release/` are gitignored on the owner's Mac per `docs/git/SOURCE-OF-TRUTH-GAPS.md`).

## 2. Live versions vs local candidate versions

| Surface | Live (production) | Local candidate | Evidence |
|---|---|---|---|
| alanyagroup.com | WordPress + Kadence + Rank Math on cPanel (Güzel Hosting, docroot recorded `/home/alanyagr/public_html`, prefix `wpkcep_`), Cloudflare-proxied. Booking engine emitting request mails since at least 2026-08-07 with pricing rule ids `multi-service-v1-20260805` and `ag-shuttle-network-v1`. WordPress version: unverified (egress blocked). | Owner Mac: `/Users/a1453/Local Sites/alanyagroup-local/app/public` and `/Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04/`. Release candidates RC2 (frozen), RC3 (not ready), RC5 governance summary 2026-07-11 (Runtime/Security/Manifest/Production/Hetzner = HOLD). None in git. | mailbox; AGOS master status; Drive RC5 summary; PR #1 |
| n8n | Live at an unverified host (`n8n.alanyagroup.com` per IaC and mail footer), version unverified, ≥ 2 active workflows (booking alert, SLA timer), execution #105 on 2026-09-01. | IaC stack `agos-n8n` (postgres:16-alpine + `n8nio/n8n:1`); dry-run workflow JSONs in AGOS repo (inactive designs). | mailbox; IaC |
| sultankebabkielce.com | Live per Semrush (11 keywords); content, stack and version unverified. | none in git | agent research |
| AGOS Mobility Cloud | Private OpenAI Sites deployment `agos-mobility-cloud.alanyagroup07.chatgpt.site` (v8 per docs, 2026-07-23), owner-only access. | `ca9b7fcd` tag `agos-s1-baseline`; build/test results in document 04 §6 | docs; repo |
| Staging WordPress | `app.alanyagroup.com` (noindex) defined in IaC; running state unverified | wordpress:6.8.1-php8.3-apache, DB `agos_wp_stage` | IaC |

## 3. Docker services, networks, volumes, health (from IaC; runtime state unverified)

See `05-INFRASTRUCTURE-AND-N8N-AUDIT.md` §3 for the full table. Summary: projects `agos-db`,
`agos-caddy`, `agos-n8n`, `agos-wordpress`; networks `agos_net` (external, shared) and `n8n_net`
(internal); volumes `mariadb_data`, `redis_data`, `caddy_data`, `caddy_config`, `n8n_data`,
`n8n_pg_data`, `wp_content`; host ports only 80/443 (Caddy) plus Portainer 9443 per status doc; all
services have healthchecks and `no-new-privileges`. The AGOS Mobility Cloud app is not Docker-hosted
(Cloudflare Workers-compatible Sites runtime, D1 sqlite, R2).

## 4. Caddy routes and TLS

| Host | Upstream | TLS | Extras |
|---|---|---|---|
| `:80` | static "AGOS edge online", `/healthz` → ok | none | gzip, console log |
| `app.alanyagroup.com` | `agos-wordpress:80` | Cloudflare origin cert `/etc/caddy/certs/origin{,-key}.pem` | `X-Robots-Tag: noindex, nofollow`, sec_headers |
| `n8n.alanyagroup.com` | `agos-n8n:5678` | same origin cert | sec_headers |
| `alanyagroup.com` / `www` | **not in Caddy** — served by the cPanel host through Cloudflare | Cloudflare edge | unverified |
| `sultankebabkielce.com` | **not in Caddy IaC** | unverified | unverified |

## 5. Databases and migrations

| Database | Owner service | Engine | Migrations | Notes |
|---|---|---|---|---|
| live WordPress DB (`alanyagr_…`, prefix `wpkcep_`) | cPanel WordPress | MySQL/MariaDB (host) | WordPress core + plugin schema; booking posts as CPT (post ids 35765–35815 observed Aug 2026) | export filename recorded in private platform repo; not accessible here |
| `agos_wp` / `agos_wp_stage` | agos-mariadb | MariaDB 11 | provisioned by `db-provision.sql` (gitignored) | staging only |
| `n8n` | agos-n8n-postgres | PostgreSQL 16 | n8n-managed | execution retention settings unverified |
| AGOS Mobility Cloud D1 | Cloudflare D1 (sqlite) | drizzle-kit | 19 migrations `0000_gigantic_vapor` … `0018_chief_epoch`; `db/postgresql-master-modules.sql` is a separate Postgres DDL file (not wired to drizzle sqlite config) | at risk if Cloudflare paid services stay disabled (D1 "subject to removal" notice 2026-08-20) |
| agcos-core SQLite | AGOS orchestrator (local) | sqlite | schema v2 | local only |

## 6. Environment variable names (values redacted)

* agos-infrastructure: see document 05 §3 (28 names across database/n8n/wordpress).
* agos-mobility-cloud (from `vite.config.ts`, `.openai/hosting.json`, worker and server code):
  `WRANGLER_LOG_PATH`, `WRANGLER_WRITE_LOGS`, `MINIFLARE_REGISTRY_PATH`, `CODEX_SANDBOX`, bindings
  `DB` (D1) and `FILES` (R2); further names as reported in document 04 §6 (agent inventory).
* WordPress live: `wp-config.php` constants not accessible; the delivery runtime uses meta keys
  `_ag_delivery_*`, `_agp_customer_email_*` (AGOS master status), not env vars.
* n8n credentials referenced by name in the record: WordPress app-password credential
  "Wordpress account", OpenAI / GSC / Sheets (bound, disabled), Gmail OAuth (in use for ops mail).

## 7. Build, test, deploy and rollback commands

| System | Build | Test | Deploy | Rollback |
|---|---|---|---|---|
| agos-mobility-cloud | `npm ci && npm run build` (vinext) | `npm test` (build + `node --test tests/rendered-html.test.mjs`), `npm run lint`, `npx tsc --noEmit` | OpenAI Sites (`.openai/hosting.json`), no CI | redeploy previous commit; no documented procedure |
| agos-infrastructure | n/a | `caddy validate` inside bootstrap 03 | `sudo bash bootstrap/0X-*/...sh` per sprint | `docker compose down` (safe) / `down -v` (destructive, OWNER GO) — see `rollback/*.md` |
| AGOS ag-platform-v2-admin-cms | n/a (PHP) | `php -l`, `php bin/safety-scan.php`, `php bin/qa-local.php` | local/staging only by environment guard | remove plugin dir (read-only, no data) |
| agcos-core | `pip install -e .` | `python -m pytest` (173 tests per PR #5) | local only | n/a |
| Live WordPress | none in git | none in git | manual (owner) | page-level: restore `content.raw` backup (AG_BOOKING_OPTION_B_ROLLBACK_PLAN); plugin-level: file backup + checksum + PHP lint |
| Live n8n workflows | none in git | none | manual import/activate in UI | manual deactivate; no export in git |

## 8. Immutable artifact and SHA256 provenance

| Artefact | Exists? | SHA256 | Where |
|---|---|---|---|
| RC2 "Golden Artifact" (WordPress candidate) | recorded as frozen + fingerprinted | not in any reachable repo | owner Mac `proof/RC2-*` (gitignored) |
| RC3 candidate | not built ("RC3 not ready") | — | — |
| RC5 freeze | "no RC5 artifact exists" (RC5 governance summary 2026-07-11) | — | Drive summary only |
| `manifests/RELEASE-MANIFEST-DRAFT.json` | yes (887 bytes, structure-only) | 0 sha256 entries | ALGRP/AGOS |
| SEL-204 local RC inventory (766 files, 76 unsafe) | local evidence only | — | owner Mac `backups/` |
| agos-mobility-cloud tag `agos-s1-baseline` | yes | commit `ca9b7fcd…` (git object hash, not an artefact checksum) | GitHub |
| agos-infrastructure tag `release-2-foundation-start` | yes | commit `aeed46ee…` | GitHub |
| Sultan | none | — | — |
| **This audit package** | yes | `SHA256SUMS` in this directory | ALGRP/AG branch `claude/agos-web-release-audit-azbaev` |

**Conclusion:** no production candidate for either site has a verifiable commit identity + SHA256
provenance chain in version control. Candidate artifact authority is **NOT PROVEN** (task IMMEDIATE ITEM).

## 9. External accounts and providers (names only)

Hetzner (host), Cloudflare (DNS/proxy/possibly R2+D1), Güzel Hosting (cPanel WordPress), Brevo
(transactional email), Google Cloud / Maps Platform (demo key only evidenced), Meta Business
(WhatsApp, email unconfirmed 2026-08-23), isimtescil.net (Sultan domain), OpenAI Sites (AGOS app),
Semrush (API units exhausted), Google Search Console exports in Drive (Apr 2026), Linear (task board
per protocol, not connected here).
