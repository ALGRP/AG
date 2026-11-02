#!/usr/bin/env bash
# SEL-327 / G2 adım 0 — Rezervasyon veritabanları KAYNAK HARİTASI. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel327-booking-source-map.sh
# Amaç: hangi veritabanı hangi servis tarafından yazılıyor, şema/idempotency/outbox yapısı ne — G2 kararı için.
# Yalnız: tablo adları, KESİN sayımlar, kolon adları/tipleri, kısıtlar, indeksler, son kayıt zamanı,
#         kaynak/domain/kanal kolonlarında değer DAĞILIMI (yalnız alan adı/kanal türünde kısa değerler).
# Satır içeriği, müşteri adı/telefon/e-posta, parola, env DEĞERİ YAZDIRILMAZ. Kullanıcı/db adları maskelenir.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın (docker exec gerekli)"; exit 1; }
say "SEL327_SOURCE_MAP v1  zaman=$(date -u +%FT%TZ)  host=$(hostname)  LIVE_CHANGED=NO"

# Rezervasyon tablosu olan tüm postgres konteynerlerini bul (n8n'in kendi DB'si hariç tutulmaz; ayrıca işaretlenir)
CANDS=""
for c in $(docker ps --format '{{.Names}}'); do
  img=$(docker inspect -f '{{.Config.Image}}' "$c")
  case "$img" in *postgres*|sha256:*) ;; *) continue;; esac
  docker exec "$c" sh -c 'command -v psql >/dev/null' 2>/dev/null || continue
  has=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="select count(*) from pg_tables where schemaname='public' and tablename in ('reservations','bookings','booking_requests')" "$c" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>/dev/null)
  [ "${has:-0}" -gt 0 ] 2>/dev/null && CANDS="$CANDS $c"
done
sec "rezervasyon tablosu olan PostgreSQL konteynerleri"
for c in $CANDS; do say "  $c  image=$(docker inspect -f '{{.Config.Image}}' "$c")  compose=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$c")"; done
[ -n "$CANDS" ] || { say "  YOK"; exit 0; }

for C in $CANDS; do
  sec "VERİTABANI: $C"
  AU=$(docker exec "$C" sh -c 'printf %s "$POSTGRES_USER"'); AD=$(docker exec "$C" sh -c 'printf %s "${POSTGRES_DB:-postgres}"')
  esc(){ printf '%s' "$1" | sed 's/[^A-Za-z0-9_]/\\&/g'; }
  mask(){ sed -e "s/\b$(esc "$AU")\b/<APP_USER>/g" -e "s/\b$(esc "$AD")\b/<APP_DB>/g"; }
  q(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | mask; }

  say "--- bu veritabanına referans veren konteynerler (env ANAHTAR adı; değer yok):"
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$C")
  hp=$(docker port "$C" 5432/tcp 2>/dev/null | sed 's/.*://' | head -1)
  PAT="$C"; [ -n "$hp" ] && PAT="$PAT|:$hp([^0-9]|\$)"
  ref=0
  for o in $(docker ps --format '{{.Names}}'); do
    [ "$o" = "$C" ] && continue
    k=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$o" 2>/dev/null | grep -E "$PAT" | cut -d= -f1 | sort -u | tr '\n' ' ')
    [ -n "$k" ] && { say "    $o: $k"; ref=1; }
  done
  # compose içi servis adıyla bağlantı (ör. 'postgres') için: aynı compose projesindeki konteynerler
  proj=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$C")
  [ -n "$proj" ] && say "    aynı compose projesi ($proj): $(docker ps --filter "label=com.docker.compose.project=$proj" --format '{{.Names}}' | grep -vx "$C" | tr '\n' ' ')"
  [ "$ref" = 1 ] || say "    (env'de doğrudan referans bulunamadı)"
  say "    host'tan bağlanan systemd servisleri: $(grep -lsE "$C|:${hp:-NOPORT}([^0-9]|$)" /etc/systemd/system/*.service 2>/dev/null | xargs -r -n1 basename | tr '\n' ' ')"

  say "--- tablolar ve KESİN satır sayıları:"
  for t in $(q "select tablename from pg_tables where schemaname='public' order by 1"); do
    printf '    %-34s %s\n' "$t" "$(q "select count(*) from public.\"$t\"")"
  done

  for T in reservations bookings booking_requests reservation_legs outbox_jobs outbox outbox_events source_events reservation_events; do
    [ "$(q "select count(*) from pg_tables where schemaname='public' and tablename='$T'")" = 1 ] || continue
    say "--- $T: kolonlar (ad | tip | null?)"
    q "select column_name||' | '||data_type||' | '||is_nullable from information_schema.columns where table_schema='public' and table_name='$T' order by ordinal_position" | sed 's/^/    /'
    say "--- $T: kısıtlar (tip | tanım)"
    q "select contype::text||' | '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.\"$T\"'::regclass order by contype" | sed 's/^/    /'
    say "--- $T: indeksler (unique olanlar dahil)"
    q "select indexdef from pg_indexes where schemaname='public' and tablename='$T' order by 1" | sed 's/^/    /'
    say "--- $T: tetikleyiciler"
    q "select tgname from pg_trigger where tgrelid='public.\"$T\"'::regclass and not tgisinternal" | sed 's/^/    /'
    tc=$(q "select column_name from information_schema.columns where table_schema='public' and table_name='$T' and column_name in ('created_at','received_at','inserted_at','updated_at') order by array_position(array['created_at','received_at','inserted_at','updated_at'],column_name::text) limit 1")
    [ -n "$tc" ] && say "--- $T: zaman ($tc) min/max: $(q "select coalesce(to_char(min(\"$tc\"),'YYYY-MM-DD'),'-')||' / '||coalesce(to_char(max(\"$tc\"),'YYYY-MM-DD HH24:MI'),'-')||'  son7g='||count(*) filter (where \"$tc\" > now()-interval '7 days') from public.\"$T\"")"
    # yalnız kaynak/kanal/durum türü kolonlarda değer dağılımı (kısa, PII olmayan değerler; 40 karakterden uzun olanlar gizlenir)
    for col in $(q "select column_name from information_schema.columns where table_schema='public' and table_name='$T' and data_type in ('text','character varying','USER-DEFINED') and column_name ~ '^(source|source_domain|domain|site|channel|brand|tenant|tenant_id|project|status|state|event_type|type|target|locale|schema_version|service_type|trip_type)$' order by 1"); do
      say "--- $T.$col dağılımı (ilk 15):"
      q "select v||' = '||n from (select case when length(coalesce(\"$col\"::text,'NULL'))>40 then '<uzun-değer-gizlendi>' else coalesce(\"$col\"::text,'NULL') end as v, count(*) as n from public.\"$T\" group by 1 order by 2 desc limit 15) x" | sed 's/^/    /'
    done
  done
  say "--- fonksiyonlar (public, ad):"
  q "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1" | sed 's/^/    /'
  say "--- roller (ad | su | login):"
  q "select rolname||' | su='||rolsuper||' | login='||rolcanlogin from pg_roles where rolname !~ '^pg_' order by 1" | sed 's/^/    /'
  say "--- migration izi (tablo adı *migration*):"
  for m in $(q "select tablename from pg_tables where schemaname='public' and tablename ~ 'migration' order by 1"); do
    say "    $m: $(q "select count(*) from public.\"$m\"") kayıt"
  done
done

sec "son"
say "SEL327_SOURCE_MAP=DONE  LIVE_CHANGED=NO"
