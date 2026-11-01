#!/bin/bash
# SEL-434 — agos-hermes-ctrl-01 Hermes kurulum envanteri. STRICTLY READ-ONLY (sudo -n yalnız OKUMA için).
# Mac'ten: ssh -o IdentitiesOnly=yes -i ~/.ssh/agos-hermes-admin agosadmin@62.238.35.60 'bash -s' < outputs/sel434-ctrl-hermes-inventory.sh
# Hiçbir dosya/servis değiştirmez. Token, parola, id, .env değeri YAZDIRMAZ.
set -u
S="sudo -n"
red(){ sed -E 's/[0-9]{6,}:[A-Za-z0-9_-]{20,}/<TOKEN>/g; s/(sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{10,}/<KEY>/g; s/[A-Za-z0-9_-]{32,}/<REDACTED>/g; s/[0-9]{7,}/<NUM>/g'; }
h(){ echo; echo "=== $*"; }
h "1) hermesrun kullanıcısı"
getent passwd hermesrun | awk -F: '{print "uid="$3" home="$6" shell="$7}'
id hermesrun 2>/dev/null
h "2) systemd servis tanımı (gizli değerler maskeli)"
$S systemctl cat hermes-ctrl-agosprod.service 2>/dev/null | grep -vE '^\s*Environment=.*(TOKEN|KEY|SECRET|PASS)' | red
echo "--- durum:"; systemctl show hermes-ctrl-agosprod.service -p ActiveState,SubState,UnitFileState,ExecMainStartTimestamp,ExecMainExitTimestamp,Result 2>/dev/null
echo "--- son 15 log satırı (maskeli):"; $S journalctl -u hermes-ctrl-agosprod.service -n 15 --no-pager 2>/dev/null | red
ls /etc/systemd/system/hermes-ctrl-agosprod.service.d/ 2>/dev/null && echo "(drop-in dizini VAR)"
h "3) Dizin yapısı (2 seviye, yalnız adlar/izinler)"
for d in /opt/hermes-ctrl /var/lib/hermes-ctrl /etc/hermes /etc/agos; do
  [ -e "$d" ] || { echo "$d: YOK"; continue; }
  echo "--- $d"; $S find "$d" -maxdepth 2 -printf '%M %u:%g %p\n' 2>/dev/null | grep -vE '/(venv|node_modules|\.git)/' | head -40
done
h "4) Hermes sürümü"
for g in /opt/hermes-ctrl/hermes-agent /opt/hermes-ctrl/*/hermes-agent /var/lib/hermes-ctrl/hermes-agent; do
  [ -d "$g/.git" ] && echo "$g HEAD: $($S git -C "$g" rev-parse HEAD 2>/dev/null)"
done
h "5) Profil config'leri (güvenlik anahtarları; değer yok, politika değerleri var)"
for c in $($S find /opt/hermes-ctrl /var/lib/hermes-ctrl /etc/hermes -name config.yaml -not -path '*/venv/*' -not -path '*/node_modules/*' 2>/dev/null); do
  echo "--- $c ($($S stat -c '%a %U:%G' "$c"))"
  for k in allow_admin_from user_allowed_commands group_allow_admin_from group_user_allowed_commands dm_policy group_policy unauthorized_dm_behavior multiplex_profiles command_allowlist TELEGRAM_ALLOWED_USERS; do
    printf '  %s: %s\n' "$k" "$($S grep -cE "^[[:space:]]*$k:" "$c")"; done
  $S grep -nE '^[[:space:]]*(mode|cron_mode|dm_policy|group_policy|unauthorized_dm_behavior):' "$c" | red | sed 's/^/  /'
  $S grep -qE '^telegram:' "$c" && echo "  üst seviye telegram: VAR" || echo "  üst seviye telegram: YOK"
  echo "  platforms altındaki anahtarlar: $($S awk '/^platforms:/{f=1;next} f&&/^[^ ]/{f=0} f&&/^  [a-z_]+:/{gsub(/[: ]/,"");printf $0" "}' "$c")"
done
h "6) .env / secret dosyaları (yalnız anahtar ADLARI, değer yok)"
for e in $($S find /opt/hermes-ctrl /var/lib/hermes-ctrl /etc/hermes /etc/agos -maxdepth 4 \( -name '.env' -o -name '*.env' -o -name 'secrets*' \) -not -path '*/venv/*' 2>/dev/null); do
  echo "--- $e ($($S stat -c '%a %U:%G' "$e"))"
  $S grep -oE '^[[:space:]]*(export[[:space:]]+)?[A-Z][A-Z0-9_]*=' "$e" | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=$//' | sort | tr '\n' ' '; echo
done
h "7) Prod'a bağlantı yolları"
echo "hermesrun SSH anahtarları: $($S find ~hermesrun/.ssh /var/lib/hermes-ctrl -maxdepth 3 -name 'id_*' -o -maxdepth 3 -name '*.pem' 2>/dev/null | wc -l)"
$S grep -rhoE 'https?://[A-Za-z0-9.-]+(:[0-9]+)?' /opt/hermes-ctrl /var/lib/hermes-ctrl /etc/hermes 2>/dev/null --include='*.yaml' --include='*.yml' --include='*.json' --include='*.env' --include='.env' | sort -u | head -20
h "8) Giriş kapısı (SEL-324 ingress gate) kurulu mu?"
$S find / -xdev \( -name 'check-hermes-ingress.py' -o -name 'ingress-policy.json' -o -name '10-agos-ingress-gate.conf' \) 2>/dev/null | head
echo; echo "=== BİTTİ (salt-okunur)"
