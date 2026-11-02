#!/usr/bin/env bash
# SEL-433/SEL-329 — Prod rezervasyon & bildirim altyapısı keşfi. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel433-prod-reservation-discovery.sh
# Yazdırılan: servis/konteyner/tablo ADLARI, port bağlamaları, env ANAHTAR adları, satır SAYILARI,
# workflow adları, HTTP durum kodları. Yazdırılmayan: env değerleri, parola/token, müşteri satırları.
# Veritabanı sorguları READ ONLY oturumda, yalnız count(*) ve şema bilgisi.
set -u
LC_ALL=C
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
mask(){ sed -E 's/[0-9]{6,}:[A-Za-z0-9_-]{20,}/<TOKEN>/g; s/(key|token|secret|pass(word)?)=[^ &]+/\1=<GIZLI>/Ig'; }

sec "1) konteynerler (ad | image | port bağlama | durum)"
docker ps -a --format '{{.Names}} | {{.Image}} | {{.Ports}} | {{.Status}}' | sort

sec "2) compose projeleri (yol | servisler)"
docker ps -a --format '{{.Label "com.docker.compose.project.config_files"}}' | tr ',' '\n' | sed '/^$/d' | sort -u | while read -r f; do
  [ -f "$f" ] || continue
  svcs=$(docker ps -a --filter "label=com.docker.compose.project.config_files=$f" --format '{{.Label "com.docker.compose.service"}}' | sort -u | tr '\n' ' ')
  say "$f | $svcs"
done

sec "3) rezervasyon otomasyonu dizini"
for d in /opt/agos-reservation-automation /opt/agos /opt/agos/agos-infrastructure; do
  [ -d "$d" ] || continue
  say "--- $d"
  ls -1 "$d" 2>/dev/null | head -40 | sed 's/^/  /'
  [ -d "$d/.git" ] && say "  git: $(git -C "$d" remote get-url origin 2>/dev/null | sed -E 's#://[^@]+@#://#') @ $(git -C "$d" rev-parse --short HEAD 2>/dev/null) ($(git -C "$d" log -1 --format=%cs 2>/dev/null))"
  for e in "$d"/.env "$d"/*.env; do [ -f "$e" ] && say "  env $(basename "$e") anahtarlar: $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$e" | tr -d '=' | tr '\n' ' ')"; done
done

sec "4) agos/rezervasyon systemd birimleri"
systemctl list-units --all --no-legend --plain 2>/dev/null | awk '{print $1, $3, $4}' | grep -Ei 'agos|reserv|booking|n8n|hermes|bridge|notif|whatsapp|telegram' | sed 's/^/  /'
for u in $(systemctl list-unit-files --no-legend 2>/dev/null | awk '{print $1}' | grep -Ei 'agos|reserv|bridge|notif'); do
  say "--- $u"
  systemctl cat "$u" 2>/dev/null | grep -E '^(Description|ExecStart|User|EnvironmentFile|WorkingDirectory)=' | mask | sed 's/^/  /'
done

sec "5) cron/timer"
systemctl list-timers --all --no-legend 2>/dev/null | grep -Ei 'agos|reserv|n8n|backup' | sed 's/^/  /'
for f in /etc/cron.d/* /var/spool/cron/crontabs/*; do [ -f "$f" ] && grep -vE '^\s*(#|$)' "$f" | mask | sed "s#^#  $(basename "$f"): #"; done 2>/dev/null

sec "6) yerel HTTP uçları (yalnız durum kodu)"
for p in $(ss -Hltn | awk '{print $4}' | grep -E '^127\.0\.0\.1:' | cut -d: -f2 | sort -un); do
  for path in / /health /healthz /api/health; do
    code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:$p$path" 2>/dev/null)
    [ "$code" != "000" ] && say "  127.0.0.1:$p$path -> $code"
  done
done

sec "7) n8n workflow'ları (ad | aktif)"
for c in $(docker ps --format '{{.Names}}' | grep -Ei 'n8n' | grep -viE 'postgres|redis|db'); do
  say "--- $c"
  docker exec "$c" n8n list:workflow 2>/dev/null | head -60 | sed -E 's/^([^|]*)\|/  id=\1 | /' || say "  (n8n CLI yok/erişilemedi)"
  docker exec "$c" n8n list:workflow --active=true 2>/dev/null | wc -l | sed 's/^/  aktif_sayisi=/'
done

sec "8) rezervasyon veritabanları: tablolar ve satır sayıları (READ ONLY)"
for c in agos-reservation-postgres agos-staging-postgres ag-transfer-platform-20260911-01-transfer-platform-db-1; do
  docker inspect "$c" >/dev/null 2>&1 || continue
  say "--- $c"
  Q="select n.nspname||'.'||c.relname||' rows~'||c.reltuples::bigint from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema') order by c.reltuples desc limit 40"
  docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$Q" "$c" sh -c 'U="${POSTGRES_USER:-postgres}"; D="${POSTGRES_DB:-$U}"; psql -X -At -U "$U" -d "$D" -c "$Q"' 2>&1 | head -40 | sed 's/^/  /'
done
say "(rows~ = istatistik tahmini; kesin sayı değil)"

sec "9) bildirim kanalları (yalnız env ANAHTAR adları, tüm konteynerler)"
for c in $(docker ps --format '{{.Names}}'); do
  k=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | cut -d= -f1 | grep -Ei 'telegram|whatsapp|twilio|smtp|mail|sms|webhook|notify|n8n_|meta_|wa_' | tr '\n' ' ')
  [ -n "$k" ] && say "  $c: $k"
done

sec "son"
say "SEL433_DISCOVERY=DONE  LIVE_CHANGED=NO"
