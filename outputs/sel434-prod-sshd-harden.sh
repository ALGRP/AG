#!/usr/bin/env bash
# SEL-434 — prod SSH: parola ile girişi kapat + hermesops'taki fazladan (root ile ortak) anahtarları kaldır.
#   ssh agos-prod-01 'bash -s' < outputs/sel434-prod-sshd-harden.sh            # PLAN
#   ssh agos-prod-01 'bash -s -- --apply' < outputs/sel434-prod-sshd-harden.sh # uygula
# Güvenlik: sshd -t ile sınanır; hata olursa drop-in silinir. Mevcut SSH oturumu KAPANMAZ (reload).
# hermesops'ta yalnız root'ta OLMAYAN anahtarlar (yani agos-prod-readonly) bırakılır.
set -euo pipefail
LC_ALL=C
MODE=plan; [ "${1:-}" = "--apply" ] && MODE=apply
say(){ printf '%s\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "root gerekli"; exit 1; }
DROP=/etc/ssh/sshd_config.d/00-sel434-hardening.conf
H=$(getent passwd hermesops | cut -d: -f6); A="$H/.ssh/authorized_keys"

say "== mevcut sshd =="
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitemptypasswords) ' | sed 's/^/  /'
say "== parola tanımlı (şifreyle girebilecek) kullanıcılar (yalnız ad) =="
awk -F: '($2 !~ /^[!*]/ && $2 != "") {print "  "$1}' /etc/shadow
say "== son 7 günde parola ile başarılı SSH girişi (sayı) =="
say "  $(journalctl -u ssh -u sshd --since '-7 days' --no-pager 2>/dev/null | grep -c 'Accepted password' || true)"
say "  (0 değilse: biri parola ile giriyor; kapatmadan önce o kişiye anahtar verin)"

mapfile -t ROOTFP < <(ssh-keygen -lf /root/.ssh/authorized_keys 2>/dev/null | awk '{print $2}')
say "== hermesops anahtarları =="
keep=0; drop=0
while IFS= read -r l; do
  [ -z "$l" ] && continue; case "$l" in \#*) continue;; esac
  fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}' || true)
  if printf '%s\n' "${ROOTFP[@]}" | grep -qxF "$fp"; then say "  $fp -> KALDIRILACAK (root ile ortak)"; drop=$((drop+1)); else say "  $fp -> KALIR"; keep=$((keep+1)); fi
done < "$A"
[ "$keep" -ge 1 ] || { say "HATA: hermesops'ta root'tan bağımsız anahtar yok; önce sel434-prod-ssh-split.sh. Dur."; exit 1; }

say "== eklenecek drop-in ($DROP) =="
CONF='# SEL-434 — Owner onaylı. Geri almak için bu dosyayı silip: systemctl reload ssh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password'
printf '%s\n' "$CONF" | sed 's/^/  /'
grep -qE '^\s*Include\s+/etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config && say "Include sshd_config.d: VAR" || say "UYARI: sshd_config Include satırı yok; drop-in etkisiz olabilir"

if [ "$MODE" = plan ]; then say ""; say "PLAN tamam: hiçbir şey değişmedi. Uygulamak için --apply."; exit 0; fi

TS=$(date -u +%Y%m%d-%H%M%S)
printf '%s\n' "$CONF" > "$DROP"; chmod 644 "$DROP"
if ! sshd -t; then rm -f "$DROP"; say "HATA: sshd -t başarısız; drop-in silindi, değişiklik yok"; exit 1; fi
systemctl reload ssh 2>/dev/null || systemctl reload sshd
say "sshd reload: OK"
sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) ' | sed 's/^/  yeni: /'

cp -p "$A" "$A.bak-sel434-$TS"; T=$(mktemp)
while IFS= read -r l; do
  fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}' || true)
  if [ -n "$fp" ] && printf '%s\n' "${ROOTFP[@]}" | grep -qxF "$fp"; then continue; fi
  printf '%s\n' "$l" >> "$T"
done < "$A"
cat "$T" > "$A"; rm -f "$T"
say "hermesops: kaldırılan=$drop kalan=$(ssh-keygen -lf "$A" 2>/dev/null | wc -l) yedek=$A.bak-sel434-$TS"
say ""
say "APPLY tamam. ŞİMDİ bu oturumu kapatmadan Mac'ten YENİ bir terminalde test edin:"
say "  ssh agos-prod-01 'echo root-ok'   ve   ssh agos-prod-readonly 'echo ro-ok'"
say "Geri alma: rm $DROP && systemctl reload ssh ; cp -p $A.bak-sel434-$TS $A"
