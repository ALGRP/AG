#!/bin/bash
# SEL-434 — agos-hermes-ctrl-01 / profil agosprod sıkılaştırma (K2+K3+K4 + allowlist + ALLOW_ALL kapatma).
# Mac'ten:
#   PLAN : ssh -o IdentitiesOnly=yes -i ~/.ssh/agos-hermes-admin agosadmin@62.238.35.60 'sudo bash -s -- --owner-confirmed' < outputs/sel434-ctrl-harden.sh
#   APPLY: ssh ... 'sudo bash -s -- --owner-confirmed --apply' < outputs/sel434-ctrl-harden.sh
# Servis başlatmaz/durdurmaz. Token'a dokunmaz. Owner id ve token BASILMAZ.
set -euo pipefail
MODE=plan; OK=no
for a in "$@"; do case "$a" in --apply) MODE=apply;; --owner-confirmed) OK=yes;; *) echo "bilinmeyen argüman: $a"; exit 2;; esac; done
[ "$(id -u)" = 0 ] || { echo "sudo ile çalıştırın"; exit 2; }
[ "$OK" = yes ] || { echo "--owner-confirmed gerekli"; exit 2; }
SVC=hermes-ctrl-agosprod
P=/var/lib/hermes-ctrl/profiles/agosprod
CODE=/opt/hermes-ctrl/current
PY=$CODE/venv/bin/python
[ -x "$PY" ] || { echo "python YOK: $PY"; exit 2; }
if systemctl is-active --quiet "$SVC"; then echo "Servis ÇALIŞIYOR; önce durdurulmalı. Değişiklik reddedildi."; exit 3; fi
echo "Servis: $(systemctl is-active $SVC 2>/dev/null || true) / $(systemctl is-enabled $SVC 2>/dev/null || true)"
TMP=$(mktemp -d); chmod 711 "$TMP"; trap 'rm -rf "$TMP"' EXIT
cd "$CODE"
"$PY" -I - "$MODE" "$P" "$TMP" "$PY" "$CODE" <<'PYEOF'
import sys, os, re, shutil, difflib, datetime, subprocess, pwd
mode, P, TMP, PY, CODE = sys.argv[1:6]
import yaml
CFG, ENV = os.path.join(P, "config.yaml"), os.path.join(P, ".env")
def fail(m): print("DURDURULDU:", m); sys.exit(4)
_TOK = re.compile(r"\d{6,}:[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,}")
# ---- .env oku
env_txt = open(ENV).read(); env_lines = env_txt.split("\n")
def env_get(k):
    v = None
    for l in env_lines:
        m = re.match(r"\s*(?:export\s+)?%s=(.*)" % k, l)
        if m: v = m.group(1).split("#")[0].strip().strip('"').strip("'")
    return v
allowed = [x.strip() for x in re.split(r"[,;]", env_get("TELEGRAM_ALLOWED_USERS") or "") if x.strip()]
home = (env_get("TELEGRAM_HOME_CHANNEL") or "").strip()
aa = (env_get("TELEGRAM_ALLOW_ALL_USERS") or "")
print(f".env: allowlist id adedi={len(allowed)}, '*' var mı={'EVET' if '*' in allowed else 'HAYIR'}, TELEGRAM_ALLOW_ALL_USERS={'true-benzeri' if aa.lower() in ('1','true','yes','on') else ('boş/YOK' if not aa else 'false-benzeri')}")
if not home.lstrip("-").isdigit() or home not in allowed: fail("TELEGRAM_HOME_CHANNEL tek sayısal id değil veya allowlist'te yok (Owner id belirlenemedi)")
OWNER = home; OTHER = [x for x in allowed if x not in (OWNER, "*")]
mask = lambda s: _TOK.sub("<REDACTED>", s.replace(OWNER, "<OWNER>"))
# ---- config.yaml: minimal metin düzenleme
orig = open(CFG).read(); data = yaml.safe_load(orig) or {}
if "telegram" in data: fail("config.yaml'da zaten üst seviye 'telegram:' var; elle incelenmeli")
for k in ("dm_policy","group_policy","unauthorized_dm_behavior","allow_admin_from"):
    if k in data: fail(f"üst seviyede beklenmeyen '{k}'")
