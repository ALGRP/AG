#!/usr/bin/env bash
# SEL-327 / G2.0b — reservation-automation (canonical) ENVANTERİ. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel327-reservation-automation-inventory.sh
# Yazdırılanlar: dosya adları/sha, package.json betik ADLARI, env değişkeni ADLARI, URL'lerin yalnız şema+host+yol kısmı,
#                SQL'de geçen tablo adları, sayımlar ve maskeli hata özetleri.
# Yazdırılmayanlar: env/secret DEĞERLERİ, token, kullanıcı/parola, sorgu parametresi, müşteri verisi.
set -uo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
R=/opt/agos-reservation-automation; C=agos-reservation-postgres
# her çıktıyı son kez süz: 6+ haneli sayılar, uzun rastgele diziler, e-posta, kullanıcı:parola@
scrub(){ sed -E -e 's/[0-9]{6,}/<NUM>/g' -e 's/[A-Za-z0-9_+\/=-]{32,}/<GİZLİ>/g' -e 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}/<EPOSTA>/g' -e 's#//[^/@[:space:]]+@#//<KIMLIK>@#g'; }
say "SEL327_RA_INVENTORY v1  zaman=$(date -u +%FT%TZ)  host=$(hostname)  LIVE_CHANGED=NO"
[ -d "$R" ] || { say "HATA: $R yok"; exit 1; }

sec "1) depo durumu"
if [ -d "$R/.git" ]; then
  say "git: $(git -C "$R" rev-parse --short HEAD 2>/dev/null) dal=$(git -C "$R" rev-parse --abbrev-ref HEAD 2>/dev/null) son_commit=$(git -C "$R" log -1 --format=%cs 2>/dev/null) uzak=$(git -C "$R" remote get-url origin 2>/dev/null | scrub)"
  say "izlenmeyen/değişmiş dosya sayısı: $(git -C "$R" status --porcelain 2>/dev/null | grep -vc '^?? runtime/' )"
else say "git: YOK (depo değil)"; fi

sec "2) migration dosyaları (ad | satır | sha12)"
for f in $(ls -1 "$R"/migrations 2>/dev/null | sort); do
  printf '  %-60s %5s  %s\n' "$f" "$(wc -l < "$R/migrations/$f")" "$(sha256sum "$R/migrations/$f" | cut -c1-12)"
done
say "--- veritabanında uygulanmış migration kayıtları:"
docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$C" sh -c 'psql -X -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "select * from automation_schema_migrations order by 1"' 2>&1 | cut -c1-160 | scrub | sed 's/^/  /'

sec "3) testler ve package.json"
say "test dosyaları: $(find "$R/test" -type f 2>/dev/null | wc -l)"
find "$R/test" -type f 2>/dev/null | sed "s#$R/##" | sort | sed 's/^/  /' | head -60
if [ -f "$R/package.json" ]; then
  say "--- package.json betik ADLARI ve komutları (değer içermez):"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); [print("  %s: %s"%(k,v[:120])) for k,v in d.get("scripts",{}).items()]; print("  bağımlılıklar:", " ".join(sorted(list(d.get("dependencies",{}).keys())+list(d.get("devDependencies",{}).keys()))))' "$R/package.json" | scrub
fi

sec "4) compose servisleri (env ANAHTAR adları; değer yok)"
python3 - "$R/compose.yaml" <<'PY' 2>/dev/null | sed -E 's/[0-9]{6,}/<NUM>/g' || say "  (compose okunamadı)"
import sys,re
txt=open(sys.argv[1]).read()
svc=None; mode=None
for line in txt.splitlines():
    m=re.match(r'^  ([A-Za-z0-9_.-]+):\s*$',line)
    if m: svc=m.group(1); print("  servis:",svc); mode=None; continue
    s=line.strip()
    if re.match(r'^(environment|env_file|volumes|ports|depends_on|command|image|build):',s):
        mode=s.split(':')[0]
        rest=s.split(':',1)[1].strip()
        if mode in('image','build','command') and rest: print("    %s: %s"%(mode, rest[:100] if mode!='command' else '<komut>'))
        continue
    if mode=='environment' and (s.startswith('- ') or ':' in s):
        k=re.split(r'[=:]',s.lstrip('- '),1)[0].strip(); print("    env:",k)
    elif mode in('ports','volumes','depends_on','env_file') and s.startswith('- '):
        v=s[2:]
        if mode=='volumes': v=v.split(':')[0]+' -> '+(v.split(':')[1] if ':' in v else '')
        print("    %s: %s"%(mode,v[:100]))
PY

