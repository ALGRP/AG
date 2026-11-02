#!/usr/bin/env bash
# SEL-434 — prod'da hermesops (salt-okunur) ile root'un ortak SSH anahtarını ayır. MAC'te çalışır.
#   bash outputs/sel434-prod-ssh-split.sh            # PLAN (hiçbir şey değişmez)
#   bash outputs/sel434-prod-ssh-split.sh --apply    # uygular
# Adımlar (apply): yeni ed25519 anahtar (~/.ssh/agos-prod-readonly) → hermesops authorized_keys'e
# ESKİ satırın seçenekleriyle (command=/restrict vb. korunur) eklenir → yeni anahtarla test →
# eski (root) anahtar hermesops'tan kaldırılır → root girişi ve hermesops girişi yeniden test →
# ~/.ssh/config'te agos-prod-readonly yeni anahtara çevrilir. Her dosyanın yedeği alınır.
# Özel anahtar hiçbir yere gönderilmez; sunucuya yalnız .pub gider.
set -euo pipefail
MODE=plan; [ "${1:-}" = "--apply" ] && MODE=apply
ROOTH=${ROOTH:-agos-prod-01}
OLDK=~/.ssh/agos-prod-01
NEWK=~/.ssh/agos-prod-readonly
HOST=${HOST:-167.233.207.116}
say(){ printf '%s\n' "$*"; }

[ -f "$OLDK.pub" ] || ssh-keygen -y -f "$OLDK" > /dev/null || { say "eski anahtar okunamadı"; exit 1; }
OLDFP=$( { [ -f "$OLDK.pub" ] && ssh-keygen -lf "$OLDK.pub" || ssh-keygen -y -f "$OLDK" | ssh-keygen -lf -; } | awk '{print $2}')
say "eski (root) anahtar parmak izi: $OLDFP"

say "== sunucudaki durum (root ile, yalnız okuma) =="
ssh -o BatchMode=yes "$ROOTH" 'bash -s' <<'EOS'
H=$(getent passwd hermesops | cut -d: -f6); A="$H/.ssh/authorized_keys"
echo "hermesops_home=$H authorized_keys=$( [ -f "$A" ] && stat -c '%a %U:%G' "$A" || echo YOK)"
[ -f "$A" ] && while IFS= read -r l; do
  [ -z "$l" ] && continue; case "$l" in \#*) continue;; esac
  fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}' || true)
  if printf '%s\n' "$l" | grep -Eq '^(ssh-|ecdsa-|sk-)'; then o=""; else o=$(printf '%s\n' "$l" | sed -E 's/ +(ssh-|ecdsa-|sk-)[a-z0-9@.-]+ [A-Za-z0-9+\/]+=* ?.*$//'); fi
  echo "  hermesops_key fp=$fp secenek=${o:--}" | cut -c1-160
done < "$A"
for l in $(ssh-keygen -lf /root/.ssh/authorized_keys 2>/dev/null | awk '{print $2}'); do echo "  root_key fp=$l"; done
echo "sshd: $(sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication) ' | tr '\n' ' ')"
EOS

if [ "$MODE" = plan ]; then
  say ""
  say "PLAN: eski parmak izi hermesops listesinde görünüyorsa --apply onu yeni anahtarla değiştirir."
  say "root anahtarına DOKUNULMAZ. hiçbir şey değişmedi."
  exit 0
fi

# ---- APPLY ----
if [ ! -f "$NEWK" ]; then
  say "== yeni anahtar üretiliyor ($NEWK). Parola (passphrase) sorulursa güçlü bir parola girin. =="
  ssh-keygen -t ed25519 -a 100 -f "$NEWK" -C "agos-prod-readonly-$(date +%Y%m%d)"
fi
NEWFP=$(ssh-keygen -lf "$NEWK.pub" | awk '{print $2}')
say "yeni anahtar parmak izi: $NEWFP"
ssh-add "$NEWK" 2>/dev/null || true

