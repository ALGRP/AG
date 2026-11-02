#!/usr/bin/env bash
# SEL-433/SEL-329 G1 — Hermes'e staging için TEK RAPOR betiğiyle sınırlı salt-okunur erişim. MAC'te çalışır.
#   bash outputs/sel433-staging-report-access.sh            # PLAN (hiçbir şey değişmez)
#   bash outputs/sel433-staging-report-access.sh --apply    # kur + doğrula
#   bash outputs/sel433-staging-report-access.sh --undo     # tamamen kaldır
# Kurulum:
#  ctrl-01: hermesrun için ed25519 anahtar (/var/lib/hermes-ctrl/.ssh/agos-staging-report, parolasız, 600);
#           root'a ait /etc/ssh/ssh_config.d/50-agos-staging-report.conf (Host agos-staging-report) ve
#           /etc/ssh/ssh_known_hosts içine prod host anahtarı (prod'un kendisinden, güvenilir kanal üzerinden alınır).
#  prod   : 'hermes-report' kullanıcısı (parolasız, kilitli); authorized_keys satırı
#           restrict,from="62.238.35.60",command="sudo -n /usr/local/sbin/agos-staging-report"
#           sudoers: yalnız bu tek betik, argümansız. Betik root:root 755.
# Hermes ne gönderirse göndersin (ssh ... 'rm -rf /') yalnız rapor çalışır; port yönlendirme/pty/agent kapalı.
set -euo pipefail
MODE=plan; case "${1:-}" in --apply) MODE=apply;; --undo) MODE=undo;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
CTRL=${CTRL:-"ssh -o IdentitiesOnly=yes -i $HOME/.ssh/agos-hermes-admin agosadmin@62.238.35.60"}
PROD=${PROD:-"ssh -o BatchMode=yes agos-prod-01"}
CTRL_IP=${CTRL_IP:-62.238.35.60}
PROD_IP=${PROD_IP:-167.233.207.116}
PROD_PORT=${PROD_PORT:-22}
HERE=$(cd "$(dirname "$0")" && pwd)
RPT_B64=$(base64 < "$HERE/agos-staging-report.sh" | tr -d '\n')
say(){ printf '%s\n' "$*"; }

if [ "$MODE" = undo ]; then
  $PROD 'bash -s' <<'EOS'
set -u
pkill -u hermes-report 2>/dev/null; userdel -r hermes-report 2>/dev/null && echo "prod: kullanıcı silindi" || echo "prod: kullanıcı yoktu"
rm -fv /etc/sudoers.d/50-agos-staging-report /usr/local/sbin/agos-staging-report
EOS
  $CTRL 'sudo bash -s' <<'EOS'
set -u
rm -fv /etc/ssh/ssh_config.d/50-agos-staging-report.conf /var/lib/hermes-ctrl/.ssh/agos-staging-report /var/lib/hermes-ctrl/.ssh/agos-staging-report.pub
sed -i '/# agos-staging-report$/d' /etc/ssh/ssh_known_hosts 2>/dev/null; echo "ctrl: kaldırıldı"
EOS
  exit 0
fi

say "== 1) ctrl-01: Hermes anahtarı =="
PUB=$($CTRL "sudo bash -s -- $MODE" <<'EOS'
set -euo pipefail
K=/var/lib/hermes-ctrl/.ssh/agos-staging-report
RU=$(command -v runuser || echo /usr/sbin/runuser)
if [ ! -f "$K" ]; then
  if [ "$1" = apply ]; then
    install -d -m 700 -o hermesrun -g hermesrun /var/lib/hermes-ctrl/.ssh
    "$RU" -u hermesrun -- ssh-keygen -q -t ed25519 -N '' -C "hermes-ctrl-01-agos-staging-report" -f "$K"
  else echo "PLAN:yeni-anahtar-uretilecek"; exit 0; fi
fi
cat "$K.pub"
EOS
)
case "$PUB" in PLAN:*) say "  anahtar YOK → apply'da üretilecek (hermesrun, parolasız, 600)";; ssh-ed25519\ *) say "  anahtar: $(printf '%s\n' "$PUB" | ssh-keygen -lf - | awk '{print $2}')";; *) say "HATA: anahtar okunamadı"; exit 1;; esac