lines = orig.rstrip("\n").split("\n"); add = []
ap = data.get("approvals")
if ap is None:
    add += ["approvals:", "  mode: manual", "  cron_mode: deny"]
elif isinstance(ap, dict):
    if "approvals:" not in lines: fail("approvals biçimi beklenmedik")
    ai = lines.index("approvals:"); hits = []
    for i in range(ai+1, len(lines)):
        l = lines[i]
        if l and not l[0].isspace() and not l.startswith("#"): break
        if re.fullmatch(r"  mode:\s*\S+\s*", l): hits.append(i)
    if len(hits) == 1: lines[hits[0]] = "  mode: manual"
    elif len(hits) == 0: lines.insert(ai+1, "  mode: manual")
    else: fail("approvals altında birden çok mode")
    if "cron_mode" not in ap: lines.insert(lines.index("approvals:")+1, "  cron_mode: deny")
else: fail("approvals sözlük değil")
if "command_allowlist" in data:
    if data["command_allowlist"] not in ([], None): fail("command_allowlist dolu; elle incelenmeli")
else: add += ["command_allowlist: []"]
add += ["telegram:", "  dm_policy: allowlist", "  unauthorized_dm_behavior: ignore", "  group_policy: disabled",
        f"  allow_admin_from: ['{OWNER}']", "  user_allowed_commands: []",
        f"  group_allow_admin_from: ['{OWNER}']", "  group_user_allowed_commands: []"]
new_cfg = "\n".join(lines + add) + "\n"
after = yaml.safe_load(new_cfg); exp = dict(data)
exp["approvals"] = dict(data.get("approvals") or {}, mode="manual"); exp["approvals"].setdefault("cron_mode", "deny")
exp.setdefault("command_allowlist", [])
exp["telegram"] = {"dm_policy":"allowlist","unauthorized_dm_behavior":"ignore","group_policy":"disabled",
                   "allow_admin_from":[OWNER],"user_allowed_commands":[],"group_allow_admin_from":[OWNER],"group_user_allowed_commands":[]}
if after != exp: fail("anlamsal kontrol başarısız (config)")
# ---- .env: ALLOW_ALL kapat (token'a dokunma)
new_env_lines = []; n_aa = 0
for l in env_lines:
    if re.match(r"\s*(?:export\s+)?(TELEGRAM_ALLOW_ALL_USERS|GATEWAY_ALLOW_ALL_USERS)=", l):
        new_env_lines.append(re.sub(r"=.*", "=false", l)); n_aa += 1
    else: new_env_lines.append(l)
