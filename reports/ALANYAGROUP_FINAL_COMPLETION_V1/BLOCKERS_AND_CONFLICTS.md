# Blockers and Conflict Register — ALANYAGROUP_FINAL_COMPLETION_IMPLEMENTATION_V1

**Status:** implementation NOT started. **owner_go = false.**
**Authority for "record" column:** `ALGRP/alanyagroup-platform` @ `5c1781b`,
`AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md` (compiled 2026-06-24, owner-verified).

Two independent classes of problem were found. **B-class** (access) makes the task
non-executable in this environment. **C-class** (conflicts) means that executing
parts of the task *as literally written* — even with full access — would damage the
live site or publish incorrect legal information.

---

## PART 1 — BLOCKERS (B)

| ID | Blocker | Evidence | Blocks |
|----|---------|----------|--------|
| **B1** | **No code exists in any reachable repository.** `ALGRP/AG` contains exactly one file (`.gitkeep`, 0 bytes) on every branch. `ALGRP/alanyagroup-platform` contains 19 files, **all Markdown** — 0 PHP, 0 JS, 0 CSS, 0 SQL. | `evidence/01`, `evidence/02` | A–I (all) |
| **B2** | **The WordPress codebase is not in git at all.** It lives on the live host docroot (record §6, AG_GM_12) and on the owner's local machine (`CURRENT_STATUS.md`). Neither is mounted in this container. *(Exact paths intentionally omitted — this repo is public; see the private platform repo.)* | record §6; `CURRENT_STATUS.md` | A–I (all) |
| **B3** | **The stated DEPENDENCY does not exist.** `DEPENDENCY=Hermes Phase 0 inventory completed`. Grep for `hermes` and `phase[ _-]?0` across the entire shared memory returns **0 hits**. The task's premise — that a verified inventory exists to work from — is unmet. | `evidence/03` Q1 | A–I (all) |
| **B4** | **Target host unreachable.** Environment network policy denies CONNECT to `www.alanyagroup.com:443` (gateway 403). Compounded by the recorded Cloudflare block on external/automated fetches (record §4, Risk 3). | `evidence/04` | MANDATORY TEST MATRIX (every row), E10 |
| **B5** | **No staging environment is recorded to exist.** `EXECUTION_MODE=STAGING_OR_LOCAL_FIRST` presumes one. The record documents only *live* + *owner's local Mac*. No staging URL, host, or credentials appear anywhere. | record §1–8 | A–I (all) |
| **B6** | **OWNER GO is false and no exception is logged.** `OWNER_GO_LOG.md`: *"No live WordPress OWNER GO given for this setup yet."* `AI_OPERATING_RULES.md` rule 2 forbids live mutation without it. Task Workstreams G6, I7 and PROHIBITIONS restate the same gate. | `OWNER_GO_LOG.md` | any live mutation |
| **B7** | **Credentials for the H/I/G chains are absent by design.** SMTP/Brevo, WhatsApp (Meta + template), Google Calendar OAuth, GA4/GTM and the AI keys are all recorded as *"Blocked on owner"*, enterable only in the n8n Credentials UI, never in chat. | record §5 | G3–G7, H1–H9, I1–I7 |
| **B8** | **No independent security audit exists for WhatsApp Job Distribution.** Task G6 forbids activation without a PASS. No audit artifact is present in the record. | record §5; `evidence/03` | G6, G7 |

> **B1–B5 are hard blockers.** They are not "missing context I can work around" — there is
> no artifact in this session to edit. Writing code here would mean inventing a
> WordPress plugin that has no relationship to the one actually running on the site.

---

## PART 2 — CONFLICT REGISTER (C)

Each row is a place where the task instruction contradicts the owner-verified record.
**None of these should be resolved by an implementer's judgement — all need the owner.**

### C1 — CRITICAL: the designated canonical shortcode does not exist

