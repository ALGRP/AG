-- QA-F3 local-only migration candidate. Apply ONLY to a fresh disposable PostgreSQL 16 database.
-- Do not apply to live CRS (SEL-329/331 staging mapping and SEL-332 verified IdP are missing).
-- A custom app.party_id GUC is NOT authentication; the trusted gateway must set it after verified authorization.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ag_owner') THEN CREATE ROLE ag_owner NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ag_app') THEN CREATE ROLE ag_app LOGIN NOBYPASSRLS PASSWORD NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ag_platform') THEN CREATE ROLE ag_platform NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ag_readonly') THEN CREATE ROLE ag_readonly NOLOGIN NOBYPASSRLS; END IF;
END
$roles$;

-- No membership from the site application role into the platform role; SET ROLE cannot elevate ag_app.
-- Separate platform credentials and 2FA must be implemented by SEL-332. This migration creates no secrets.
GRANT USAGE ON SCHEMA public TO ag_app, ag_platform, ag_readonly;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Keep the owner role separate from every data-serving principal.
DO $owners$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'booking','booking_money_event','settlement_entry','manual_price_approval',
    'bank_receipt','settlement_adjustment','statement_dispute','statement_delivery',
    'shuttle_run','outbox_event','idempotency_key','settlement_week'
  ] LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO ag_owner', tab);
  END LOOP;
END
$owners$;

-- Read-only default; site callers cannot mutate financial ledger tables.
GRANT SELECT ON booking, booking_money_event, settlement_entry, manual_price_approval,
  bank_receipt, settlement_adjustment, statement_delivery, statement_dispute, shuttle_run
  TO ag_app, ag_readonly;
-- Partner/site metadata itself is not exposed to the generic app/reporting role.
-- Site authorization is resolved by the verified gateway, not by granting arbitrary site registry reads.
GRANT SELECT, INSERT, UPDATE ON booking, booking_money_event, settlement_entry, manual_price_approval,
  bank_receipt, settlement_adjustment, statement_delivery, statement_dispute, shuttle_run,
  outbox_event, idempotency_key, settlement_week TO ag_platform;
-- Site INSERT/UPDATE grants are deliberately absent until a verified, column-constrained CRS adapter exists.
-- All DELETE/TRUNCATE remain unavailable to ag_app/ag_platform/ag_readonly.

-- Legacy supplier-inclusive policy is replaced. Exposing the full booking table to suppliers would expose PII.
DROP POLICY IF EXISTS booking_party_read ON booking;

DO $rls$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'booking','booking_money_event','settlement_entry','manual_price_approval',
    'bank_receipt','settlement_adjustment','statement_dispute','statement_delivery',
    'shuttle_run','outbox_event','idempotency_key','settlement_week'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tab);
    -- Even an accidental app.scope=platform does not permit elevation by ag_app.
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO ag_platform USING (current_user = %L AND current_setting(%L, true) = %L) WITH CHECK (current_user = %L AND current_setting(%L, true) = %L)',
      tab || '_platform_only', tab, 'ag_platform', 'app.scope', 'platform',
      'ag_platform', 'app.scope', 'platform'
    );
  END LOOP;
END
$rls$;

-- Site/read-only identity is derived by the server from a verified principal; missing scope matches nothing.
CREATE POLICY booking_site_read ON booking FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND selling_party_id = current_setting('app.party_id', true)
);
CREATE POLICY booking_money_site_read ON booking_money_event FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id)
);
CREATE POLICY settlement_entry_site_read ON settlement_entry FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id)
);
CREATE POLICY manual_approval_site_read ON manual_price_approval FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id)
);
CREATE POLICY receipt_party_read ON bank_receipt FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND current_setting('app.party_id', true) IN (payer_id, payee_id)
);
CREATE POLICY adjustment_party_read ON settlement_adjustment FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND current_setting('app.party_id', true) IN (debtor_id, creditor_id)
);
CREATE POLICY statement_dispute_party_read ON statement_dispute FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND raised_by = current_setting('app.party_id', true)
);
CREATE POLICY statement_delivery_party_read ON statement_delivery FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND party_id = current_setting('app.party_id', true)
);
CREATE POLICY shuttle_run_party_read ON shuttle_run FOR SELECT TO ag_app, ag_readonly USING (
  current_setting('app.scope', true) = 'site'
  AND EXISTS (SELECT 1 FROM booking b WHERE b.shuttle_run_id = shuttle_run.id)
);
-- No site policy for outbox_event, idempotency_key, settlement_week.

COMMIT;