new_env = "\n".join(new_env_lines)
print(f".env: ALLOW_ALL satırı false yapılacak: {n_aa} adet; başka satıra dokunulmuyor")
print("Anlamsal kontrol (config): OK")
print("--- config diff (Owner maskeli):")
for l in difflib.unified_diff(orig.splitlines(), new_cfg.splitlines(), "config.yaml(önce)", "config.yaml(sonra)", lineterm="", n=1): print(mask(l))
# ---- doğrulama: hermesrun olarak Hermes yükleyicisi
VERIFY = r'''
import sys, os
sys.path.insert(0, os.getcwd())
owner, others = sys.argv[1], [x for x in sys.argv[2].split(",") if x]
from gateway.config import load_gateway_config, Platform
cfg = load_gateway_config(); tp = cfg.platforms.get(Platform.TELEGRAM); ok = True
def chk(n, c):
    global ok; print(f"  [{'OK' if c else 'FAIL'}] {n}"); ok = ok and bool(c)
chk("telegram platformu yüklendi", tp is not None)
ex = dict(getattr(tp, "extra", {}) or {}) if tp else {}
chk("dm_policy=allowlist", str(ex.get("dm_policy")) == "allowlist")
chk("group_policy=disabled", str(ex.get("group_policy")) == "disabled")
chk("unauthorized_dm_behavior=ignore", cfg.get_unauthorized_dm_behavior(Platform.TELEGRAM) == "ignore")
for k in ("allow_admin_from","group_allow_admin_from"):
    chk(f"{k}=yalnız Owner", [str(x) for x in (ex.get(k) or [])] == [owner])
for k in ("user_allowed_commands","group_user_allowed_commands"):
    chk(f"{k}=[]", k in ex and list(ex.get(k) or []) == [])
try:
    import gateway.slash_access as sa
    pol = None
    for a in ((ex,), (ex,"dm"), (ex,"telegram")):
        try: pol = sa.policy_from_extra(*a); break
        except TypeError: pass
    def adm(u):
        for a in ((u,), (u,"dm")):
            try: return bool(pol.is_admin(*a))
            except TypeError: pass
        raise TypeError
    chk("slash: Owner admin", adm(owner) is True)
    for i,o in enumerate(others): chk(f"slash: diğer id #{i+1} admin DEĞİL", adm(o) is False)
except Exception as e: print("  [INFO] slash sınaması atlandı:", type(e).__name__)
aa = os.environ.get("TELEGRAM_ALLOW_ALL_USERS")
print("VERIFY_RESULT=" + ("PASS" if ok else "FAIL")); sys.exit(0 if ok else 1)
'''
hr = pwd.getpwnam("hermesrun")
RUNUSER = shutil.which("runuser") or "/usr/sbin/runuser"
def verify(home, label):
    print(f"--- doğrulama ({label}):")
    env = {"HERMES_HOME": home, "HOME": "/var/lib/hermes-ctrl", "PATH": "/usr/sbin:/usr/bin:/sbin:/bin"}
    p = subprocess.run([RUNUSER, "-u", "hermesrun", "--", PY, "-I", "-c", VERIFY, OWNER, ",".join(OTHER)],
                       cwd=CODE, env=env, capture_output=True, text=True)
    out = mask(p.stdout)
    for o in OTHER: out = out.replace(o, "<ID>")
    print(out.rstrip())
    if p.returncode not in (0, 1): print("  yükleyici hatası:", mask((p.stderr.strip().splitlines() or [""])[-1])[:300])
    return p.returncode == 0
TH = os.path.join(TMP, "h"); os.makedirs(TH)
open(os.path.join(TH, "config.yaml"), "w").write(new_cfg)
open(os.path.join(TH, ".env"), "w").write(new_env)
for root, dirs, files in os.walk(TMP):
    for x in dirs + files: os.chown(os.path.join(root, x), hr.pw_uid, hr.pw_gid)
os.chown(TMP, hr.pw_uid, hr.pw_gid)
os.chmod(os.path.join(TH, ".env"), 0o600)
if not verify(TH, "geçici kopya"): fail("geçici kopyada doğrulama geçmedi; gerçek dosyalar DEĞİŞMEDİ")
if mode != "apply": print("\nPLAN tamam: gerçek dosyalar DEĞİŞMEDİ. Uygulamak için --apply ekleyin."); sys.exit(0)
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
B = f"/var/lib/hermes-ctrl/backups-sel434/{ts}"; os.makedirs(B, mode=0o700)
os.chmod("/var/lib/hermes-ctrl/backups-sel434", 0o700)
for f in (CFG, ENV): shutil.copy2(f, B)
print("Yedek:", B, "(root:root 700)")
def atomic(path, text):
    st = os.stat(path); t = path + f".sel434-{ts}.tmp"
    open(t, "w").write(text); os.chown(t, st.st_uid, st.st_gid); os.chmod(t, st.st_mode & 0o777); os.replace(t, path)
atomic(CFG, new_cfg); atomic(ENV, new_env); print("config.yaml ve .env yazıldı.")
if not verify(P, "GERÇEK profil"):
    for f in ("config.yaml", ".env"): shutil.copy2(os.path.join(B, f), os.path.join(P, f))
    fail("gerçek profilde doğrulama geçmedi → dosyalar yedekten GERİ ALINDI")
import hashlib
for f in (CFG, ENV): print(f"sha256 {os.path.basename(f)}: {hashlib.sha256(open(f,'rb').read()).hexdigest()}")
print(f"\nAPPLY tamam. Geri dönüş:\n  sudo cp -p {B}/config.yaml {B}/.env {P}/")
print("Servis BAŞLATILMADI ve enable EDİLMEDİ.")
PYEOF