| | |
|---|---|
| **Task says** | Workstream A1: use **only** `[ag_booking_engine]` on all transfer money pages. |
| **Record says** | Owner-chosen canonical engine is **`[ag_home_booking]`** (record §3). `[ag_booking_engine]` appears **nowhere** — 0 hits (`evidence/03` Q2). |
| **Risk if executed literally** | WordPress renders an unregistered shortcode as **literal text**. Placing `[ag_booking_engine]` on every money page would print the raw string `[ag_booking_engine]` and leave **0 working booking forms** across the entire revenue surface. |
| **Precedent** | This exact failure already happened once: page `21024` `/antalya-transfer-booking/` was found broken with literal `[ag_transfer_booking_form]` text and 0 forms, and was repaired on 2026-06-21 by replacing it with `[ag_home_booking]` (record §3). |
| **Note** | This also directly violates the task's own MANDATORY TEST MATRIX rows `raw shortcode/CSS=0` and `duplicate form=0`, and Workstream A4 `booking engine instance count=1`. The instruction is self-contradictory. |

**Required owner decision:** confirm whether canonical is `[ag_home_booking]` (live, working),
`[agp_booking_engine]` (local/dev, ~65%, AG_GM_08), or a genuinely new `[ag_booking_engine]`
that must be *built and registered first*. **Do not proceed on A until answered.**

### C2 — The task's legacy-shortcode hit list is wrong

Task A2 orders a sweep for `[ag_transfer_booking_form]` and `[agp_booking_engine]`.
The record (§3) explicitly classifies both as **fictional / not present on production**:
> *"Fictional shortcodes (do not use): `[ag_transfer_booking_form]`, `[agp_booking_engine]` … do not exist on the site."*

Sweeping for them returns ~0 production hits while the **real** duplicate-form sources go
untouched. See `BOOKING_ENGINE_MATRIX.md` for the corrected target list.

### C3 — CRITICAL (legal/compliance): TÜRSAB licence number mismatch

| | |
|---|---|
| **Task says** | Workstream D9: publish **"TÜRSAB 2165"**. |
| **Record says** | **"TÜRSAB licence 12892"** (record §1). |
| **Delta** | Two different licence numbers for the same agency. |

Publishing an incorrect travel-agency licence number is a **regulatory and consumer-trust
exposure**, not a copy tweak. Neither number is verified against a TÜRSAB registry record in
this session. **Neither may be published until the owner supplies documentary proof.**
Task D9 says "doğrulanmış biçimde kullan" (use in verified form) — that verification does not exist yet.

Also unverified: the phone/WhatsApp number **+90 551 160 69 05** (Workstream D10) appears
**nowhere** in the shared memory (`evidence/03` Q5) and cannot be corroborated here.

### C4 — MATERIAL: shuttle pricing contradicts the record

| Passengers | Task C (SHUTTLE) | Record §1 | Delta |
|---|---|---|---|
| 1 | €30 | €30 | — |
| 2 | €50 | €50 | — |
| 3 | **€60** | **€70** | **−€10** |
| 4 | **€70** (3rd tier +10) | **€80** | **−€10** |
| 5 | €80 | *(undefined)* | new |
| 6 | €90 | *(undefined)* | new |

**Scope conflict too:** the record scopes shuttle to **Alanya↔Antalya only**. The task expands
it to AYT↔Alanya/Side/Belek/Kemer, Alanya↔GZP, a new AYT↔GZP shuttle, and GZP coverage
including Okurcalar/Avsallar/Türkler. That is a **service-catalogue expansion**, not a config
change — it implies new routes, new distance data (the record notes the **GZP cluster has no
GZP km data yet**, §1), and new capacity assumptions.

### C5 — MATERIAL: private/VIP pricing model is a different model, not a tweak

The record uses a **tiered/marginal** model: €40 base (first 20 km) then per-km bands
€0.20→€0.50. The task supplies **linear formulas with a floor**. These are not reconcilable
by tuning — they are different formulas. Modelled against the record's own published
from-prices (distances approximate, from the cluster distance data):

| Destination | ≈km from AYT | Task formula result | Record "from" price | Delta |
|---|---|---|---|---|
| Belek | ~35 | `max(50, 50+5×0.60)` = **€53** | €43 | **+€10** |
| Kemer | ~55 | `max(50, 50+25×0.60)` = **€65** | €48 | **+€17** |
| Side | ~65 | `max(50, 50+35×0.60)` = **€71** | €52 | **+€19** |
| Manavgat | ~75 | `max(50, 50+45×0.60)` = **€77** | €55 | **+€22** |
| Alanya | ~125 | `max(55, 40+95×0.40)` = **€78** | €77 | +€1 |