say "== 2) prod: kısıtlı kullanıcı + rapor betiği =="
HOSTKEY=$({ printf 'set -- %q %q %q %q\n' "$MODE" "$PUB" "$RPT_B64" "$CTRL_IP"; cat <<'EOS'
set -euo pipefail
MODE=$1; PUB=$2; B64=$3; CIP=$4; U=hermes-report; S=/usr/local/sbin/agos-staging-report
id "$U" >/dev/null 2>&1 && echo "  kullanıcı $U: VAR" >&2 || echo "  kullanıcı $U: YOK" >&2
[ -f "$S" ] && echo "  rapor betiği: VAR ($(sha256sum "$S" | cut -c1-12))" >&2 || echo "  rapor betiği: YOK" >&2
echo "  yeni betik: $(printf '%s' "$B64" | base64 -d | sha256sum | cut -c1-12)" >&2
if [ "$MODE" = apply ]; then
  id "$U" >/dev/null 2>&1 || useradd -m -s /bin/sh -c "Hermes salt-okunur staging raporu (SEL-329)" "$U"
  usermod -p '*' "$U"     # parola yok, ama pubkey girişi açık
  printf '%s' "$B64" | base64 -d > "$S.tmp"; chown root:root "$S.tmp"; chmod 755 "$S.tmp"; mv "$S.tmp" "$S"
  printf '%s ALL=(root) NOPASSWD: %s ""\n' "$U" "$S" > /etc/sudoers.d/50-agos-staging-report.tmp
  chmod 440 /etc/sudoers.d/50-agos-staging-report.tmp
  visudo -cf /etc/sudoers.d/50-agos-staging-report.tmp >/dev/null && mv /etc/sudoers.d/50-agos-staging-report.tmp /etc/sudoers.d/50-agos-staging-report || { rm -f /etc/sudoers.d/50-agos-staging-report.tmp; echo "HATA sudoers" >&2; exit 1; }
  H=$(getent passwd "$U" | cut -d: -f6); install -d -m 700 -o "$U" -g "$U" "$H/.ssh"
  printf 'restrict,from="%s",command="sudo -n %s" %s\n' "$CIP" "$S" "$PUB" > "$H/.ssh/authorized_keys"
  chown root:"$U" "$H/.ssh/authorized_keys"; chmod 640 "$H/.ssh/authorized_keys"; chown root:"$U" "$H/.ssh"; chmod 750 "$H/.ssh"
  echo "  kuruldu: kullanıcı, betik, sudoers (tek komut), authorized_keys (restrict+from+command; kullanıcı değiştiremez)" >&2
fi
cat /etc/ssh/ssh_host_ed25519_key.pub
EOS
} | $PROD 'bash -s')
HFP=$(printf '%s\n' "$HOSTKEY" | ssh-keygen -lf - | awk '{print $2}')
say "  prod host anahtarı (prod'un kendisinden): $HFP"
say "  Mac known_hosts ile karşılaştırma: $(ssh-keygen -F "$PROD_IP" -l 2>/dev/null | awk '/ED25519/{print $3}' | head -1 | grep -qx "$HFP" && echo AYNI || echo 'FARKLI/YOK (dikkat)')"

