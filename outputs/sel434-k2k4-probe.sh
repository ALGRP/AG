#!/bin/bash
# SEL-434 K2–K4 hazırlık yoklaması — STRICTLY READ-ONLY.
# config.yaml'da platforms.telegram ve approvals ağacının yalnız ANAHTAR ADLARINI ve TÜRLERİNİ basar.
# Değer basmaz (yalnız approvals.* politika değerleri basılır). Dosya yazmaz, servis başlatmaz.
set -u
CFG="$HOME/.hermes/profiles/agosorchestrator/config.yaml"
HB="$(command -v hermes)"
PY="$(head -1 "$HB" | sed -n 's/^#! *//p' | awk '{print $1}')"
[ -x "$PY" ] || PY=python3
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
            print(f"{'  '*depth}{prefix}{k}: <{t}>{n}")
            if isinstance(v, dict): tree(v, "", depth+1)
print("top-level keys:", sorted(d.keys()))
for path in (["platforms"], ["telegram"], ["gateway"]):
    node = d
    for p in path: node = node.get(p) if isinstance(node, dict) else None
    print(f"--- {'.'.join(path)}: {'VAR' if node is not None else 'YOK'}")
    if isinstance(node, dict): tree(node, "")
a = d.get("approvals")
print("--- approvals:", "VAR" if a is not None else "YOK")
if isinstance(a, dict):
    for k, v in a.items():
        print(f"  {k}: " + (repr(v) if isinstance(v, (str, bool, int)) or v is None else f"<{type(v).__name__}> len={len(v)}"))
PYEOF
echo "--- hermes config set desteği:"
hermes -p agosorchestrator config --help 2>&1 | head -30
