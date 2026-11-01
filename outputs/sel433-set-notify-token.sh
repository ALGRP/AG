#!/usr/bin/env bash
# SEL-433 — Rezervasyon bildirim botunun token'ını prod'a GİZLİ yaz. MAC'te çalışır.
#   bash outputs/sel433-set-notify-token.sh            # token sorar, uygular, doğrular
#   bash outputs/sel433-set-notify-token.sh --test     # ayrıca izinli sohbete 1 test mesajı gönderir
# Token: ekranda görünmez (read -s), argv'ye girmez; ssh stdin'inde betiğin 2. satırı olarak gider.
# Sunucuda: worker'ın TELEGRAM_BOT_TOKEN_FILE dosyası (host yolu mount'tan bulunur) yedeklenir,
# aynı sahip/izinle değiştirilir; api+worker yeniden başlatılır; getMe ile doğrulanır.
set -euo pipefail
TEST=0; [ "${1:-}" = "--test" ] && TEST=1
HOST=${PROD_HOST:-agos-prod-01}
HERMES_SHA_PREFIX=4f15192b0e74   # ctrl-01 Hermes token'ının sha256 öneki (değer değil)
sha12(){ if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi | cut -c1-12; }

printf 'Rezervasyon bildirim botu token (gizli): '; read -rs TK; echo
TK=$(printf '%s' "$TK" | tr -d '[:space:]"'\''')
[[ "$TK" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]] || { echo "HATA: token formatı beklenmedik; hiçbir şey gönderilmedi"; exit 1; }
if [ "$(printf '%s' "$TK" | sha12)" = "$HERMES_SHA_PREFIX" ]; then
  echo "UYARI: Bu token Hermes botuyla AYNI (aynı bot iki sistemde). Ayrı bildirim botu önerilir."
  printf 'Yine de devam? (evet/hayır): '; read -r a; [ "$a" = "evet" ] || { echo "İptal, hiçbir şey değişmedi."; exit 1; }
fi

REMOTE=$(cat <<'EOS'
set -euo pipefail
TEST=${1:-0}
WK=agos-reservation-worker; API=agos-reservation-api
[[ "$TOK" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]] || { echo "HATA: token alınamadı"; exit 1; }
TF=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $WK | sed -n 's/^TELEGRAM_BOT_TOKEN_FILE=//p')
[ -n "$TF" ] || { echo "HATA: TELEGRAM_BOT_TOKEN_FILE yok"; exit 1; }
# Konteyner yolunu host yoluna çevir (en uzun eşleşen mount)
HP=$(docker inspect -f '{{range .Mounts}}{{.Source}}|{{.Destination}}{{println}}{{end}}' $WK | awk -F'|' -v t="$TF" 'NF==2 && index(t,$2)==1 && length($2)>m {m=length($2); s=$1; d=$2} END{ if(m) print s substr(t, length(d)+1) }')
[ -n "$HP" ] && [ -f "$HP" ] || { echo "HATA: host dosyası bulunamadı (konteyner yolu: $TF)"; exit 1; }
echo "token dosyası (host): $HP  izin=$(stat -c '%a %U:%G' "$HP")"
API_TF=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $API | sed -n 's/^TELEGRAM_BOT_TOKEN_FILE=//p')
[ "$API_TF" = "$TF" ] && echo "api aynı dosyayı kullanıyor: EVET" || echo "UYARI: api farklı token dosyası kullanıyor ($API_TF)"
TS=$(date -u +%Y%m%d-%H%M%S); BK="$HP.bak-sel433-$TS"
cp -p "$HP" "$BK"; chmod 600 "$BK"
printf '%s' "$TOK" > "$HP.tmp"; chown --reference="$HP" "$HP.tmp"; chmod --reference="$HP" "$HP.tmp"; mv "$HP.tmp" "$HP"
echo "yazıldı; yedek: $BK (eski token, iptal edilmiş)"
docker restart $API $WK >/dev/null; echo "api+worker yeniden başlatıldı"
for i in $(seq 1 30); do
  h1=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $API); h2=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $WK)
  [ "$h1" = healthy ] && [ "$h2" = healthy ] && break; sleep 2
done
echo "sağlık: api=$h1 worker=$h2"
T2=$(docker exec $WK sh -c "cat '$TF'" | tr -d '[:space:]')
[ "$T2" = "$TOK" ] && echo "konteyner yeni token'ı görüyor: EVET" || echo "UYARI: konteyner içindeki dosya farklı"
printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$TOK" | curl -s -m 8 -K - | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d.get("result",{}); print("getMe ok=%s bot=@%s" % (d.get("ok"), r.get("username")))' 2>/dev/null || echo "getMe: yanıt alınamadı"
if [ "$TEST" = 1 ]; then
  CID=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $WK | sed -n 's/^TELEGRAM_ALLOWED_CHAT_IDS=//p' | tr ',; ' '\n\n\n' | grep -E '^-?[0-9]+$' | head -1)
  { printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TOK"; printf 'data-urlencode = "chat_id=%s"\n' "$CID"; printf 'data-urlencode = "text=AGOS rezervasyon bildirim testi (SEL-433). Bu mesajı görüyorsanız bildirimler çalışıyor."\n'; } \
    | curl -s -m 8 -K - | python3 -c 'import sys,json; d=json.load(sys.stdin); print("test mesajı: ok=%s %s" % (d.get("ok"), d.get("description","")))' 2>/dev/null || echo "test mesajı: yanıt alınamadı"
fi
unset TOK T2
echo "Geri alma: cp -p $BK $HP && docker restart $API $WK"
EOS
)
{ printf 'IFS= read -r TOK\n%s\n' "$TK"; printf '%s\n' "$REMOTE"; } | ssh -o BatchMode=yes "$HOST" "bash -s -- $TEST"
unset TK