**Reading:** the Alanya formula reproduces the current Alanya price almost exactly (€78 vs €77),
but the "other" formula raises every non-Alanya destination by €10–€22. If that increase is
intended, fine — but it rewrites the **"from €X" price shown on money pages and in SEO
snippets sitewide**, which collides with Workstream E (title/meta rewrite scope) and with the
record's German-traffic-preservation concern (F/E9).

**Two spec defects worth fixing before anyone implements:**

1. `max(50, 50 + max(0, km−30) × 0.60)` — the outer `max(50, …)` **can never bind**, because
   `50 + (non-negative)` is always ≥ 50. The floor is dead code. Was the base meant to be
   lower than the floor (e.g. `max(50, 40 + …)`), mirroring the Alanya formula's shape?
2. By contrast the Alanya floor **does** bind: `40 + (km−30)×0.40 < 55` whenever **km < 67.5**,
   so all Alanya-area trips under 67.5 km price at the €55 floor. Confirm that is intended.
3. VIP `max(90, private × 1.30)`: the €90 floor binds whenever private < €69.23. Consistent, no defect.

### C6 — MINOR: payment-wording instruction is internally ambiguous

Workstream C/PAYMENT simultaneously says *"Nakit/araçta ödeme pilotu korunacak"* (preserve the
cash/in-vehicle payment pilot) and *"'cash or card in vehicle' gibi … ifadeleri temizle"*
(remove "cash or card in vehicle" phrasing).

**Proposed reading (needs a one-word confirmation, not a blocker):** keep **cash** in vehicle,
remove the **"or card"** half — i.e. the objection is to implying card acceptance, not to
in-vehicle payment. This is consistent with the record's *"No prepayment/account up front"*
and with the no-online-card rule. Recommend the site standardise on **"Pay cash in vehicle —
final price and availability confirmed on WhatsApp."**

### C7 — Requirements that may already be satisfied on the live canonical engine

Workstream B1 (email optional) and B2 (remove manual seat selection) may be aimed at the wrong
build. The live `[ag_home_booking]` flow is recorded (§3) as:
`date → guest steppers → Google Places pickup → name + WhatsApp → notes`
— **no email field and no seat-selection screen is described.** Both requirements more
plausibly describe the **local/dev `[agp_booking_engine]`** build (AG_GM_08, ~65%), which does
own passenger/date UX and shuttle logic.

Cannot be confirmed without access (B1/B4). Flagging so effort is not spent removing a field
from a form that does not have it, while the dev build that does keeps it.

### C8 — Language scope omits a language that exists on the site

Task F sets priority **EN → TR → DE → RU**. The record (§1) states the site is multilingual
**EN 439 / TR / DE / RU / AR** — Arabic exists and the task does not mention it. Task F4 also
forbids bulk auto-translation publishing, and the record notes **only English is currently
edited; TR/DE/RU/AR are reserved for WPML**.

**Needs decision:** what happens to AR — leave as-is, `noindex`, or bring into scope? Silence
here plus a hreflang rebuild (F3) risks emitting an hreflang set that omits live AR URLs.

---

## PART 3 — WHAT WAS NOT DONE, AND WHY

No source file was created, edited, or deleted. No WordPress content was touched. No n8n
workflow was imported, activated, or executed. No credential was requested, used, or stored.
No WhatsApp message was sent. No test result is reported as passing.

This is not caution for its own sake — per **B1/B2 there is no code in this session to
change**, and per **B4** there is no reachable target to verify against. Producing plausible
diffs against an imagined plugin, or a filled-in test matrix that was never run, would violate
PROHIBITIONS ("Başarısız testi gizleme" — do not hide failing tests) and the operating rule
that evidence follows every task.

**The task's own instruction A3 — *"Legacy shortcode'ları kör biçimde silme. Önce kullanım ve
bağımlılık matrisi çıkar"* (do not blindly delete legacy shortcodes; first produce a usage and
dependency matrix) — is the one deliverable that was genuinely possible from the record alone.
It is delivered in `BOOKING_ENGINE_MATRIX.md`.**
