#!/bin/bash
# agos-staging-report — SEL-329 / G1 salt-okunur kanıt raporu. prod'da /usr/local/sbin altında, root:root 755.
# Hermes (ctrl-01) bunu yalnız forced-command SSH + tek satır sudoers ile çalıştırabilir; ARGÜMAN ALMAZ.
# Veri sınıfı: GERÇEK MÜŞTERİ VERİSİ (Owner kararı 2026-11-01) → yalnız sayım/şema/yetki; satır içeriği ASLA.
# Tüm SQL READ ONLY oturumda. Kullanıcı/db adları maskelenir. Parola/token yazdırılmaz.
set -u
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
C=agos-staging-postgres
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
say "AGOS_STAGING_REPORT v2  zaman=$(date -u +%FT%TZ)  host=$(hostname)  LIVE_CHANGED=NO"
say "veri_sinifi=GERCEK_MUSTERI_VERISI (yalnız sayım/şema/yetki raporlanır)"
docker inspect "$C" >/dev/null 2>&1 || { say "konteyner=YOK"; exit 0; }

sec "1) ortam kimliği"
docker inspect -f 'konteyner={{.Name}} image={{.Config.Image}} image_id={{.Image}}' "$C" | sed 's#=/#=#'
docker inspect -f 'olusturma={{.Created}} durum={{.State.Status}} baslama={{.State.StartedAt}} restart={{.HostConfig.RestartPolicy.Name}}' "$C"
say "compose_projesi=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$C")"

sec "2) ağ sınırı"
say "port_baglama: $(docker port "$C" 5432/tcp 2>/dev/null | tr '\n' ' ')"
L=$(ss -Hltn | awk '{print $4}' | grep -E ':5434$' | tr '\n' ' ')
say "host_dinleyen_5434: $L"
case "$L" in *0.0.0.0:5434*|*'[::]:5434'*|*'*:5434'*) say "dis_erisim=ACIK (FAIL)";; *) say "dis_erisim=KAPALI (yalnız 127.0.0.1)";; esac
for n in $(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$C"); do
  say "ag=$n uyeler: $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$n" 2>/dev/null)"
done

sec "3) bu veritabanına referans veren diğer konteynerler (yalnız konteyner + env ANAHTAR adı)"
ref=0
for c in $(docker ps -a --format '{{.Names}}'); do
  [ "$c" = "$C" ] && continue
  k=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" 2>/dev/null | grep -E 'agos-staging-postgres|:5434([^0-9]|$)' | cut -d= -f1 | tr '\n' ' ')
  [ -n "$k" ] && { say "  $c: $k"; ref=1; }
done
[ "$ref" = 1 ] || say "  YOK (hiçbir konteyner bu veritabanını env üzerinden kullanmıyor)"

sec "4) parola rotasyonu (değer yok)"
F=/root/.secrets/agos-staging-postgres.password
[ -f "$F" ] && say "parola_dosyasi=VAR izin=$(stat -c '%a %U' "$F") degisim_utc=$(date -u -r "$F" +%FT%TZ)" || say "parola_dosyasi=YOK"

sec "5) veritabanı (READ ONLY)"
AU=$(docker exec "$C" sh -c 'printf %s "$POSTGRES_USER"' 2>/dev/null)
AD=$(docker exec "$C" sh -c 'printf %s "${POSTGRES_DB:-postgres}"' 2>/dev/null)
esc(){ printf '%s' "$1" | sed 's/[^A-Za-z0-9_]/\\&/g'; }
AUe=$(esc "$AU"); ADe=$(esc "$AD")
mask(){ if [ -n "$AUe" ] && [ -n "$ADe" ]; then sed -e "s/\b$AUe\b/<APP_USER>/g" -e "s/\b$ADe\b/<APP_DB>/g"; else sed 's/.*/<MASKE_HATASI>/'; fi; }
q(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$2" "$C" sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "'"$1"'" -c "$Q"' 2>&1 | mask; }
if ! q "$AD" 'select 1' | grep -qx 1; then say "db_erisim=HATA"; exit 0; fi
# Veri sorguları (tablo sayımları, istatistikler) least-privilege rol ile: agos_readonly (NOLOGIN, yalnız SELECT)
RO=0; [ "$(q "$AD" "select count(*) from pg_roles where rolname='agos_readonly' and not rolsuper and not rolcanlogin")" = 1 ] && RO=1
qro(){ if [ "$RO" = 1 ]; then docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "SET ROLE agos_readonly" -c "$Q"' 2>&1 | mask; else q "$AD" "$1"; fi; }
if [ "$RO" = 1 ]; then say "veri_sorgu_rolu=$(qro "select current_user||' su='||(select rolsuper from pg_roles where rolname=current_user)")"; else say "veri_sorgu_rolu=<APP_USER> (agos_readonly YOK; superuser ile READ ONLY)"; fi
say "--- roller (ad | superuser | login | createrole | createdb | bypassrls):"
q "$AD" "select rolname||' | su='||rolsuper||' | login='||rolcanlogin||' | createrole='||rolcreaterole||' | createdb='||rolcreatedb||' | bypassrls='||rolbypassrls from pg_roles where rolname !~ '^pg_' order by 1" | sed 's/^/  /'
say "salt_okunur_rol(agos_readonly)=$([ "$RO" = 1 ] && echo VAR || echo YOK)  salt_okunur_login_rol_sayisi=$(q "$AD" "select count(*) from pg_roles r where rolcanlogin and not rolsuper and not exists (select 1 from information_schema.role_table_grants g where g.grantee=r.rolname and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))")"
say "--- veritabanları:"; q "$AD" "select datname from pg_database where not datistemplate order by 1" | sed 's/^/  /'
say "--- tablolar ve KESİN satır sayıları (<APP_DB>.public):"
for t in $(q "$AD" "select tablename from pg_tables where schemaname='public' order by 1"); do
  printf '  %-28s %s\n' "$t" "$(qro "select count(*) from public.\"$t\"")"
done
say "--- tablo yetkileri özeti (grantee | yetki | tablo sayısı):"
q "$AD" "select grantee||' | '||privilege_type||' | '||count(*) from information_schema.role_table_grants where table_schema='public' group by grantee, privilege_type order by 1" | sed 's/^/  /'
say "--- ayarlar:"
q "$AD" "select name||'='||setting from pg_settings where name in ('server_version','listen_addresses','ssl','password_encryption','log_connections','log_statement') order by 1" | sed 's/^/  /'
say "--- bağlantılar: $(q "$AD" "select 'istemci='||count(*) filter (where backend_type='client backend' and pid<>pg_backend_pid())||' dis_istemci='||count(*) filter (where client_addr is not null and host(client_addr) !~ '^(127\.|172\.|10\.|192\.168\.)') from pg_stat_activity")"
say "--- son veri hareketi (tablo istatistiği; satır içeriği yok):"
q "$AD" "select relname||' ins='||n_tup_ins||' upd='||n_tup_upd||' del='||n_tup_del from pg_stat_user_tables where n_tup_ins+n_tup_upd+n_tup_del>0 order by relname" | sed 's/^/  /'

sec "son"
say "AGOS_STAGING_REPORT=DONE"
