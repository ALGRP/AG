# 08 — Multi-Domain Site Factory (design)

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01 · Mode: read-only design.
Status: **TARGET STATE**. Nothing is built or deployed by this document.

## 1. What exists today (two competing factories)

| Factory | Where | Domains covered | Status | Evidence |
|---|---|---|---|---|
| **A. WordPress "AG Central Hub" (provider/consumer)** | owner spec in Drive sheet "Domainlerimiz" (AGHTH UMVE, M1 Import & DB Schema) | alanyagroup.com (provider) → antalyagettransfer.com, antalyaairporttransfers.net, antalyaflughafen.com, safelinetravel.com (consumers) | specification only; no plugin code in any repo | Drive `Domainlerimiz`; alanyagroup-platform §8 |
| **B. AGOS Mobility Cloud domain registry** | `agos-mobility-cloud/app/domain-registry.ts`, `build/sites-vite-plugin.ts`, OpenAI Sites hosting | 8 managed domains incl. alanyagroup.com, sultankebabkielce.com (restaurant vertical), konakhomes.com (real estate), agos.tr | prototype/MVP; private Sites deployment; one Next.js codebase renders every domain from one registry | repo @ca9b7fc; docs/AGOS-V7 |

The two designs disagree on the core: A keeps WordPress as the SEO/content authority and syncs
entities outward; B makes one Next.js app answer for all hosts. Running both against the same
domains would produce duplicate content across origins and split the canonical signal.
**Owner decision required before any satellite domain goes live** (backlog item MD-01).

## 2. Recommended shape: one core per business family, many domain manifests

```
family: mobility      core: AG Mobility Core (WordPress today; AGOS API later)
   domains: alanyagroup.com (authority), antalyagettransfer.com, antalyaairporttransfers.net,
            antalyaflughafen.com (de), safelinetravel.com, agos.tr (tr)
family: restaurant    core: Sultan Core (ordering: menu, modifiers, cart, delivery/pickup, RODO)
   domains: sultankebabkielce.com (pl primary; en, de secondary)
family: real_estate   core: Konak Core (property viewing)
   domains: konakhomes.com
```

Principles:

1. **One core per family, never one core for all families.** A restaurant ordering core has nothing
   in common with transfer pricing; sharing a runtime only shares outages. (The AGOS registry already
   marks Sultan and Konak as `isolation: separate_vertical`; keep that.)
2. **A domain is a manifest, not a fork.** Each domain is a declarative file; the core reads it at
   build time and at request time. Code changes go through the core; content and config changes go
   through the manifest.
3. **Exactly one canonical origin per intent per language.** Satellites either (a) serve unique,
   market-specific content, or (b) redirect/canonicalize to the authority. Mirrors are forbidden.

## 3. Domain manifest (schema)

```yaml
# domains/antalyaflughafen.com.yaml
domain: antalyaflughafen.com
family: mobility
core_version: ">=2.1 <3"            # semver range the manifest is validated against
role: satellite                     # authority | satellite | redirect
authority: alanyagroup.com          # where canonical lives when role != authority
market: DE                          # ISO country, drives currency display, legal footer, hreflang
languages:
  primary: de
  secondary: []                     # a satellite serves ONE language unless it has unique content per language
content_mode: unique                # unique | canonical_to_authority | redirect
canonical_policy:
  self_canonical_paths: ["/", "/antalya-flughafen-transfer/", "/preise/"]
  canonical_to_authority_paths: ["/hotels/*"]          # shared hotel pages point to the authority
  noindex_paths: ["/buchen/*", "/danke/"]
hreflang_group: mobility-antalya-transfer              # pages in the same group emit each other as alternates
booking:
  engine: ag_booking_engine          # owner-canonical shortcode / component
  pricing_authority: alanyagroup.com # satellite never computes price locally
  payment: cash_in_vehicle
  email_required: false
  seat_selection: false
  shuttle_rules: ag-shuttle-network-v1
  manual_confirmation: true
legal:
  company: "<legal entity>"          # from owner registry; never free-typed per domain
  licence: "TÜRSAB <verified number>"# single source; blocked until documentary proof is filed
  cancellation_policy_ref: policies/mobility/cancellation-v2.md
  privacy_ref: policies/mobility/privacy-de.md
analytics:
  ga4_property: G-XXXXXXX            # id only, no secrets
  consent_mode: required
theme:
  accent: "#185fbd"
  logo: assets/antalyaflughafen/logo.svg
deploy:
  target: hetzner-caddy              # or cloudflare-pages for static satellites
  staging_host: stg.antalyaflughafen.com
```

