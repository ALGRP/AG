-- Independent QA negative probes for packages/db/migrations/0001_network_core.sql (synthetic data only).
-- Run on a FRESH database after the migration, WITHOUT ON_ERROR_STOP:
--   psql -d <db> -f qa-independent/sql/qa_probes.sql
-- Every "Qnn" statement violates a business rule and SHOULD be rejected (ERROR). A success tag (INSERT/UPDATE)
-- after a Qnn label means the database accepts the violation. "Rnn" lines are RLS observations.
\set VERBOSITY terse
\pset pager off

-- ------------------------------------------------------------------ setup (must all succeed)
\echo SETUP
INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test'), ('p2','P2','c@x.test'), ('p3','P3','d@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id, self_operation_verified_at) VALUES
 ('site-one','partner','p1','o@x.test','+905550000001','p1',NULL),
 ('site-two','partner','p2','o@x.test','+905550000002','p2',NULL),
 ('site-self','partner','p3','o@x.test','+905550000003','p3','2026-10-01');
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, closed_at, report_snapshot) VALUES
 ('2026-W45','2026-11-02 00:00+03','2026-11-09 00:00+03','2026-11-10 18:00+03','2026-11-09 08:00+03','{}'),
 ('2026-W46','2026-11-09 00:00+03','2026-11-16 00:00+03','2026-11-17 18:00+03','2026-11-16 08:00+03','{}');
INSERT INTO shuttle_route (tariff_version_id, route_code, active, coverage) VALUES ('shuttle-2026-11-03-proposed','AYT-KMR',false,'AYT -> Kemer (inactive)');
-- B1 shuttle 50 EUR delivered, collected, settled in W45
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, collected_amount, collection_method, collected_at, completed_at, price_mode, settlement_week_id)
VALUES ('00000000-0000-4000-8000-000000000101','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQQQ22','AYT-ALN','a','b','2026-11-04 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f101','delivered','shuttle-split-v1',1000,500,3500,5000,'cash','2026-11-04 10:00+03','2026-11-04 12:00+03','FIXED_SHUTTLE','2026-W45');
-- B2 private 80 EUR (entitlement 47,50), delivered + collected
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, site_commission_amount, agos_fee_amount, supplier_entitlement, collected_amount, collection_method, collected_at, completed_at, price_mode)
VALUES ('00000000-0000-4000-8000-000000000102','site-two','p2','sup-p','private',8000,'EUR','AG-QQQQ23',NULL,'a','b','2026-11-04 11:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f102','delivered',3250,0,4750,8000,'cash','2026-11-04 11:00+03','2026-11-04 13:00+03','SITE_PRICE');
-- B3..B6, B9: shuttle 50 EUR delivered (shares consistent), not settled
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, completed_at, price_mode)
SELECT ('00000000-0000-4000-8000-0000000001' || v.n)::uuid, 'site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQQQ' || v.r,'AYT-ALN','a','b','2026-11-05 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f' || v.n,'delivered','shuttle-split-v1',1000,500,3500,'2026-11-05 12:00+03','FIXED_SHUTTLE'
FROM (VALUES ('03','33'),('04','34'),('05','35'),('06','36'),('09','39')) AS v(n, r);
UPDATE booking SET collected_amount = 5000, collection_method = 'cash', collected_at = '2026-11-05 10:00+03' WHERE id = '00000000-0000-4000-8000-000000000109';
-- B7: 6 pax request, no price yet
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status)
VALUES ('00000000-0000-4000-8000-000000000107','site-one','p1','shuttle','AG-QQQQ27','AYT-ALN','a','b','2026-11-06 10:00',6,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f107','request');
-- B10: 2 pax confirmed, auto-priced 50 EUR
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000110','site-one','p1','shuttle',5000,'EUR','AG-QQQQ32','AYT-ALN','a','b','2026-11-06 11:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f110','confirmed','FIXED_SHUTTLE');
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0001','2026-W45','00000000-0000-4000-8000-000000000101','collection',0,5000,5000,1000,500,3500,'EUR','shuttle-split-v1');
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000a0001','00000000-0000-4000-8000-000000000101','collection',5000,'cash','supplier','SLIP-101','2026-11-04 10:00+03');
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000a0002','00000000-0000-4000-8000-000000000102','collection',8000,'cash','supplier','SLIP-102','2026-11-04 11:00+03');
INSERT INTO bank_receipt (id, week_id, payer_id, payee_id, amount, currency, bank_reference, paid_at) VALUES
 ('00000000-0000-4000-8000-0000000b0001','2026-W45','sup-a','p1',1000,'EUR','TR-0001','2026-11-10 09:00+03'),
 ('00000000-0000-4000-8000-0000000b0002','2026-W45','sup-p','p2',3250,'EUR','TR-7777','2026-11-10 09:00+03');
INSERT INTO statement_dispute (id, week_id, raised_by, reason, category, status, decided_by, decided_role, decided_mfa, decision_reason, decided_at)
VALUES ('ITZ-2026-W45-0001','2026-W45','p1','hesap hatasi iddiasi','calculation_error','rejected','m1','finance_manager',true,'dekontlar uyumlu','2026-11-12 09:00+03');
\echo SETUP_DONE

-- ------------------------------------------------------------------ Area 1 / 4 — settlement_entry and weeks
\echo Q01 A1 second entry re-counting the same 0->5000 base in W46 (double counting)
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0002','2026-W46','00000000-0000-4000-8000-000000000101','collection',0,5000,5000,1000,500,3500,'EUR','shuttle-split-v1');
\echo Q02 A1 entry base_after 9000 above the 5000 booking price
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0003','2026-W45','00000000-0000-4000-8000-000000000103','collection',0,9000,9000,1800,900,6300,'EUR','shuttle-split-v1');
\echo Q03 A1/A10 shuttle entry violating 20/10/70 (site 0, AGOS 0, supplier 5000)
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0004','2026-W45','00000000-0000-4000-8000-000000000104','collection',0,5000,5000,0,0,5000,'EUR','shuttle-split-v1');
\echo Q04 A11 private entry with an AGOS share (2750 / 500 / 4750)
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0005','2026-W45','00000000-0000-4000-8000-000000000102','collection',0,8000,8000,2750,500,4750,'EUR','private-pro-rata-on-collection');
\echo Q05 A4 entry appended to W45 days after W45 was closed (closed week changes)
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0006','2026-W45','00000000-0000-4000-8000-000000000105','collection',0,5000,5000,1000,500,3500,'EUR','shuttle-split-v1');
\echo Q06 A4 closing a week that has not ended yet (2099-W01 closed now)
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot) VALUES ('2099-W01','2098-12-29 00:00+03','2099-01-05 00:00+03','2099-01-06 18:00+03','{}');
\echo Q07 A4 closing W48 while W47 is not closed (out of order)
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot) VALUES ('2026-W48','2026-11-23 00:00+03','2026-11-30 00:00+03','2026-12-01 18:00+03','{}');
\echo Q08 A4 week id that does not match its period (2026-W50 with a Tuesday-start period)
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot) VALUES ('2026-W50','2026-11-03 00:00+03','2026-11-10 00:00+03','2026-11-11 18:00+03','{}');
\echo Q09 A4 non-existent ISO week 2027-W53
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot) VALUES ('2027-W53','2028-01-03 00:00+03','2028-01-10 00:00+03','2028-01-11 18:00+03','{}');
\echo Q10 A1 entry with an unknown split policy id
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0007','2026-W46','00000000-0000-4000-8000-000000000106','collection',0,5000,5000,1000,500,3500,'EUR','fake-policy');
\echo Q11 A1 entry in USD for a EUR booking
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000e0008','2026-W46','00000000-0000-4000-8000-000000000103','collection',0,5000,5000,1000,500,3500,'USD','shuttle-split-v1');

