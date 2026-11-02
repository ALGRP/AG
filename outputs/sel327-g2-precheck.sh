#!/usr/bin/env bash
# SEL-327 / G2.0c — doğrulama öncesi iki soru. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel327-g2-precheck.sh
# 1) reservation-automation testleri gerçek PostgreSQL mi kullanıyor, sahte depo mu? (yalnız sayım/ad)
# 2) Köprü kaybı var mı: 2026-10-22 sonrası transfer-platform kayıtları ↔ canonical'a ulaşanlar (yalnız sayım)
# Kod satırları yazdırılırken gizli/uzun değerler maskelenir; müşteri verisi okunmaz.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
scrub(){ sed -E -e 's/[0-9]{6,}/<NUM>/g' -e 's/[A-Za-z0-9_+\/=-]{32,}/<GİZLİ>/g' -e 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}/<EPOSTA>/g' -e 's#//[^/@[:space:]]+@#//<KIMLIK>@#g'; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
R=/opt/agos-reservation-automation; C=agos-reservation-postgres
say "SEL327_G2_PRECHECK v1  zaman=$(date -u +%FT%TZ)  LIVE_CHANGED=NO"

sec "1) testler: veritabanı kullanımı (dosya | pg/Pool | DATABASE_/TEST_DB env | fake/memory | skip)"
for f in $(ls -1 "$R"/test/*.js 2>/dev/null | sort); do
  printf '  %-36s pg=%-3s env=%-3s fake=%-3s skip=%s\n' "$(basename "$f")" \
    "$(grep -cE "require\(['\"]pg['\"]\)|from ['\"]pg['\"]|new Pool|createPool|\bpg\." "$f")" \
    "$(grep -cE "process\.env\.(TEST_)?DATABASE|PGHOST|TEST_DB|INTEGRATION" "$f")" \
    "$(grep -ciE "fake|inmemory|in-memory|mock|stub" "$f")" \
    "$(grep -cE "\.skip|skip:|\{ *skip" "$f")"
done
say "--- testlerde geçen env değişkeni ADLARI:"
grep -ohE "process\.env\.[A-Z0-9_]+" "$R"/test/*.js 2>/dev/null | sed 's/process\.env\.//' | sort | uniq -c | sed 's/^/  /'
say "--- src/automation altında veritabanı modülleri (dosya adı):"
grep -lE "require\(['\"]pg['\"]\)|new Pool" -r "$R/src" 2>/dev/null | sed "s#$R/##" | sed 's/^/  /'
say "--- çalışan API konteyneri: node sürümü, test dizini var mı"
say "  node=$(docker exec agos-reservation-api node --version 2>/dev/null || echo ?)  test_dosyasi=$(docker exec agos-reservation-api sh -c 'ls test/*.js 2>/dev/null | wc -l' 2>/dev/null || echo ?)  image=$(docker inspect -f '{{.Config.Image}}' agos-reservation-api)  image_id=$(docker inspect -f '{{.Image}}' agos-reservation-api | cut -c8-19)"

sec "2) source-bridge mantığı (kodda source_system / eşleme satırları, maskeli, ilk 25)"
SB="$R/scripts/source-bridge.py"
grep -niE "source_system|platform_source|landing|wordpress|since|cursor|last_id|state|sqlite|\.db['\"]|INTERVAL|created_at" "$SB" 2>/dev/null | cut -c1-140 | scrub | head -25 | sed 's/^/  /'

sec "3) köprü kaybı: 2026-10-22 00:00 UTC sonrası"
TP=$(docker ps --format '{{.Names}}' | grep -E 'transfer-platform-db' | head -1)
tq(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$TP" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-160 | scrub; }
cq(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-160 | scrub; }
# yalnız iç kullanım (ekrana basılmaz): filtresiz ham çıktı
tqr(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$TP" sh -c 'psql -X -q -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>/dev/null; }
cqr(){ docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$C" sh -c 'psql -X -q -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"' 2>/dev/null; }
say "--- transfer-platform (kaynak | adet | ilk | son):"
tq "select source_system, count(*), to_char(min(created_at),'MM-DD HH24:MI'), to_char(max(created_at),'MM-DD HH24:MI') from reservations where created_at >= '2026-10-22' group by 1 order by 2 desc" | sed 's/^/  /'
say "--- canonical (kaynak | adet | ilk | son), whatsapp hariç:"
cq "select source_system, count(*), to_char(min(created_at),'MM-DD HH24:MI'), to_char(max(created_at),'MM-DD HH24:MI') from reservations where source_system <> 'whatsapp-baileys' group by 1 order by 2 desc" | sed 's/^/  /'
say "--- canonical source_events (kaynak | olay | farklı kayıt):"
cq "select source_system, count(*), count(distinct source_record_id) from source_events where source_system <> 'whatsapp-baileys' group by 1 order by 2 desc" | sed 's/^/  /'
say "--- eşleşme: transfer-platform reservation_no / id → canonical source_record_id (yalnız sayım)"
TPIDS=$(tqr "select string_agg(quote_literal(x), ',') from (select reservation_no::text x from reservations where created_at >= '2026-10-22' union select id::text from reservations where created_at >= '2026-10-22' union select source_record_id from reservations where created_at >= '2026-10-22') s" | tail -1)
if [ -n "$TPIDS" ]; then
  say "  transfer-platform kayıt (22 Ekim+): $(tqr "select count(*) from reservations where created_at >= '2026-10-22'")"
  say "  canonical'da source_record_id eşleşen: $(printf "select count(distinct source_record_id) from reservations where source_system <> 'whatsapp-baileys' and source_record_id in (%s);\n" "$TPIDS" | cqr)"
else say "  (eşleme listesi oluşturulamadı)"; fi
say "--- source-bridge son 7 gün log özeti (satır | 'posted|sent|200' | hata):"
L=$(journalctl -u agos-reservation-source-bridge --since -7d --no-pager 2>/dev/null)
say "  satır=$(printf '%s\n' "$L" | grep -c .) basari=$(printf '%s\n' "$L" | grep -ciE 'posted|sent|accepted|200|ok') hata=$(printf '%s\n' "$L" | grep -ciE 'error|traceback|fail|4[0-9][0-9]|5[0-9][0-9]')"

sec "son"
say "SEL327_G2_PRECHECK=DONE  LIVE_CHANGED=NO"