say "== 3) ctrl-01: sabit alias + pinned known_hosts =="
{ printf 'set -- %q %q %q %q\n' "$MODE" "$PROD_IP" "$(printf '%s' "$HOSTKEY" | awk '{print $1" "$2}')" "$PROD_PORT"; cat <<'EOS'
set -euo pipefail
MODE=$1; IP=$2; HK=$3; PP=$4
CF=/etc/ssh/ssh_config.d/50-agos-staging-report.conf
[ -f "$CF" ] && echo "  alias: VAR" || echo "  alias: YOK"
if [ "$MODE" = apply ]; then
  cat > "$CF" <<CFG
# SEL-329 G1 — Hermes salt-okunur staging raporu. Kaldırmak: sel433-staging-report-access.sh --undo
Host agos-staging-report
    HostName $IP
    Port $PP
    User hermes-report
    IdentityFile /var/lib/hermes-ctrl/.ssh/agos-staging-report
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    UserKnownHostsFile /dev/null
    GlobalKnownHostsFile /etc/ssh/ssh_known_hosts
    HostKeyAlias agos-staging-report
    ForwardAgent no
    ClearAllForwardings yes
    RequestTTY no
    BatchMode yes
    ConnectTimeout 10
CFG
  chmod 644 "$CF"
  touch /etc/ssh/ssh_known_hosts; sed -i '/# agos-staging-report$/d' /etc/ssh/ssh_known_hosts
  printf 'agos-staging-report %s # agos-staging-report\n' "$HK" >> /etc/ssh/ssh_known_hosts; chmod 644 /etc/ssh/ssh_known_hosts
  echo "  alias + pinned host key yazıldı (root'a ait; Hermes değiştiremez)"
  echo "  config doğrulama (bağlantısız): $(ssh -G agos-staging-report | grep -E '^(hostname|user|identityfile|stricthostkeychecking|globalknownhostsfile|hostkeyalias|clearallforwardings) ' | tr '\n' ';')"
fi
EOS
} | $CTRL 'sudo bash -s'

if [ "$MODE" = plan ]; then say ""; say "PLAN tamam: hiçbir şey değişmedi. Kurmak için --apply."; exit 0; fi

say "== 4) bağlantı testleri (ctrl-01'den, hermesrun olarak) =="
$CTRL 'sudo bash -s' <<'EOS'
set -u
RU=$(command -v runuser || echo /usr/sbin/runuser)
run(){ "$RU" -u hermesrun -- env HOME=/var/lib/hermes-ctrl ssh -n agos-staging-report "$@" 2>&1 </dev/null; }
O=$(run); echo "$O" | head -3 | sed 's/^/  rapor: /'; echo "$O" | grep -q 'AGOS_STAGING_REPORT=DONE' && echo "  TEST1 rapor çalışıyor: PASS" || echo "  TEST1: FAIL"
O=$(run 'id; cat /etc/shadow'); echo "$O" | grep -qE 'uid=|root:' && echo "  TEST2 keyfi komut: FAIL (çalıştı!)" || echo "  TEST2 keyfi komut engellendi (yine yalnız rapor): PASS"
"$RU" -u hermesrun -- env HOME=/var/lib/hermes-ctrl bash -c '
  E=$(mktemp); ssh -n -o ClearAllForwardings=no -N -L 15434:127.0.0.1:5434 agos-staging-report 2>"$E" </dev/null & p=$!
  sleep 3; timeout 3 bash -c "exec 3<>/dev/tcp/127.0.0.1/15434 && head -c1 <&3" >/dev/null 2>&1; sleep 1
  kill $p 2>/dev/null; wait $p 2>/dev/null
  if grep -qiE "prohibited|denied|refused|failed" "$E"; then echo "  TEST3 port yönlendirme engellendi: PASS"; else echo "  TEST3 port yönlendirme: KONTROL ($(tr "\n" " " < "$E" | cut -c1-120))"; fi
  rm -f "$E"'
EOS
say ""
say "APPLY tamam. Hermes artık yalnız 'ssh agos-staging-report' ile raporu alabilir (her çalıştırma Owner onayına düşer)."
say "Kaldırmak için: bash outputs/sel433-staging-report-access.sh --undo"
