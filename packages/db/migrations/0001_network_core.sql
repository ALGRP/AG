-- AG Network — merkez şema ADAYI (LOCAL_ONLY · CANDIDATE)
-- Bu dosya canlıya/staging'e UYGULANMAZ. Kanonik rezervasyon veritabanı mevcut CRS PostgreSQL'idir
-- (Linear D-CRS-20261102-01: agos-reservation-postgres). Buradaki tablolar, CRS şeması okunduktan
-- sonra (SEL-329 G1, SEL-331 eşleme) CRS karşılıklarına eşlenecek bir sözleşmedir; yeni bir rezervasyon
-- deposu açmak için değildir.
--
-- Değişmezler:
--   * Para numeric değil, bigint minor unit (cent) + ayrı para birimi kolonu; birimler karışmaz.
--   * Her kiracı tablosunda partner_id / site_id; PostgreSQL RLS + uygulama katmanı filtresi birlikte.
--   * Hesap kayıtları (settlement_entry, para hareketleri, dekontlar, düzeltmeler) yalnız eklenir; silinmez.
--   * 03.11 Owner karar taslağı (T1–T3, K17, K8) bu şemada YEREL ADAY olarak yer alır; canlıya uygulanmaz.
--   * Bildirim yalnız outbox'tan doğar; dedupe_key tekil.

BEGIN;

