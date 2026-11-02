#!/bin/bash
# SEL-434 K2–K4 hazırlık yoklaması — STRICTLY READ-ONLY.
# config.yaml'da platforms.telegram ve approvals ağacının yalnız ANAHTAR ADLARINI ve TÜRLERİNİ basar.
# Değer basmaz (yalnız approvals.* politika değerleri basılır). Dosya yazmaz, servis başlatmaz.
set -u
CFG="$HOME/.hermes/profiles/agosorchestrator/config.yaml"
HB="$(command -v hermes)"
# Yalnız GERÇEK bir python yorumlayıcısı kabul edilir (hermes bash sarmalayıcısı olabilir).
PY=""
for c in "$HOME/.hermes/hermes-agent/venv/bin/python3" "$HOME/.hermes/hermes-agent/.venv/bin/python3" \
         $(grep -oE '/[^" ]*/bin/python3?' "$HB" 2>/dev/null) "$(command -v python3)"; do
  [ -n "$c" ] && [ -x "$c" ] || continue
  case "$(basename "$c")" in python*) ;; *) continue;; esac
  "$c" -c 'import sys; sys.exit(0 if sys.version_info[0]==3 else 1)' 2>/dev/null || continue
  PY="$c"; break
done
[ -n "$PY" ] || { echo "Python yorumlayıcısı bulunamadı; durduruldu."; exit 2; }
echo "hermes: $HB"; echo "python: $PY"
"$PY" -I - "$CFG" <<'PYEOF'
import sys
try:
    import yaml
except Exception as e:
    print("PyYAML YOK:", type(e).__name__); sys.exit(2)
try:
    import ruamel.yaml  # noqa
    print("ruamel.yaml: VAR")
except Exception:
    print("ruamel.yaml: YOK")
d = yaml.safe_load(open(sys.argv[1])) or {}
def tree(node, prefix, depth=0):
    if depth > 4: return
    if isinstance(node, dict):
        for k, v in node.items():
            t = type(v).__name__
            n = f" (len={len(v)})" if isinstance(v, (list, dict)) else ""
            ks = str(k)
            if sum(c.isdigit() for c in ks) >= 5 or len(ks) > 40: ks = "<MASKED-KEY>"
            print(f"{'  '*depth}{prefix}{ks}: <{t}>{n}")
            if isinstance(v, dict): tree(v, "", depth+1)
print("top-level keys:", sorted(d.keys()))
for path in (["platforms"], ["telegram"], ["gateway"]):
    node = d
    for p in path: node = node.get(p) if isinstance(node, dict) else None
    print(f"--- {'.'.join(path)}: {'VAR' if node is not None else 'YOK'}")
    if isinstance(node, dict): tree(node, "")
def find(node, path=()):
    if isinstance(node, dict):
        for k, v in node.items():
            if str(k).upper().startswith(("TELEGRAM_", "GATEWAY_", "HERMES_")) or str(k) in ("allow_admin_from","user_allowed_commands","group_allow_admin_from","group_user_allowed_commands","dm_policy","group_policy","unauthorized_dm_behavior","multiplex_profiles"):
                n = len([x for x in str(v).replace(";", ",").split(",") if x.strip()]) if isinstance(v, (str, int)) else (len(v) if isinstance(v, (list, dict)) else 0)
                star = ("*" in str(v)) if isinstance(v, (str, list)) else False
                print(f"  {'.'.join(path+(str(k),))}: <{type(v).__name__}> öğe={n} yıldız={'VAR' if star else 'YOK'}")
            find(v, path+(str(k),))
print("--- güvenlik anahtarları (konum/tür/sayı, değer yok):")
find(d)
a = d.get("approvals")
print("--- approvals:", "VAR" if a is not None else "YOK")
if isinstance(a, dict):
    for k, v in a.items():
        print(f"  {k}: " + (repr(v) if isinstance(v, (str, bool, int)) or v is None else f"<{type(v).__name__}> len={len(v)}"))
PYEOF
echo "--- hermes config set desteği:"
hermes -p agosorchestrator config --help 2>&1 | head -30
