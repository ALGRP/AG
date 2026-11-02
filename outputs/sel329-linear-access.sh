#!/usr/bin/env bash
# SEL-329 madde 1 — Hermes'e Linear erişimi, anahtarı Hermes'e GÖSTERMEDEN. MAC'te çalışır.
#   bash outputs/sel329-linear-access.sh             # PLAN
#   bash outputs/sel329-linear-access.sh --apply     # ctrl-01'e kapıyı kur
#   bash outputs/sel329-linear-access.sh --set-key   # Linear API anahtarını GİZLİ gir (ekranda görünmez)
#   bash outputs/sel329-linear-access.sh --test      # salt-okunur test (issue SEL-329 + dry-run yorum + red testleri)
#   bash outputs/sel329-linear-access.sh --undo      # tamamen kaldır
# Tasarım (ctrl-01 içinde):
#   'agos-linear' kullanıcısı: anahtar ~/.linear-api-key (600) yalnız onda. Kapı: /usr/local/bin/agos-linear-gate (root 755).
#   hermesrun → ssh agos-linear '<işlem>'  (127.0.0.1, restrict + forced command). Hermes anahtarı okuyamaz.
#   İzinli işlemler: issue, comments, doc, comment(HERMES: ön ekli, gizli-değer filtreli), reply.
set -euo pipefail
MODE=plan; case "${1:-}" in --apply) MODE=apply;; --undo) MODE=undo;; --set-key) MODE=setkey;; --test) MODE=test;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
CTRL=${CTRL:-"ssh -o IdentitiesOnly=yes -i $HOME/.ssh/agos-hermes-admin agosadmin@62.238.35.60"}
HERE=$(cd "$(dirname "$0")" && pwd)
say(){ printf '%s\n' "$*"; }

