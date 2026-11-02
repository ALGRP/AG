#!/bin/bash
# SEL-434 K6 — agos-hermes-ctrl-01 / agosprod config kilidi.
#   PLAN : ssh ... 'sudo bash -s' < outputs/sel434-ctrl-k6.sh
#   APPLY: ssh ... 'sudo bash -s -- --apply' < outputs/sel434-ctrl-k6.sh   (drop-in + precheck kurar, pin yazar)
#   REPIN: ssh ... 'sudo bash -s -- --repin' < outputs/sel434-ctrl-k6.sh   (Owner'ın bilinçli değişikliğinden sonra pin günceller)
#   UNDO : ssh ... 'sudo bash -s -- --undo'  < outputs/sel434-ctrl-k6.sh   (drop-in ve precheck'i kaldırır)
# Servisi başlatmaz/enable etmez. Token/id BASMAZ.
set -euo pipefail
MODE=plan
case "${1:-}" in --apply) MODE=apply;; --repin) MODE=repin;; --undo) MODE=undo;; "") ;; *) echo "bilinmeyen: $1"; exit 2;; esac
[ "$(id -u)" = 0 ] || { echo "sudo ile çalıştırın"; exit 2; }
SVC=hermes-ctrl-agosprod
P=/var/lib/hermes-ctrl/profiles/agosprod
ROOTCFG=/var/lib/hermes-ctrl/config.yaml
DROPDIR=/etc/systemd/system/$SVC.service.d
DROP=$DROPDIR/10-sel434-k6.conf
PRE=/usr/local/sbin/sel434-hermes-ctrl-precheck
PINDIR=/etc/hermes-ctrl
PIN=$PINDIR/agosprod.sha256
FILES="$P/config.yaml $P/.env"
[ -f "$ROOTCFG" ] && FILES="$FILES $ROOTCFG"

read -r -d '' DROP_TXT <<EOT || true
# SEL-434 K6 — Owner onaylı. Kaldırmak için: sel434-ctrl-k6.sh --undo
[Service]
ExecStartPre=+$PRE
ReadOnlyPaths=$FILES
EOT

read -r -d '' PRE_TXT <<'EOT' || true
#!/bin/bash
# SEL-434 K6 precheck: config/.env pin + tehlikeli ayar kontrolü. Başarısızsa servis BAŞLAMAZ.
set -u
PIN=/etc/hermes-ctrl/agosprod.sha256
P=/var/lib/hermes-ctrl/profiles/agosprod
fail(){ echo "SEL434-PRECHECK FAIL: $*" >&2; exit 1; }
[ -f "$PIN" ] || fail "pin dosyası yok"
[ "$(stat -c '%U %a' "$PIN")" = "root 600" ] || fail "pin dosyası root 600 değil"
sha256sum --quiet -c "$PIN" >/dev/null 2>&1 || fail "config/.env pin ile eşleşmiyor (değiştirilmiş). Bilinçli değişiklikse admin --repin çalıştırmalı."
E="$P/.env"
grep -qiE '^[[:space:]]*(export[[:space:]]+)?(TELEGRAM|GATEWAY)_ALLOW_ALL_USERS=[[:space:]]*["'"'"']?(1|true|yes|on)' "$E" && fail "ALLOW_ALL açık"
grep -qE '^[[:space:]]*(export[[:space:]]+)?(TELEGRAM|GATEWAY)_ALLOWED_USERS=.*\*' "$E" && fail "allowlist'te '*' var"
grep -qiE '^[[:space:]]*(export[[:space:]]+)?HERMES_YOLO_MODE=[[:space:]]*["'"'"']?(1|true|yes|on)' "$E" && fail "YOLO açık"
C="$P/config.yaml"
grep -qE '^telegram:' "$C" || fail "telegram bloğu yok"
grep -qE '^  allow_admin_from: \[' "$C" || fail "allow_admin_from yok"
grep -qE '^  mode: manual' "$C" || fail "approvals.mode manual değil"
echo "SEL434-PRECHECK OK"
EOT

writepin(){ install -d -m 700 -o root -g root "$PINDIR"; sha256sum $FILES > "$PIN.tmp"; chmod 600 "$PIN.tmp"; chown root:root "$PIN.tmp"; mv "$PIN.tmp" "$PIN"; echo "Pin yazıldı ($PIN):"; sed 's/^/  /' "$PIN"; }

echo "Servis: $(systemctl is-active $SVC 2>/dev/null || true) / $(systemctl is-enabled $SVC 2>/dev/null || true)"
case $MODE in
plan)
  echo "--- kurulacak drop-in ($DROP):"; echo "$DROP_TXT" | sed 's/^/  /'
  echo "--- kurulacak precheck ($PRE, root 755): $(echo "$PRE_TXT" | wc -l) satır"
  echo "--- pinlenecek dosyalar:"; sha256sum $FILES | sed 's/^/  /'
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  echo "$PRE_TXT" > "$T/pre"; sha256sum $FILES > "$T/pin"
  sed -i "s#^PIN=.*#PIN=$T/pin#" "$T/pre"; chmod 600 "$T/pin"
  echo "--- precheck kuru çalıştırma (geçici pin ile; root 600 kontrolü dahil):"; bash "$T/pre" 2>&1 | sed 's/^/  /' || true
  echo; echo "PLAN tamam: hiçbir şey yazılmadı. Uygulamak için --apply."
  ;;
apply)
  systemctl is-active --quiet $SVC && { echo "Servis çalışıyor; önce durdurun."; exit 3; }
  install -d -m 755 "$DROPDIR"
  printf '%s\n' "$PRE_TXT" > "$PRE.tmp"; chown root:root "$PRE.tmp"; chmod 755 "$PRE.tmp"; mv "$PRE.tmp" "$PRE"
  printf '%s\n' "$DROP_TXT" > "$DROP.tmp"; chmod 644 "$DROP.tmp"; mv "$DROP.tmp" "$DROP"
  writepin
  systemctl daemon-reload
  echo "--- systemd birleşik tanım (ilgili satırlar):"; systemctl cat $SVC | grep -E '^(ExecStartPre|ReadOnlyPaths|ReadWritePaths|ExecStart)=' | sed 's/^/  /'
  echo "--- precheck testi:"; "$PRE" 2>&1 | sed 's/^/  /' || true
  echo; echo "APPLY tamam. Servis BAŞLATILMADI. Geri almak için: --undo"
  ;;
repin)
  [ -x "$PRE" ] || { echo "K6 kurulu değil"; exit 2; }
  echo "Mevcut pin ile fark:"; sha256sum -c "$PIN" 2>&1 | sed 's/^/  /' || true
  writepin; "$PRE" 2>&1 | sed 's/^/  /' || true
  ;;
undo)
  rm -f "$DROP" "$PRE"; rmdir "$DROPDIR" 2>/dev/null || true; systemctl daemon-reload; echo "K6 kaldırıldı (pin dosyası $PIN bırakıldı)."
  ;;
esac
