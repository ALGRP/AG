#!/usr/bin/env bash
# SEL-434 — agos-staging-postgres uygulama kullanıcısının parolasını değiştir.
# Varsayılan PLAN.  --apply: yeni rastgele parola üretir, ALTER ROLE yapar, root 600 dosyaya yazar.
#   ssh agos-prod-01 'bash -s' < outputs/sel434-prod-pg-rotate.sh
#   ssh agos-prod-01 'bash -s -- --apply' < outputs/sel434-prod-pg-rotate.sh
# Parola HİÇBİR ZAMAN ekrana/loga/argv'ye yazılmaz: psql'e stdin ile gider, dosyaya umask 077 ile yazılır.
# Not: konteynerin POSTGRES_PASSWORD env'i yalnız ilk kurulumda kullanılır; değişmez (bilgi amaçlı eski kalır).
set -euo pipefail
LC_ALL=C
C=agos-staging-postgres
F=/root/.secrets/agos-staging-postgres.password
MODE=plan; [ "${1:-}" = "--apply" ] && MODE=apply
say(){ printf '%s\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "root gerekli"; exit 1; }
docker inspect "$C" >/dev/null 2>&1 || { say "konteyner YOK"; exit 1; }

port=$(docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}' "$C")
say "port=$port"
case "$port" in 127.0.0.1:*) say "port kontrolü: OK (yalnız yerel)";; *) say "UYARI: port hâlâ tüm arayüzlerde; önce sel434-prod-pg-lockdown.sh --apply önerilir";; esac
say "aktif istemci bağlantısı (arka plan süreçleri hariç): $(docker exec "$C" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "select count(*) from pg_stat_activity where backend_type='"'"'client backend'"'"' and pid<>pg_backend_pid()"')"
say "hedef rol: <APP_USER> (konteynerin POSTGRES_USER'ı), yeni parola: 32 bayt rastgele (base64url), saklama: $F (root 600)"
[ -e "$F" ] && say "not: $F zaten var; --apply yedeğini $F.bak-<ts> olarak saklar"

if [ "$MODE" = plan ]; then say ""; say "PLAN tamam: hiçbir şey değişmedi. Uygulamak için --apply."; exit 0; fi

umask 077
mkdir -p "$(dirname "$F")"; chmod 700 "$(dirname "$F")"
[ -e "$F" ] && cp -p "$F" "$F.bak-$(date -u +%Y%m%d-%H%M%S)"
NEW=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')
# psql değişkeni + :'v' ile güvenli tırnaklama; parola stdin'den gelir, argv'de görünmez.
printf '\\set np %s\nALTER ROLE :"u" PASSWORD :'"'"'np'"'"';\n' "$NEW" \
 | docker exec -i "$C" sh -c 'psql -X -q -v ON_ERROR_STOP=1 -v u="$POSTGRES_USER" -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"' >/dev/null
printf '%s\n' "$NEW" > "$F.tmp"; chmod 600 "$F.tmp"; mv "$F.tmp" "$F"
unset NEW

# Doğrulama: TCP üzerinden (trust değil, scram) yeni parola ile bağlan.
if docker exec -i "$C" sh -c 'PGPASSWORD="$(cat)" psql -X -At -h "$(hostname -i | cut -d" " -f1)" -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "select 1"' < "$F" 2>/dev/null | grep -qx 1; then
  say "doğrulama: yeni parola ile TCP girişi OK"
else
  say "UYARI: TCP doğrulaması başarısız (ağ arayüzü üzerinden); parola yine de değişti"
fi
say "eski parola ile giriş: $(docker exec "$C" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -At -h "$(hostname -i | cut -d" " -f1)" -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "select 1"' >/dev/null 2>&1 && echo 'HALA_CALISIYOR (FAIL)' || echo 'REDDEDILDI (OK)')"
say "sha256(parola dosyası)=$(sha256sum "$F" | cut -c1-12)…  (değer değil, yalnız değişim izi)"
say ""
say "APPLY tamam. Bu veritabanına bağlanan istemciler (staging uygulaması/n8n) yeni parolayı $F dosyasından almalı."
