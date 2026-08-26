# ALANYAGROUP_SITE_FINAL_REMEDIATION_V1

**Status:** PARTIAL — Workstream 1 analysis complete; code changes blocked.
**Production changed:** NO.

Read in this order:

1. **[`TASK_STATUS.md`](TASK_STATUS.md)** — delivery format; what ran, what didn't, why.
2. **[`BOOKING_ENGINE_MATRIX.md`](BOOKING_ENGINE_MATRIX.md)** — the Workstream 1 deliverable.
3. **[`FINDINGS_AND_CONFLICTS.md`](FINDINGS_AND_CONFLICTS.md)** — corrections to the previous report + open conflicts.
4. **[`EXECUTION_PLAN.md`](EXECUTION_PLAN.md)** — ordered unblock sequence.
5. `evidence/` — reproducible analysis script + raw output. `data/README.md` explains which bulk CSVs are withheld and why.

## Headline

Across 906 verified URLs: **duplicate forms = 0** and **raw shortcode = 0** — both already pass.
The real gap is **384 of 587 money pages (65%) render no booking form at all**, including
`/shuttle-transfer/`, `/alanya-airport-transfer/` and `/vip-transfers-city-tours/`.

Workstream 1 asks for de-duplication; the evidence says the work is **coverage-fill**.

Blocking decision: the task names `[ag_booking_engine]` as canonical, but that shortcode exists
nowhere — two independent sources name **`ag_home_booking`**.
