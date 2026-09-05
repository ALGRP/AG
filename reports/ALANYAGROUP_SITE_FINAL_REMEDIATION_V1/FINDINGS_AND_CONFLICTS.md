# Findings, Corrections and Open Conflicts — SITE_FINAL_REMEDIATION_V1

## PART 0 — Corrections to my previous report (V1 decision pack, PR #1)

Attaching `ALGRP/AGOS` (a repo not examined previously) changed three conclusions. Recording them
plainly:

| Prev. finding | Correction |
|---|---|
| **B3** — "Phase 0 inventory does not exist" | ❌ **WRONG.** It exists: a 906-URL rendered-DOM booking inventory (`AG_BOOKING_COVERAGE_INVENTORY.csv`) plus a 699-URL priority matrix, in `ALGRP/AGOS`. It is not called "Hermes", which is why the earlier name-based grep missed it. The matrix is now produced from it. |
| **C3** — "phone +90 551 160 69 05 uncorroborated" | ❌ **PARTIALLY WRONG.** Corroborated: `+905511606905` appears as `report_whatsapp` in an n8n workflow config in `ALGRP/AGOS`. Treat the number as confirmed. |
| **B1** — "no application code in any reachable repo" | ⚠️ **NARROWED.** `ALGRP/AGOS` contains a real WordPress plugin, `ag-platform-v2-admin-cms` (26 PHP files). It is **not** the booking engine — see below. The booking engine source is still absent. |

The earlier searches were correct about the two repos I had; they were incomplete because I stopped
at two of five. That was my error, and the inventory it missed was the single most load-bearing
input to this task.

## PART 1 — What the newly-found code actually is

`ALGRP/AGOS → ag-platform-v2-admin-cms` is a **deliberately read-only, local/staging-only** WP admin
plugin (registry/inbox/transfer projector views).

Two hard guards, already implemented:

- `includes/class-environment-guard.php` — allows only `local`, `development`, `staging`;
  outside those the registry is disabled. Reports `mode: READ_ONLY`, `owner_go: false`.
- `bin/safety-scan.php` — a build-time blocklist that fails on `wp_insert_post`, `wp_update_post`,
  `update_option`, `$wpdb->*`, `INSERT INTO`/`UPDATE`/`DELETE FROM`, `wp_mail`, `wp_remote_post`,
  `register_rest_route`, `wp_ajax_`, **and `add_shortcode`/`do_shortcode`**.

**Consequence:** this plugin is architecturally incapable of hosting a booking engine — registering a
shortcode is a build failure by design. It already enforces this task's `MODE=LOCAL_OR_STAGING_FIRST`
and `PRODUCTION_DEPLOYMENT=NO`. It is not the place to implement Workstreams 2 or 3.

## PART 2 — Still blocked, and why

| ID | Blocker | Effect |
|----|---------|--------|
| **B1′** | **The booking engine source is in no attached repo.** `ag_home_booking` has **0 hits** in any `.php`/`.js`/`.ts` file across all four attached repos — it appears only in prose/CSV. `agos-mobility-cloud` is a Next.js SaaS app (162 files, 0 PHP, no booking shortcodes). | Workstream 2 (email optional, seat removal, D-M-Y, return-trip, Places fallback) and Workstream 3 (server-side pricing authority) — **cannot be implemented** |
| **B2′** | **Target host egress-denied** — CONNECT to `www.alanyagroup.com:443` refused by environment policy (gateway 403), re-tested this session; plus the recorded Cloudflare block on automated fetches. | Live verification, raw-HTML checks after SEO edits (§5), console-error / horizontal-overflow / mobile tests — **cannot run** |
| **B3′** | **No staging environment is recorded to exist**, though `MODE=LOCAL_OR_STAGING_FIRST` presumes one. | no place to apply or rehearse changes |
| **B4′** | **`owner_go=false`**, reaffirmed in every AGOS artifact including `AG_BOOKING_OWNER_DECISION_01` ("Current status: **HOLD**"). | no live mutation authorized |
| **B5′** | **Credentials absent by design** — SMTP/Brevo, WhatsApp, GA4/GTM, Google Maps server key. | Workstreams 7, 8, 9 — untestable |
| **B6′** | **No IP-restricted server key for Distance Matrix/Geocoding** is recorded anywhere. | **Reported as OWNER BLOCKER**, exactly as Workstream 9 instructs. Not worked around; no key embedded. |

