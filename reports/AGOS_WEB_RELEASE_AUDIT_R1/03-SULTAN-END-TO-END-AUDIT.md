# 03 — Sultan Kebab Kielce End-to-End Audit

Audit: AGOS_WEB_RELEASE_PROGRAM_FABLE_5_1_MASTER_AUDIT_R1 · Date: 2026-09-01 · Mode: STRICT_READ_ONLY.
Targets: https://sultankebabkielce.com (live), "Sultan local repository and production deployment".

## 1. Verdict

**SULTAN_RELEASE_READY = NO — NOT AUDITABLE.** No Sultan source code, build, deployment descriptor,
database, test, or content export exists in any of the five ALGRP repositories, in the owner's Google
Drive, in Slack, or in the owner mailbox. The live host is egress-blocked from this session. The only
Sultan artefacts that exist anywhere reachable are: a domain registration receipt, one tenant entry in
the AGOS Mobility Cloud domain registry (table-reservation white-label, not an ordering site), and
third-party marketplace listings. Every item in Mandatory Work C is therefore **UNVERIFIED**, and the
release verdict cannot be anything other than NO until a candidate exists in git.

## 2. What was found

| Item | Value | Source | Status |
|---|---|---|---|
| Domain | `sultankebabkielce.com`, registered 2026-06-25 via isimtescil.net, 1 year, expires 2027-06-26 | registrar mail | verified |
| Domain in AGOS registry | `productId 5724729`, vertical `restaurant`, `reservationMode: restaurant_booking`, `defaultLocale: pl`, `timeZone: Europe/Warsaw`, `isolation: separate_vertical`, brand copy "Zarezerwuj stolik w Sultan Kebab"; logo and hero image reused from Alanya Group; rendered by `VerticalReservationPortal` → `POST /api/domain-reservations` (date, time, guests 1–12, name required, single "Telefon lub e-mail" free-text contact required, note); `preferredAt` stored without timezone; `GET` lists the last 100 reservations of **all** tenants to any signed-in user; no confirmation is ever sent | `agos-mobility-cloud/app/domain-registry.ts:105-117`; `evidence/agent_mobility_cloud.md` §5 | verified; **table booking only**, no menu/cart/order model |
| Menu / modifiers / cart / delivery / pickup / payments code | none in any repo (grep for `menu`, `cart`, `order`, `delivery`, `pickup`, `modifier`, `allergen`, `RODO`, `NIP` across 5 repos yields only AGOS spec prose and the registry entry) | repo grep | **absent** |
| Payload CMS / PostgreSQL for Sultan | not in `agos-infrastructure` IaC; task lists them as shared services | IaC | **drift / unverified** |
| Search visibility | `site:sultankebabkielce.com` returns 0 results in web search; Semrush (PL database) shows the domain with 11 organic keywords and ~18 est. monthly visits | agent research | live and indexed by Semrush; web-search absence unexplained (noindex? new?) |
| Third-party presence | Pyszne.pl listing "Sultan Kebab & Pizza", Sienkiewicza 49, 25-002 Kielce: minimum order 35 zł, delivery 7 zł, "delivery currently unavailable — personal pickup"; also Uber Eats and Glovo; Instagram/Facebook/TikTok accounts; Google Business listing exists (owner received a review-reply notice 2026-08-01) | agent research; mailbox | verified third-party, not first-party |
| Legal identity (NIP/REGON/address), regulamin, polityka prywatności/RODO, allergen list | not found anywhere reachable | agent research | **UNVERIFIED — treat as missing** |
| Opening hours, delivery zones/fees, minimum order on the first-party site | not observable | egress block | UNVERIFIED |
| Order persistence, idempotency, restaurant notification, tracking, retry | no code, no ops emails in the mailbox for Sultan orders | mailbox search (`zamówienie`, "Sultan Kebab", order) → 0 | UNVERIFIED; no evidence that any order has ever flowed |
| PL/EN/DE | registry locale `pl` only; no i18n catalogue for a Sultan site in any repo | repo | UNVERIFIED |
| Hosting | Hetzner account notices are addressed to the Sultan mailbox as well, so the Sultan stack most likely shares the Hetzner host | mailbox | inferred |