-- ------------------------------------------------------------------ Area 2 / 3 / 5 — money events, receipts, adjustments
\echo Q12 A3 customer refund of 90 EUR on a booking with no collection at all
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000a0003','00000000-0000-4000-8000-000000000106','refund',9000,'cash','supplier','RF-9000',now());
\echo Q13 A2 shuttle money event collected by the SITE
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000a0004','00000000-0000-4000-8000-000000000106','collection',5000,'cash','site','SLIP-SITE',now());
\echo Q14 A4 collection back-dated into the closed W45
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000a0005','00000000-0000-4000-8000-000000000105','collection',5000,'cash','supplier','SLIP-BACK','2026-11-03 10:00+03');
\echo Q15 A2 collected_amount of a settled booking reduced 5000 -> 0
UPDATE booking SET collected_amount = 0 WHERE id = '00000000-0000-4000-8000-000000000101';
\echo Q16 A5 same bank receipt of the same payer typed in lower case
INSERT INTO bank_receipt (id, week_id, payer_id, payee_id, amount, currency, bank_reference, paid_at) VALUES ('00000000-0000-4000-8000-0000000b0003','2026-W45','sup-a','p1',1000,'EUR','tr-0001','2026-11-10 09:00+03');
\echo Q17 A3 offset with an EMPTY written approval reference
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason, adjustment_reference, written_approval_reference) VALUES ('00000000-0000-4000-8000-0000000c0001','2026-W47','2026-W45','agos','sup-a',100,'EUR','offset','mahsup','OFS-QA-1','');
\echo Q18 A3/A4 correction written into the already-closed W46
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason, adjustment_reference, written_approval_reference) VALUES ('00000000-0000-4000-8000-0000000c0002','2026-W46','2026-W45','agos','sup-a',100,'EUR','offset','mahsup','OFS-QA-2','ONAY-QA-2');
\echo Q19 A3/A8 money moved for a REJECTED dispute
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason, adjustment_reference, dispute_id) VALUES ('00000000-0000-4000-8000-0000000c0003','2026-W47','2026-W45','sup-a','p1',500,'EUR','dispute_decision','red edildi ama odeme','ITZ-2026-W45-0001-ADJ','ITZ-2026-W45-0001');
\echo Q20 A3 adjustment into a non-existent future week 2026-W99
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason, adjustment_reference, written_approval_reference) VALUES ('00000000-0000-4000-8000-0000000c0004','2026-W99','2026-W45','agos','sup-a',100,'EUR','offset','mahsup','OFS-QA-4','ONAY-QA-4');
\echo Q21 A8 offset table has no actor / role / 2FA column (count of such columns)
SELECT count(*) AS actor_or_mfa_columns FROM information_schema.columns WHERE table_name = 'settlement_adjustment' AND column_name ~ '(mfa|actor|approved_by|decided_by|role)';

