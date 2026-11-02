#!/usr/bin/env bash
# SEL-434 — Prod Postgres maruziyet + giriş denemesi incelemesi. STRICTLY READ-ONLY.
# Docker'a erişimi olan admin hesabıyla çalıştırılır (root veya sudo):
#   ssh <prod-admin> 'sudo bash -s' < outputs/sel434-prod-pg-admin-check.sh
# Yalnız: docker ps / inspect / logs (okuma). exec, restart, compose up YOK.
# Parola, .env, kullanıcı adı, veritabanı içeriği yazdırılmaz. Dış IP'ler yalnız SAYI olarak.
set -u
LC_ALL=C
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }

command -v docker >/dev/null || { say "docker=YOK"; exit 1; }
docker ps >/dev/null 2>&1 || { say "DOCKER_API=ERISIM_YOK (sudo ile çalıştırın)"; exit 1; }

sec "5432/5434 yayınlayan konteynerler"
mapfile -t CS < <(docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep -E '543[24]' )
[ ${#CS[@]} -gt 0 ] || { say "pg_konteyner=YOK"; exit 0; }

for line in "${CS[@]}"; do
  id=${line%% *}; rest=${line#* }; name=${rest%% *}
  sec "konteyner: $name"
  say "image=$(docker inspect -f '{{.Config.Image}}' "$id")"
  say "baslama_utc=$(docker inspect -f '{{.State.StartedAt}}' "$id")"
  docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}port_baglama={{$p}} -> host_ip="{{.HostIp}}" host_port={{.HostPort}}{{"\n"}}{{end}}{{end}}' "$id" \
    | sed -E 's/host_ip=""/host_ip="" (BOS = 0.0.0.0, TUM ARAYUZLER)/'
  say "compose_dosyasi=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$id")"
  say "compose_servis=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
  args=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$args" in *log_connections=on*) say "log_connections=ON (başarılı girişler de loglanıyor)";; *) say "log_connections=varsayilan/OFF (başarılı girişler loglarda GÖRÜNMEZ; yalnız hatalar)";; esac

  tmp=$(mktemp); docker logs --timestamps "$id" >"$tmp" 2>&1
  say "log_satir=$(wc -l <"$tmp") ilk_log=$(head -1 "$tmp" | cut -c1-20)"
  af=$(grep -c 'password authentication failed' "$tmp")
  nu=$(grep -cE 'role ".*" does not exist|database ".*" does not exist' "$tmp")
  hb=$(grep -c 'no pg_hba.conf entry' "$tmp")
  ssl=$(grep -cE 'invalid length of startup packet|unsupported frontend protocol|SSL' "$tmp")
  say "kimlik_hatasi(parola)=$af  olmayan_rol/db=$nu  hba_red=$hb  tarama_paketi=$ssl"
  if [ "$af" -gt 0 ]; then
    say "parola_hatasi_ilk=$(grep -m1 'password authentication failed' "$tmp" | cut -c1-20)"
    say "parola_hatasi_son=$(grep 'password authentication failed' "$tmp" | tail -1 | cut -c1-20)"
    say "son_7_gun_parola_hatasi=$(awk -v d="$(date -u -d '-7 days' +%FT%T)" '$1>=d' "$tmp" | grep -c 'password authentication failed')"
  fi
  # Bağlantı kaydı varsa: dış (özel olmayan) kaynak IP sayısı
  ext=$(grep -oE 'connection received: host=[0-9a-f.:]+' "$tmp" | sed 's/.*host=//' \
        | grep -vE '^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|\[local\])' | sort -u | wc -l)
  auth_ok_ext=$(grep -E 'connection authorized' "$tmp" | wc -l)
  say "dis_kaynak_ip_adedi=$ext  basarili_giris_kaydi=$auth_ok_ext"
  rm -f "$tmp"
done

sec "son"
say "SEL434_PROD_PG_ADMIN_CHECK=DONE  LIVE_CHANGED=NO"
