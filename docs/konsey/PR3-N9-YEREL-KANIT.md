# PR3-N9 — Geçmiş kendi aracı rezervasyonu doğrulama geri alınınca kilitlenmez

2026-11-04. LOCAL_ONLY. This is a candidate, not accepted CRS production behavior.

## Rule
Self-operation approval is verified at booking INSERT and at first supplier assignment (supplier_id: NULL -> value). Historical, already-supplied bookings retain their original recorded selling_site_id, selling_party_id and supplier_id after the site owner or self-operation approval changes. Subsequent operational updates must not revalidate current approval. A new self-supplied booking or supplier assignment must never bypass current verification. The 0009 attribution-freeze rule remains.

## Implementation
An additive packages/db/migrations/0011_self_supply_history.sql replaces BOTH ag_f4_check_booking_attribution() (introduced by 0008/0009) and legacy 0001 booking_settlement_guard(); either function alone would still deny legitimate historical updates. Prior migrations 0001–0010 remain unchanged.

## Evidence
Original Claude attribution-hardening.test.ts PR3-N9 assertion was enabled without changing assertions. After an approved self-supplied booking is inserted and authorization is revoked, updating its notes succeeds. PR3-N7 and PR3-N8 legacy acceptance expectations remain. PG16 uses an isolated network-none Docker test container, no customer/CRS data.

Remaining release gates: actual CRS schema and trusted IdP, financial/business Owner decisions, PR3-N2 SAVEPOINT, independent human review, SEL-324/326 G0 HOLD. No PR merge, staging/live database migration, payment, Ads or real booking changes.