sec "5) source-bridge (systemd, root) — ne okuyor, nereye yazıyor"
SB="$R/scripts/source-bridge.py"
if [ -f "$SB" ]; then
  say "dosya: satır=$(wc -l < "$SB") sha12=$(sha256sum "$SB" | cut -c1-12)"
  say "--- kullandığı env değişkeni ADLARI:"
  grep -oE "(os\.environ(\.get)?\(?\[?['\"][A-Z0-9_]+|getenv\(['\"][A-Z0-9_]+)" "$SB" | grep -oE "[A-Z][A-Z0-9_]+$" | sort -u | sed 's/^/  /'
  say "--- geçen URL'ler (şema+host+yol; sorgu ve kimlik yok):"
  grep -oE "https?://[^\"' )]+" "$SB" | sed -E 's/\?.*$//' | scrub | sort -u | sed 's/^/  /'
  say "--- geçen dosya yolları:"
  grep -oE "['\"](/[A-Za-z0-9_./-]+)['\"]" "$SB" | tr -d "'\"" | sort -u | sed 's/^/  /' | head -30
  say "--- SQL'de geçen tablo adları:"
  grep -oiE "(from|into|update|join)[[:space:]]+[a-z_\"]+" "$SB" | awk '{print tolower($2)}' | tr -d '"' | sort | uniq -c | sed 's/^/  /'
  say "--- docker/subprocess çağrıları (komut adı):"
  grep -oE "subprocess\.[a-z_]+\(\[?['\"][a-z-]+['\"]?(,\s*['\"][a-z-]+)?" "$SB" | sed 's/subprocess\.//' | sort | uniq -c | sed 's/^/  /'
else say "source-bridge.py YOK"; fi
say "--- systemd birimi:"
systemctl show agos-reservation-source-bridge -p ActiveState -p SubState -p User -p ExecMainStartTimestamp -p NRestarts 2>/dev/null | sed 's/^/  /'
say "--- son 24 saat log satır sayısı / hata benzeri:"
L=$(journalctl -u agos-reservation-source-bridge --since -24h --no-pager 2>/dev/null)
say "  satır=$(printf '%s\n' "$L" | grep -c .) hata=$(printf '%s\n' "$L" | grep -ciE 'error|traceback|fail')"

sec "6) canonical DB: kaynak dağılımı (maskeli)"
q(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$C" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-200 | scrub; }
say "--- reservations: source_system | source_account_id | adet | ilk | son"
q "select source_system, source_account_id, count(*), to_char(min(created_at),'YYYY-MM-DD'), to_char(max(created_at),'YYYY-MM-DD') from reservations group by 1,2 order by 3 desc" | sed 's/^/  /'
say "--- reservations: workflow_status | booking_confirmation_status | adet"
q "select workflow_status, booking_confirmation_status, count(*) from reservations group by 1,2 order by 3 desc" | sed 's/^/  /'
say "--- reservations: bacak sayısı dağılımı (bacak | rezervasyon)"
q "select n, count(*) from (select r.id, count(l.id) n from reservations r left join reservation_legs l on l.reservation_id=r.id and l.active group by r.id) x group by n order by n" | sed 's/^/  /'
say "--- source_events: processing_status | adet"
q "select processing_status, count(*) from source_events group by 1 order by 2 desc" | sed 's/^/  /'
say "--- aynı kayda gelen olay sayısı (olay/kayıt | kayıt)"
q "select n, count(*) from (select source_record_id, count(*) n from source_events group by 1) x group by n order by n" | sed 's/^/  /'
say "--- outbox_jobs: type | status | adet | max_attempt"
q "select type, status, count(*), max(attempt_count) from outbox_jobs group by 1,2 order by 1,2" | sed 's/^/  /'
say "--- blocked/dead işler (tip | hedef türü | deneme | oluşturma | hata özeti, maskeli)"
q "select type, split_part(target,':',1), attempt_count, to_char(created_at,'YYYY-MM-DD HH24:MI'), left(coalesce(last_error,'-'),120) from outbox_jobs where status in ('blocked','dead') order by created_at" | sed 's/^/  /'
say "--- target_syncs: kolonlar"
q "select string_agg(column_name,',' order by ordinal_position) from information_schema.columns where table_name='target_syncs'" | sed 's/^/  /'

sec "7) transfer-platform DB ↔ canonical bağı (yalnız sayım ve kaynak etiketi)"
TP=$(docker ps --format '{{.Names}}' | grep -E 'transfer-platform-db' | head -1)
if [ -n "$TP" ]; then
  tq(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" "$TP" sh -c 'psql -X -q -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"' 2>&1 | cut -c1-200 | scrub; }
  say "--- transfer-platform reservations: source_system | owner_company | adet | son"
  tq "select source_system, owner_company, count(*), to_char(max(created_at),'YYYY-MM-DD') from reservations group by 1,2 order by 3 desc limit 15" | sed 's/^/  /'
  say "--- transfer-platform API env ANAHTAR adları:"
  TA=$(docker ps --format '{{.Names}}' | grep -E 'transfer-platform-api' | head -1)
  [ -n "$TA" ] && docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$TA" | cut -d= -f1 | grep -vE '^(PATH|HOME|LANG|GPG_KEY|PYTHON_.*|HOSTNAME)$' | tr '\n' ' ' | sed 's/^/  /'; echo
fi

sec "son"
say "SEL327_RA_INVENTORY=DONE  LIVE_CHANGED=NO"
