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
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded');
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
  -- Özel/VIP: pass_to_network = site satar, iş pass bedeliyle AG ağına aktarılır (Partner Sunumu V3);
  --           self_operate    = site sahibi operasyonu kendisi yapar.
  private_mode    text NOT NULL DEFAULT 'pass_to_network' CHECK (private_mode IN ('pass_to_network', 'self_operate')),
  -- Site sahibinin kendi satış fiyatları (cent); yoksa talep fiyatsız gelir.
  sale_private_minor bigint CHECK (sale_private_minor > 0),
  sale_vip_minor  bigint CHECK (sale_vip_minor > 0),
  sale_currency   currency,
  gsc_property    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((ownership = 'partner') = (partner_id IS NOT NULL))
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
  currency        currency NOT NULL,
  routes          text[] NOT NULL,
  valid_from      date NOT NULL,
  valid_to        date,
  max_passengers  int NOT NULL CHECK (max_passengers BETWEEN 1 AND 20),
  totals_minor    bigint[] NOT NULL,
  extra_per_passenger_minor bigint NOT NULL,
  approved_by     text NOT NULL,
  approved_at     timestamptz NOT NULL
);

CREATE TABLE split_policy (
  id              text PRIMARY KEY,
  carrier_bps     int NOT NULL,
  partner_bps     int NOT NULL,
  platform_bps    int NOT NULL,
  CHECK (carrier_bps >= 0 AND partner_bps >= 0 AND platform_bps >= 0),
  CHECK (carrier_bps + partner_bps + platform_bps = 10000)
);
INSERT INTO split_policy VALUES ('shuttle-split-v1', 7000, 2000, 1000);

-- Özel/VIP pass bedeli (sunum örnek varsayımı: private 47,50 €, VIP 60 €).
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
  collection_mode text CHECK (collection_mode IN ('card', 'cash_in_vehicle')),
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
  price_mode      text CHECK (price_mode IN ('FIXED_SHUTTLE', 'PARTNER_PRICE_WITH_PASS', 'PARTNER_QUOTE')),
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

CREATE FUNCTION ledger_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entry is append-only (% blocked)', TG_OP;
END $$;
CREATE TRIGGER ledger_entry_no_update BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();

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