## 3. Findings

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| SUL-01 | **P0** | No candidate artefact, commit identity or SHA provenance exists for the Sultan site in any reachable repository. A production deployment cannot be authorised or rolled back against something that is not in version control. | repo grep; agent C inventory (0 Sultan repos, 0 tags) |
| SUL-02 | **P0** | Legal identity, terms (regulamin), privacy/RODO notice and allergen information cannot be shown to exist. For a Polish food-ordering site these are statutory (RODO/GDPR Art. 13, Polish consumer law, EU Regulation 1169/2011 allergen labelling). | agent research (0 hits), egress block |
| SUL-03 | **P0** | Hosting continuity: the Hetzner account that (by mailbox routing) covers Sultan received "Final Payment Warning / Services blocked" on 2026-08-25. | mailbox |
| SUL-04 | **P1** | Third-party listing states "delivery currently unavailable" while the task expects delivery + pickup on the first-party site. Delivery fee (7 zł) and minimum order (35 zł) exist only on Pyszne.pl; no first-party authority for these values. | agent research |
| SUL-05 | **P1** | AGOS Mobility Cloud registry maps `sultankebabkielce.com` to a **table-reservation** portal. If that Next.js app answers for the domain, it would serve a booking form instead of the ordering site (wrong product on the money domain). Which app answers the host today is unverified. | `domain-registry.ts` |
| SUL-06 | **P1** | The domain is absent from web-search results while Semrush sees 11 keywords: suggests either a `noindex`, a robots block, a very recent launch, or a Cloudflare challenge on the crawler. Needs a robots/sitemap/canonical check from an allow-listed host. | agent research |
| SUL-07 | **P1** | Dynamic hours / delivery values require runtime verification (task IMMEDIATE ITEM). Not possible from this session; no runtime config in git. | egress block |
| SUL-08 | **P2** | Brand naming drift: "Sultan Kebab Kielce" (registry, domain) vs "Sultan Kebab & Pizza" (marketplaces, social handles) vs "Sultan Pizza Kebab Kielce" (Google Business). A second unrelated "Sułtan Kebab" at a different Sienkiewicza address exists in directories — NAP consistency and entity disambiguation risk for local SEO. | agent research; mailbox |
| SUL-09 | **P2** | Order-notification design for the restaurant must not reuse the Alanya n8n Gmail path (personal mailbox, no SLA for food prep times). Design it under the family-core rule in document 08. | design |

## 4. Mandatory Work C coverage table

| C-item | Result |
|---|---|
| menu, modifiers, prices, cart, delivery, pickup, hours, payments | UNVERIFIED — no source, host blocked |
| order persistence | UNVERIFIED — no store identified (Payload/Postgres claimed, not in IaC) |
| duplicate prevention and idempotency | UNVERIFIED |
| restaurant notifications | UNVERIFIED — no Sultan notification mail in mailbox |
| order tracking | UNVERIFIED |
| retry and failure recovery | UNVERIFIED |
| PL/EN/DE | UNVERIFIED — registry pl only |
| mobile, accessibility, performance, SEO | UNVERIFIED — 0 web-search visibility, 11 Semrush keywords |
| RODO/GDPR, terms, allergens, company identity | **NOT FOUND** — treat as failing until shown |

## 5. What is needed to make Sultan auditable (exact inputs)

1. Push the Sultan application (Payload CMS config, collections, Next.js/front end, Dockerfile,
   compose, migrations, seed menu) to a **private** ALGRP repository with a tagged commit.
2. Provide the production `docker compose config` (secrets redacted) and `docker ps` from the host,
   plus the Caddy route for `sultankebabkielce.com`.
3. Provide the first-party legal pages (regulamin, polityka prywatności, alergeny, dane firmy) as
   rendered HTML or as CMS exports.
4. Allow-list `sultankebabkielce.com` for read-only egress from the audit session, or supply a
   crawl export (HTML + headers) for `/`, `/menu`, `/checkout`, `/regulamin`, `/polityka-prywatnosci`.
5. One synthetic test order transcript (test flag set, no real kitchen ticket) showing persistence
   id, notification, tracking URL and duplicate-submit behaviour.

With those five inputs the Sultan audit can be completed in one bounded child task (see
`00-EXECUTIVE-VERDICT.md`, NEXT_RECOMMENDED_CHILD_TASK candidates).
