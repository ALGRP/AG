# Bulk data — deliberately NOT committed here

`ALGRP/AG` is a **public** repository. `ALGRP/AGOS` (the data source) is **private**.

Two files that this analysis produced or consumed are withheld from this repo on purpose:

| File | Why withheld | Where it lives |
|---|---|---|
| `AG_BOOKING_COVERAGE_INVENTORY.csv` (906 rows) | Republishing a private-repo fixture into a public repo. | `ALGRP/AGOS` → `ag-platform-v2-admin-cms/fixtures/` |
| `MONEY_PAGE_BOOKING_ENGINE_MATRIX.csv` (587 rows) | It is a per-URL list of every money page that currently cannot take a booking — a ready-made competitive/target list. | regenerate locally, see below |

The aggregate findings needed to make decisions are in `../BOOKING_ENGINE_MATRIX.md`. The bulk
per-URL files add operational convenience, not decision value, and are not worth the public exposure.

## Regenerate locally

```
python3 ../evidence/analyze_booking_coverage.py \
    <AGOS>/ag-platform-v2-admin-cms/fixtures/AG_BOOKING_COVERAGE_INVENTORY.csv \
    <AGOS>/ag-platform-v2-admin-cms/fixtures/AG_BOOKING_PRIORITY_MATRIX.csv
```

**If you want these committed**, the right fix is to move this report package into the private
`AGOS` or `alanyagroup-platform` repo, or make `ALGRP/AG` private — not to publish them here.
