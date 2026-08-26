# Booking Engine Matrix — ALANYAGROUP_SITE_FINAL_REMEDIATION_V1

**Deliverable:** `BOOKING_ENGINE_MATRIX` (Workstream 1).
**Status:** ✅ **PRODUCED** — from verified rendered-DOM data, not inference.

**Data source:** `ALGRP/AGOS` → `ag-platform-v2-admin-cms/fixtures/AG_BOOKING_COVERAGE_INVENTORY.csv`
(906 URLs) + `AG_BOOKING_PRIORITY_MATRIX.csv` (699 zero-form URLs).
**Provenance recorded in the data:** *"SEL-117 URL inventory + SEL-123 public HTML selector scan"*,
with later rows *"SEL-121 apply + SEL-122 rendered monitor overlay"*. Compiled ~2026-06.

**Why this is admissible:** the record's Risk 2 requires counting **rendered DOM elements, never
shortcode strings**. This dataset does exactly that — it carries per-URL `distinct_form_count`,
`ag_home_form_count`, `c6_form_count`, `agsc_v6_form_count`, and normalizes marker overcount to
one form family. It is the DOM-based inventory, already run.

> ⚠️ **Point-in-time.** Compiled ~2026-06; the live site is unreachable from this container, so it
> could not be refreshed. Re-run a preflight DOM count before any mutation.

Reproduce: `evidence/analyze_booking_coverage.py <inventory.csv> <priority_matrix.csv>`
Full output: `evidence/01_booking_coverage_analysis.txt`
Money-page matrix: regenerate locally — see `data/README.md` (withheld: this repo is public)

---

## 1. Sitewide engine distribution (906 URLs, all HTTP 200)

| Engine | URLs | Coverage status | Disposition |
|---|---:|---|---|
| **none** | **699** | `NO_RENDERED_BOOKING_FORM_REVIEW` | ❗ coverage gap — no form at all |
| `agsc-v6` (template-injected) | 192 | `COVERED_TEMPLATE_AGSC_V6_STANDARDIZATION_CANDIDATE` | standardize (Option C) |
| `ag_home` (**canonical**) | 13 | `COVERED_CANONICAL_AG_HOME` | keep |
| `c6` (legacy `[ag_booking_form]`) | 2 | `COVERED_LEGACY_C6_MIGRATION_CANDIDATE` | migrate |

Page types: 633 posts + 273 pages.

## 2. Acceptance criteria — measured, not assumed

The task lists these as tests to be driven to zero. Against this dataset they are **already zero**:

| Task criterion | Measured | Verdict |
|---|---|---|
| `duplicate form = 0` | 0 URLs have `distinct_form_count > 1` (all are 0 or 1) | ✅ **PASS** |
| `raw shortcode = 0` | `literal_shortcode_text = none` on **906/906** | ✅ **PASS** |
| non-200 in inventory | 0 — all 906 return 200 | ✅ **PASS** |

**This reframes Workstream 1.** The task is written as if the problem were *too many* engines per
money page ("her money page'de yalnızca bir rezervasyon motoru bırak"). Measured reality: **no URL
has more than one form.** The problem is the opposite — **absence**.

## 3. The actual problem: 384 of 587 money pages have NO booking form

Money page = URL matching `transfer|shuttle|private|vip|airport|havaalan|havalimani|flughafen|chauffeur`.

| Engine on money pages | Count | Action |
|---|---:|---|
| **none** | **384 (65%)** | **COVERAGE_FILL** |
| `agsc-v6` | 191 | STANDARDIZE → `ag_home_booking` |
| `ag_home` | 10 | none — already canonical |
| `c6` | 2 | MIGRATE → `ag_home_booking` |

**Revenue-critical pages currently rendering zero booking form** (priority score 106, Batch 1):

- `/alanya-airport-transfer/` (id 31901)
- `/alanya-airport-transportation/` (id 20514) ← *named in task §4*
- `/alanya-group-transfer-routes/` (id 15321)
- `/belek-airport-transfer/`
- `/kemer-airport-transfer/`
- `/shuttle-transfer/` ← *the shuttle money page*
- also: `/vip-transfers-city-tours/`, `/antalya-hotel-transfer/`