say "== hermesops'a yeni anahtar ekleniyor (eski satırın seçenekleri korunur) =="
ssh -o BatchMode=yes "$ROOTH" "bash -s -- $(printf %q "$OLDFP") $(printf %q "$(cat "$NEWK.pub")")" <<'EOS'
set -euo pipefail
OLDFP=$1; NEWPUB=$2
H=$(getent passwd hermesops | cut -d: -f6); A="$H/.ssh/authorized_keys"
TS=$(date -u +%Y%m%d-%H%M%S); cp -p "$A" "$A.bak-sel434-$TS"
opts=""; found=0
while IFS= read -r l; do
  fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}' || true)
  if [ "$fp" = "$OLDFP" ]; then found=1; if printf '%s\n' "$l" | grep -Eq '^(ssh-|ecdsa-|sk-)'; then o=""; else o=$(printf '%s\n' "$l" | sed -E 's/ +(ssh-|ecdsa-|sk-)[a-z0-9@.-]+ [A-Za-z0-9+\/]+=* ?.*$//'); fi; opts=$o; fi
done < "$A"
newfp=$(printf '%s\n' "$NEWPUB" | ssh-keygen -lf - | awk '{print $2}')
if ! { ssh-keygen -lf "$A" 2>/dev/null || true; } | awk '{print $2}' | grep -qx "$newfp"; then
  printf '%s%s\n' "${opts:+$opts }" "$NEWPUB" >> "$A"
fi
echo "eski_anahtar_hermesops_listesinde=$found secenek_kopyalandi=$( [ -n "$opts" ] && echo EVET || echo YOK) yedek=$A.bak-sel434-$TS"
EOS

say "== test: yeni anahtarla hermesops =="
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$NEWK" "hermesops@$HOST" 'echo "hermesops_yeni_anahtar=OK uid=$(id -u)"' \
  || { say "HATA: yeni anahtarla giriş olmadı; eski anahtar KALDIRILMADI. Dur."; exit 1; }

say "== eski (root) anahtar hermesops'tan kaldırılıyor =="
ssh -o BatchMode=yes "$ROOTH" "bash -s -- $(printf %q "$OLDFP")" <<'EOS'
set -euo pipefail
OLDFP=$1
H=$(getent passwd hermesops | cut -d: -f6); A="$H/.ssh/authorized_keys"; T=$(mktemp)
n=0
while IFS= read -r l; do
  fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}' || true)
  if [ -n "$fp" ] && [ "$fp" = "$OLDFP" ]; then n=$((n+1)); continue; fi
  printf '%s\n' "$l" >> "$T"
done < "$A"
cat "$T" > "$A"; rm -f "$T"   # cat > ile sahip/izin korunur
echo "kaldirilan_satir=$n kalan_anahtar=$(ssh-keygen -lf "$A" 2>/dev/null | wc -l)"
EOS

say "== doğrulama =="
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$NEWK" "hermesops@$HOST" 'echo "hermesops+yeni=OK"' || say "hermesops+yeni=FAIL"
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$OLDK" "hermesops@$HOST" true 2>/dev/null && say "hermesops+eski=HALA_GIRIYOR (FAIL)" || say "hermesops+eski=REDDEDILDI (OK)"
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$OLDK" "root@$HOST" 'echo "root+eski=OK"' || say "root+eski=FAIL (root girişini kontrol edin!)"

say "== ~/.ssh/config güncelleniyor =="
CFG=~/.ssh/config; cp -p "$CFG" "$CFG.bak-sel434-$(date +%Y%m%d-%H%M%S)"
python3 - "$CFG" <<'PY'
import sys,re,os
p=sys.argv[1]; L=open(p).read().split('\n'); out=[]; inblk=False; done_id=False; has_io=False
for l in L:
    m=re.match(r'\s*Host\s+(.+)',l,re.I)
    if m:
        if inblk and not has_io: out.append('    IdentitiesOnly yes')
        inblk = 'agos-prod-readonly' in m.group(1).split(); has_io=False
    elif inblk and re.match(r'\s*IdentityFile\s',l,re.I):
        l='    IdentityFile ~/.ssh/agos-prod-readonly'; done_id=True
    elif inblk and re.match(r'\s*IdentitiesOnly\s',l,re.I):
        has_io=True
    out.append(l)
if inblk and not has_io: out.append('    IdentitiesOnly yes')
open(p,'w').write('\n'.join(out)); print('config: agos-prod-readonly ->', 'agos-prod-readonly anahtarı' if done_id else 'IdentityFile bulunamadı!')
PY
ssh -o BatchMode=yes agos-prod-readonly 'echo "agos-prod-readonly (config)=OK"'
say ""
say "APPLY tamam. Geri dönüş: sunucuda hermesops authorized_keys yedeği (.bak-sel434-*) ve ~/.ssh/config.bak-sel434-*"