if [ "$MODE" = setkey ]; then
  printf 'Linear API anahtarı (gizli): '; read -rs K; echo
  K=$(printf '%s' "$K" | tr -d '[:space:]"'\''')
  [[ "$K" =~ ^lin_api_[A-Za-z0-9]{20,}$ ]] || { say "HATA: 'lin_api_' ile başlayan bir Linear kişisel API anahtarı bekleniyordu; hiçbir şey gönderilmedi"; exit 1; }
  { printf 'IFS= read -r K\n%s\n' "$K"; cat <<'EOS'
set -euo pipefail
id agos-linear >/dev/null 2>&1 || { echo "HATA: önce --apply"; exit 1; }
H=$(getent passwd agos-linear | cut -d: -f6); F="$H/.linear-api-key"
umask 077; printf '%s' "$K" > "$F.tmp"; chown agos-linear:agos-linear "$F.tmp"; chmod 600 "$F.tmp"; mv "$F.tmp" "$F"; unset K
echo "anahtar yazıldı: $F (agos-linear 600; hermesrun okuyamaz: $(runuser -u hermesrun -- test -r "$F" && echo OKUYABİLİYOR-HATA || echo EVET))"
EOS
  } | $CTRL 'sudo bash -s'
  unset K; exit 0
fi

GATE_B64=$(base64 < "$HERE/agos-linear-gate.py" | tr -d '\n')
{ printf 'set -- %q %q\n' "$MODE" "$GATE_B64"; cat <<'EOS'
set -euo pipefail
MODE=$1; B64=$2
U=agos-linear; G=/usr/local/bin/agos-linear-gate
HK=/var/lib/hermes-ctrl/.ssh/agos-linear; CF=/etc/ssh/ssh_config.d/51-agos-linear.conf
RU=$(command -v runuser || echo /usr/sbin/runuser)
hr(){ "$RU" -u hermesrun -- env HOME=/var/lib/hermes-ctrl "$@"; }
if [ "$MODE" = undo ]; then
  pkill -u $U 2>/dev/null || true; userdel -r $U 2>/dev/null && echo "kullanıcı silindi" || echo "kullanıcı yoktu"
  rm -fv "$G" "$CF" "$HK" "$HK.pub"; sed -i '/# agos-linear$/d' /etc/ssh/ssh_known_hosts 2>/dev/null || true; exit 0
fi
echo "== durum =="
echo "  kullanıcı $U: $(id $U >/dev/null 2>&1 && echo VAR || echo YOK)"
echo "  kapı: $([ -f $G ] && sha256sum $G | cut -c1-12 || echo YOK)  yeni: $(printf '%s' "$B64" | base64 -d | sha256sum | cut -c1-12)"
echo "  anahtar dosyası: $(id $U >/dev/null 2>&1 && [ -f "$(getent passwd $U | cut -d: -f6)/.linear-api-key" ] && echo VAR || echo YOK)"
echo "  sshd AllowUsers/AllowGroups: $(sshd -T 2>/dev/null | grep -Ei '^(allowusers|allowgroups) ' | tr '\n' ' ' || true)"
echo "  python3: $(command -v python3 || echo YOK)"
if [ "$MODE" = test ]; then
  echo "== test (hermesrun olarak) =="
  hr ssh -n agos-linear 'issue SEL-329' 2>&1 | head -3 | sed 's/^/  issue: /' || true
  printf 'HERMES:TEST:dry-run:%s\nkapı testi; gönderilmez.\n' "$(date -u +%Y%m%d)" | hr ssh agos-linear 'comment SEL-329 --dry-run' 2>&1 | sed 's/^/  dry-run: /' || true
  printf 'HERMES: id 678400000\n' | hr ssh agos-linear 'comment SEL-329 --dry-run' 2>&1 | sed 's/^/  gizli-filtre (RED beklenir): /' || true
  hr ssh -n agos-linear 'cat /etc/passwd' 2>&1 | head -1 | sed 's/^/  keyfi komut (RED beklenir): /' || true
  hr sh -c 'cat ~agos-linear/.linear-api-key' >/dev/null 2>&1 && echo "  anahtar hermesrun'dan okunabiliyor: HATA" || echo "  anahtar hermesrun'dan okunamıyor: PASS"
  exit 0
fi
[ "$MODE" = plan ] && { echo; echo "PLAN tamam: hiçbir şey değişmedi. Kurmak için --apply."; exit 0; }

# --- APPLY ---
id $U >/dev/null 2>&1 || useradd -m -s /bin/sh -c "Hermes Linear kapısı (SEL-329)" $U
usermod -p '*' $U
H=$(getent passwd $U | cut -d: -f6); chmod 700 "$H"
printf '%s' "$B64" | base64 -d > "$G.tmp"; chown root:root "$G.tmp"; chmod 755 "$G.tmp"; mv "$G.tmp" "$G"
[ -f "$HK" ] || { install -d -m 700 -o hermesrun -g hermesrun /var/lib/hermes-ctrl/.ssh; hr ssh-keygen -q -t ed25519 -N '' -C hermes-ctrl-01-agos-linear -f "$HK"; }
install -d -m 750 -o root -g $U "$H/.ssh"
printf 'restrict,from="127.0.0.1,::1",command="%s" %s\n' "$G" "$(cat "$HK.pub")" > "$H/.ssh/authorized_keys"
chown root:$U "$H/.ssh/authorized_keys"; chmod 640 "$H/.ssh/authorized_keys"
cat > "$CF" <<CFG
# SEL-329 — Hermes Linear kapısı. Kaldırmak: sel329-linear-access.sh --undo
Host agos-linear
    HostName 127.0.0.1
    User agos-linear
    IdentityFile $HK
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    UserKnownHostsFile /dev/null
    GlobalKnownHostsFile /etc/ssh/ssh_known_hosts
    HostKeyAlias agos-linear
    ClearAllForwardings yes
    ForwardAgent no
    RequestTTY no
    BatchMode yes
    ConnectTimeout 10
CFG
chmod 644 "$CF"
touch /etc/ssh/ssh_known_hosts; sed -i '/# agos-linear$/d' /etc/ssh/ssh_known_hosts
printf 'agos-linear %s # agos-linear\n' "$(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)" >> /etc/ssh/ssh_known_hosts
echo "kuruldu: kullanıcı $U, kapı $G, alias agos-linear (pinned host key), hermesrun anahtarı"
O=$(hr ssh -n agos-linear 'cat /etc/passwd' 2>&1 | head -1 || true); case "$O" in GATE_RED*) echo "  keyfi komut engeli: PASS";; *) echo "  keyfi komut engeli: KONTROL ($O)";; esac
echo "Sıradaki: bash outputs/sel329-linear-access.sh --set-key  ve sonra --test"
EOS
} | $CTRL 'sudo bash -s'
