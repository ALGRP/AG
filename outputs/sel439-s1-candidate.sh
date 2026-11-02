#!/usr/bin/env bash
# SEL-439 / S1 — 4 uydu site için ADAY paket: WhatsApp CTA (site kodu + sayfa), robots Sitemap satırı, llms.txt.
#   PLAN  (salt-okunur; hiçbir şey yazmaz):  ssh agos-prod-01 'WA_NUMBER=<rakamlar> bash -s' < outputs/sel439-s1-candidate.sh
#   STAGE (yalnız aday klasörü yazar; canlı servis DEĞİŞMEZ):  ... 'WA_NUMBER=<rakamlar> bash -s -- --stage' < ...
# Karar: D-WA-20261102-01 (ortak hat, mesajda kaynak domain + sayfa). Standart: AGNET-SEO v1.0 (SEL-441).
# Canlıya geçiş (switch) bu betikte YOK: plan çıktısındaki sunum yöntemi görüldükten sonra ayrı betik + Owner-L3.
# Numara çıktıda maskelenir (****6905 biçimi). Müşteri verisi okunmaz.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
MODE=plan; [ "${1:-}" = "--stage" ] && MODE=stage
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
WA="${WA_NUMBER:-}"; WA="${WA//[^0-9]/}"
[ ${#WA} -ge 10 ] || { say "HATA: WA_NUMBER verilmedi ya da geçersiz (yalnız rakam, ülke koduyla). D-WA-20261102-01 hattını verin."; exit 1; }
say "SEL439_S1_CANDIDATE v1  mod=$MODE  zaman=$(date -u +%FT%TZ)  wa=****${WA: -4}  LIVE_CHANGED=NO"
DOMAINS="antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

sec "1) canlı sunum zinciri: Caddy → konteyner → kök dizin"
CADDY=$(docker ps --format '{{.Names}}' | grep -E '^agos-caddy$' | head -1)
[ -n "$CADDY" ] || { say "HATA: agos-caddy çalışmıyor"; exit 1; }
CF=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")
say "  Caddyfile (host): ${CF:-bağlı-değil}  sha12=$( [ -n "$CF" ] && sha256sum "$CF" | cut -c1-12 )"
docker exec "$CADDY" caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null > "$T/caddy.json" || { say "HATA: caddy adapt"; exit 1; }
python3 - "$T/caddy.json" $DOMAINS > "$T/upstreams" <<'PY'
import json,sys
cfg=json.load(open(sys.argv[1])); doms=sys.argv[2:]
res={}
def walk(routes,hosts):
    for r in routes or []:
        h=set(hosts)
        for m in r.get('match',[]) or []:
            for x in m.get('host',[]) or []: h.add(x)
        for hd in r.get('handle',[]) or []:
            if hd.get('handler')=='reverse_proxy':
                ups=[u.get('dial') for u in hd.get('upstreams',[])]
                for d in doms:
                    if d in h or 'www.'+d in h: res.setdefault(d,('proxy',ups))
            elif hd.get('handler')=='file_server' or hd.get('handler')=='vars' and 'root' in hd:
                for d in doms:
                    if d in h or 'www.'+d in h: res.setdefault(d,('file',[hd.get('root','?')]))
            elif hd.get('handler')=='subroute':
                walk(hd.get('routes'),h)
for srv in cfg.get('apps',{}).get('http',{}).get('servers',{}).values():
    walk(srv.get('routes'),set())
for d in doms:
    k,v=res.get(d,('YOK',[]))
    print(d,k,','.join(x for x in v if x))
PY
cat "$T/upstreams" | sed 's/^/  /'

sec "2) kaynak ağacını kopyala (docker cp; canlıya dokunmaz) ve canlıyla karşılaştır"
: > "$T/sources"
while read -r D KIND UP; do
  if [ "$KIND" != proxy ]; then say "  $D: sunum türü=$KIND → bu betik yalnız reverse_proxy → statik konteyner yolunu destekler; DURDU"; continue; fi
  HOSTPART=${UP%%:*}
  C=$(docker ps --format '{{.Names}}' | grep -Fx "$HOSTPART" | head -1)
  if [ -z "$C" ]; then  # IP ile bağlıysa konteyneri IP'den bul
    for c in $(docker ps --format '{{.Names}}'); do docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$c" | grep -qw "$HOSTPART" && C=$c && break; done
  fi
  [ -n "$C" ] || { say "  $D: upstream $UP için konteyner bulunamadı"; continue; }
  IMG=$(docker inspect -f '{{.Config.Image}}' "$C")
  NGX=$(docker exec "$C" sh -c 'nginx -T 2>/dev/null' || true)
  ROOT=$(printf '%s\n' "$NGX" | python3 -c '
import sys,re
d=sys.argv[1]; t=sys.stdin.read()
for blk in re.split(r"\bserver\s*\{",t)[1:]:
    sn=re.search(r"server_name\s+([^;]+);",blk); rt=re.search(r"\broot\s+([^;]+);",blk)
    if sn and rt and (d in sn.group(1).split() or "www."+d in sn.group(1).split()): print(rt.group(1).strip()); break
else:
    m=re.search(r"\broot\s+([^;]+);",t); print(m.group(1).strip() if m else "/usr/share/nginx/html")
' "$D")
  ROOT=${ROOT//\$host/$D}
  MNT=$(docker inspect -f '{{range .Mounts}}{{.Source}}=>{{.Destination}} {{end}}' "$C")
  mkdir -p "$T/src/$D"
  docker cp "$C:$ROOT/." "$T/src/$D/" >/dev/null 2>&1 || { say "  $D: docker cp $C:$ROOT başarısız"; continue; }
  [ -f "$T/src/$D/index.html" ] || { [ -d "$T/src/$D/$D" ] && { mv "$T/src/$D" "$T/x"; mv "$T/x/$D" "$T/src/$D"; rm -rf "$T/x"; }; }
  curl -sS -L --max-time 20 -o "$T/$D.live" "https://$D/" 2>/dev/null
  M=$( [ "$(sha256sum < "$T/$D.live" | cut -c1-12)" = "$(sha256sum < "$T/src/$D/index.html" 2>/dev/null | cut -c1-12)" ] && echo AYNI || echo FARKLI )
  say "  $D: konteyner=$C image=$IMG kök=$ROOT  bağlama=[${MNT:-yok (dosyalar image içinde)}]  html=$(find "$T/src/$D" -name '*.html' | wc -l)  canlı_ana_sayfa=$M"
  printf '%s %s %s %s\n' "$D" "$C" "$ROOT" "$M" >> "$T/sources"
done < "$T/upstreams"
say "--- CSP başlığı (inline onclick engelli mi):"
for D in $DOMAINS; do say "  $D: $(curl -sSI --max-time 15 "https://$D/" 2>/dev/null | grep -i '^content-security-policy' | cut -c1-140 || true)"; done

sec "3) aday paket üret (geçici dizinde)"
cp -a "$T/src" "$T/cand"
python3 - "$T/cand" "$WA" <<'PY' | sed -E "s/$WA/****${WA: -4}/g"
import os,re,sys,html,urllib.parse,hashlib
root,wa=sys.argv[1],sys.argv[2]
SITES={
 'antalyagettransfer.com':('AGT','Antalya Get Transfer','en'),
 'antalyaflughafen.com':('AFH','Antalya Flughafen','de'),
 'antalyaairporttransfers.net':('AAT','Antalya Airport Transfers','en'),
 'safelinetravel.com':('SLT','SafeLine Travel','en'),
}
MSG={'en':'Hello, I would like to book a transfer.','de':'Hallo, ich möchte einen Transfer buchen.'}
LBL={'en':'WhatsApp us','de':'WhatsApp schreiben'}
BRAND={'en':'{b} is an Alanya Group brand. Transfers are operated by Alanya Group, Alanya, Türkiye.',
       'de':'{b} ist eine Marke der Alanya Group. Die Transfers werden von der Alanya Group (Alanya, Türkei) durchgeführt.'}
def urlpath(rel):
    p='/'+rel.replace(os.sep,'/')
    return p[:-len('index.html')] if p.endswith('/index.html') else p
def meta(h,name):
    m=re.search(r'<meta[^>]+name=["\']%s["\'][^>]*content=["\']([^"\']*)'%name,h,re.I) or re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*name=["\']%s["\']'%name,h,re.I)
    return html.unescape(m.group(1)).strip() if m else ''
def title(h):
    m=re.search(r'<title>(.*?)</title>',h,re.I|re.S); return html.unescape(m.group(1)).strip() if m else ''
def canon_host(h,d):
    m=re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']https?://([^/"\']+)',h,re.I); return m.group(1) if m else 'www.'+d
for d,(code,brand,deflang) in SITES.items():
    base=os.path.join(root,d)
    if not os.path.isdir(base): print("  %s: kaynak yok, atlandı"%d); continue
    home=open(os.path.join(base,'index.html'),errors='ignore').read() if os.path.exists(os.path.join(base,'index.html')) else ''
    host=canon_host(home,d)
    patched=skipped=noindex=0; pages=[]; sample=None
    for dp,_,fs in os.walk(base):
        for f in sorted(fs):
            if not f.endswith('.html'): continue
            p=os.path.join(dp,f); rel=os.path.relpath(p,base); h=open(p,errors='ignore').read()
            lang=(re.search(r'<html[^>]*\blang=["\']([a-zA-Z-]+)',h) or [None,deflang])[1][:2].lower()
            lang=lang if lang in MSG else deflang
            path=urlpath(rel)
            if re.search(r'<meta[^>]+name=["\']robots["\'][^>]*noindex',h,re.I): noindex+=1
            else: pages.append((path,title(h),meta(h,'description')))
            if re.search(r'wa\.me/|api\.whatsapp\.com',h,re.I): skipped+=1; continue
            text='[%s] %s%s – %s'%(code,d,path,MSG[lang])
            href='https://wa.me/%s?text=%s'%(wa,urllib.parse.quote(text))
            snip=('\n<!-- SEL-439 S1 D-WA-20261102-01 -->\n<a class="agos-wa" href="%s" target="_blank" rel="nofollow noopener" '
                  'data-agos-site="%s" aria-label="%s" style="position:fixed;right:16px;bottom:16px;z-index:9999;'
                  'display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;background:#1f8f4e;'
                  'color:#fff;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)">'
                  '<span aria-hidden="true">💬</span><span>%s</span></a>\n')%(html.escape(href),code,LBL[lang],LBL[lang])
            i=h.lower().rfind('</body>')
            if i<0: skipped+=1; continue
            h2=h[:i]+snip+h[i:]
            open(p,'w').write(h2); patched+=1
            if sample is None: sample=(path,text)
    # robots.txt
    rp=os.path.join(base,'robots.txt'); rob='robots.txt kaynakta YOK (Caddy/global servis ediliyor olabilir) → değiştirilmedi'
    if os.path.exists(rp):
        r=open(rp,errors='ignore').read()
        if re.search(r'(?im)^sitemap:',r): rob='robots.txt zaten Sitemap satırı içeriyor'
        else:
            open(rp,'a').write(('' if r.endswith('\n') else '\n')+'\nSitemap: https://%s/sitemap.xml\n'%host); rob='robots.txt: Sitemap satırı eklendi'
    # llms.txt (llmstxt.org)
    lp=os.path.join(base,'llms.txt')
    if os.path.exists(lp): llm='llms.txt zaten var → dokunulmadı'
    else:
        hd={'en':('Pages','Booking and contact','Policy'),'de':('Seiten','Buchung und Kontakt','Hinweise')}[deflang]
        homedesc=meta(home,'description')
        L=['# %s'%brand,'','> %s'%homedesc,'',BRAND[deflang].format(b=brand),'','## %s'%hd[0]]
        for path,t,ds in sorted(pages,key=lambda x:(x[0]!='/',x[0])):
            L.append('- [%s](https://%s%s)%s'%(t or path,host,path,(': '+ds) if ds else ''))
        L+=['','## %s'%hd[1]]
        if deflang=='de':
            L+=['- Buchung über das Formular auf jeder Seite; Preise werden im Formular berechnet.','- WhatsApp: über die Schaltfläche auf der Seite (Nachricht enthält die Herkunftsseite).']
            L+=['','## %s'%hd[2],'- Preise, Fahrzeiten und Verfügbarkeit gelten nur laut Buchungsbestätigung.']
        else:
            L+=['- Book with the form on each page; prices are calculated in the form.','- WhatsApp: use the button on the page (the message includes the page it came from).']
            L+=['','## %s'%hd[2],'- Prices, travel times and availability are binding only as stated in the booking confirmation.']
        open(lp,'w').write('\n'.join(L)+'\n'); llm='llms.txt oluşturuldu: %d sayfa linki'%len(pages)
    print("  %s [%s]: html yamalandı=%d  zaten WhatsApp'lı/</body> yok=%d  noindex(llms dışı)=%d  | %s | %s"%(d,code,patched,skipped,noindex,rob,llm))
    if sample: print("      örnek ön-dolu mesaj: %s"%sample[1])
PY
say "--- fark özeti (kaynak → aday; yalnız sayılar):"
for D in $DOMAINS; do
  [ -d "$T/src/$D" ] || continue
  say "  $D: değişen dosya=$(diff -rq "$T/src/$D" "$T/cand/$D" 2>/dev/null | grep -c differ)  yeni dosya=$(diff -rq "$T/src/$D" "$T/cand/$D" 2>/dev/null | grep -c '^Only in')"
done
say "--- kontrol: yalnız </body> öncesine ekleme yapıldı mı (silinen satır olmamalı):"
for D in $DOMAINS; do
  [ -d "$T/src/$D" ] || continue
  del=0; for f in $(cd "$T/src/$D" && find . -name '*.html'); do del=$((del + $(diff "$T/src/$D/$f" "$T/cand/$D/$f" | grep -c '^<'))); done
  say "  $D: silinen/değişen eski satır=$del (0 olmalı)"
done

if [ "$MODE" = plan ]; then
  sec "PLAN tamam"
  say "Hiçbir şey yazılmadı. Aday paketi sunucuda saklamak için --stage. Canlıya geçiş ayrı betik + Owner-L3."
  exit 0
fi

sec "4) STAGE: aday klasörü yaz (canlı servis değişmez)"
TS=$(date -u +%Y%m%dT%H%M%SZ); OUT=/opt/agos/candidates/sel439-s1-$TS
install -d -m 750 "$OUT"
cp -a "$T/src" "$OUT/source-snapshot"; cp -a "$T/cand" "$OUT/candidate"
cp "$T/sources" "$OUT/SOURCES"; cp "$T/upstreams" "$OUT/UPSTREAMS"
( cd "$OUT" && find candidate source-snapshot -type f -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )
chmod -R go-w "$OUT"
say "  yazıldı: $OUT  (source-snapshot = şu an canlıda olanın kopyası = geri dönüş; candidate = aday)"
say "  manifest sha12=$(sha256sum "$OUT/MANIFEST.sha256" | cut -c1-12)  dosya=$(wc -l < "$OUT/MANIFEST.sha256")"
say "STAGE tamam. Canlı DEĞİŞMEDİ. Sıradaki: switch betiği (sunum yöntemine göre) + Owner-L3."
