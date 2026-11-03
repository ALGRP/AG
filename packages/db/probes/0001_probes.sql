-- Negatif şema probları (yerel, sentetik veri). Çalıştırma: psql -f 0001_network_core.sql; ardından bu dosya (ON_ERROR_STOP olmadan).
-- Beklenen: 'OK' satırları ve OK2/OK3 hatasız; P1–P16 her biri ERROR. 03.11.2026 doğrulaması: 16/16 ERROR, OK1–OK3 geçti.
\set VERBOSITY terse
INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id) VALUES ('site-one','partner','p1','o@x.test','+905550000000','p1');
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot) VALUES
 ('2026-W45','2026-11-02 00:00+03','2026-11-09 00:00+03','2026-11-10 18:00+03','{}'),
 ('2026-W46','2026-11-09 00:00+03','2026-11-16 00:00+03','2026-11-17 18:00+03','{}');
INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status)
 VALUES ('00000000-0000-4000-8000-000000000001','site-one','p1','shuttle',5000,'EUR','AG-ABCDEF','AYT-ALN','a','b','2026-11-04 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f','confirmed');
-- OK: overcollection allowed (collected > price)
UPDATE booking SET collected_amount=6000, collection_method='cash', collected_at=now(), settlement_week_id='2026-W46' WHERE ref='AG-ABCDEF';
SELECT 'OK1 overcollect allowed';
-- P1 week backward
UPDATE booking SET settlement_week_id='2026-W45' WHERE ref='AG-ABCDEF';
-- P2 refunds reduced
UPDATE booking SET refunded_amount=1000 WHERE ref='AG-ABCDEF';
UPDATE booking SET refunded_amount=500 WHERE ref='AG-ABCDEF';
-- P3 collector fixed
UPDATE booking SET collection_method='card_pos' WHERE ref='AG-ABCDEF';
-- P4 money event dup reference
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','collection',3000,'cash','supplier','SLIP-1',now());
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000001','collection',2000,'cash','supplier','SLIP-1',now());
-- P5 money event update
UPDATE booking_money_event SET amount=1 WHERE reference='SLIP-1';
-- P6 entry delta sum mismatch
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000000b1','2026-W45','00000000-0000-4000-8000-000000000001','collection',0,3000,3000,600,300,2000,'EUR','shuttle-split-v1');
-- OK2 valid entry
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000000b2','2026-W45','00000000-0000-4000-8000-000000000001','collection',0,3000,3000,600,300,2100,'EUR','shuttle-split-v1');
-- P7 second entry same week
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000000b3','2026-W45','00000000-0000-4000-8000-000000000001','collection',3000,5000,2000,400,200,1400,'EUR','shuttle-split-v1');
-- P8 kind mismatch (refund_correction with positive delta)
INSERT INTO settlement_entry VALUES ('00000000-0000-4000-8000-0000000000b4','2026-W46','00000000-0000-4000-8000-000000000001','refund_correction',3000,5000,2000,400,200,1400,'EUR','shuttle-split-v1');
-- P9 mfa false
INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason) VALUES ('00000000-0000-4000-8000-000000000001','u1','admin',false,9000,'grup fiyatı');
-- P10 operator role
INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason) VALUES ('00000000-0000-4000-8000-000000000001','u1','operator',true,9000,'grup fiyatı');
-- P11 dispute decided without reason
INSERT INTO statement_dispute (id, week_id, raised_by, reason, category) VALUES ('ITZ-2026-W45-0001','2026-W45','p1','hesap hatası var','calculation_error');
UPDATE statement_dispute SET status='rejected', decided_at=now(), decided_by='m1', decided_role='finance_manager', decided_mfa=true WHERE id='ITZ-2026-W45-0001';
-- OK3 proper decision
UPDATE statement_dispute SET status='rejected', decided_at=now(), decided_by='m1', decided_role='finance_manager', decided_mfa=true, decision_reason='dekontlar uyumlu' WHERE id='ITZ-2026-W45-0001';
-- P12 second decision
UPDATE statement_dispute SET status='accepted' WHERE id='ITZ-2026-W45-0001';
-- P13 offset without written approval
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason, adjustment_reference) VALUES ('00000000-0000-4000-8000-0000000000c1','2026-W46','2026-W45','p1','agos',100,'EUR','offset','mahsup','ADJ-1');
-- P14 shuttle_route AYT-GZP
INSERT INTO shuttle_route VALUES ('shuttle-2026-11-03-proposed','AYT-GZP',false,'x',NULL,NULL,NULL);
-- P15 min > max
INSERT INTO shuttle_route VALUES ('shuttle-2026-11-03-proposed','AYT-ALN',true,'x',9000,8000,'proposed');
-- P16 refund > collected
UPDATE booking SET refunded_amount=7000 WHERE ref='AG-ABCDEF';