Validation (CI, `manifest-validate`): schema check, `authority` must exist and be `role: authority`,
`hreflang_group` members must have distinct `languages.primary` or distinct `market`, no two
manifests may claim the same `(hreflang_group, language, market)`, every `*_ref` must resolve, and
`legal.licence` must match the owner registry value.

## 4. Language and market separation

| Rule | Why |
|---|---|
| One primary language per satellite; the authority may be multilingual (EN 439 items, TR/DE/RU/AR reserved for WPML, plus 12 live Scandinavian money pages found in the inventory). | Prevents the "same English page on five domains" pattern that already threatens alanyagroup.com's Antalya/Gazipaşa clusters. |
| `hreflang` is emitted only from the manifest graph, never hand-written. | The record already flags an hreflang rebuild that could orphan AR and Scandinavian pages. |
| Market decides currency display, legal footer, phone format, cancellation wording; language decides copy. | Turkish market pages can show EUR prices with TR legal footer; German market pages show EUR with DE consumer-law wording. |
| Sultan: PL is primary and legally required content (regulamin, polityka prywatności/RODO, alergeny, NIP/REGON) exists in PL first; EN/DE are translations that canonicalize to themselves under `/en/` and `/de/` only if fully translated, else `noindex`. | Task requirement PL/EN/DE + RODO. |

## 5. Shared components without duplicate SEO content

* **Shared = code and design tokens, not copy.** Booking widget, price display, FAQ accordion,
  schema generators, consent banner live in the core package and are versioned.
* **Copy is per manifest and per language**, stored as content objects with a `canonical_owner`
  field. Rendering a content object on a non-owner domain automatically emits
  `<link rel="canonical">` to the owner URL and `noindex` unless the manifest declares the page
  `unique`.
* **Structured data** (Service, Offer, FAQPage, LocalBusiness, Restaurant/Menu for Sultan) is
  precomputed per domain from the manifest (the owner's Central Hub spec already asks for
  precomputed JSON-LD) and never duplicated by a second SEO plugin.
* **Pricing and distance facts** come from one fact table (route → km, minutes, from-price) with a
  version id (`multi-service-v1-20260805` is the live rule). Every domain prints the same numbers;
  the AYT–Alanya distance/duration contradiction the task cites cannot recur if the number is never
  typed by hand.

## 6. Automated pipeline (build → test → staging → deploy → rollback)

```
git push (core or manifest) ─▶ CI
  1. lint + typecheck + unit tests (core)
  2. manifest-validate (all domains)
  3. build per domain matrix  → artifact  <domain>-<core_sha>-<manifest_sha>.tar.zst
  4. sha256sum artifacts     → SHA256SUMS, signed (cosign or GPG) → artifact registry
  5. deploy to staging host  (stg.<domain>) via compose pull + `caddy reload`
  6. smoke + Playwright on staging: 200s, canonical, hreflang, robots, LCP budget,
     booking dry-run (test flag, no notification), a11y (axe), PL/EN/DE copy present
  7. Owner GO gate (manual approval in CI; logged to OWNER_GO_LOG.md)
  8. production deploy = symlink switch `/srv/sites/<domain>/current -> releases/<artifact>`
     + `caddy reload`; previous release retained
  9. post-deploy checks (same smoke suite against prod)
 10. rollback = symlink back + reload (< 60 s), DB migrations are expand/contract only
```

Artifact immutability: the artifact name embeds both commit hashes; `SHA256SUMS` is committed to the
release ledger; the deploy job refuses an artifact whose checksum is not in the ledger. This closes
the "candidate artifact authority and SHA provenance" gap flagged in `00-EXECUTIVE-VERDICT.md`.

## 7. Migration path from today

| Wave | Step | Precondition |
|---|---|---|
| F0 | Owner decides Factory A vs B for the mobility family (recommended: A for SEO authority now, B's registry reused as the manifest format). | none |
| F1 | Write manifests for the 6 mobility domains + sultankebabkielce.com + konakhomes.com; validate; **no deploy**. | F0 |
| F2 | Move pricing/distance facts into one versioned fact table consumed by WordPress and AGOS. | Alanya pricing decisions (04 audit, P0-ALA-01) |
| F3 | Stand up staging per domain on the Hetzner Caddy edge (already routes `app.alanyagroup.com`). | Hetzner account current (P0-INF-01) |
| F4 | First satellite (antalyaflughafen.com, DE market) through the full pipeline. | F1–F3, Owner GO |
| F5 | Sultan core through the same pipeline (separate family). | Sultan source located and audited (03 audit) |

## 8. Non-goals

* No automatic translation publishing (owner rule F4 in prior task).
* No satellite computes prices or accepts bookings on its own store.
* No shared database between families.
