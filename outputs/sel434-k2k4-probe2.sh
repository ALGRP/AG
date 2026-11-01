#!/bin/bash
# SEL-434 K2–K4 hazırlık yoklaması 2 — STRICTLY READ-ONLY.
# (a) Kurulu Hermes kaynağında güvenlik anahtarlarının nereden okunduğu (yalnız KOD satırları).
# (b) config.yaml'daki TELEGRAM_ALLOWED_USERS id'si .env listesinde mi (yalnız EVET/HAYIR; id basılmaz).
set -u
R="$HOME/.hermes/hermes-agent"
PD="$HOME/.hermes/profiles/agosorchestrator"
PY="$R/venv/bin/python3"
[ -x "$PY" ] || { echo "venv python YOK; durduruldu."; exit 2; }
cd "$R" || exit 2
echo "=== (a) kaynak: anahtar okuma noktaları"
for k in allow_admin_from user_allowed_commands group_allow_admin_from group_user_allowed_commands \
         dm_policy unauthorized_dm_behavior group_policy; do
  echo "--- $k"
  grep -rn --include='*.py' -E "[\"']$k[\"']" gateway hermes_cli 2>/dev/null | grep -v '/tests\?/' | head -8
done
echo "--- TELEGRAM_ALLOWED_USERS (config.yaml üst seviye -> env köprüsü?)"
grep -rn --include='*.py' -E "TELEGRAM_ALLOWED_USERS" gateway hermes_cli 2>/dev/null | grep -v '/tests\?/' | head -12
echo "--- platforms.<x>.extra okuma"
grep -rn --include='*.py' -E "\.get\([\"']extra[\"']|\[[\"']extra[\"']\]" gateway/config.py 2>/dev/null | head -10
echo "--- config.yaml üst seviye env-benzeri anahtarların env'e aktarımı"
grep -rn --include='*.py' -E "isupper\(\)|os\.environ\.setdefault|os\.environ\[k" gateway/config.py hermes_cli/config.py 2>/dev/null | head -10
echo "=== hermes config set yardım"
hermes -p agosorchestrator config set --help 2>&1 | head -25
echo "=== (b) id üyeliği (değer basılmaz)"
"$PY" -I - "$PD/config.yaml" "$PD/.env" <<'PYEOF'
import sys, re, yaml
cfg = yaml.safe_load(open(sys.argv[1])) or {}
c = cfg.get("TELEGRAM_ALLOWED_USERS")
cids = {x.strip() for x in str(c).replace(";", ",").split(",") if x.strip()} if c is not None else set()
eids = set()
for line in open(sys.argv[2]):
    m = re.match(r'\s*(?:export\s+)?TELEGRAM_ALLOWED_USERS=(.*)', line)
    if m:
        v = m.group(1).split('#')[0].strip().strip('"').strip("'")
        eids |= {x.strip() for x in re.split(r'[,;]', v) if x.strip()}
print("config id adedi:", len(cids), "| .env id adedi:", len(eids))
print("config id'leri .env listesinde mi:", "EVET" if cids and cids <= eids else "HAYIR")
print(".env'de olup config'de olmayan id adedi:", len(eids - cids))
h = cfg.get("TELEGRAM_HOME_CHANNEL")
print("TELEGRAM_HOME_CHANNEL config id'siyle aynı mı:", "EVET" if h is not None and str(h).strip() in cids else "HAYIR")
PYEOF
