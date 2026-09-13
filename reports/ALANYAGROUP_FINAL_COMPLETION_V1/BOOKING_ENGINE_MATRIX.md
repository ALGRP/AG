# Booking Engine — Usage & Dependency Matrix (Workstream A3)

**Satisfies:** Workstream A3 — *"Legacy shortcode'ları kör biçimde silme. Önce kullanım ve
bağımlılık matrisi çıkar."*

**Source:** `ALGRP/alanyagroup-platform` @ `5c1781b` → `MASTER_PROJECT_STATUS.md` §3 + §6,
`RISK_REGISTER.md` items 2 and 5. Compiled **2026-06-24**.

> ⚠️ **This matrix is derived from the written record, not from a live scan.** The live site
> is unreachable from this container (`evidence/04`). Per record Risk 2 it must be
> **re-verified against rendered DOM before any change** — see "The counting rule" below.
> Treat every row as *point-in-time, needs revalidation*.

---

## 1. Form implementations observed live (2026-06-21)

Three distinct booking form implementations were found rendering on production:

| # | DOM signature | Origin | Type | Disposition |
|---|---|---|---|---|
| 1 | `.ag-home-booking-shortcode` / `.ag-home-search` | `[ag_home_booking]` | content shortcode | ✅ **CANONICAL** (owner-chosen) |
| 2 | `.ag-c6-public-booking` | `[ag_booking_form]` | content shortcode (**old**) | ⚠️ migrate → canonical |
| 3 | `#agsc-v6-form` | **template injection** | not a shortcode | ⚠️ unify (see §3) |

Full canonical invocation as it appears live:

```
[ag_home_booking context="single_hero" default_service="transfer" layout="hero" ...]
```

**Canonical flow:** date → guest steppers → Google Places pickup (region-restricted, stores
`place_id` + lat/lng) → name + WhatsApp → notes. Live price total. Primary CTA
**"Confirm on WhatsApp"** fires the n8n webhook *and* opens a pre-filled WhatsApp message.
No prepayment, no account.

## 2. Identifier disposition — corrected

The task's Workstream A1/A2 identifier list does not match production. Corrected:

| Identifier | Task's classification | **Actual status (record)** | Action |
|---|---|---|---|
| `[ag_home_booking]` | *not mentioned* | **live canonical, working** | **keep — this is the target** |
| `[ag_booking_engine]` | "canonical" (A1) | **does not exist** — 0 hits | ❌ **do not deploy** → C1 |
| `[ag_booking_form]` | *not mentioned* | **live, old, real** → `.ag-c6-public-booking` | **the real migration target** |
| `[ag_transfer_booking_form]` | "legacy, sweep" (A2) | recorded **fictional**; was found once as *literal broken text* on page `21024`, already repaired | sweep for **literal text**, not for a working form |
| `[agp_booking_engine]` | "legacy, sweep" (A2) | **local/dev engine only** (AG_GM_08, ~65%) — *not on production* | out of scope for a production sweep; it is the dev build |
| `#agsc-v6-form` | *not mentioned* | **live template injection** on cluster URLs | biggest real duplicate-form risk → §3 |

**Net effect:** two of the three things the task asks to hunt are not on production, while the
two largest real sources of duplicate/legacy forms (`[ag_booking_form]` and `#agsc-v6-form`)
are not named in the task at all.

## 3. The template-injection problem (`#agsc-v6-form`)

`#agsc-v6-form` is injected **by template**, on structured cluster URLs:

- `/antalya-transfer/.../` — parent `33146`
- `/gazipasa-transfer/.../` — parent `33340`
- (cluster offset: **Gazipaşa ID = Antalya ID + 194**)

**Why this matters for A4 (`instance count = 1`):** because this form comes from the template
and not from post content, **adding a canonical shortcode to a cluster page produces TWO
forms** — the injected one plus the new one. This is precisely the double-form risk in record
Risk 2/5. The record already flags an unresolved *"`/gazipasa-transfer/` double-form decision."*

