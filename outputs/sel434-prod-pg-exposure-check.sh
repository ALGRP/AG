#!/usr/bin/env bash
# SEL-434 — Prod Postgres (5434) maruziyet kontrolü. STRICTLY READ-ONLY.
# Çalıştırma (Mac):  ssh agos-prod-readonly 'bash -s' < outputs/sel434-prod-pg-exposure-check.sh
# Hiçbir servis/dosya değiştirilmez. Parola, token, .env değeri, kullanıcı adı yazdırılmaz.
# Yetki yetmeyen adımlar "ERISIM_YOK" yazar; dolanma denenmez (sudo kullanılmaz).
set -u
LC_ALL=C
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }

sec "kimlik"
say "host=$(hostname) user_uid=$(id -u) tarih_utc=$(date -u +%FT%TZ)"

sec "dinleyen portlar (yalnız adres:port)"
if command -v ss >/dev/null; then
  ss -H -ltn 2>/dev/null | awk '{print $4}' | sort -u
  if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\*|\[::\]):5434$'; then
    say "PG5434_TUM_ARAYUZLER=VAR  (Docker portu 0.0.0.0'a bağlı; kalıcı düzeltme gerekli)"
  elif ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq ':5434$'; then
    say "PG5434_TUM_ARAYUZLER=YOK  (yalnız yerel/özel adreste)"
  else
    say "PG5434_DINLEYEN=YOK"
  fi
else
  say "ss=YOK"
fi

sec "docker erişimi"
if docker ps >/dev/null 2>&1; then
  say "DOCKER_API=VAR"
  docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E '5432|5434' || say "pg_konteyner_port_eslesmesi=YOK"
else
  say "DOCKER_API=ERISIM_YOK (beklenen: hermesops docker grubunda değil)"
fi

sec "compose dosyalarında 5434 port tanımı (yalnız satır şekli, değer yok)"
found=0
for d in /opt /srv /home/*/ /etc/agos; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    found=1
    say "dosya=$f"
    grep -nE '5434:5432' "$f" 2>/dev/null | while IFS=: read -r n rest; do
      case "$rest" in *127.0.0.1:5434*) say "satir=$n bind=127.0.0.1 (yerel, iyi)";; *) say "satir=$n bind=TUM_ARAYUZLER (duzeltilmeli)";; esac
    done
  done < <(find "$d" -maxdepth 4 -name 'docker-compose*.y*ml' -readable 2>/dev/null | xargs -r grep -l '5434' 2>/dev/null)
done
[ "$found" = 1 ] || say "okunabilir_compose_5434=YOK"

sec "postgres log: dış kaynaklı bağlantı/kimlik hatası sayımları"
# Docker logları hermesops için okunamayabilir; okunabilir dosya loglarını dener.
logs=$(find /var/log /var/lib/docker/containers -maxdepth 3 \( -name 'postgresql*.log' -o -name '*-json.log' \) -readable 2>/dev/null | head -50)
if [ -z "$logs" ]; then
  say "PG_LOG=ERISIM_YOK  (Owner/admin ile ayrıca bakılmalı: docker logs <pg> | grep 'authentication failed')"
else
  for f in $logs; do
    a=$(grep -c 'password authentication failed' "$f" 2>/dev/null || true)
    b=$(grep -c 'no pg_hba.conf entry' "$f" 2>/dev/null || true)
    c=$(grep -cE 'connection received: host=[0-9]' "$f" 2>/dev/null || true)
    [ "${a:-0}${b:-0}${c:-0}" = "000" ] && continue
    say "dosya=$f auth_failed=$a hba_red=$b baglanti_kaydi=$c"
  done
  say "(sayım 0 ise satır yazılmadı)"
fi

sec "son"
say "SEL434_PROD_PG_CHECK=DONE  LIVE_CHANGED=NO"
