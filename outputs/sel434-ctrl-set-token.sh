#!/bin/bash
# SEL-434 — Yeni Telegram bot token'ını ctrl-01 agosprod .env'ye GİZLİ yazar (Mac'te çalışır).
#   bash outputs/sel434-ctrl-set-token.sh
# Token ekrana, argv'ye veya geçmişe düşmez; ssh stdin'i ile sunucuya gider. Sunucuda yedek alınır,
# yalnız TELEGRAM_BOT_TOKEN satırı değişir, sahip/mod korunur. Ardından K6 pin'ini --repin ile güncelleyin.
set -euo pipefail
SSH=(ssh -o IdentitiesOnly=yes -i "$HOME/.ssh/agos-hermes-admin" agosadmin@62.238.35.60)
printf 'Yeni token (gizli): '; read -rs TK; echo
TK=$(printf '%s' "$TK" | tr -d ' \t\r\n"'"'"'')
if ! [[ "$TK" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]]; then
  L=${#TK}; C=$([[ "$TK" == *:* ]] && echo VAR || echo YOK); D=$([[ "$TK" =~ ^[0-9]+: ]] && echo EVET || echo HAYIR)
  unset TK; echo "HATA: token formatı beklenmedik; hiçbir şey gönderilmedi (ipucu: uzunluk=$L, ':' $C, rakamla başlıyor=$D; beklenen ~45-46 karakter, örn. 123456789:AAH...)"; exit 2
fi
printf '%s' "$TK" | "${SSH[@]}" 'sudo /opt/hermes-ctrl/current/venv/bin/python -I -c '"'"'
import sys, os, re, shutil, datetime
tok = sys.stdin.read().strip()
P = "/var/lib/hermes-ctrl/profiles/agosprod/.env"
if not re.fullmatch(r"\d{6,}:[A-Za-z0-9_-]{30,}", tok): sys.exit("HATA: format; dosya DEGISMEDI")
L = open(P).read().split("\n"); n = 0
for i, l in enumerate(L):
    m = re.match(r"(\s*(?:export\s+)?TELEGRAM_BOT_TOKEN=)(.*)", l)
    if m:
        v = m.group(2).strip(); q = v[0] if v[:1] in (chr(34), chr(39)) else ""
        L[i] = m.group(1) + q + tok + q; n += 1
if n != 1: sys.exit("HATA: TELEGRAM_BOT_TOKEN satiri %d adet; dosya DEGISMEDI" % n)
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S"); B = "/var/lib/hermes-ctrl/backups-sel434/env-before-token-" + ts
shutil.copy2(P, B); os.chmod(B, 0o600)
st = os.stat(P); t = P + ".tmp-" + ts
open(t, "w").write("\n".join(L)); os.chown(t, st.st_uid, st.st_gid); os.chmod(t, st.st_mode & 0o777); os.replace(t, P)
print("OK: sunucuda token guncellendi (1 satir); yedek:", B)
'"'"''
unset TK
