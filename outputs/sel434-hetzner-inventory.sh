#!/bin/bash
# SEL-434 Adım 1 — Hetzner Hermes envanteri. STRICTLY READ-ONLY.
# Mac'ten çalıştırma:  ssh agos-prod-readonly 'bash -s' < outputs/sel434-hetzner-inventory.sh
# Hiçbir dosyayı/servisi değiştirmez. Token, parola, id, .env değeri YAZDIRMAZ (yalnız VAR/YOK ve sayı).
set -u
red(){ sed -E 's/[0-9]{6,}:[A-Za-z0-9_-]{20,}/<TOKEN>/g; s/[A-Za-z0-9_-]{32,}/<REDACTED>/g; s/[0-9]{7,}/<NUM>/g'; }
h(){ echo; echo "=== $*"; }
h "1) Sistem"
echo "kullanıcı: $(id -un) (uid $(id -u)); sudo -n: $(sudo -n true 2>/dev/null && echo VAR || echo YOK)"
. /etc/os-release 2>/dev/null; echo "os: ${PRETTY_NAME:-?}; kernel: $(uname -r); uptime:$(uptime -p 2>/dev/null)"
df -h / 2>/dev/null | tail -1 | awk '{print "disk /: kullanılan "$3" / "$2" ("$5")"}'
echo "kabuk kullanıcıları: $(awk -F: '$7!~/(nologin|false)$/{print $1}' /etc/passwd | tr '\n' ' ')"
h "2) Hermes kurulumları (yalnız varlık)"
for d in /home/*/.hermes /root/.hermes /opt/hermes* /srv/hermes* /var/lib/hermes*; do
  [ -e "$d" ] && echo "VAR: $d ($(stat -c '%U %a' "$d" 2>/dev/null || echo 'okunamadı'))"
done
command -v hermes >/dev/null && echo "hermes komutu: $(command -v hermes)" || echo "hermes komutu: YOK (bu kullanıcı PATH'inde)"
for d in /home/*/.hermes; do
  [ -r "$d" ] || continue
  [ -d "$d/hermes-agent/.git" ] && echo "  $d/hermes-agent HEAD: $(git -C "$d/hermes-agent" rev-parse --short=12 HEAD 2>/dev/null)"
  for p in "$d" "$d"/profiles/*; do
    [ -f "$p/config.yaml" ] || continue
    c="$p/config.yaml"; e="$p/.env"
    echo "  profil: $p"
    for k in allow_admin_from user_allowed_commands group_allow_admin_from dm_policy group_policy unauthorized_dm_behavior multiplex_profiles command_allowlist; do
      printf '    %s: %s\n' "$k" "$(grep -cE "^[[:space:]]*$k:" "$c" 2>/dev/null)"; done
    awk '/^[^ \t#][^:]*:/{t=$1} t=="approvals:" && /^[ \t]+(mode|cron_mode):/{gsub(/^[ \t]+/,""); print "    approvals."$0}' "$c" 2>/dev/null
    grep -qE '^telegram:' "$c" && echo "    üst seviye telegram: bloğu: VAR" || echo "    üst seviye telegram: bloğu: YOK"
    if [ -r "$e" ]; then
      for k in TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_USERS TELEGRAM_ALLOW_ALL_USERS GATEWAY_ALLOW_ALL_USERS HERMES_YOLO_MODE; do
        printf '    .env %s: %s\n' "$k" "$(grep -cE "^[[:space:]]*(export[[:space:]]+)?$k=" "$e")"; done
      echo "    .env mod: $(stat -c '%a %U' "$e")"
    else echo "    .env: $( [ -e "$e" ] && echo 'VAR ama okunamadı' || echo YOK)"; fi
    [ -d "$p/platforms/pairing" ] && echo "    pairing dosyaları: $(ls "$p/platforms/pairing" 2>/dev/null | tr '\n' ' ')"
  done
done
h "3) Servisler"
systemctl list-units --all --no-pager --plain 2>/dev/null | grep -Ei 'hermes|agos|n8n|telegram|bot' | awk '{print "  "$1, $3, $4}' | red
systemctl --user list-units --all --no-pager --plain 2>/dev/null | grep -Ei 'hermes|agos|bot' | awk '{print "  user: "$1, $3, $4}' | red
h "4) Çalışan süreçler (komut adı ve kullanıcı)"
ps -eo user,pid,lstart,comm,args --no-headers 2>/dev/null | grep -Ei 'hermes|gateway|agos|n8n|bot' | grep -v grep | awk '{a=""; for(i=9;i<=NF&&i<=14;i++) a=a" "$i; print "  "$1, $2, $3" "$4" "$5" "$6, $8, a}' | red | head -30
h "5) Docker"
command -v docker >/dev/null && (docker ps --format '  {{.Names}} {{.Image}} {{.Status}}' 2>/dev/null || echo "  docker erişimi yok") || echo "  docker: YOK"
h "6) Dinlenen portlar"
(ss -tlnH 2>/dev/null || netstat -tln 2>/dev/null) | awk '{print "  "$4}' | sort -u | head -30
h "7) Güvenlik duvarı ve SSH"
(sudo -n ufw status 2>/dev/null || echo "  ufw: okunamadı (sudo yok)") | head -15
grep -hE '^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | sed 's/^/  /'
h "8) Telegram bağlantı izi (son 24 saat, yalnız SAYI)"
for d in /home/*/.hermes /home/*/.hermes/profiles/*; do
  L="$d/logs/gateway.log"; [ -r "$L" ] || continue
  echo "  $L: Conflict=$(grep -c 'Conflict' "$L") Unauthorized/401=$(grep -cE 'Unauthorized|401' "$L") son-değişiklik=$(stat -c '%y' "$L" | cut -d. -f1)"
done
echo; echo "=== BİTTİ (salt-okunur)"
