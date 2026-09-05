# Execution Plan — unblock sequence for ALANYAGROUP_FINAL_COMPLETION_V1

Ordered so each step produces the input the next one needs. Steps 0–2 are prerequisites;
**no workstream can start before step 2 completes.**

---

## STEP 0 — Owner decisions (blocking, ~15 minutes of owner time)

Nothing below can start until these five are answered. Four are one-liners.

| # | Question | Why it blocks | Ref |
|---|---|---|---|
| 0.1 | **Which shortcode is canonical?** `[ag_home_booking]` (live, working) / `[agp_booking_engine]` (dev, 65%) / build a new `[ag_booking_engine]`? | The task names one that does not exist. Deploying it prints raw text and zeroes out every booking form. | **C1** |
| 0.2 | **TÜRSAB licence: 2165 or 12892?** Supply the registry document. | Publishing the wrong licence number is a regulatory exposure. | **C3** |
| 0.3 | **Confirm the new pricing supersedes the record** — shuttle 3pax €60 (not €70), and non-Alanya private +€10–€22. | Rewrites "from €X" sitewide, incl. DE money pages. | **C4, C5** |
| 0.4 | **Fix the private-"other" formula.** `max(50, 50+…)` has a dead floor — was the base meant to be `40`? | Ambiguous spec; implementer must not guess a price. | **C5** |
| 0.5 | **Arabic (AR): in scope, leave as-is, or noindex?** | hreflang rebuild will otherwise omit live AR URLs. | **C8** |

Recommended default if the owner wants the safest path: **0.1 = `[ag_home_booking]`**
(it is live, working, and already the recorded owner choice), and treat the task's
`[ag_booking_engine]` as a naming error.

## STEP 1 — Provide a working target (blocking)

One of the following must exist before any implementation:

- **1a (preferred): a staging clone** of `alanyagroup.com` — docroot + DB restored from the
  recorded export (table prefix and export filename are in the private platform repo, §6
  AG_GM_12), reachable from the working environment, with the host allowlisted for egress. `EXECUTION_MODE=STAGING_OR_LOCAL_FIRST` assumes this; **no
  staging environment is currently recorded to exist** (B5).
- **1b: the plugin/theme source committed to git.** Push the `ag-homepage-pilot` build and the
  AG_GM_08 local engine into `ALGRP/alanyagroup-platform` (or `ALGRP/AG`) so the code is
  reviewable and diffable. This alone unblocks Workstreams A, B, C at the code level even
  without a live target.
- **1c: minimum viable** — allowlist `www.alanyagroup.com` for read-only egress so the audit
  and test matrix can at least *observe* production.

**Without 1a or 1b there is no file to edit.** 1c alone permits auditing, not implementing.

## STEP 2 — Redo Phase 0 inventory (blocking; the missing dependency)

The task's stated dependency does not exist (**B3**). It must be produced, from **live DOM**,
not from `content.raw` (record Risk 2). Reuse the existing read-only n8n audit workflows rather
than building new ones:

- booking coverage → **`L39h5h3uIqCFmbkL`**
- architecture → **`IT67wkS4YrNyTM1I`**

**Output required:** the per-URL table in `BOOKING_ENGINE_MATRIX.md` §6, fully populated, for
all ~906 items — with DOM element counts for the three signatures in §1 of that document.

---

## STEP 3+ — Workstream sequencing (after 0–2 clear)

Ordered by dependency, not by the task's A–I lettering.

| Order | Workstream | Prerequisites | Notes |
|---|---|---|---|
| 1 | **A** — one canonical engine | 0.1, 1, 2 | Split into **coverage-fill** vs **migration** vs **template unification** — three different risk profiles (matrix §4). Template unification is a code change, not a content edit. |
| 2 | **C** — pricing authority | 0.3, 0.4, 1 | Implement in the pricing endpoint first, verify at boundaries (1/2/3/4/6 pax; km=29/30/31; the €55/€90 floors), *then* update displayed "from €X". |
| 3 | **B** — booking UX | A, 1 | Confirm C7 first: email field and seat screen may only exist in the dev build. B8 (server key for Distance Matrix/Geocoding) is likely a **report-as-missing-permission**, not an implementable item. |
| 4 | **D** — content/template cleanup | A | D2 ("do not change working URLs") constrains D6; settle the SEO redirect decision before touching `/alanya-airport-transportation/`. D9/D10 gated on 0.2. |
| 5 | **G, H** — reservation ops, voucher | B7, B8, A | Idempotency (G1/G2, H5, H8) is designable now; **delivery testing needs credentials**. H9 (Calendar) is a **declared blocker** unless OAuth is provided — do not work around it. |
| 6 | **E** — SEO remediation | A, D | E10 (raw-HTML verify after every save) requires the logged-in same-origin method; Cloudflare blocks automation. Respect E9 — no bulk permalink change, DE traffic is strong. |
| 7 | **F** — languages | E, 0.5 | F4 forbids bulk auto-translation. EN→TR→DE→RU, English fallback. |
| 8 | **I** — analytics | A, G | GA4/GTM state is **entirely undocumented** — discovery needed before any change. GTM publish needs OWNER GO (I7). |

---

## Standing constraints (carry through every step)

- `owner_go = false` by default; documentation updates never imply authorisation.
- No live WordPress mutation, no n8n activation, no credential binding without a **new,
  explicit** OWNER GO logged in `OWNER_GO_LOG.md`.
- Backup + rollback package before **every** live mutation — the 2026-06-21 page-`21024`
  repair is the precedent to follow (backup taken, rollback saved, `owner_go` reverted to
  false immediately after).
- Verify booking-form presence by **rendered DOM counts, never string counts**.
- Secrets only in the n8n Credentials UI — never in chat, never in git.
- Never send a real WhatsApp message to a real driver or customer group; use synthetic
  addresses for Brevo/SMTP tests (H6).
- Update `CHANGELOG.md`, `TASK_QUEUE.md`, `RISK_REGISTER.md` after each completed task
  (`AI_OPERATING_RULES.md` 5–7).

## Note on repository routing

Per `AI_WORKFLOW_PROTOCOL.md`, `ALGRP/alanyagroup-platform` is the shared project memory and
the canonical home for evidence. This report was written to **`ALGRP/AG`** because that is the
repository and branch designated for this task. **Recommend mirroring this package into
`alanyagroup-platform/REPORTS/` and appending to its `CHANGELOG.md` / `TASK_QUEUE.md`** — not
done here, as no permission to write to that repository was given for this task.
