#!/bin/bash
# SEL-434 Aşama A — Mac READ-ONLY envanter (agosorchestrator).
# Servis başlatmaz/durdurmaz, dosya düzenlemez, Telegram'a dokunmaz.
# Token, kullanıcı id'si veya .env değeri YAZDIRMAZ — yalnız VAR/YOK ve sayım.
set -u
P=agosorchestrator
H="$HOME/.hermes"
PD="$H/profiles/$P"
ENVF="$PD/.env"
CFG="$PD/config.yaml"
REPO="/Users/a1453/.hermes/hermes-agent"
OUTDIR="${OUTDIR:-$PWD/outputs}"; mkdir -p "$OUTDIR"
OUT="$OUTDIR/sel434-phaseA-mac-$(date +%Y%m%d).md"
redact(){ sed -E 's/[0-9]{6,}/<NUM>/g; s/[A-Za-z0-9_-]{30,}/<REDACTED>/g; s/(token|secret|key)[=:][^ ]*/\1=<REDACTED>/Ig'; }
vy(){ [ -e "$1" ] && echo VAR || echo YOK; }
{
echo "# SEL-434 Aşama A — Mac read-only envanter ($P) — $(date -u +%FT%TZ)"
echo; echo "## 1) Gateway durumu"; echo '```'
hermes -p "$P" gateway status 2>&1 | redact
echo "--- launchctl"; launchctl list "ai.hermes.gateway-$P" 2>&1 | redact
echo '```'
echo; echo "## 2) hermes-agent HEAD"
HEAD=$(git -C "$REPO" rev-parse HEAD 2>&1); echo "- HEAD: \`$HEAD\`"
case "$HEAD" in 165c889e*) echo "- Beklenen (165c889e...): EŞLEŞİYOR";; *) echo "- Beklenen (165c889e...): EŞLEŞMİYOR";; esac
echo; echo "## 3) SHA-256"; echo '```'
for f in gateway/slash_access.py hermes_cli/managed_scope.py hermes_cli/kanban_db.py hermes_cli/backup.py; do
  if [ -f "$REPO/$f" ]; then (cd "$REPO" && shasum -a 256 "$f"); else echo "YOK  $f"; fi
done; echo '```'
echo; echo "## 4) .env anahtar satır sayıları (değer yok)"
echo "- .env: $(vy "$ENVF")"
if [ -f "$ENVF" ]; then
  for k in TELEGRAM_ALLOWED_USERS TELEGRAM_ALLOW_ALL_USERS GATEWAY_ALLOW_ALL_USERS GATEWAY_ALLOWED_USERS TELEGRAM_GROUP_ALLOWED_CHATS HERMES_YOLO_MODE HERMES_MANAGED_DIR; do
    echo "- $k: $(grep -cE "^[[:space:]]*(export[[:space:]]+)?$k=" "$ENVF")"
  done
  for k in TELEGRAM_ALLOWED_USERS GATEWAY_ALLOWED_USERS; do
    awk -v k="$k" -v q="'" '
      { line=$0; sub(/^[ \t]*(export[ \t]+)?/,"",line) }
      index(line,k"=")==1 { v=substr(line,length(k)+2); gsub(/["'\'' \t\r]/,"",v); sub(/#.*/,"",v)
        n=split(v,a,/[,;]/); ids=0; star=0
        for(i=1;i<=n;i++){ if(a[i]=="*") star++; else if(a[i]!="") ids++ }
        printf "- %s: %s*%s sayısı=%d, id adedi=%d\n", k, q, q, star, ids; found=1 }
      END{ if(!found) printf "- %s: anahtar YOK\n", k }' "$ENVF"
  done
fi
echo; echo "## 5) config.yaml"
echo "- config.yaml: $(vy "$CFG")"
if [ -f "$CFG" ]; then
  echo "### Anahtar sayıları"
  for k in allow_admin_from user_allowed_commands group_allow_admin_from dm_policy group_policy unauthorized_dm_behavior multiplex_profiles command_allowlist; do
    echo "- $k: $(grep -cE "^[[:space:]]*$k:" "$CFG")"
  done
  echo "### Politika değerleri"; echo '```'
  awk '/^[^ \t#][^:]*:/{top=$1} top=="approvals:" && /^[ \t]+mode:/{print "approvals.mode:" substr($0,index($0,":")+1)}' "$CFG"
  grep -nE "^[[:space:]]*(cron_mode|dm_policy|unauthorized_dm_behavior|multiplex_profiles):" "$CFG" | redact
  echo '```'
fi
echo; echo "## 6) Pairing / gateway.json / /etc/hermes"
echo "- $PD/platforms/pairing/: $(vy "$PD/platforms/pairing")"
[ -d "$PD/platforms/pairing" ] && ls -1A "$PD/platforms/pairing" | redact | sed 's/^/  - /'
echo "- $PD/gateway.json: $(vy "$PD/gateway.json")"
echo "- $H/gateway.json: $(vy "$H/gateway.json")"
echo "- /etc/hermes: $(vy /etc/hermes)"
echo; echo "## 7) Mod / sahip"; echo '```'
for p in "$H" "$PD" "$ENVF" "$CFG"; do
  [ -e "$p" ] && echo "$(stat -f '%Sp %Su' "$p")  ${p/#$HOME/~}" || echo "YOK  ${p/#$HOME/~}"
done; echo '```'
} > "$OUT"
echo "Yazıldı: $OUT"
shasum -a 256 "$OUT"
