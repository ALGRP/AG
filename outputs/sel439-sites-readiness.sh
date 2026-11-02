#!/usr/bin/env bash
# SEL-439 / adım 0 — 5 sitenin rezervasyon + WhatsApp + SEO hazırlık DENETİMİ. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'sudo bash -s' < outputs/sel439-sites-readiness.sh
# Ne yapar: her domain için herkese açık sayfaları okur (curl GET), statik sürüm klasöründe dosya sayar,
#           veritabanlarında yalnız "hangi domainden kaç kayıt" sayımı yapar.
# Ne yapmaz: form göndermez, dosya/servis/DB değiştirmez, mesaj atmaz.
# Yazdırılmaz: telefon numarası (WhatsApp linkindeki numara <NUM> olur), müşteri verisi, token, env değeri.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
scrub(){ sed -E -e 's/[0-9]{6,}/<NUM>/g' -e 's/[A-Za-z0-9_+\/=-]{32,}/<GİZLİ>/g' -e 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}/<EPOSTA>/g'; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
DOMAINS="alanyagroup.com antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com"
UA="AGOS-readiness-check/1.0 (+read-only)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
get(){ curl -sS -L --max-time 20 -A "$UA" -o "$2" -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
cnt(){ grep -ciE "$1" "$2" 2>/dev/null || true; }
say "SEL439_SITES_READINESS v1  zaman=$(date -u +%FT%TZ)  host=$(hostname)  LIVE_CHANGED=NO"

for D in $DOMAINS; do
  sec "SİTE: $D"
  H="$T/$D.home.html"
  code=$(get "https://$D/" "$H")
  say "ana sayfa: http=$code  boyut=$(wc -c < "$H" 2>/dev/null || echo 0)B  lang=$(grep -oiE '<html[^>]*lang="[^"]+"' "$H" | head -1 | grep -oE 'lang="[^"]+"' | tr -d '"' | sed 's/lang=//')"
  say "  title: $(grep -oiE '<title>[^<]{0,120}' "$H" | head -1 | sed 's/<title>//I' | scrub)"
  say "  meta description: $( [ "$(cnt '<meta[^>]+name="description"' "$H")" -gt 0 ] && echo VAR || echo YOK )  canonical: $(grep -oiE '<link[^>]+rel="canonical"[^>]*>' "$H" | grep -oE 'href="[^"]+"' | head -1 | sed 's/href=//' | tr -d '"')"
  say "  hreflang: $(cnt 'hreflang=' "$H")  json-ld blok: $(cnt 'application/ld\+json' "$H")  şema tipleri: $(grep -oE '"@type" *: *"[A-Za-z]+"' "$H" | sed -E 's/.*"([A-Za-z]+)"$/\1/' | sort -u | tr '\n' ' ')"
  say "  robots meta noindex: $( [ "$(cnt '<meta[^>]+name="robots"[^>]+noindex' "$H")" -gt 0 ] && echo EVET-DİKKAT || echo hayır )  GSC doğrulama meta: $( [ "$(cnt 'google-site-verification' "$H")" -gt 0 ] && echo VAR || echo YOK )  Bing doğrulama: $( [ "$(cnt 'msvalidate.01' "$H")" -gt 0 ] && echo VAR || echo YOK )  Yandex: $( [ "$(cnt 'yandex-verification' "$H")" -gt 0 ] && echo VAR || echo YOK )"
  say "  analitik: GA4=$( [ "$(cnt 'gtag\(|googletagmanager.com/gtag' "$H")" -gt 0 ] && echo VAR || echo YOK ) GTM=$( [ "$(cnt 'googletagmanager.com/gtm.js|GTM-' "$H")" -gt 0 ] && echo VAR || echo YOK ) YandexMetrica=$( [ "$(cnt 'mc.yandex' "$H")" -gt 0 ] && echo VAR || echo YOK )"
  # rezervasyon formu ve WhatsApp
  say "  rezervasyon: form etiketi=$(cnt '<form' "$H")  ag_booking/booking-widget izi=$(cnt 'ag_booking|booking-widget|data-booking|bookingForm|ag-booking' "$H")  app.js=$(grep -oE 'src="[^"]*app\.js[^"]*"' "$H" | head -1 | sed 's/src=//' | tr -d '"')"
  WA="$T/$D.wa"; grep -oiE 'https?://(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/[^"'"'"' <>]*' "$H" | sort -u > "$WA"
  say "  WhatsApp link: adet=$(wc -l < "$WA")  ön-dolu metin(text=) olan=$(grep -c 'text=' "$WA")  grup(chat.)=$(grep -c 'chat\.whatsapp' "$WA")"
  python3 - "$WA" "$D" <<'PY' 2>/dev/null | scrub | head -5
import sys,urllib.parse,re
dom=sys.argv[2]; seen=set()
for u in open(sys.argv[1]).read().split():
    q=urllib.parse.urlparse(u); t=urllib.parse.parse_qs(q.query).get('text',[''])[0]
    num=re.sub(r'\D','',q.path) or re.sub(r'\D','',urllib.parse.parse_qs(q.query).get('phone',[''])[0])
    key=(num[-4:],t[:60])
    if key in seen: continue
    seen.add(key)
    tag = 'EVET' if (dom.split('.')[0] in t.lower() or dom in t.lower() or re.search(r'\[[A-Z]{2,5}[-: \]]', t)) else 'HAYIR'
    print("    numara_son4=%s  metin=%r  site_etiketi=%s" % ('****'+num[-4:] if num else '-', t[:80], tag))
PY
  # robots, sitemap, llms
  R="$T/$D.robots"; rc=$(get "https://$D/robots.txt" "$R")
  say "  robots.txt: http=$rc  Disallow:/ (tüm site)=$(grep -ciE '^disallow: */ *$' "$R")  Sitemap satırı=$(cnt '^sitemap:' "$R")  AI bot engeli(GPTBot|ClaudeBot|Google-Extended|CCBot)=$(cnt 'GPTBot|ClaudeBot|Google-Extended|CCBot' "$R")  AI arama izinli(OAI-SearchBot|Claude-SearchBot|PerplexityBot)=$(cnt 'OAI-SearchBot|Claude-SearchBot|PerplexityBot' "$R")"
  SM_URL=$(grep -iE '^sitemap:' "$R" | head -1 | awk '{print $2}' | tr -d '\r'); [ -n "$SM_URL" ] || SM_URL="https://$D/sitemap.xml"
  S="$T/$D.sitemap"; sc=$(get "$SM_URL" "$S")
  say "  sitemap: $SM_URL http=$sc  <url>=$(grep -o '<url>' "$S" | wc -l)  alt-sitemap=$(grep -o '<sitemap>' "$S" | wc -l)  lastmod(son)=$(grep -oE '<lastmod>[^<]+' "$S" | sed 's/<lastmod>//' | sort | tail -1)"
  for f in llms.txt llms-full.txt; do
    L="$T/$D.$f"; lc=$(get "https://$D/$f" "$L")
    say "  $f: http=$lc  satır=$(wc -l < "$L" 2>/dev/null || echo 0)  başlık(# )=$(grep -c '^# ' "$L")  link=$(grep -cE '\]\(https?://' "$L")  biçim=$( [ "$lc" = 200 ] && { grep -q '^# ' "$L" && grep -qE '\]\(https?://' "$L" && echo llmstxt.org || echo düz-metin; } || echo - )"
  done
  ic=$(get "https://$D/indexnow-key.txt" "$T/x"); say "  IndexNow anahtar dosyası (indexnow-key.txt): http=$ic"
done

sec "statik uydu siteler: yayın klasörü (dosya sayıları)"
REL=$(ls -1dt /opt/agos/releases/ag-multidomain-static-* 2>/dev/null | head -1)
if [ -n "$REL" ]; then
  say "son sürüm klasörü: $(basename "$REL")  çalışan konteyner(ler): $(docker ps --format '{{.Names}} {{.Image}}' | grep -E 'transfer-sites|multidomain' | tr '\n' ';')"
  for D in antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com; do
    d=$(find "$REL" -maxdepth 3 -type d -name "$D" 2>/dev/null | head -1)
    if [ -n "$d" ]; then
      say "  $D: html=$(find "$d" -name '*.html' | wc -l)  form içeren html=$(grep -lis '<form' $(find "$d" -name '*.html') 2>/dev/null | wc -l)  dil klasörleri=$(find "$d" -maxdepth 1 -mindepth 1 -type d -printf '%f ' | head -c 200)"
    else say "  $D: klasör bulunamadı (yapı farklı olabilir)"; fi
  done
  say "--- sürüm klasörü üst yapısı (ilk 2 seviye, yalnız klasör adları):"
  find "$REL" -maxdepth 2 -mindepth 1 -type d -printf '  %P\n' 2>/dev/null | head -30
else say "  /opt/agos/releases/ag-multidomain-static-* YOK"; fi

sec "kaynak takibi: rezervasyon hangi siteden geldi (yalnız sayım)"
TP=$(docker ps --format '{{.Names}}' | grep -E 'transfer-platform-db' | head -1)
C=agos-reservation-postgres
dq(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$2" "$1" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-160 | scrub; }
if [ -n "$TP" ]; then
  COLS=$(dq "$TP" "select string_agg(column_name,' ') from information_schema.columns where table_name='reservations' and column_name ~ '(domain|landing|site|brand|channel|utm|referr|source)'")
  say "transfer-platform reservations kaynak kolonları: $COLS"
  for col in $COLS; do
    say "--- $col (değer | adet | son) — son 30 gün:"
    dq "$TP" "select case when length(coalesce(\"$col\"::text,'NULL'))>60 then '<uzun>' else coalesce(\"$col\"::text,'NULL') end, count(*), to_char(max(created_at),'MM-DD') from reservations where created_at > now()-interval '30 days' group by 1 order by 2 desc limit 12" | sed 's/^/  /'
  done
fi
say "--- canonical: source_system | source_account_id | adet (son 30 gün)"
dq "$C" "select source_system, source_account_id, count(*) from reservations where created_at > now()-interval '30 days' group by 1,2 order by 3 desc" | sed 's/^/  /'
say "--- canonical reservations kaynak/domain kolonları:"
dq "$C" "select string_agg(column_name,' ') from information_schema.columns where table_name='reservations' and column_name ~ '(domain|landing|site|brand|channel|utm|referr|attribution)'" | sed 's/^/  /'
say "--- telegram.notify payload'ında domain alanı geçen iş sayısı / toplam:"
dq "$C" "select count(*) filter (where payload::text ~* '(landing|source_domain|domain|site)'), count(*) from outbox_jobs where type='telegram.notify'" | sed 's/^/  /'

sec "son"
say "SEL439_SITES_READINESS=DONE  LIVE_CHANGED=NO"
