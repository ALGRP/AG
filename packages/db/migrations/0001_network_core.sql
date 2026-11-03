-- AG Network — merkez şema ADAYI (LOCAL_ONLY · CANDIDATE)
-- Bu dosya canlıya/staging'e UYGULANMAZ. Kanonik rezervasyon veritabanı mevcut CRS PostgreSQL'idir
-- (Linear D-CRS-20261102-01: agos-reservation-postgres). Buradaki tablolar, CRS şeması okunduktan
-- sonra (SEL-329 G1, SEL-331 eşleme) CRS karşılıklarına eşlenecek bir sözleşmedir; yeni bir rezervasyon
-- deposu açmak için değildir.
--
-- Değişmezler:
--   * Para numeric değil, bigint minor unit (cent) + ayrı para birimi kolonu; birimler karışmaz.
--   * Her kiracı tablosunda partner_id / site_id; PostgreSQL RLS + uygulama katmanı filtresi birlikte.
--   * Defter (ledger_entry) satırları değişmez ve silinmez; düzeltme ters kayıtla yapılır.
--   * Bildirim yalnız outbox'tan doğar; dedupe_key tekil.

BEGIN;

CREATE TYPE site_ownership AS ENUM ('ag_brand', 'partner');
CREATE TYPE site_status AS ENUM ('preview', 'live', 'suspended');
CREATE TYPE product AS ENUM ('private', 'vip', 'shuttle');
CREATE TYPE booking_status AS ENUM ('request', 'quoted', 'confirmed', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partially_paid', 'paid', 'refunded');
CREATE TYPE payment_method AS ENUM ('card_online', 'cash_in_vehicle');
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
  -- K12 (öneri): network_pass = site satar, iş pass bedeliyle AG tedarikçi ağına aktarılır (AG ek komisyon 0 €);
  --              self_operated = site sahibi kendi aracıyla yapar; yalnız doğrulanmış yetkiyle açılır.
  private_mode    text NOT NULL DEFAULT 'network_pass' CHECK (private_mode IN ('network_pass', 'self_operated')),
  self_operation_verified_at timestamptz,
  -- K15: bu sitedeki rezervasyonlarda izin verilen ödeme yöntemleri.
  payment_methods payment_method[] NOT NULL DEFAULT ARRAY['card_online']::payment_method[] CHECK (cardinality(payment_methods) >= 1),
  -- Site sahibinin kendi satış fiyatları (cent); yoksa talep fiyatsız gelir.
  sale_private_minor bigint CHECK (sale_private_minor > 0),
  sale_vip_minor  bigint CHECK (sale_vip_minor > 0),
  sale_currency   currency,
  gsc_property    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((ownership = 'partner') = (partner_id IS NOT NULL)),
  CHECK (private_mode <> 'self_operated' OR self_operation_verified_at IS NOT NULL)
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

-- Abonelik: Partner Sunumu V3 — 200 €/ay SaaS aboneliği uydu site sahibinden Alanya Group'a.
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

CREATE TABLE split_policy (
  id              text PRIMARY KEY,
  -- Yalnız 'approved' politika otomatik pay yazar.
  status          text NOT NULL CHECK (status IN ('proposed', 'approved')),
  carrier_bps     int NOT NULL,
  partner_bps     int NOT NULL,
  platform_bps    int NOT NULL,
  CHECK (carrier_bps >= 0 AND partner_bps >= 0 AND platform_bps >= 0),
  CHECK (carrier_bps + partner_bps + platform_bps = 10000)
);
-- OWNER KARARI 03.11.2026: satış tutarının %70'i tedarikçi, %20'si uydu site, %10'u Alanya Group.
INSERT INTO split_policy VALUES ('shuttle-split-v1', 'approved', 7000, 2000, 1000);
-- K4 (öneri, Owner onayı bekliyor): AG'nin kendi sitesinden gelen shuttle → %90 tedarikçi, %10 Alanya Group.
INSERT INTO split_policy VALUES ('shuttle-direct-v1', 'proposed', 9000, 0, 1000);

-- K12 Model B: pass bedeli tedarikçinindir, AG ek komisyon 0 €. Tutarlar örnek, sabit tarife değil.
CREATE TABLE pass_policy (
  id              text PRIMARY KEY,
  currency        currency NOT NULL,
  pass_private_minor bigint NOT NULL CHECK (pass_private_minor > 0),
  pass_vip_minor  bigint NOT NULL CHECK (pass_vip_minor > 0)
);
INSERT INTO pass_policy VALUES ('pass-deck-v3-example', 'EUR', 4750, 6000);

CREATE TABLE shuttle_run (
  id              uuid PRIMARY KEY,
  route_code      text NOT NULL,
  slot_start      timestamp NOT NULL,          -- yerel saat (Europe/Istanbul)
  capacity        int NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  seats_taken     int NOT NULL DEFAULT 0 CHECK (seats_taken >= 0),
  status          text NOT NULL CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')),
  carrier_payee_id text,
  version         int NOT NULL DEFAULT 1,
  CHECK (seats_taken <= capacity)              -- aşırı doluluk veritabanında da imkânsız
);
CREATE INDEX shuttle_run_slot ON shuttle_run(route_code, slot_start) WHERE status IN ('open', 'assigned');

CREATE TABLE booking (
  id              uuid PRIMARY KEY,
  ref             text NOT NULL UNIQUE CHECK (ref ~ '^AG-[2-9A-HJKMNP-Z]{6}$'),
  site_id         text NOT NULL REFERENCES site(id),
  source_partner_id text REFERENCES partner(id),
  product         product NOT NULL,
  status          booking_status NOT NULL DEFAULT 'request',
  payment_status  payment_status NOT NULL DEFAULT 'unpaid',
  allowed_payment_methods payment_method[] NOT NULL CHECK (cardinality(allowed_payment_methods) >= 1),
  preferred_payment_method payment_method,
  carrier_payee_id text,
  ops_owner_kind  text NOT NULL CHECK (ops_owner_kind IN ('central', 'partner')),
  ops_owner_partner_id text REFERENCES partner(id),
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
  price_mode      text CHECK (price_mode IN ('FIXED_SHUTTLE', 'SHUTTLE_MANUAL_APPROVED', 'PARTNER_PRICE_WITH_PASS', 'PARTNER_QUOTE')),
  price_minor     bigint,
  pass_minor      bigint CHECK (pass_minor > 0),
  price_currency  currency,
  price_source_version text,
  price_frozen_at timestamptz,
  lookup_token_hash text NOT NULL,
  fingerprint     text NOT NULL,
  is_duplicate    boolean NOT NULL DEFAULT false,
  is_test         boolean NOT NULL DEFAULT false,
  shuttle_run_id  uuid REFERENCES shuttle_run(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1,
  CHECK ((product = 'shuttle') = (route_code IS NOT NULL)),
  CHECK ((price_minor IS NULL) = (price_currency IS NULL)),
  -- Fiyat onayı bekleyen (5+ kişi) shuttle onaylanamaz / teslim edilemez.
  CHECK (product <> 'shuttle' OR status IN ('request', 'cancelled') OR price_minor IS NOT NULL),
  CHECK ((price_mode = 'PARTNER_PRICE_WITH_PASS') = (pass_minor IS NOT NULL)),
  CHECK (pass_minor IS NULL OR pass_minor <= price_minor),
  CHECK ((ops_owner_kind = 'partner') = (ops_owner_partner_id IS NOT NULL))
);
CREATE INDEX booking_fingerprint ON booking(fingerprint) WHERE status <> 'cancelled';
CREATE INDEX booking_site_created ON booking(site_id, created_at DESC);

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

-- K15: tahsilat ve iade kayıtları (yalnız eklenir). Online kart yalnız merkezden, araçta nakit yalnız tedarikçiden.
CREATE TABLE payment_event (
  id              uuid PRIMARY KEY,
  booking_id      uuid NOT NULL REFERENCES booking(id),
  kind            text NOT NULL CHECK (kind IN ('collection', 'refund')),
  method          payment_method NOT NULL,
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  currency        currency NOT NULL,
  party_kind      text NOT NULL CHECK (party_kind IN ('carrier', 'partner', 'platform')),
  party_id        text NOT NULL,
  at              timestamptz NOT NULL DEFAULT now(),
  CHECK (method <> 'card_online' OR party_kind = 'platform'),
  CHECK (method <> 'cash_in_vehicle' OR party_kind = 'carrier')
);

CREATE TABLE ledger_entry (
  id              uuid PRIMARY KEY,
  booking_id      uuid NOT NULL REFERENCES booking(id),
  party_kind      text NOT NULL CHECK (party_kind IN ('carrier', 'partner', 'platform')),
  party_id        text NOT NULL,
  amount_minor    bigint NOT NULL,
  currency        currency NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('shuttle_share', 'pass_share', 'reversal')),
  policy_id       text NOT NULL,              -- split_policy.id veya pass_policy.id
  reverses_entry_id uuid UNIQUE REFERENCES ledger_entry(id),  -- bir satır en fazla bir kez ters çevrilir
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'reversal') = (reverses_entry_id IS NOT NULL))
);
CREATE UNIQUE INDEX ledger_one_share_per_party ON ledger_entry(booking_id, party_kind) WHERE kind <> 'reversal';

CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END $$;
CREATE TRIGGER ledger_entry_no_update BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER payment_event_no_update BEFORE UPDATE OR DELETE ON payment_event
  FOR EACH ROW EXECUTE FUNCTION append_only();

-- K15: haftalık kapanış (Pazartesi–Pazar, Europe/Istanbul). Yalnız ekstre; ödeme gönderimi kapalı.
CREATE TABLE settlement_closing (
  week_start      date PRIMARY KEY CHECK (extract(isodow FROM week_start) = 1),
  period_end      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  payout_execution text NOT NULL DEFAULT 'disabled_pending_legal_review'
    CHECK (payout_execution = 'disabled_pending_legal_review')
);
CREATE TABLE settlement_statement (
  week_start      date NOT NULL REFERENCES settlement_closing(week_start),
  party_kind      text NOT NULL,
  party_id        text NOT NULL,
  currency        currency NOT NULL,
  earned_minor    bigint NOT NULL,
  held_minor      bigint NOT NULL,
  net_minor       bigint NOT NULL CHECK (net_minor = earned_minor - held_minor),
  PRIMARY KEY (week_start, party_kind, party_id, currency)
);
-- Mükerrer koruması: her defter satırı ve her tahsilat EN FAZLA BİR kapanışa girer.
CREATE TABLE settlement_item (
  week_start      date NOT NULL REFERENCES settlement_closing(week_start),
  ledger_entry_id uuid UNIQUE REFERENCES ledger_entry(id),
  payment_event_id uuid UNIQUE REFERENCES payment_event(id),
  CHECK ((ledger_entry_id IS NULL) <> (payment_event_id IS NULL))
);
CREATE TRIGGER settlement_item_no_update BEFORE UPDATE OR DELETE ON settlement_item
  FOR EACH ROW EXECUTE FUNCTION append_only();

-- RLS: üye yalnız kendi sitesinin kayıtlarını görür. Uygulama her işlemde
--   SET LOCAL app.partner_id = '<oturumdaki partner>';
-- çalıştırır; değer istemciden değil, doğrulanmış oturumdan gelir. Başka kiracının kaydı 404 döner.
ALTER TABLE booking ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_partner_read ON booking FOR SELECT
  USING (source_partner_id = current_setting('app.partner_id', true));
ALTER TABLE ledger_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_partner_read ON ledger_entry FOR SELECT
  USING (party_kind = 'partner' AND party_id = current_setting('app.partner_id', true));

COMMIT;