> **Correction to the task's premise for `/alanya-airport-transportation/`.** Task §4 says migrate it
> *"eski form kullanan"* (using an old form) to the canonical engine. The data says it has
> **`booking_engine=none`, `distinct_form_count=0`** — no old form, **no form at all**. It is a
> coverage-fill, not a migration. Same for `/tours/alanya/boat-trip/`.

## 4. Complete canonical `ag_home` inventory (13 URLs)

| URL | ID |
|---|---|
| `/` | 23532 |
| `/antalya-transfer/` | 33146 |
| `/antalya-transfer/kemer/` | 33226 |
| `/antalya-transfer/serik/belek/` | 33202 |
| `/antalya-transfer/manavgat/` | 33174 |
| `/antalya-transfer/manavgat/side/` | 33176 |
| `/antalya-transfer-booking/` | 21024 |
| `/antalya-airport-transfer/` | 11460 |
| `/gazipasa-airport-transfer/` | 12174 |
| `/private-transfer/` | 33989 |
| `/grand-okan-hotel-alanya-transfer/` | 34004 |
| `/tours/alanya/atv-safari/` | 33975 |
| `/korean-restaurants-in-antalya/` | 31033 |

## 5. Complete legacy `c6` inventory (2 URLs — the entire migration backlog)

| URL | ID | Forms | Note |
|---|---|---|---|
| `/alanya-transfer/` | 31925 | 1 | not broken; renders one `.ag-c6-public-booking` |
| `/antalya-alanya-transfer/` | 31889 | 1 | not broken; renders one `.ag-c6-public-booking` |

Legacy migration is **2 pages**, not a sitewide sweep.

## 6. Prioritised coverage backlog (699 zero-form URLs, pre-batched)

| Priority group | URLs |
|---|---:|
| `MUST_HAVE_BOOKING` (A) | **466** |
| `SHOULD_HAVE_BOOKING` (B) | 124 |
| `NO_BOOKING_NEEDED` (C) | 92 |
| `EXCLUDE_SYSTEM` (D) | 17 |

| Proposed batch | URLs |
|---|---:|
| Batch 1 — top revenue pages | 94 |
| Batch 2 — hotel transfer pages | 321 |
| Batch 3 — tours & activities | 51 |
| Batch 4 — destination guides | 16 |
| Batch 5 — remaining optional | 108 |

## 7. Language scope (feeds Workstream 6)

Of the 699 zero-form URLs: **521** `EN_OR_ASCII_OR_UNKNOWN`, **178** `NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE`.

Slug scan finds live non-English money pages the task's `EN → TR → DE → RU` priority does not cover:

| Language | URLs | Example |
|---|---:|---|
| DE | 21 | `/alanya-24-7-flughafentransfer/` |
| TR | 14 | `/alanya-havaalani-transfer-hizmeti/` |
| **Scandinavian (NO/DA/SV)** | **12** | `/alanya-flyplass-7-24-overfore/`, `/alanya-overfore/` |
| RU (latin slug) | 0 | — |

**Scandinavian money pages exist and are in no stated language tier.** A hreflang rebuild
(Workstream 6) that emits only EN/TR/DE/RU would orphan them. Needs an owner decision — same class
of issue as Arabic, flagged previously.

## 8. Counting rule for any future change (unchanged, mandatory)

- ✅ count **rendered DOM** form containers; normalize inner-marker overcount to one form family
- ❌ never count shortcode strings in `content.raw`
- ✅ per-URL, before **and** after every change
- ✅ target state: exactly **one** booking form per money page

The dominant risk when filling 384 pages is **creating** the duplicate-form condition that does not
currently exist: adding a shortcode to a page that already receives a template form. `agsc-v6`
coverage is template-driven on cluster URLs — verify per URL before inserting anything.
