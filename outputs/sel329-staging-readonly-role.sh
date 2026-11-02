#!/usr/bin/env bash
# SEL-329 G1 madde 4 — staging PostgreSQL'de least-privilege salt-okunur rol: agos_readonly.
#   ssh agos-prod-01 'bash -s' < outputs/sel329-staging-readonly-role.sh             # PLAN
#   ssh agos-prod-01 'bash -s -- --apply' < outputs/sel329-staging-readonly-role.sh  # oluştur + doğrula
#   ssh agos-prod-01 'bash -s -- --undo' < outputs/sel329-staging-readonly-role.sh   # tamamen kaldır
# Rol: NOLOGIN (parola yok, doğrudan girilemez), NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS/NOINHERIT.
# Yetki: CONNECT (db) + USAGE (public şeması) + SELECT (public tabloları, gelecektekiler dahil). Başka hiçbir şey.
# Mevcut uygulama rolüne (superuser) ve verilere DOKUNULMAZ. Doğrulama yazma denemeleri WHERE false ile, hiçbir satır etkilenmez.
set -euo pipefail
LC_ALL=C
MODE=plan; case "${1:-}" in --apply) MODE=apply;; --undo) MODE=undo;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
C=agos-staging-postgres; R=agos_readonly
say(){ printf '%s\n' "$*"; }
docker inspect "$C" >/dev/null 2>&1 || { say "konteyner YOK"; exit 1; }
AU=$(docker exec "$C" sh -c 'printf %s "$POSTGRES_USER"'); AD=$(docker exec "$C" sh -c 'printf %s "${POSTGRES_DB:-postgres}"')
esc(){ printf '%s' "$1" | sed 's/[^A-Za-z0-9_]/\\&/g'; }
mask(){ sed -e "s/\b$(esc "$AU")\b/<APP_USER>/g" -e "s/\b$(esc "$AD")\b/<APP_DB>/g"; }
# yazma modunda psql (ON_ERROR_STOP); okuma kontrolleri READ ONLY
psqlw(){ docker exec -i "$C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"' 2>&1 | mask; }
q(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | mask; }

say "== mevcut =="
say "  $R rolü: $(q "select case when count(*)=0 then 'YOK' else 'VAR' end from pg_roles where rolname='$R'")"
say "  public tablo sayısı: $(q "select count(*) from pg_tables where schemaname='public'")"
say "  uygulama rolü: <APP_USER> su=$(q "select rolsuper from pg_roles where rolname=current_user")  (DOKUNULMAYACAK)"

if [ "$MODE" = undo ]; then
  psqlw <<SQL
DO \$\$ BEGIN IF EXISTS (select from pg_roles where rolname='$R') THEN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE "$AU" IN SCHEMA public REVOKE SELECT ON TABLES FROM $R';
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM $R';
  EXECUTE 'REVOKE USAGE ON SCHEMA public FROM $R';
  EXECUTE 'REVOKE CONNECT ON DATABASE "$AD" FROM $R';
  EXECUTE 'DROP OWNED BY $R';
  EXECUTE 'DROP ROLE $R';
END IF; END \$\$;
SQL
  say "UNDO tamam: $R rolü $(q "select case when count(*)=0 then 'SİLİNDİ' else 'HÂLÂ VAR' end from pg_roles where rolname='$R'")"; exit 0
fi

say "== uygulanacak SQL (yalnız staging, <APP_DB>) =="
cat <<SQL | sed 's/^/  /' | mask
CREATE ROLE $R NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;   -- yoksa
GRANT CONNECT ON DATABASE "$AD" TO $R;
GRANT USAGE ON SCHEMA public TO $R;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $R;
ALTER DEFAULT PRIVILEGES FOR ROLE "$AU" IN SCHEMA public GRANT SELECT ON TABLES TO $R;
SQL
if [ "$MODE" = plan ]; then say ""; say "PLAN tamam: hiçbir şey değişmedi. Uygulamak için --apply."; exit 0; fi

psqlw <<SQL
BEGIN;
DO \$\$ BEGIN IF NOT EXISTS (select from pg_roles where rolname='$R') THEN
  CREATE ROLE $R NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
END IF; END \$\$;
ALTER ROLE $R NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
GRANT CONNECT ON DATABASE "$AD" TO $R;
GRANT USAGE ON SCHEMA public TO $R;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO $R;
ALTER DEFAULT PRIVILEGES FOR ROLE "$AU" IN SCHEMA public GRANT SELECT ON TABLES TO $R;
COMMIT;
SQL
say "uygulandı."

say "== doğrulama =="
say "  rol özellikleri: $(q "select 'login='||rolcanlogin||' su='||rolsuper||' createdb='||rolcreatedb||' createrole='||rolcreaterole||' bypassrls='||rolbypassrls||' repl='||rolreplication from pg_roles where rolname='$R'")"
say "  tablo yetkileri: $(q "select string_agg(distinct privilege_type, ',') || ' (' || count(distinct table_name) || ' tablo)' from information_schema.role_table_grants where grantee='$R' and table_schema='public'")"
T=$(q "select tablename from pg_tables where schemaname='public' order by 1 limit 1")
COL=$(q "select column_name from information_schema.columns where table_schema='public' and table_name='$T' order by ordinal_position limit 1")
# Okuma: rol olarak sayım çalışmalı
RD=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e T="$T" "$C" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "SET ROLE agos_readonly" -c "select count(*) from public.\"$T\""' 2>&1 | tail -1)
case "$RD" in ''|*[!0-9]*) say "  okuma testi: FAIL ($RD)";; *) say "  okuma testi (SELECT count): PASS";; esac
# Yazma: rol olarak her biri izin hatası vermeli (WHERE false, ayrıca ROLLBACK; READ ONLY KULLANILMAZ ki gerçek yetki sınansın)
for op in "DELETE FROM public.\"$T\" WHERE false" "UPDATE public.\"$T\" SET \"$COL\"=\"$COL\" WHERE false" "TRUNCATE public.\"$T\"" "CREATE TABLE public.sel329_probe(x int)"; do
  O=$(printf 'BEGIN;\nSET ROLE agos_readonly;\n%s;\nROLLBACK;\n' "$op" | docker exec -i "$C" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"' 2>&1)
  if printf '%s' "$O" | grep -qiE 'permission denied|must be owner'; then
    printf '  yazma engeli [%s]: PASS\n' "${op%% *}"
  else
    printf '  yazma engeli [%s]: FAIL -> %s\n' "${op%% *}" "$(printf '%s' "$O" | tr '\n' ' ' | cut -c1-120 | mask)"
  fi
done
say "  sonda tablosu oluşmadı mı: $(q "select case when count(*)=0 then 'EVET (iyi)' else 'HAYIR' end from pg_tables where tablename='sel329_probe'")"
say ""
say "APPLY tamam. Rapor betiği bu rolü kullanacak şekilde güncellendi; ctrl/prod'a yeniden kurmak için: bash outputs/sel433-staging-report-access.sh --apply"
say "Geri alma: ssh agos-prod-01 'bash -s -- --undo' < outputs/sel329-staging-readonly-role.sh"
