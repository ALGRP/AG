#!/usr/bin/env bash
# SEL-433 — AGOS beceri paketini (outputs/hermes-skills/agos) ctrl-01 Hermes profiline SALT-OKUNUR kur. MAC'te çalışır.
#   bash outputs/hermes-skills/deploy-ctrl.sh            # PLAN: sunucuda ne var, ne kurulacak (değişiklik yok)
#   bash outputs/hermes-skills/deploy-ctrl.sh --apply    # kur + doğrula + gateway'i yeniden başlat
# Kurulum yeri: $HERMES_HOME/skills/agos/  sahip root:hermesrun, dizin 750, dosya 640
#   → Hermes okur ama DEĞİŞTİREMEZ/SİLEMEZ. Önceki sürüm /var/lib/hermes-ctrl/backups-sel433/ altına yedeklenir.
set -euo pipefail
MODE=plan; [ "${1:-}" = "--apply" ] && MODE=apply
SSH_CTRL=${SSH_CTRL:-"ssh -o IdentitiesOnly=yes -i $HOME/.ssh/agos-hermes-admin agosadmin@62.238.35.60"}
PKG=$(cd "$(dirname "$0")" && pwd)/agos
[ -d "$PKG" ] || { echo "paket yok: $PKG"; exit 1; }
sha12(){ if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-12; }

echo "== yerel paket =="
for s in "$PKG"/*/SKILL.md; do printf '  %-32s %s\n' "$(basename "$(dirname "$s")")" "$(sha12 "$s")"; done
if grep -rnE '([0-9]{6,}:[A-Za-z0-9_-]{30,})|(sk-[A-Za-z0-9]{20,})|(BEGIN [A-Z ]*PRIVATE KEY)' "$PKG" >/dev/null; then
  echo "HATA: pakette gizli değer benzeri içerik var; durdu"; exit 1; fi
echo "  gizli değer taraması: temiz"

B64=$(tar -C "$(dirname "$PKG")" -czf - agos | base64 | tr -d '\n')
REMOTE=$(cat <<'EOS'
set -euo pipefail
MODE=$1; B64=$2
HH=/var/lib/hermes-ctrl/profiles/agosprod
PY=/opt/hermes-ctrl/current/venv/bin/python
RUNUSER=$(command -v runuser || echo /usr/sbin/runuser)
SK="$HH/skills"; DEST="$SK/agos"
echo "== sunucu =="
echo "  HERMES_HOME=$HH  skills dizini: $( [ -d "$SK" ] && stat -c '%a %U:%G' "$SK" || echo YOK )"
echo "  mevcut beceri klasörleri: $(ls -1 "$SK" 2>/dev/null | tr '\n' ' ')"
[ -d "$DEST" ] && echo "  mevcut agos paketi: VAR ($(ls -1 "$DEST" | tr '\n' ' '))" || echo "  mevcut agos paketi: YOK"
echo "  servis: $(systemctl is-active hermes-ctrl-agosprod)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
printf '%s' "$B64" | base64 -d | tar -C "$TMP" -xzf -
echo "  gelen paket: $(ls -1 "$TMP/agos" | tr '\n' ' ')"
if [ "$MODE" != apply ]; then echo; echo "PLAN tamam: hiçbir şey değişmedi. Kurmak için --apply."; exit 0; fi

TS=$(date -u +%Y%m%d-%H%M%S); BK=/var/lib/hermes-ctrl/backups-sel433; install -d -m 700 -o root -g root "$BK"
[ -d "$DEST" ] && tar -C "$SK" -czf "$BK/skills-agos-$TS.tgz" agos && echo "  yedek: $BK/skills-agos-$TS.tgz"
[ -d "$SK" ] || install -d -m 750 -o hermesrun -g hermesrun "$SK"
rm -rf "$DEST.new"; cp -r "$TMP/agos" "$DEST.new"
chown -R root:hermesrun "$DEST.new"; find "$DEST.new" -type d -exec chmod 750 {} +; find "$DEST.new" -type f -exec chmod 640 {} +
rm -rf "$DEST.old"; [ -d "$DEST" ] && mv "$DEST" "$DEST.old"; mv "$DEST.new" "$DEST"; rm -rf "$DEST.old"
echo "  kuruldu: $DEST (root:hermesrun 750/640)"
echo "== doğrulama =="
"$RUNUSER" -u hermesrun -- test -r "$DEST/agos-roadmap/SKILL.md" && echo "  hermesrun okuyabiliyor: EVET" || echo "  hermesrun okuyabiliyor: HAYIR"
"$RUNUSER" -u hermesrun -- sh -c "touch '$DEST/agos-roadmap/x' 2>/dev/null" && echo "  hermesrun yazabiliyor: EVET (BEKLENMEZ)" || echo "  hermesrun yazabiliyor: HAYIR (iyi)"
"$RUNUSER" -u hermesrun -- env HERMES_HOME="$HH" HOME=/var/lib/hermes-ctrl "$PY" -m hermes_cli.main skills list 2>/dev/null | grep -iE 'agos' | sed 's/^/  hermes skills: /' || echo "  (hermes skills list çıktısında agos görünmedi; gateway yeniden başlayınca kontrol edin)"
systemctl restart hermes-ctrl-agosprod; sleep 20
echo "  servis: $(systemctl is-active hermes-ctrl-agosprod)"
journalctl -u hermes-ctrl-agosprod --since "-1min" --no-pager | grep -E 'PRECHECK|Connecting|conflict|rejected' | sed -E 's/[0-9]{6,}:[A-Za-z0-9_-]{20,}/<TOKEN>/g; s/^/  /' | tail -5
echo
echo "APPLY tamam. Geri alma: sudo rm -rf $DEST  (ve gerekirse yedekten: tar -C $SK -xzf $BK/skills-agos-$TS.tgz) && sudo systemctl restart hermes-ctrl-agosprod"
EOS
)
# Betik ve paket argüman olarak değil, stdin'den gider (bash -s); paket base64 olarak betiğin içinde.
{ printf 'set -- %q %q\n' "$MODE" "$B64"; printf '%s\n' "$REMOTE"; } | $SSH_CTRL 'sudo bash -s'