## PART 3 — Conflict C1 — now corroborated by a second independent source

**The task again designates `[ag_booking_engine]` as canonical (Workstream 1).**

`ALGRP/AGOS → AG_BOOKING_OWNER_DECISION_01.md` (2026-06-24), written independently of my analysis,
states under "Wrong engine risk":

> *"Confirm canonical engine and approved attribute string before any future insertion.*
> ***Do not use `[ag_transfer_booking_form]` or `[agp_booking_engine]`.****
> *Treat `agsc-v6` as working legacy/template coverage until a separate standardization step replaces it."*

and names the target as **`ag_home_booking`**, with the recovery-plan end state:
*"one `ag_home_booking` engine with two sanctioned render paths."*

So **two independent sources** — the platform record and the AGOS booking decision package — agree
the canonical engine is **`ag_home_booking`**. `[ag_booking_engine]` still has **zero occurrences**
anywhere in any of the four repos.

**Unchanged risk:** WordPress renders an unregistered shortcode as literal text. Inserting
`[ag_booking_engine]` into the 384 zero-form money pages would print raw shortcode on all of them and
still leave zero working forms — failing this task's own `raw shortcode=0` criterion, which the site
currently **passes 906/906**.

**This remains the one blocking decision.** Recommended answer: canonical = **`ag_home_booking`**,
and treat `[ag_booking_engine]` in the task text as a naming error. I have not acted on either
reading.

## PART 4 — Other conflicts

### C2 — TÜRSAB number (unresolved, legal)
Task §4 now says *"TÜRSAB No. 2165 bilgisi korunmalı"* (must be preserved) — a reaffirmation of
**2165**. The platform record says **12892**. AGOS contains **no** TÜRSAB reference (0 hits), so the
second source does not break the tie.

You have now stated 2165 twice, so I record it as your decision. I have published neither number —
nothing was written to the site — and I'd still recommend checking the figure against the TÜRSAB
registry document before it goes live, because a wrong agency licence number is a regulatory
exposure rather than a copy detail. That is a recommendation, not a blocker on your call.

### C3 — Pricing (unresolved, and now un-implementable anyway)
Task pricing still contradicts the platform record: shuttle 3 pax €60 vs €70, 4 pax €70 vs €80;
private non-Alanya **+€10 to +€22** above published from-prices. AGOS contains **no** pricing
formulas matching either (0 hits for `0.40`/`0.60`/`1.30`/`max(55`/`max(90`).

Spec defect stands: in `max(50, 50 + max(0, km−30) × 0.60)` the €50 floor **can never bind** —
`50 + (non-negative) ≥ 50` always. Dead code. The Alanya formula's floor *does* bind (below 67.5 km).
If the two were meant to be symmetrical, the non-Alanya base is probably meant to be **40**, not 50.

New requirement noted: *"Fiyat yalnızca server-side authority üzerinden belirlenmeli"* — pricing must
be server-side only, no client-side manipulation. Sound, and it is the right call; it cannot be
implemented without the engine source (B1′).

### C4 — Resolved by this task's wording ✅
The previous task said *"AYT ↔ GZP shuttle oluşturma"*, which I read as **create**. This task says
**"AYT ↔ GZP shuttle yasak"** — forbidden. That resolves the ambiguity in the opposite direction from
my earlier reading. Recorded: **AYT ↔ GZP shuttle is prohibited.** Okurcalar / Avsallar / Türkler
remain in GZP scope.

### C5 — Language tiers omit live Scandinavian pages (new)
See `BOOKING_ENGINE_MATRIX.md` §7. Twelve Norwegian/Scandinavian money-page URLs exist live
(`/alanya-flyplass-7-24-overfore/`, `/alanya-overfore/`, …) and fall outside the stated
`EN → TR → DE → RU` tiers — as does Arabic. A hreflang rebuild emitting only the four stated
languages would orphan them. Needs a decision.

### C6 — Workstream 1's premise is inverted (evidence-based)
"Leave only one booking engine per money page" assumes duplicates. Measured: **zero** URLs have more
than one form; **384 money pages have none**. The work is coverage-fill, not de-duplication. Acting
on the stated premise would spend the effort on a problem that does not exist while the real one —
65% of money pages unable to take a booking — stays open.