Template unification cannot be done by editing post content. It requires a template/hook change,
which is a code change to the theme or plugin — i.e. blocked by **B1/B2**.

## 4. Coverage reality (the real scale of Workstream A)

| Surface | Form present? | Source |
|---|---|---|
| ~14 of 906 items | ✅ inline shortcode | content |
| structured cluster URLs | ✅ but via template | `#agsc-v6-form` |
| flat-slug hotel-transfer pages | ❌ **none** | — |
| tours / activities pages | ❌ **none** | — |
| global header/footer | ❌ hook does **not** inject | — |

Site scale: **~906 published items** (273 pages + 633 posts), EN 439.

**Consequence for Workstream A5** (*"Ana sayfa, Antalya/Gazipaşa, shuttle, private, VIP, hotel
ve bölge sayfaları aynı motoru kullanmalı"*): the hotel and region pages listed there are
substantially in the **no-form-at-all** bucket. So A5 is mostly a **coverage-gap fill**
(add engine where none exists), not a **migration** (swap one engine for another). These are
different jobs with different risk profiles, and the task treats them as one.

## 5. The counting rule (mandatory before any mutation)

> **Record Risk 2:** *"booking-form presence cannot be confirmed from stored `content.raw`
> (forms inject at render time / via template); verify via DOM element counts, never string
> counts → mass-insert = double-form risk."*

This governs Workstream A4 and the test-matrix rows `duplicate form=0` / `booking engine
instance count=1`. Any audit **must**:

- ✅ count **rendered DOM elements** matching the three signatures in §1
- ❌ never count shortcode strings in `content.raw`
- ✅ run per-URL, before **and** after each change
- ✅ treat cluster URLs as presumed-template-injected until DOM proves otherwise

Access constraint: rendered-HTML reads are blocked to automation by Cloudflare; the recorded
working method is the **WordPress REST API through a logged-in admin browser session**
(Claude-in-Chrome, `wpApiSettings.nonce`, same-origin). A read-only n8n booking-coverage audit
workflow already exists — **`L39h5h3uIqCFmbkL`** — and should be reused rather than rebuilt.

## 6. Per-URL verification template (Workstream A4)

To be filled **only** from live DOM evidence. Empty by design — no row may be marked from the
written record alone.

| URL | canonical instances | legacy `.ag-c6-public-booking` | `#agsc-v6-form` | total forms | landing preselect correct | raw shortcode visible | verdict |
|---|---|---|---|---|---|---|---|
| `/` | — | — | — | — | — | — | ⛔ not verified |
| `/antalya-transfer/` | — | — | — | — | — | — | ⛔ not verified |
| `/gazipasa-transfer/` | — | — | — | — | — | — | ⛔ not verified |
| `/antalya-transfer-booking/` | — | — | — | — | — | — | ⛔ not verified |
| `/alanya-airport-transportation/` | — | — | — | — | — | — | ⛔ not verified |
| *(+ shuttle / private / VIP / hotel / region pages)* | — | — | — | — | — | — | ⛔ not verified |

**Pass criteria per row (task A4):** total forms = 1 · correct landing preselection ·
duplicate form = 0 · raw shortcode visible = 0.

## 7. Known open decisions carried in the record

All pending separate OWNER GO, all still open:

1. Coverage-gap fill (hotel flat-slug + tours/activities pages).
2. Old-shortcode migration (`[ag_booking_form]` → canonical).
3. `agsc-v6` **template unification**.
4. `/antalya-airport-transfer/` and `/gazipasa-airport-transfer/` old→new migration decision.
5. `/gazipasa-transfer/` **double-form** decision.
6. Local/dev engine standardisation — reconcile `[agp_booking_engine]` (AG_GM_08) against the
   live canonical `[ag_home_booking]` surface. **This is where task Workstream B's email/seat
   requirements most likely belong** (see conflict C7).

Item 6 is the one that must be settled first, because it determines what "canonical" even
means — and therefore whether Workstream A1 is a rename, a rebuild, or a mistake (C1).
