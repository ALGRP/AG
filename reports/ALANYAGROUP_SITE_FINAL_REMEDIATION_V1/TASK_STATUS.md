# TASK_STATUS — ALANYAGROUP_SITE_FINAL_REMEDIATION_V1

Delivery format below. Every field reflects what was actually measured or attempted.
Nothing is reported as passing that was not run.

```
TASK_STATUS            = PARTIAL — ANALYSIS AND MATRIX DELIVERED, CODE CHANGES BLOCKED
                         Workstream 1 analysis is COMPLETE and evidence-based.
                         Workstreams 2,3 blocked: booking engine source is in no
                         attached repo. Workstreams 5-9 blocked: target host is
                         egress-denied and credentials are owner-gated.

BASE_COMMIT            = 290945017e2974547178be61973dfc6f06d4bd99
                         (ALGRP/AG, branch claude/alanyagroup-final-completion-me48z5)
                         Read-only references:
                           ALGRP/alanyagroup-platform @ 5c1781b
                           ALGRP/AGOS                 @ f420b0e   <- inventory source
                           ALGRP/agos-mobility-cloud  @ ca9b7fc   <- Next.js SaaS, not relevant

IMPLEMENTATION_COMMIT  = see PR — analysis/report only.
                         Application code changed: 0. WordPress content changed: 0.

CHANGED_FILES          = 7 new files under reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/
                         (5 markdown, 1 analysis script, 1 evidence output)
                         Theme/plugin/booking-core files changed: 0

CHANGED_URLS           = NONE. No live or staging URL was modified.

BOOKING_ENGINE_MATRIX  = ✅ DELIVERED — BOOKING_ENGINE_MATRIX.md (aggregate + per-engine lists)
                         Bulk per-URL CSVs deliberately NOT committed: ALGRP/AG is a
                         PUBLIC repo and the source fixture is in the PRIVATE AGOS repo.
                         See data/README.md to regenerate. This is a disclosure control,
                         not a gap in the analysis.
                         Sitewide, from verified rendered-DOM counts:
                           none     699   (coverage gap)
                           agsc-v6  192   (template, standardization candidate)
                           ag_home   13   (canonical)
                           c6         2   (legacy migration candidate)
                         Money pages (587): 384 have ZERO booking form (65%).

LEGACY_FORMS_REMAINING = c6 legacy  : 2 URLs — /alanya-transfer/ (31925),
                                      /antalya-alanya-transfer/ (31889)
                         agsc-v6    : 192 URLs (template-injected; not a shortcode,
                                      needs a template release, not a content edit)
                         [ag_transfer_booking_form] : 0 — literal text nowhere (906/906
                                      literal_shortcode_text=none)
                         [agp_booking_engine]       : 0 on production (local/dev only)
                         [ag_booking_engine]        : 0 — DOES NOT EXIST anywhere -> C1
                         NOTHING WAS REMOVED. No dependency check could be completed
                         against a live target.

EMAIL_OPTIONAL_TEST    = BLOCKED (B1'). Booking engine source not in any attached repo,
                         so frontend/backend/API email validation cannot be located or
                         changed. Note: the recorded canonical flow is
                         date -> guests -> Places -> name + WhatsApp -> notes, with no
                         email field described — the requirement may already hold on the
                         live engine and target the dev build instead.

SEAT_SELECTION_REMOVED = NOT DONE (B1'). Same cause. No manual seat-selection step is
                         described in the recorded canonical flow either.

PRICING_TESTS          = BLOCKED (B1') + SPEC CONFLICT (C3).
                         Task pricing contradicts the platform record (shuttle 3pax EUR60
                         vs EUR70; non-Alanya private +EUR10..+EUR22). AGOS holds no
                         pricing formulas for either. Spec defect: the non-Alanya floor
                         max(50, 50+...) can never bind — dead code; base likely meant 40.
                         Server-side-authority requirement noted and endorsed; not
                         implementable without the engine source.
                         AYT<->GZP shuttle recorded as PROHIBITED per this task (resolves
                         the earlier ambiguity).

SEO_TESTS              = BLOCKED (B2'). Rank Math title/meta/canonical/schema audit,
                         duplicate-schema detection, sitemap hygiene and the required
                         raw-HTML verification after each save all need a reachable target.
                         One datum available from the inventory: all 906 URLs returned
                         HTTP 200 at scan time — no 404/redirect in that set.
                         No permalink change was made or proposed.

LANGUAGE_STATUS        = NOT IMPLEMENTED — scope conflict surfaced (C5).
                         699 zero-form URLs split 521 EN_OR_ASCII / 178 NON_EN_WPML_SCOPE.
                         Live non-English money pages by slug: DE 21, TR 14,
                         Scandinavian (NO/DA/SV) 12, RU 0.
                         Scandinavian and Arabic pages fall outside the stated
                         EN->TR->DE->RU tiers; a hreflang rebuild limited to those four
                         would orphan them. Owner decision needed.

BOOKING_IDEMPOTENCY    = BLOCKED (B1', B2'). Double-click / network-retry single-record
                         behaviour cannot be exercised without the engine or a live target.
                         Design requirement recorded; no test claimed.

NOTIFICATION_TEST      = BLOCKED (B4', B5'). All n8n workflows are inactive with no
                         credentials by design. Nothing imported, activated or executed.

VOUCHER_TEST           = BLOCKED (B5'). Brevo/SMTP credentials owner-gated and absent;
                         no synthetic-address delivery test could run. No real customer
                         or driver was contacted. WhatsApp Job Distribution NOT activated.

ANALYTICS_TEST         = BLOCKED (B2') + NO BASELINE. GA4/GTM state is undocumented in all
                         four repos; discovery must precede verification. No GTM publish
                         attempted, as instructed.

TOTAL_TESTS            = 18 listed in the task's test matrix.
PASSED                 = 3  — and only against the 906-URL inventory dataset, NOT a live run:
                              • duplicate form = 0   (0 URLs with >1 form)
                              • raw shortcode  = 0   (906/906 literal_shortcode_text=none)
                              • non-200 URLs   = 0   (906/906 HTTP 200)
FAILED                 = 0  — nothing failed, because nothing else could execute.
                         15 NOT RUN: desktop/mobile, AYT/GZP, one-way/return,
                         shuttle/private/VIP, region matrix, 1/2/3/4/6 pax,
                         empty/valid/invalid email, Places ok/fail, double-click + retry,
                         price bounds, console errors, horizontal overflow, single booking,
                         single operation notification, double voucher, rollback rehearsal.

PRODUCTION_CHANGED     = NO. Verifiably not.
                         No WordPress mutation. No n8n activation. No credential used or
                         stored. No WhatsApp message sent. No real customer/driver data
                         touched. No DB migration. No plugin overwrite. owner_go=false.

ROLLBACK_PACKAGE       = NOT REQUIRED — nothing to roll back; no production artifact exists.
                         Revert path for this report branch: git revert of the commit, or
                         close the PR unmerged.
                         For the future coverage work, the required rollback discipline is
                         already specified in AGOS AG_BOOKING_OWNER_DECISION_01 §C:
                         page edits -> back up content.raw, restore to roll back;
                         template/plugin -> file backup + checksum + PHP lint + staging
                         proof before activation. Do not combine coverage, migration and
                         template standardization in one action.

KNOWN_BLOCKERS         = B1' booking engine source absent from all four attached repos
                              (ag_home_booking: 0 hits in any .php/.js/.ts)
                         B2' target host egress-denied (gateway 403) + Cloudflare block
                         B3' no staging environment recorded to exist
                         B4' owner_go=false; AGOS decision package status = HOLD
                         B5' SMTP/Brevo, WhatsApp, GA4/GTM credentials owner-gated
                         B6' OWNER BLOCKER — no IP-restricted server key for Distance
                              Matrix/Geocoding is recorded. Reported, not worked around;
                              no key embedded in code, no auth check bypassed.
                         C1  [ag_booking_engine] does not exist; canonical is
                              ag_home_booking per TWO independent sources. Blocking.
                         C2  TÜRSAB 2165 (task, stated twice) vs 12892 (platform record);
                              neither published.
                         C3  pricing conflict + dead-floor spec defect.
                         C5  Scandinavian/Arabic money pages outside stated language tiers.

EVIDENCE_PATH          = reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/
                           TASK_STATUS.md            (this file)
                           BOOKING_ENGINE_MATRIX.md  (Workstream 1 deliverable)
                           FINDINGS_AND_CONFLICTS.md (corrections + C1-C6)
                           EXECUTION_PLAN.md         (ordered unblock sequence)
                           data/README.md            (why bulk CSVs are withheld)
                           evidence/analyze_booking_coverage.py        (reproducible)
                           evidence/01_booking_coverage_analysis.txt   (raw output)

READY_FOR_CODEX_REVIEW = YES — for the matrix, analysis and conflict register.
                         NO  — for implementation, which did not occur and cannot until
                               the canonical-engine decision (C1) is given AND either the
                               booking engine source is committed to git or a staging
                               target is provided.
```

---

## The two things that matter most

**1. The inventory existed — I missed it last time.** My previous report said the Phase 0 booking
inventory did not exist. It does: 906 URLs with verified rendered-DOM form counts, in `ALGRP/AGOS`,
a repo I had not attached. It is not named "Hermes", so a name-based search missed it. The matrix in
this package is built from it. Correcting that is what made the rest of this analysis possible.

**2. Workstream 1 is aimed at the wrong problem.** It asks to leave only one engine per money page.
Measured across 906 URLs: **no page has more than one form**, and **raw shortcode leakage is already
zero**. What the data shows instead is that **384 of 587 money pages (65%) render no booking form at
all** — including `/shuttle-transfer/`, `/alanya-airport-transfer/`, `/vip-transfers-city-tours/` and
`/alanya-airport-transportation/`. De-duplication would consume the effort without moving revenue;
coverage-fill is the actual work, and it is already prioritised into five batches.
