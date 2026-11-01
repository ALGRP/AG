#!/usr/bin/env bash
# SEL-434 — agos-staging-postgres sızma (compromise) kontrolü. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel434-prod-pg-compromise-check.sh
# Yalnız docker inspect/top/diff/logs/stats ve READ ONLY transaction içinde SELECT.
# Parola, veri satırı, müşteri verisi YAZDIRILMAZ. Yalnız rol/db/eklenti ADLARI ve sayımlar.
set -u
LC_ALL=C
C=${1:-agos-staging-postgres}
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
docker inspect "$C" >/dev/null 2>&1 || { say "konteyner=YOK ($C)"; exit 1; }

sec "1) konteyner tanımı"
docker inspect -f 'olusturma={{.Created}} restart={{.HostConfig.RestartPolicy.Name}} image={{.Config.Image}}' "$C"
docker inspect -f '{{range .Mounts}}mount={{.Type}} {{.Name}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$C" | sed '/^$/d'
docker inspect -f '{{range .NetworkSettings.Networks}}ag={{.NetworkID}}{{end}}' "$C" | cut -c1-20
say "env_anahtar_adlari=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$C" | cut -d= -f1 | sort | tr '\n' ' ')"

sec "2) konteyner içi süreçler (postgres dışı = ŞÜPHELİ)"
docker top "$C" -eo user,pid,pcpu,comm 2>/dev/null | awk 'NR==1{print;next}{print}' | head -40
odd=$(docker top "$C" -eo comm 2>/dev/null | tail -n +2 | grep -vcE '^(postgres|postmaster)$')
say "postgres_disi_surec_adedi=$odd"

sec "3) CPU/bellek (madenci belirtisi: sürekli yüksek CPU)"
docker stats --no-stream --format 'cpu={{.CPUPerc}} mem={{.MemUsage}}' "$C"

sec "4) dosya sistemi değişiklikleri (docker diff; veri dizini hariç)"
D=$(docker diff "$C" 2>/dev/null | grep -vE ' /var/lib/postgresql' || true)
say "degisen_yol_adedi=$(printf '%s' "$D" | grep -c . || true)"
printf '%s\n' "$D" | grep -E ' /(tmp|var/tmp|dev/shm|root|usr/bin|usr/local/bin|bin|etc/cron|etc/ld\.so\.preload)' | head -30

sec "5) loglarda saldırı izi (yalnız sayım)"
L=$(docker logs "$C" 2>&1)
for pat in 'FROM PROGRAM' 'lo_import' 'lo_export' 'pg_read_server_files' 'pg_execute_server_program' 'CREATE ROLE' 'ALTER ROLE' 'ALTER USER' 'CREATE EXTENSION' 'CREATE FUNCTION' 'DROP DATABASE' 'DROP TABLE' 'curl' 'wget' 'base64'; do
  n=$(printf '%s\n' "$L" | grep -ci -- "$pat")
  say "iz[$pat]=$n"
done
say "--- parola hatası hedef rol adları (sayım):"
printf '%s\n' "$L" | grep -oE 'password authentication failed for user "[^"]{1,40}"' | sed -E 's/.*user "([^"]*)"/\1/' | sort | uniq -c | sort -rn | head -10
say "--- günlere göre parola hatası (son 10 gün):"
docker logs --timestamps "$C" 2>&1 | grep 'password authentication failed' | cut -c1-10 | sort | uniq -c | tail -10

sec "6) veritabanı içi (READ ONLY oturum)"
PSQL=(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$C" psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1)
if "${PSQL[@]}" -c 'select 1' >/dev/null 2>&1; then
  say "--- roller (ad | superuser | login | parola_sureli):"
  "${PSQL[@]}" -c "select rolname||' | su='||rolsuper||' | login='||rolcanlogin||' | valid_until='||coalesce(rolvaliduntil::text,'-') from pg_roles where rolname !~ '^pg_' order by 1"
  say "--- veritabanları:"
  "${PSQL[@]}" -c "select datname from pg_database where not datistemplate order by 1"
  say "--- eklentiler (tüm db):"
  for d in $("${PSQL[@]}" -c "select datname from pg_database where not datistemplate and datallowconn"); do
    ex=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$C" psql -X -At -U postgres -d "$d" -c "select string_agg(extname||' '||extversion, ', ') from pg_extension" 2>/dev/null)
    fn=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$C" psql -X -At -U postgres -d "$d" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname not in ('pg_catalog','information_schema') and l.lanname in ('c','plpython3u','plperlu','plsh')" 2>/dev/null)
    say "db=$d eklentiler=[$ex] guvensiz_dil_fonksiyon=$fn"
  done
  say "--- şu anki bağlantılar (yerel olmayan istemci sayısı):"
  "${PSQL[@]}" -c "select count(*) filter (where client_addr is not null and host(client_addr) !~ '^(127\.|172\.|10\.|192\.168\.)') as dis, count(*) as toplam from pg_stat_activity"
  say "--- ayarlar:"
  "${PSQL[@]}" -c "select name||'='||setting from pg_settings where name in ('listen_addresses','password_encryption','log_connections','ssl','shared_preload_libraries','archive_command')" | sed -E 's/(archive_command=).+/\1<VAR>/'
  say "--- pg_hba kuralları (tip/db/kullanıcı/adres/yöntem):"
  "${PSQL[@]}" -c "select type||' '||array_to_string(database,',')||' '||array_to_string(user_name,',')||' '||coalesce(address,'-')||' '||coalesce(netmask,'')||' '||auth_method from pg_hba_file_rules where error is null" 2>/dev/null
else
  say "PSQL_YEREL=ERISIM_YOK (konteyner içi postgres rolü yok veya parola istiyor; atlandı)"
fi

sec "son"
say "SEL434_PG_COMPROMISE_CHECK=DONE  LIVE_CHANGED=NO"