CREATE TYPE site_ownership AS ENUM ('ag_brand', 'partner');
CREATE TYPE site_status AS ENUM ('preview', 'live', 'suspended');
CREATE TYPE product AS ENUM ('private', 'vip', 'shuttle');
CREATE TYPE booking_status AS ENUM ('request', 'quoted', 'confirmed', 'delivered', 'cancelled');
-- K15: müşteriden tahsilatı tedarikçi yapar (private/VIP'de site de yapabilir).
CREATE TYPE collection_method AS ENUM ('cash', 'card_pos', 'bank_transfer');
-- T2: komisyon gerçekleşen tahsilat üzerinden; kısmi tahsilat ve fazla tahsilat ayrı durumlardır.
CREATE TYPE collection_status AS ENUM ('pending', 'short_collected', 'collected', 'overcollected', 'refunded');
CREATE TYPE settlement_status AS ENUM ('open', 'included', 'exception', 'adjusted');
CREATE TYPE currency AS ENUM ('EUR', 'USD', 'GBP', 'TRY');

-- Ücret ödeyen site sahibi (white-label üye).
CREATE TABLE partner (
  id              text PRIMARY KEY,
  legal_name      text NOT NULL,
  -- Yalnız doğrulanmış resmi belge; tahmin yazılmaz.
  license_text    text,
  billing_email   text NOT NULL,
  status          text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'active', 'restricted', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{3,64}$'),
  ownership       site_ownership NOT NULL,
  partner_id      text REFERENCES partner(id),
  owner_email     text NOT NULL,
  whatsapp_e164   text NOT NULL CHECK (whatsapp_e164 ~ '^\+[0-9]{8,15}$'),
  status          site_status NOT NULL DEFAULT 'preview',
  -- Satış kanalı payının alacaklısı: partner sitede partner_id, AG markalı sitede 'alanya-group'.
  owner_party_id  text NOT NULL,
  -- Site işi kendi aracıyla yapabilir (shuttle %90/%10) yalnız yasal yetkisi doğrulandıysa.
  self_operation_verified_at timestamptz,
  collection_methods collection_method[] NOT NULL DEFAULT ARRAY['cash','card_pos']::collection_method[]
    CHECK (cardinality(collection_methods) >= 1),
  -- Site sahibinin kendi satış fiyatları (cent); yoksa talep fiyatsız gelir.
  sale_private_minor bigint CHECK (sale_private_minor > 0),
  sale_vip_minor  bigint CHECK (sale_vip_minor > 0),
  sale_currency   currency,
  gsc_property    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((ownership = 'partner') = (partner_id IS NOT NULL)),
  CHECK (owner_party_id = CASE WHEN ownership = 'partner' THEN partner_id ELSE 'alanya-group' END)
);

-- Özel alan adı: TXT ile sahiplik kanıtı, sonra CNAME + TLS.
CREATE TABLE site_domain (
  host            text PRIMARY KEY,
  site_id         text NOT NULL REFERENCES site(id),
  txt_token       text NOT NULL,
  verified_at     timestamptz,
  is_canonical    boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX site_domain_one_canonical ON site_domain(site_id) WHERE is_canonical;

-- K15 kural 10: 200 €/ay SaaS aboneliği shuttle komisyonlarından AYRI takip edilir (ayrı tablolar,
-- komisyon borçlarıyla mahsup edilmez).
-- Google Ads bütçesi (40 €/gün) partnerin kendi gideridir; burada TUTULMAZ, merkezin cirosu değildir.
CREATE TABLE subscription_plan (
  id              text PRIMARY KEY,
  setup_fee_minor bigint NOT NULL CHECK (setup_fee_minor >= 0),
  monthly_fee_minor bigint NOT NULL CHECK (monthly_fee_minor >= 0),
  currency        currency NOT NULL,
  active          boolean NOT NULL DEFAULT true
);

-- Site başı değişken maliyet (hosting + yazılım + destek; sunum varsayımı 40 €) iç maliyet olarak plan satırında.
ALTER TABLE subscription_plan ADD COLUMN site_cost_minor bigint NOT NULL DEFAULT 0 CHECK (site_cost_minor >= 0);
INSERT INTO subscription_plan (id, setup_fee_minor, monthly_fee_minor, currency, site_cost_minor)
  VALUES ('partner-saas-deck-v3', 0, 20000, 'EUR', 4000);

CREATE TABLE subscription_invoice (
  id              uuid PRIMARY KEY,
  partner_id      text NOT NULL REFERENCES partner(id),
  site_id         text NOT NULL REFERENCES site(id),
  plan_id         text NOT NULL REFERENCES subscription_plan(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  amount_minor    bigint NOT NULL CHECK (amount_minor >= 0),
  currency        currency NOT NULL,
  status          text NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'overdue', 'void')),
  UNIQUE (site_id, period_start)
);

CREATE TABLE shuttle_tariff_version (
  id              text PRIMARY KEY,
  -- K8: yalnız 'approved' sürüm canlıda kullanılır; başlangıç yayın tarihine bağlıdır.
  approval        text NOT NULL CHECK (approval IN ('proposed', 'approved')),
  published_at    date NOT NULL,
  currency        currency NOT NULL,
  -- Her yön ayrı kod (AYT-ALN, ALN-AYT). AYT ↔ GZP shuttle hattı açılmaz.
  routes          text[] NOT NULL CHECK (NOT (routes && ARRAY['AYT-GZP', 'GZP-AYT'])),
  pilot_routes    text[] NOT NULL DEFAULT '{}' CHECK (pilot_routes <@ routes),
  valid_from      date NOT NULL,
  valid_to        date,
  max_passengers  int NOT NULL CHECK (max_passengers BETWEEN 1 AND 20),
  -- totals_minor[i] = (i+1) kişilik REZERVASYONUN TOPLAMI. Listenin ötesi otomatik fiyatlanmaz (onaya gider).
  totals_minor    bigint[] NOT NULL CHECK (cardinality(totals_minor) BETWEEN 1 AND max_passengers),
  approved_by     text,
  approved_at     timestamptz,
  CHECK (valid_from >= published_at),
  CHECK ((approval = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
-- FİYAT: OWNER KESİN KARARI 03.11.2026 — rezervasyon toplamı 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €; 5+ manuel.
-- HATLAR (K8): öneri, canlıdan önce Owner onayı → bu sürüm 'proposed'.
INSERT INTO shuttle_tariff_version (id, approval, published_at, currency, routes, pilot_routes, valid_from, max_passengers, totals_minor)
  VALUES ('shuttle-2026-11-03-proposed', 'proposed', '2026-11-03', 'EUR',
          ARRAY['AYT-ALN','ALN-AYT','AYT-SID','SID-AYT','AYT-BLK','BLK-AYT','AYT-KMR','KMR-AYT','AYT-KNY','KNY-AYT','GZP-ALN','ALN-GZP'],
          ARRAY['GZP-ALN','ALN-GZP'], '2026-11-03', 10, ARRAY[3000,5000,6000,7000]::bigint[]);

-- K8 (taslak): her yön ayrı hat kodu, kapsam ve aktif/pasif durumu, tarife sürümüne bağlı.
-- K17 (taslak): 5+ kişi manuel fiyat için hat bazında alt/üst sınır; sınırı Owner onaylı değilse fiyat kabul edilmez.
CREATE TABLE shuttle_route (
  tariff_version_id text NOT NULL REFERENCES shuttle_tariff_version(id),
  route_code      text NOT NULL CHECK (route_code ~ '^[A-Z]{3}-[A-Z]{3}$' AND route_code NOT IN ('AYT-GZP', 'GZP-AYT')),
  active          boolean NOT NULL DEFAULT false,
  coverage        text NOT NULL CHECK (length(trim(coverage)) > 0),
  manual_min_minor bigint CHECK (manual_min_minor > 0),
  manual_max_minor bigint,
  manual_bounds_status text CHECK (manual_bounds_status IN ('proposed', 'approved')),
  PRIMARY KEY (tariff_version_id, route_code),
  CHECK ((manual_min_minor IS NULL) = (manual_max_minor IS NULL) AND (manual_min_minor IS NULL) = (manual_bounds_status IS NULL)),
  CHECK (manual_max_minor IS NULL OR manual_max_minor >= manual_min_minor)
);

CREATE TABLE split_policy (
  id              text PRIMARY KEY,
  status          text NOT NULL CHECK (status IN ('proposed', 'approved')),
  carrier_bps     int NOT NULL,
  partner_bps     int NOT NULL,
  platform_bps    int NOT NULL,
  CHECK (carrier_bps >= 0 AND partner_bps >= 0 AND platform_bps >= 0),
  CHECK (carrier_bps + partner_bps + platform_bps = 10000)
);
-- K15 OWNER KARARI (KESİN): satış kanalı %20, AGOS %10, tedarikçi %70 — tek kaynak; kodla aynı (testli).
INSERT INTO split_policy VALUES ('shuttle-split-v1', 'approved', 7000, 2000, 1000);

CREATE TABLE shuttle_run (
  id              uuid PRIMARY KEY,
  route_code      text NOT NULL,
  slot_start      timestamp NOT NULL,          -- yerel saat (Europe/Istanbul)
  capacity        int NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  seats_taken     int NOT NULL DEFAULT 0 CHECK (seats_taken >= 0),
  status          text NOT NULL CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')),
  supplier_id     text,
  version         int NOT NULL DEFAULT 1,
  CHECK (seats_taken <= capacity)              -- aşırı doluluk veritabanında da imkânsız
);
CREATE INDEX shuttle_run_slot ON shuttle_run(route_code, slot_start) WHERE status IN ('open', 'assigned');

-- Hesap haftası: ISO hafta, Europe/Istanbul. Kapanış bir kez yapılır; anlık görüntü değişmez.
CREATE TABLE settlement_week (
  week_id         text PRIMARY KEY CHECK (week_id ~ '^[0-9]{4}-W[0-9]{2}$'),
  period_start    timestamptz NOT NULL,        -- Pazartesi 00:00 İstanbul
  period_end      timestamptz NOT NULL,        -- sonraki Pazartesi 00:00 İstanbul (hariç)
  payment_due     timestamptz NOT NULL,        -- önerilen: Salı 18:00 İstanbul
  closed_at       timestamptz NOT NULL DEFAULT now(),
  report_snapshot jsonb NOT NULL,
  -- Canlı ödeme / banka transferi / otomatik borç tahsilatı Owner GO olmadan kapalı.
  payout_execution text NOT NULL DEFAULT 'disabled_owner_go_required' CHECK (payout_execution = 'disabled_owner_go_required'),
  CHECK (period_end = period_start + interval '7 days'),
  CHECK (payment_due = period_end + interval '1 day 18 hours')
);

CREATE TABLE booking (
  -- ---- Owner K15 alan listesi ----
  id              uuid PRIMARY KEY,                       -- booking_id
  selling_site_id text NOT NULL REFERENCES site(id),
  selling_party_id text NOT NULL,                         -- site sahibi (komisyon alacaklısı)
  supplier_id     text,                                   -- işi yapan tedarikçi (kendi aracıyla: = selling_party_id)
  service_type    product NOT NULL,
  final_booking_price bigint CHECK (final_booking_price > 0),
  currency        currency,
  collection_method collection_method,
  collector       text NOT NULL DEFAULT 'supplier' CHECK (collector IN ('supplier', 'site')),
  collection_status collection_status NOT NULL DEFAULT 'pending',
  collected_amount bigint NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  refunded_amount bigint NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= collected_amount),
  collected_at    timestamptz,
  completed_at    timestamptz,
  policy_id       text REFERENCES split_policy(id),
  site_commission_amount bigint,
  agos_fee_amount bigint,
  supplier_entitlement bigint,
  supplier_payment_to_site bigint,
  supplier_payment_to_agos bigint,
  site_payment_to_supplier bigint,                        -- private/VIP'de müşteri siteye ödediyse
  settlement_week_id text REFERENCES settlement_week(week_id),
  settlement_status settlement_status NOT NULL DEFAULT 'open',
  payment_reference text,
  invoice_reference text,
  adjustment_reference text,
  -- ---- Rezervasyon ----
  ref             text NOT NULL UNIQUE CHECK (ref ~ '^AG-[2-9A-HJKMNP-Z]{6}$'),
  status          booking_status NOT NULL DEFAULT 'request',
  route_code      text,
  pickup_text     text NOT NULL,
  dropoff_text    text NOT NULL,
  pickup_at       timestamp NOT NULL,
  return_pickup_at timestamp,
  passengers      int NOT NULL CHECK (passengers BETWEEN 1 AND 16),
  flight_no       text,
  notes           text,
  customer_name   text NOT NULL,
  customer_email  text NOT NULL,
  customer_phone  text NOT NULL,
  customer_locale text NOT NULL,
  price_mode      text CHECK (price_mode IN ('FIXED_SHUTTLE', 'SHUTTLE_MANUAL_APPROVED', 'SITE_PRICE')),
  price_source_version text,
  price_frozen_at timestamptz,
  allowed_collection_methods collection_method[] NOT NULL CHECK (cardinality(allowed_collection_methods) >= 1),
  cancelled_at    timestamptz,
  disputed_at     timestamptz,
  dispute_reason  text CHECK (dispute_reason IS NULL OR dispute_reason !~ '[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+'),
  dispute_resolved_at timestamptz,
  dispute_outcome text CHECK (dispute_outcome IN ('upheld', 'rejected')),
  lookup_token_hash text NOT NULL,
  fingerprint     text NOT NULL,
  is_duplicate    boolean NOT NULL DEFAULT false,
  is_test         boolean NOT NULL DEFAULT false,
  shuttle_run_id  uuid REFERENCES shuttle_run(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1,
  CHECK ((service_type = 'shuttle') = (route_code IS NOT NULL)),
  CHECK ((final_booking_price IS NULL) = (currency IS NULL)),
  -- 5+ kişi: fiyat onayı bekleyen shuttle onaylanamaz / teslim edilemez / tahsil edilemez.
  CHECK (service_type <> 'shuttle' OR status IN ('request', 'cancelled') OR final_booking_price IS NOT NULL),
  -- T1: fazla tahsilat kaydedilebilir (müşteriye iade edilir); komisyon satış fiyatına kadar hesaplanır.
  -- Kural 2: shuttle'da tahsilatı tedarikçi yapar.
  CHECK (service_type <> 'shuttle' OR collector = 'supplier'),
  -- Paylar ya hepsi var ya hiçbiri (NULL ile CHECK atlatılamaz).
  CHECK ((supplier_entitlement IS NULL) = (site_commission_amount IS NULL) AND (supplier_entitlement IS NULL) = (agos_fee_amount IS NULL)),
  CHECK ((collection_method IS NULL) = (collected_at IS NULL)),
  -- Paylar tutarlı: tedarikçi hak edişi + site komisyonu + AGOS = satış.
  CHECK (supplier_entitlement IS NULL OR supplier_entitlement + site_commission_amount + agos_fee_amount = final_booking_price),
  -- Private/VIP: AGOS ek işlem komisyonu yok.
  CHECK (service_type = 'shuttle' OR coalesce(agos_fee_amount, 0) = 0),
  -- Kendi aracıyla: kendine komisyon yok.
  CHECK (supplier_id IS DISTINCT FROM selling_party_id OR coalesce(site_commission_amount, 0) = 0)
);
CREATE INDEX booking_fingerprint ON booking(fingerprint) WHERE status <> 'cancelled';
CREATE INDEX booking_site_created ON booking(selling_site_id, created_at DESC);
CREATE INDEX booking_week ON booking(settlement_week_id);

-- Kural 1, 8, 9 ve kendi aracı kuralı veritabanında da:
--  * shuttle payları split_policy tablosundaki TEK kaynaktan hesaplananla aynı olmalı (20/10/70; kendi aracı 0/10/90)
--  * site kendi aracıyla ancak yetkisi doğrulanmışsa tedarikçi olabilir
--  * tahsilat bir kez yazılır; hesaplandığı hafta bir kez yazılır; hesaplanmış işin tutar ve kimlikleri donar
CREATE FUNCTION booking_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p split_policy%ROWTYPE;
  exp_site bigint;
  exp_agos bigint;
  exp_supplier bigint;
  verified timestamptz;
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NEW.supplier_id = NEW.selling_party_id THEN
    SELECT self_operation_verified_at INTO verified FROM site WHERE id = NEW.selling_site_id;
    IF verified IS NULL THEN
      RAISE EXCEPTION 'site % is not verified for self-operation', NEW.selling_site_id;
    END IF;
  END IF;
  IF NEW.service_type = 'shuttle' AND NEW.supplier_entitlement IS NOT NULL THEN
    SELECT * INTO p FROM split_policy WHERE id = NEW.policy_id AND status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'shuttle booking % needs an approved split policy', NEW.id;
    END IF;
    exp_supplier := NEW.final_booking_price * p.carrier_bps / 10000;
    exp_site := NEW.final_booking_price * p.partner_bps / 10000;
    exp_agos := NEW.final_booking_price - exp_supplier - exp_site;
    IF NEW.supplier_id = NEW.selling_party_id THEN
      exp_supplier := exp_supplier + exp_site;
      exp_site := 0;
    END IF;
    IF NEW.site_commission_amount <> exp_site OR NEW.agos_fee_amount <> exp_agos OR NEW.supplier_entitlement <> exp_supplier THEN
      RAISE EXCEPTION 'shuttle split of booking % does not match policy % (expected %/%/%)', NEW.id, p.id, exp_site, exp_agos, exp_supplier;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Tahsilatçı ve ilk tahsilat yöntemi değişmez (kısmi tahsilatlar booking_money_event'te ayrı kayıt).
    IF OLD.collection_method IS NOT NULL AND (NEW.collection_method IS DISTINCT FROM OLD.collection_method
         OR NEW.collector IS DISTINCT FROM OLD.collector OR NEW.collected_at IS DISTINCT FROM OLD.collected_at) THEN
      RAISE EXCEPTION 'collector and first collection of booking % are fixed', OLD.id;
    END IF;
    IF NEW.refunded_amount < OLD.refunded_amount THEN
      RAISE EXCEPTION 'refunds of booking % cannot be reduced', OLD.id;
    END IF;
    -- Son hesap haftası yalnız ileri gider (yeni tahsilat/iade farkı sonraki haftaya yazılır; eski hafta değişmez).
    IF OLD.settlement_week_id IS NOT NULL AND (NEW.settlement_week_id IS NULL OR NEW.settlement_week_id < OLD.settlement_week_id) THEN
      RAISE EXCEPTION 'settlement week of booking % can only move forward', OLD.id;
    END IF;
    IF OLD.settlement_week_id IS NOT NULL AND (
         NEW.final_booking_price IS DISTINCT FROM OLD.final_booking_price
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.site_commission_amount IS DISTINCT FROM OLD.site_commission_amount
      OR NEW.agos_fee_amount IS DISTINCT FROM OLD.agos_fee_amount
      OR NEW.supplier_entitlement IS DISTINCT FROM OLD.supplier_entitlement
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.selling_site_id IS DISTINCT FROM OLD.selling_site_id
      OR NEW.selling_party_id IS DISTINCT FROM OLD.selling_party_id
      OR NEW.service_type IS DISTINCT FROM OLD.service_type
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.policy_id IS DISTINCT FROM OLD.policy_id) THEN
      RAISE EXCEPTION 'settled booking % is frozen (use an adjustment)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_settlement_guard BEFORE INSERT OR UPDATE ON booking FOR EACH ROW EXECUTE FUNCTION booking_settlement_guard();
CREATE FUNCTION no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME;
END $$;
CREATE TRIGGER booking_no_delete BEFORE DELETE ON booking FOR EACH ROW EXECUTE FUNCTION no_delete();
CREATE TRIGGER booking_no_truncate BEFORE TRUNCATE ON booking FOR EACH STATEMENT EXECUTE FUNCTION no_delete();

CREATE TABLE idempotency_key (
  scope           text PRIMARY KEY,           -- intake:<site>:<key>
  request_hash    text NOT NULL,
  response_status int NOT NULL,
  response_body   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_event (
  id              uuid PRIMARY KEY,
  dedupe_key      text NOT NULL UNIQUE,
  type            text NOT NULL,
  booking_id      uuid NOT NULL REFERENCES booking(id),
  payload         jsonb NOT NULL,             -- kişisel veri YOK
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'retry', 'permanent_failure', 'skipped')),
  attempts        int NOT NULL DEFAULT 0 CHECK (attempts <= 8),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due ON outbox_event(next_attempt_at) WHERE status IN ('pending', 'retry');

CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END $$;

-- Kural 6: banka dekontları (tedarikçi → site / AGOS). Yalnız eklenir; aynı dekont iki kez girilemez.
CREATE TABLE bank_receipt (
  id              uuid PRIMARY KEY,
  week_id         text NOT NULL CHECK (week_id ~ '^[0-9]{4}-W[0-9]{2}$'),
  payer_id        text NOT NULL,
  payee_id        text NOT NULL,
  amount          bigint NOT NULL CHECK (amount > 0),
  currency        currency NOT NULL,
  bank_reference  text NOT NULL,
  paid_at         timestamptz NOT NULL,
  -- Kural 10: abonelik ödemesi komisyon borcuyla eşleştirilmez.
  -- overpayment_refund (T1): alacaklının fazla ödemeyi ödeyene iadesi.
  purpose         text NOT NULL DEFAULT 'settlement' CHECK (purpose IN ('settlement', 'subscription', 'overpayment_refund')),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payer_id, bank_reference)
);
CREATE TRIGGER bank_receipt_append_only BEFORE UPDATE OR DELETE ON bank_receipt FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER bank_receipt_no_truncate BEFORE TRUNCATE ON bank_receipt FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- T1/T2: müşteri para hareketleri — kısmi tahsilat, kalan tahsilat ve müşteriye iade AYRI kayıtlar; her biri kanıt
-- referansı (dekont / POS slip / makbuz) taşır ve rezervasyon içinde tekildir (aynı kayıt iki kez yazılmaz).
CREATE TABLE booking_money_event (
  id              uuid PRIMARY KEY,
  booking_id      uuid NOT NULL REFERENCES booking(id),
  kind            text NOT NULL CHECK (kind IN ('collection', 'refund')),
  amount          bigint NOT NULL CHECK (amount > 0),
  method          collection_method NOT NULL,
  collector       text NOT NULL CHECK (collector IN ('supplier', 'site')),
  reference       text NOT NULL CHECK (reference ~ '^[A-Za-z0-9./_-]{3,64}$'),
  at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reference)
);
CREATE TRIGGER booking_money_event_append_only BEFORE UPDATE OR DELETE ON booking_money_event FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER booking_money_event_no_truncate BEFORE TRUNCATE ON booking_money_event FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- Haftalık fark kayıtları: pay(hafta sonuna kadarki net tahsilat) − pay(önceki kapanışlar). Bir rezervasyon için
-- bir haftada en fazla bir kayıt; kayıtlar silinmez; üç payın farkı tahsilat farkına eşittir.
CREATE TABLE settlement_entry (
  id              uuid PRIMARY KEY,
  week_id         text NOT NULL REFERENCES settlement_week(week_id),
  booking_id      uuid NOT NULL REFERENCES booking(id),
  kind            text NOT NULL CHECK (kind IN ('collection', 'refund_correction')),
  base_before     bigint NOT NULL CHECK (base_before >= 0),
  base_after      bigint NOT NULL CHECK (base_after >= 0),
  collected_delta bigint NOT NULL CHECK (collected_delta <> 0 AND collected_delta = base_after - base_before),
  site_delta      bigint NOT NULL,
  agos_delta      bigint NOT NULL,
  supplier_delta  bigint NOT NULL,
  currency        currency NOT NULL,
  policy_id       text NOT NULL,
  UNIQUE (booking_id, week_id),
  CHECK (site_delta + agos_delta + supplier_delta = collected_delta),
  CHECK ((kind = 'collection') = (collected_delta > 0))
);
CREATE TRIGGER settlement_entry_append_only BEFORE UPDATE OR DELETE ON settlement_entry FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER settlement_entry_no_truncate BEFORE TRUNCATE ON settlement_entry FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- K17 (taslak): manuel fiyat onayının denetim kaydı — kim, rol, zaman, eski/yeni fiyat, gerekçe; yalnız 2FA'lı oturum.
CREATE TABLE manual_price_approval (
  booking_id      uuid PRIMARY KEY REFERENCES booking(id),
  actor_id        text NOT NULL,
  actor_role      text NOT NULL CHECK (actor_role IN ('admin', 'finance_manager')),
  mfa_verified    boolean NOT NULL CHECK (mfa_verified),
  at              timestamptz NOT NULL DEFAULT now(),
  old_price_minor bigint,
  new_price_minor bigint NOT NULL CHECK (new_price_minor > 0),
  reason          text NOT NULL CHECK (length(trim(reason)) >= 5)
);
CREATE TRIGGER manual_price_approval_append_only BEFORE UPDATE OR DELETE ON manual_price_approval FOR EACH ROW EXECUTE FUNCTION append_only();

-- T3 (taslak): ekstre iletimi ve kapanmış haftaya itiraz. Süre: iletimden itibaren 7 gün; süre dışı itiraz
-- otomatik reddedilmez (karar yetkili yöneticinin, gerekçeli).
CREATE TABLE statement_delivery (
  week_id         text NOT NULL REFERENCES settlement_week(week_id),
  party_id        text NOT NULL,
  sent_at         timestamptz NOT NULL,
  PRIMARY KEY (week_id, party_id)
);
CREATE TRIGGER statement_delivery_append_only BEFORE UPDATE OR DELETE ON statement_delivery FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TABLE statement_dispute (
  id              text PRIMARY KEY CHECK (id ~ '^ITZ-[0-9]{4}-W[0-9]{2}-[0-9]{4}$'),
  week_id         text NOT NULL REFERENCES settlement_week(week_id),
  raised_by       text NOT NULL,
  reason          text NOT NULL CHECK (length(trim(reason)) >= 5),
  category        text NOT NULL CHECK (category IN ('calculation_error', 'legal_right', 'fraud_suspicion', 'other')),
  raised_at       timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  decided_by      text,
  decided_role    text CHECK (decided_role IN ('admin', 'finance_manager')),
  decided_mfa     boolean CHECK (decided_mfa),
  decision_reason text,
  decided_at      timestamptz,
  CHECK ((status = 'open') = (decided_at IS NULL)),
  -- NULL bir CHECK'i geçirir; bu yüzden her alan açıkça NOT NULL / coalesce ile denetlenir.
  CHECK (status = 'open' OR (decided_by IS NOT NULL AND decided_role IS NOT NULL AND coalesce(decided_mfa, false)
         AND decision_reason IS NOT NULL AND length(trim(decision_reason)) >= 5))
);
CREATE FUNCTION statement_dispute_decide_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'dispute % already decided', OLD.id; END IF;
  IF NEW.id <> OLD.id OR NEW.week_id <> OLD.week_id OR NEW.raised_by <> OLD.raised_by OR NEW.reason <> OLD.reason OR NEW.raised_at <> OLD.raised_at THEN
    RAISE EXCEPTION 'dispute % record fields are fixed', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER statement_dispute_decide_once BEFORE UPDATE ON statement_dispute FOR EACH ROW EXECUTE FUNCTION statement_dispute_decide_once();
CREATE TRIGGER statement_dispute_no_delete BEFORE DELETE ON statement_dispute FOR EACH ROW EXECUTE FUNCTION append_only();

-- Kural 8: düzeltme hareketleri — eski hafta silinmez/değişmez, düzeltme yeni haftaya yazılır.
CREATE TABLE settlement_adjustment (
  id              uuid PRIMARY KEY,
  week_id         text NOT NULL CHECK (week_id ~ '^[0-9]{4}-W[0-9]{2}$'),
  original_week_id text NOT NULL REFERENCES settlement_week(week_id),
  debtor_id       text NOT NULL,
  creditor_id     text NOT NULL,
  amount          bigint NOT NULL CHECK (amount <> 0),
  currency        currency NOT NULL,
  -- İade sonrası yeniden hesap settlement_entry ile otomatiktir; burada yalnız elle düzeltmeler:
  kind            text NOT NULL CHECK (kind IN ('dispute_decision', 'offset')),
  reason          text NOT NULL,
  adjustment_reference text NOT NULL UNIQUE,
  -- T1: mahsup yalnız ilgili tarafların yazılı onayıyla.
  written_approval_reference text,
  booking_id      uuid REFERENCES booking(id),
  dispute_id      text REFERENCES statement_dispute(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (week_id > original_week_id),
  CHECK (kind <> 'offset' OR written_approval_reference IS NOT NULL),
  CHECK ((kind = 'dispute_decision') = (dispute_id IS NOT NULL))
);
CREATE TRIGGER settlement_adjustment_append_only BEFORE UPDATE OR DELETE ON settlement_adjustment
  FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER settlement_week_append_only BEFORE UPDATE OR DELETE ON settlement_week
  FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER settlement_adjustment_no_truncate BEFORE TRUNCATE ON settlement_adjustment FOR EACH STATEMENT EXECUTE FUNCTION append_only();
CREATE TRIGGER settlement_week_no_truncate BEFORE TRUNCATE ON settlement_week FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- RLS: site sahibi yalnız kendi satışlarını, tedarikçi yalnız kendi işlerini görür. Uygulama her işlemde
--   SET LOCAL app.party_id = '<oturumdaki taraf>';
-- çalıştırır; değer istemciden değil, doğrulanmış oturumdan gelir. Başka tarafın kaydı 404 döner.
ALTER TABLE booking ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_party_read ON booking FOR SELECT
  USING (selling_party_id = current_setting('app.party_id', true) OR supplier_id = current_setting('app.party_id', true));

COMMIT;