-- ------------------------------------------------------------------ Area 7 / 12 — prices
\echo Q22 A12 manual price approval of 0,01 EUR
INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason) VALUES ('00000000-0000-4000-8000-000000000107','m1','finance_manager',true,1,'grup fiyati onayi');
\echo Q23 A12 5 pax shuttle auto-priced FIXED_SHUTTLE 80 EUR
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000201','site-one','p1','shuttle',8000,'EUR','AG-QQQR22','AYT-ALN','a','b','2026-11-06 12:00',5,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f201','confirmed','FIXED_SHUTTLE');
\echo Q24 A12 SHUTTLE_MANUAL_APPROVED price without any approval record
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000202','site-one','p1','shuttle',9000,'EUR','AG-QQQR23','AYT-ALN','a','b','2026-11-06 13:00',6,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f202','confirmed','SHUTTLE_MANUAL_APPROVED');
\echo Q25 A12 tariff version with a 5th automatic total (5 pax = 80 EUR)
INSERT INTO shuttle_tariff_version (id, approval, published_at, currency, routes, valid_from, max_passengers, totals_minor) VALUES ('qa-five', 'proposed', '2026-11-03', 'EUR', ARRAY['AYT-ALN'], '2026-11-03', 10, ARRAY[3000,5000,6000,7000,8000]::bigint[]);
\echo Q26 A12 tariff version with zero / negative totals
INSERT INTO shuttle_tariff_version (id, approval, published_at, currency, routes, valid_from, max_passengers, totals_minor) VALUES ('qa-zero', 'proposed', '2026-11-03', 'EUR', ARRAY['AYT-ALN'], '2026-11-03', 10, ARRAY[0,-5000]::bigint[]);
\echo Q27 A12 booking on the forbidden route AYT-GZP
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000203','site-one','p1','shuttle',5000,'EUR','AG-QQQR24','AYT-GZP','a','b','2026-11-06 14:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f203','confirmed','FIXED_SHUTTLE');
\echo Q28 A12 priced booking on the INACTIVE route AYT-KMR
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000204','site-one','p1','shuttle',5000,'EUR','AG-QQQR25','AYT-KMR','a','b','2026-11-06 15:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f204','confirmed','FIXED_SHUTTLE');
\echo Q29 A7 price of a delivered + collected (not yet settled) booking changed 50 -> 30 EUR
UPDATE booking SET final_booking_price = 3000, site_commission_amount = 600, agos_fee_amount = 300, supplier_entitlement = 2100 WHERE id = '00000000-0000-4000-8000-000000000109';
\echo Q30 A7 settled delivered booking switched to cancelled
UPDATE booking SET status = 'cancelled', cancelled_at = now() WHERE id = '00000000-0000-4000-8000-000000000101';
\echo Q31 A7 manual price approval recorded for a 2 pax auto-priced booking
INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason) VALUES ('00000000-0000-4000-8000-000000000110','m1','admin',true,9000,'grup fiyati onayi');
\echo Q32 A12 approved manual bounds with a 0,01 EUR minimum
INSERT INTO shuttle_route (tariff_version_id, route_code, active, coverage, manual_min_minor, manual_max_minor, manual_bounds_status) VALUES ('shuttle-2026-11-03-proposed','AYT-ALN',true,'AYT -> Alanya',1,100000,'approved');

