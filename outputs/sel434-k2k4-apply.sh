#!/bin/bash
# SEL-434 K2 → K4 → K3 uygulayıcı (agosorchestrator).
#   Varsayılan: PLAN — gerçek dosyaya YAZMAZ. Geçici kopyada değişikliği yapar,
#               Hermes'in kendi yükleyicisiyle doğrular, maskeli diff basar.
#   --apply   : PLAN doğrulaması geçerse yedek alır ve config.yaml'a yazar, sonra yeniden doğrular.
#   Gateway başlatmaz/durdurmaz. .env ve pairing dosyasına YAZMAZ (yalnız yedekler).
#   Owner id'si hiçbir yerde basılmaz (<OWNER> olarak maskelenir).
set -euo pipefail
MODE=plan; OWNER_OK=no
for a in "$@"; do case "$a" in
  --apply) MODE=apply;; --owner-confirmed) OWNER_OK=yes;;
  *) echo "Bilinmeyen argüman: $a"; exit 2;; esac; done
R="$HOME/.hermes/hermes-agent"; PD="$HOME/.hermes/profiles/agosorchestrator"
PY="$R/venv/bin/python3"
[ -x "$PY" ] || { echo "venv python YOK; durduruldu."; exit 2; }
[ "$OWNER_OK" = yes ] || { echo "Owner id onayı gerekli: --owner-confirmed ile çalıştırın."; exit 2; }
if launchctl list ai.hermes.gateway-agosorchestrator >/dev/null 2>&1; then
  echo "Gateway launchd'de YÜKLÜ görünüyor; değişiklik reddedildi (önce durumu Owner'la konuşun)."; exit 3; fi
echo "Gateway: launchd'de yüklü değil (OK)"
echo "--- dm_policy/group_policy kabul edilen değerler (kaynak, salt-okunur):"
sed -n '2538,2560p' "$R/gateway/run.py" | grep -nE 'policy|allowlist|disabled|pairing|open' | head -20 || true
sed -n '243,252p' "$R/gateway/config.py"
TMP="$(mktemp -d)"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
cd "$R"
"$PY" -I - "$MODE" "$PD" "$TMP" <<'PYEOF'
import sys, os, re, io, shutil, difflib, datetime, inspect, subprocess
mode, PD, TMP = sys.argv[1:4]
sys.path.insert(0, os.getcwd())
from ruamel.yaml import YAML
y = YAML(); y.preserve_quotes = True; y.width = 4096
CFG = os.path.join(PD, "config.yaml"); ENV = os.path.join(PD, ".env")
def fail(m): print("DURDURULDU:", m); sys.exit(4)

# --- Owner id: config.yaml TELEGRAM_ALLOWED_USERS (tek id), .env listesinde ve HOME_CHANNEL ile aynı olmalı
orig_text = open(CFG).read()
data = y.load(orig_text)
cid = data.get("TELEGRAM_ALLOWED_USERS"); home = data.get("TELEGRAM_HOME_CHANNEL")
ids = [x.strip() for x in str(cid).split(",") if x.strip()] if cid is not None else []
if len(ids) != 1: fail("config.yaml TELEGRAM_ALLOWED_USERS tek id değil")
OWNER = ids[0]
if not OWNER.lstrip("-").isdigit(): fail("Owner id sayısal değil")
if str(home).strip() != OWNER: fail("TELEGRAM_HOME_CHANNEL Owner id ile aynı değil")
envids = set()
for line in open(ENV):
    m = re.match(r'\s*(?:export\s+)?TELEGRAM_ALLOWED_USERS=(.*)', line)
    if m:
        v = m.group(1).split('#')[0].strip().strip('"').strip("'")
        envids |= {x.strip() for x in re.split(r'[,;]', v) if x.strip()}
if OWNER not in envids: fail("Owner id .env allowlist'te yok")
OTHER = sorted(envids - {OWNER})
print(f"Owner id: doğrulandı (config=HOME_CHANNEL, .env içinde). Diğer allowlist id adedi: {len(OTHER)}")

# --- Değişiklik (K2 + K4 → üst seviye telegram: bloğu; K3 → approvals.mode)
if "telegram" in data: fail("config.yaml'da zaten üst seviye 'telegram:' bloğu var; elle incelenmeli")
for k in ("dm_policy","group_policy","unauthorized_dm_behavior","allow_admin_from"):
    if k in data: fail(f"üst seviyede beklenmeyen '{k}' anahtarı var")
from ruamel.yaml.comments import CommentedMap, CommentedSeq
def seq(items):
    s = CommentedSeq(items); s.fa.set_flow_style(); return s
tg = CommentedMap()
tg["dm_policy"] = "allowlist"                 # K4
tg["unauthorized_dm_behavior"] = "ignore"     # K4
tg["group_policy"] = "disabled"               # K4
tg["allow_admin_from"] = seq([OWNER])         # K2
tg["user_allowed_commands"] = seq([])         # K2
tg["group_allow_admin_from"] = seq([OWNER])   # K2
tg["group_user_allowed_commands"] = seq([])   # K2
data["telegram"] = tg
if not isinstance(data.get("approvals"), dict): fail("approvals bölümü yok")
old_mode = data["approvals"].get("mode")
data["approvals"]["mode"] = "manual"          # K3
buf = io.StringIO(); y.dump(data, buf); new_text = buf.getvalue()

_TOK = re.compile(r"\d{6,}:[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,}")
mask = lambda s: _TOK.sub("<REDACTED>", s.replace(OWNER, "<OWNER>"))
print(f"--- approvals.mode: {old_mode!r} -> 'manual'")
print("--- diff (Owner id maskeli):")
for l in difflib.unified_diff(orig_text.splitlines(), new_text.splitlines(), "config.yaml(önce)", "config.yaml(sonra)", lineterm="", n=1):
    print(mask(l))

