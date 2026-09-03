# ALGRP/AG

Working repository for Alanya Group implementation tasks.

> **Note on repository roles.** `ALGRP/alanyagroup-platform` is the shared project memory
> (AI Command Center, evidence, changelog) per `AI_WORKFLOW_PROTOCOL.md`. This repository is
> the designated working repo for task branches. It currently contains **no application code** —
> the WordPress source for alanyagroup.com lives on the live host docroot and on the owner's
> local machine, not in git. (Exact host paths and DB identifiers are recorded in the private
> `alanyagroup-platform` repo and are deliberately not repeated here — this repo is public.)

## Reports

| Report | Status |
|---|---|
| [`reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/`](reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/) | ⛔ **STOPPED** — baseline absent; stop condition met. Includes a macOS preflight script. |
| [`reports/ALANYAGROUP_FINAL_COMPLETION_V1/`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/) | ⛔ **BLOCKED** — preconditions absent, spec conflicts found. Start with [`TASK_STATUS.md`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/TASK_STATUS.md). |

### ALANYAGROUP_FINAL_COMPLETION_V1 — read in this order

1. **[`TASK_STATUS.md`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/TASK_STATUS.md)** — required return block; what ran, what didn't, why.
2. **[`BLOCKERS_AND_CONFLICTS.md`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md)** — 8 blockers, 8 spec-vs-record conflicts.
3. **[`BOOKING_ENGINE_MATRIX.md`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/BOOKING_ENGINE_MATRIX.md)** — Workstream A3 usage/dependency matrix.
4. **[`EXECUTION_PLAN.md`](reports/ALANYAGROUP_FINAL_COMPLETION_V1/EXECUTION_PLAN.md)** — ordered unblock sequence.
5. `evidence/` — raw command output backing every claim above.

**Headline:** Workstream A designates `[ag_booking_engine]` as canonical, but that shortcode
does not exist — the live canonical engine is `[ag_home_booking]`. Deploying it would render
literal text and leave zero working booking forms. See conflict **C1**.

## Operating rules

`owner_go = false`. No live WordPress mutation, n8n activation, or credential binding without a
new explicit OWNER GO. Documentation updates never imply authorization.

## Handoff

| Paket | Alıcı |
|---|---|
| [`handoff/HERMES_TASK_PACKET_01.md`](handoff/HERMES_TASK_PACKET_01.md) | **Hermes** — baseline sağlama + TÜRSAB / fiyat formülü / dil kapsamı doğrulaması. Rapor yolları ve teslim formatı içinde. |
