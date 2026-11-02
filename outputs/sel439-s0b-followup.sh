#!/usr/bin/env bash
# SEL-439 / S0b — S0'da kesinleşmeyen noktalar. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel439-s0b-followup.sh
# 1) robots.txt: Googlebot/genel (*) için tüm site kapalı mı? 5 sitede aynı dosya mı?
# 2) canonical DB ve Telegram bildirimi: site (landing domain) bilgisi taşınıyor mu? (yalnız sayım)
# 3) sitemap ↔ yayındaki html sayfa farkı
# 4) AGT ve AAT: aynı slug'lı sayfaların metin benzerliği (yinelenen içerik riski)
# 5) WhatsApp linki: uydu sitelerin herhangi bir sayfasında var mı?
# 6) AGNET-SEO §2 marka beyanı footer'da var mı? (5-gram Jaccard eşiği %15: AGNET-SEO §10)
# Müşteri verisi, token, telefon yazdırılmaz.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
SITES="alanyagroup.com antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
get(){ curl -sS -L --max-time 20 -A "AGOS-readiness-check/1.0" -o "$2" -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
say "SEL439_S0B v2  zaman=$(date -u +%FT%TZ)  LIVE_CHANGED=NO"

sec "1) robots.txt: kimler engelli"
for D in $SITES; do
  get "https://$D/robots.txt" "$T/$D.r" >/dev/null
  python3 - "$T/$D.r" "$D" <<'PY'
import sys
lines=[l.split('#')[0].strip() for l in open(sys.argv[1],errors='ignore')]
groups=[];cur=None;last_ua=False
for l in lines:
    if not l or ':' not in l: continue
    k,v=[x.strip() for x in l.split(':',1)]; k=k.lower()
    if k=='user-agent':
        if not last_ua: cur={'ua':[],'dis':[],'allow':[]}; groups.append(cur)
        cur['ua'].append(v); last_ua=True
    else:
        last_ua=False
        if cur is None: continue
        if k=='disallow': cur['dis'].append(v)
        if k=='allow': cur['allow'].append(v)
def blocked(bot):
    g=[x for x in groups if any(u.lower()==bot.lower() for u in x['ua'])] or [x for x in groups if '*' in x['ua']]
    if not g: return 'İZİNLİ (kural yok)'
    full=any(d=='/' for x in g for d in x['dis'])
    return 'TÜM SİTE KAPALI' if full else 'İZİNLİ (%d kısmi kural)'%sum(len(x['dis']) for x in g)
import hashlib
print("  %-28s sha12=%s grup=%d" % (sys.argv[2], hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()[:12], len(groups)))
for b in ['*','Googlebot','Bingbot','YandexBot','OAI-SearchBot','Claude-SearchBot','PerplexityBot','GPTBot','ClaudeBot','Google-Extended','CCBot']:
    print("    %-17s %s" % (b, blocked(b)))
PY
done

sec "2) canonical DB / Telegram: site bilgisi taşınıyor mu (yalnız sayım)"
C=agos-reservation-postgres
cq(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-160 | sed -E 's/[0-9]{6,}/<NUM>/g'; }
say "--- transfer-platform kaynaklı rezervasyonlar: alan adı izi geçen / toplam"
for col in public_summary reservation_private; do
  say "  reservations.$col: $(cq "select count(*) filter (where $col::text ~* '(landing|antalyagettransfer|antalyaflughafen|antalyaairporttransfers|safelinetravel)')||' / '||count(*) from reservations where source_system='transfer-platform'")"
done
say "  source_events.safe_payload: $(cq "select count(*) filter (where safe_payload::text ~* '(landing|antalyagettransfer|antalyaflughafen|antalyaairporttransfers|safelinetravel)')||' / '||count(*) from source_events where source_system='transfer-platform'")"
say "  outbox telegram.notify safe_payload: $(cq "select count(*) filter (where o.safe_payload::text ~* '(landing|antalyagettransfer|antalyaflughafen|antalyaairporttransfers|safelinetravel)')||' / '||count(*) from outbox_jobs o join reservations r on r.id=o.aggregate_id where o.type='telegram.notify' and r.source_system='transfer-platform'")"
say "--- telegram.notify safe_payload üst seviye ANAHTAR adları (değer yok):"
cq "select string_agg(distinct k, ' ') from outbox_jobs, jsonb_object_keys(safe_payload) k where type='telegram.notify'" | sed 's/^/  /'
say "--- public_summary üst seviye ANAHTAR adları (değer yok):"
cq "select string_agg(distinct k, ' ') from reservations, jsonb_object_keys(public_summary) k" | sed 's/^/  /'

sec "3) sitemap ↔ yayındaki html sayfa"
REL=/opt/agos/releases/ag-multidomain-static-20261022-booking-settings/public
for D in antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com; do
  get "https://$D/" "$T/$D.live" >/dev/null
  say "  $D: canlı ana sayfa = $REL/$D/index.html ? $( [ "$(sha256sum < "$T/$D.live" | cut -c1-12)" = "$(sha256sum < "$REL/$D/index.html" 2>/dev/null | cut -c1-12)" ] && echo AYNI || echo FARKLI-bu-klasör-canlı-kaynak-olmayabilir )"
  get "https://$D/sitemap.xml" "$T/$D.sm" >/dev/null
  grep -oE '<loc>[^<]+' "$T/$D.sm" | sed -E 's#<loc>https?://[^/]+##; s#/index\.html$#/#' | sort -u > "$T/$D.smurls"
  ( cd "$REL/$D" 2>/dev/null && find . -name '*.html' | sed -E 's#^\.##; s#/index\.html$#/#; s#^$#/#' | sort -u ) > "$T/$D.files"
  say "  $D: sitemap=$(wc -l < "$T/$D.smurls") html=$(wc -l < "$T/$D.files")  sitemap'te olmayan html=$(comm -13 "$T/$D.smurls" "$T/$D.files" | wc -l)  html'i olmayan sitemap url=$(comm -23 "$T/$D.smurls" "$T/$D.files" | wc -l)"
  comm -13 "$T/$D.smurls" "$T/$D.files" | head -8 | sed 's/^/      eksik: /'
done

sec "4) yinelenen içerik riski: aynı slug'lı sayfalarda metin benzerliği"
python3 - "$REL" <<'PY'
import os,re,sys,difflib,itertools
def jac(x,y,n=5):
    def g(t):
        w=t.split(); return set(tuple(w[i:i+n]) for i in range(max(0,len(w)-n+1)))
    A,B=g(x),g(y)
    return len(A&B)/len(A|B) if A|B else 0.0
R=sys.argv[1]; S=['antalyagettransfer.com','antalyaairporttransfers.net','safelinetravel.com','antalyaflughafen.com']
def text(p):
    h=open(p,errors='ignore').read()
    h=re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>',' ',h); h=re.sub(r'(?s)<[^>]+>',' ',h)
    return re.sub(r'\s+',' ',h).strip().lower()
pages={s:{os.path.relpath(os.path.join(dp,f),os.path.join(R,s)):os.path.join(dp,f) for dp,_,fs in os.walk(os.path.join(R,s)) for f in fs if f.endswith('.html')} for s in S if os.path.isdir(os.path.join(R,s))}
for a,b in itertools.combinations(pages,2):
    common=sorted(set(pages[a])&set(pages[b]))
    if not common: print("  %s ↔ %s: ortak slug=0" % (a,b)); continue
    rs=[difflib.SequenceMatcher(None,text(pages[a][c]).split(),text(pages[b][c]).split(),autojunk=False).ratio() for c in common]
    hi=sum(1 for r in rs if r>=0.8)
    js=[jac(text(pages[a][c]),text(pages[b][c])) for c in common]
    over=sum(1 for j in js if j>0.15)
    print("  %s ↔ %s: ortak slug=%d  ort.benzerlik=%.0f%%  ≥80%% benzer=%d  5-gram Jaccard ort=%.0f%%  >15%% (AGNET eşiği aşan)=%d" % (a,b,len(common),100*sum(rs)/len(rs),hi,100*sum(js)/len(js),over))
# ana sayfalar ayrıca
hs={s:text(os.path.join(R,s,'index.html')) for s in pages if os.path.exists(os.path.join(R,s,'index.html'))}
for a,b in itertools.combinations(hs,2):
    print("  ana sayfa %s ↔ %s: benzerlik=%.0f%%  5-gram Jaccard=%.0f%%" % (a,b,100*difflib.SequenceMatcher(None,hs[a].split(),hs[b].split(),autojunk=False).ratio(),100*jac(hs[a],hs[b])))
PY

sec "5) WhatsApp linki: uydu sitelerin tüm sayfaları"
for D in antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com; do
  say "  $D: wa.me/api.whatsapp içeren html=$(grep -rlisE 'wa\.me/|api\.whatsapp\.com' "$REL/$D" --include='*.html' 2>/dev/null | wc -l)  app.js içinde=$(grep -cisE 'wa\.me|whatsapp' "$REL/../public/$D/assets/app.js" "$REL/$D/assets/app.js" 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')"
done

sec "6) AGNET-SEO §2 marka beyanı (footer) ve AG linki — uydu ana sayfaları"
for D in antalyagettransfer.com antalyaflughafen.com antalyaairporttransfers.net safelinetravel.com; do
  f="$REL/$D/index.html"
  say "  $D: beyan_metni=$(grep -ciE 'an Alanya Group brand|Marke der Alanya Group' "$f" 2>/dev/null)  alanyagroup.com_linki=$(grep -oiE '<a[^>]+alanyagroup\.com[^>]*>' "$f" 2>/dev/null | wc -l)  nofollow_olan=$(grep -oiE '<a[^>]+alanyagroup\.com[^>]*>' "$f" 2>/dev/null | grep -ci nofollow)  tüm html içinde beyan olan=$(grep -rliE 'an Alanya Group brand|Marke der Alanya Group' "$REL/$D" --include='*.html' 2>/dev/null | wc -l)/$(find "$REL/$D" -name '*.html' | wc -l)"
done

sec "son"
say "SEL439_S0B=DONE  LIVE_CHANGED=NO"