# --- Hermes yükleyicisiyle doğrulama (ayrı süreçte, HERMES_HOME=kopya)
VERIFY = r'''
import sys, os, inspect
sys.path.insert(0, os.getcwd())
owner, others = sys.argv[1], [x for x in sys.argv[2].split(",") if x]
from gateway.config import load_gateway_config, Platform
cfg = load_gateway_config()
tp = cfg.platforms.get(Platform.TELEGRAM)
ok = True
def chk(name, cond):
    global ok
    print(f"  [{'OK' if cond else 'FAIL'}] {name}"); ok = ok and bool(cond)
chk("telegram platformu yüklendi ve enabled", tp is not None and getattr(tp, "enabled", False))
ex = dict(getattr(tp, "extra", {}) or {}) if tp else {}
chk("dm_policy=allowlist", str(ex.get("dm_policy")) == "allowlist")
chk("group_policy=disabled", str(ex.get("group_policy")) == "disabled")
chk("unauthorized_dm_behavior=ignore (etkili)", cfg.get_unauthorized_dm_behavior(Platform.TELEGRAM) == "ignore")
for k in ("allow_admin_from", "group_allow_admin_from"):
    v = [str(x) for x in (ex.get(k) or [])]
    chk(f"{k} = yalnız Owner (adet={len(v)})", v == [owner])
for k in ("user_allowed_commands", "group_user_allowed_commands"):
    chk(f"{k} = [] (boş)", list(ex.get(k) or []) == [] and k in ex)
try:
    import gateway.slash_access as sa
    pol = sa.policy_from_extra(ex) if "policy_from_extra" in dir(sa) else None
    if pol is not None and hasattr(pol, "is_admin"):
        sig = inspect.signature(pol.is_admin)
        def adm(u):
            try: return pol.is_admin(u)
            except TypeError: return pol.is_admin(u, "dm")
        chk("slash gating: Owner admin", adm(owner) is True)
        for i, o in enumerate(others): chk(f"slash gating: diğer id #{i+1} admin DEĞİL", adm(o) is False)
    else:
        print("  [INFO] slash_access.policy_from_extra/is_admin bulunamadı; gating doğrudan sınanmadı")
except Exception as e:
    print(f"  [INFO] slash gating sınaması atlandı: {type(e).__name__}")
print("VERIFY_RESULT=" + ("PASS" if ok else "FAIL"))
sys.exit(0 if ok else 1)
'''
def verify(home, label):
    print(f"--- doğrulama ({label}):")
    env = dict(os.environ, HERMES_HOME=home)
    env.pop("HERMES_PROFILE", None)
    p = subprocess.run([sys.executable, "-I", "-c", VERIFY, OWNER, ",".join(OTHER)], cwd=os.getcwd(),
                       env=env, capture_output=True, text=True)
    out = mask(p.stdout)
    for o in OTHER: out = out.replace(o, "<ID>")
    print(out.rstrip())
    if p.returncode not in (0, 1):
        err = p.stderr.strip().splitlines()[-1:] if p.stderr else []
        print("  yükleyici hatası:", mask(" ".join(err))[:300])
    return p.returncode == 0

# kopya profil (yalnız config.yaml + .env; 0600)
os.makedirs(os.path.join(TMP, "h"), mode=0o700)
TH = os.path.join(TMP, "h")
with open(os.path.join(TH, "config.yaml"), "w") as f: f.write(new_text)
shutil.copy2(ENV, os.path.join(TH, ".env")); os.chmod(os.path.join(TH, ".env"), 0o600)
pair = os.path.join(PD, "platforms", "pairing")
if os.path.isdir(pair): shutil.copytree(pair, os.path.join(TH, "platforms", "pairing"))
if not verify(TH, "geçici kopya, değişiklik SONRASI"):
    fail("geçici kopyada doğrulama geçmedi; gerçek dosyaya dokunulmadı")

if mode != "apply":
    print("\nPLAN tamam: gerçek config.yaml DEĞİŞMEDİ. Uygulamak için --apply ekleyin."); sys.exit(0)

# --- APPLY: yedek + atomik yazım + yeniden doğrulama
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
B = os.path.join(PD, "backups", f"sel434-{ts}"); os.makedirs(B, mode=0o700)
for f in ("config.yaml", ".env"): shutil.copy2(os.path.join(PD, f), os.path.join(B, f))
if os.path.isdir(pair): shutil.copytree(pair, os.path.join(B, "pairing"))
print(f"Yedek: {B.replace(os.path.expanduser('~'), '~')}")
st = os.stat(CFG); tmpf = CFG + f".sel434-{ts}.tmp"
with open(tmpf, "w") as f: f.write(new_text)
os.chmod(tmpf, st.st_mode & 0o777); os.replace(tmpf, CFG)
print("config.yaml yazıldı.")
if not verify(PD, "GERÇEK profil, yazım SONRASI"):
    shutil.copy2(os.path.join(B, "config.yaml"), CFG)
    fail("gerçek profilde doğrulama geçmedi → config.yaml yedekten GERİ ALINDI")
print("\nAPPLY tamam. Geri dönüş:")
print(f"  cp -p {B.replace(os.path.expanduser('~'), '~')}/config.yaml ~/.hermes/profiles/agosorchestrator/config.yaml")
print("Gateway BAŞLATILMADI (K7 ayrı karar).")
PYEOF