-- ------------------------------------------------------------------ Area 10 / 11 — attribution and private
\echo Q33 A10 booking credits p2 although the selling site belongs to p1
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, price_mode)
VALUES ('00000000-0000-4000-8000-000000000205','site-one','p2','shuttle',5000,'EUR','AG-QQQR26','AYT-ALN','a','b','2026-11-06 16:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f205','confirmed','FIXED_SHUTTLE');
\echo Q34 A10 unverified site supplies itself via a case-variant supplier id (P1 for p1) and takes 20 + 70
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode)
VALUES ('00000000-0000-4000-8000-000000000206','site-one','p1','P1','shuttle',5000,'EUR','AG-QQQR27','AYT-ALN','a','b','2026-11-06 17:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f206','confirmed','shuttle-split-v1',1000,500,3500,'FIXED_SHUTTLE');
\echo Q35 A11 private booking with supplier entitlement 90 > sale 80 (site share -10)
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode)
VALUES ('00000000-0000-4000-8000-000000000207','site-two','p2','sup-p','private',8000,'EUR','AG-QQQR28',NULL,'a','b','2026-11-06 18:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f207','confirmed',-1000,0,9000,'SITE_PRICE');

-- ------------------------------------------------------------------ positive controls (the schema DOES enforce these; each must be ERROR)
\echo C01 control payout execution switched on
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot, payout_execution) VALUES ('2026-W47','2026-11-16 00:00+03','2026-11-23 00:00+03','2026-11-24 18:00+03','{}','enabled');
\echo C02 control settlement_entry updated after the fact
UPDATE settlement_entry SET site_delta = 0 WHERE id = '00000000-0000-4000-8000-0000000e0001';
\echo C03 control booking deleted
DELETE FROM booking WHERE id = '00000000-0000-4000-8000-000000000101';
\echo C04 control shuttle shares 0/500/4500 for a non-self supplier
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode)
VALUES ('00000000-0000-4000-8000-000000000208','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQQR29','AYT-ALN','a','b','2026-11-06 19:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f208','confirmed','shuttle-split-v1',0,500,4500,'FIXED_SHUTTLE');
\echo C05 control unverified site as its own supplier (exact id)
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode)
VALUES ('00000000-0000-4000-8000-000000000209','site-one','p1','p1','shuttle',5000,'EUR','AG-QQQR32','AYT-ALN','a','b','2026-11-06 20:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f209','confirmed','shuttle-split-v1',0,500,4500,'FIXED_SHUTTLE');

-- ------------------------------------------------------------------ Area 6 — row level security
\echo RLS_SETUP
DO $$ BEGIN CREATE ROLE qa_party NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON booking, booking_money_event, settlement_entry, bank_receipt, settlement_adjustment, idempotency_key TO qa_party;
GRANT UPDATE ON booking TO qa_party;
SET ROLE qa_party;
SET app.party_id = 'p1';
\echo R01 A6 p1 session: own vs foreign booking rows visible (foreign should be 0)
SELECT count(*) FILTER (WHERE selling_party_id = 'p1' OR supplier_id = 'p1') AS own, count(*) FILTER (WHERE selling_party_id <> 'p1' AND coalesce(supplier_id, '') <> 'p1') AS foreign FROM booking;
\echo R02 A6 p1 session: money events of the p2 private booking visible (should be 0)
SELECT count(*) AS foreign_money_events FROM booking_money_event WHERE booking_id = '00000000-0000-4000-8000-000000000102';
\echo R03 A6 p1 session: bank receipts of p2 visible (should be 0)
SELECT count(*) AS foreign_receipts FROM bank_receipt WHERE payee_id = 'p2' OR payer_id = 'sup-p';
\echo R04 A6 p1 session: all settlement entries visible (no RLS on settlement_entry)
SELECT count(*) AS entries_visible FROM settlement_entry;
\echo R05 A6 the session itself can switch to another party (SET app.party_id = p2) and read the p2 bookings
SET app.party_id = 'p2';
SELECT count(*) AS p2_rows_after_self_switch FROM booking;
\echo R06 A6 p1 session cannot update any booking (no UPDATE policy -> app must run as owner, which bypasses RLS)
SET app.party_id = 'p1';
UPDATE booking SET notes = 'x' WHERE selling_party_id = 'p1';
RESET ROLE;
\echo R07 A6 RLS flags per table (relrowsecurity / relforcerowsecurity)
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('booking','booking_money_event','settlement_entry','bank_receipt','settlement_adjustment','statement_dispute','manual_price_approval','idempotency_key') ORDER BY relname;
\echo R08 A6 policies defined
SELECT tablename, policyname, cmd FROM pg_policies ORDER BY tablename;
\echo END
