#!/usr/bin/env bash
# SEL-329 G1 madde 2 — STAGING_N8N_VERIFIED: production'dan AYRI test n8n (staging runner).
#   ssh agos-prod-01 'bash -s'               < outputs/sel329-staging-n8n.sh   # PLAN (hiçbir şey değişmez)
#   ssh agos-prod-01 'bash -s -- --apply'    < outputs/sel329-staging-n8n.sh   # kur + pasif test workflow'u içe aktar
#   ssh agos-prod-01 'bash -s -- --test'     < outputs/sel329-staging-n8n.sh   # doğrula (salt-okunur + sentetik çalıştırma)
#   ssh agos-prod-01 'bash -s -- --undo'     < outputs/sel329-staging-n8n.sh   # tamamen kaldır (konteyner, ağ, disk, anahtar)
# Tasarım:
#   - Image: prod 'agos-n8n' ile AYNI image kimliği (sürüm farkı yok, internetten çekme yok).
#   - Port YAYINLANMAZ (host'tan bile erişilemez). n8n'in sahipsiz ilk-kurulum ekranı bu yüzden kimseye açık değil.
#     Sağlık ve CLI kontrolleri 'docker exec' ile konteyner içinden. Web arayüzü/webhook gerekirse G2'de ayrıca planlanır.
#   - Kendi diski (SQLite, volume agos-staging-n8n-data); prod n8n DB'sine ve prod workflow'larına DOKUNULMAZ.
#   - Kimlik bilgisi (credential) YOK → WhatsApp/SMS/e-posta/Telegram gönderimi yapılamaz.
#   - Workflow'lar PASİF; yalnız Manual Trigger → NoOp sentetik test workflow'u.
#   - Kaynak sınırı 1 GB bellek / 1 CPU (prod servisleri korunur).
#   - Prod n8n konteyneri, compose dosyası ve ağı DEĞİŞMEZ.
set -euo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
MODE=plan; case "${1:-}" in --apply) MODE=apply;; --test) MODE=test;; --undo) MODE=undo;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
N=agos-staging-n8n; NET=agos-staging-n8n-net; VOL=agos-staging-n8n-data
KEY=/root/.secrets/agos-staging-n8n.key; SRC=${SRC:-agos-n8n}
WF_NAME="SEL-329 staging smoke (pasif)"
say(){ printf '%s\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }

if [ "$MODE" = undo ]; then
  docker rm -f "$N" >/dev/null 2>&1 && say "konteyner silindi" || say "konteyner yoktu"
  docker network rm "$NET" >/dev/null 2>&1 && say "ağ silindi" || say "ağ yoktu"
  docker volume rm "$VOL" >/dev/null 2>&1 && say "disk silindi" || say "disk yoktu"
  [ -f "$KEY" ] && rm -f "$KEY" && say "anahtar silindi" || say "anahtar yoktu"
  exit 0
fi

ex(){ docker exec -u node "$N" "$@"; }
wf_total(){ ex n8n list:workflow 2>/dev/null | grep -c '|' || true; }
wf_active(){ ex n8n list:workflow --active=true 2>/dev/null | grep -c '|' || true; }
port_bind(){ docker port "$N" 2>/dev/null | tr '\n' ' '; }
health(){ timeout 10 docker exec -u node "$N" node -e "fetch('http://127.0.0.1:5678/healthz').then(r=>r.text()).then(t=>console.log(t)).catch(()=>{})" 2>/dev/null || true; }

say "== durum =="
docker inspect "$SRC" >/dev/null 2>&1 || { say "HATA: prod n8n konteyneri '$SRC' bulunamadı (SRC=... ile verin)"; exit 1; }
IMG=$(docker inspect -f '{{.Image}}' "$SRC")
say "  prod n8n: $SRC  image=$(docker inspect -f '{{.Config.Image}}' "$SRC")  image_id=${IMG:7:12}  (DOKUNULMAYACAK)"
ST=$(docker inspect -f '{{.State.Status}} image_id={{.Image}}' "$N" 2>/dev/null) || ST=YOK
say "  staging n8n: $(printf '%s' "$ST" | sed -E 's/sha256:(.{12}).*/\1/')"
say "  ağ $NET: $(docker network inspect "$NET" >/dev/null 2>&1 && echo VAR || echo YOK)   disk $VOL: $(docker volume inspect "$VOL" >/dev/null 2>&1 && echo VAR || echo YOK)"
say "  boş bellek: $(free -m | awk '/^Mem:/{print $7" MB"}')"

if [ "$MODE" = plan ]; then
  cat <<EOF

== PLAN (hiçbir şey değişmedi) ==
--apply:
  1. $KEY (n8n şifreleme anahtarı, 32 bayt rastgele, root 600) yoksa oluşturulur; değeri yazdırılmaz.
  2. Ayrı ağ '$NET' ve disk '$VOL' oluşturulur.
  3. '$N' konteyneri prod ile aynı image kimliğiyle başlar: PORT YAYINI YOK, 1 GB / 1 CPU,
     telemetri/şablon/sürüm bildirimi kapalı, env erişimi node'lara kapalı, restart unless-stopped.
  4. Sağlık (healthz) beklenir; '$WF_NAME' (Manual Trigger → NoOp) içe aktarılır ve tüm workflow'lar PASİF yapılır.
--test:
  5. Port yayını yok, image prod ile aynı, healthz ok, aktif workflow=0, credential=0,
     sentetik workflow CLI ile bir kez çalıştırılır (dışarıya hiçbir şey göndermez).
Geri alma: --undo
EOF
  exit 0
fi

if [ "$MODE" = apply ]; then
  if docker inspect "$N" >/dev/null 2>&1; then
    say "  '$N' zaten var; yeniden oluşturulmuyor (önce --undo)."
  else
    install -d -m 700 -o root -g root /root/.secrets
    if [ ! -f "$KEY" ]; then umask 077; openssl rand -hex 32 > "$KEY.tmp"; chmod 600 "$KEY.tmp"; mv "$KEY.tmp" "$KEY"; fi
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create --label agos.env=staging "$NET" >/dev/null
    docker volume inspect "$VOL" >/dev/null 2>&1 || docker volume create --label agos.env=staging "$VOL" >/dev/null
    docker run -d --name "$N" --restart unless-stopped --network "$NET" \
      --memory 1g --cpus 1 --label agos.env=staging --label agos.sel=SEL-329 \
      -v "$VOL:/home/node/.n8n" \
      -e N8N_ENCRYPTION_KEY="$(cat "$KEY")" \
      -e N8N_HOST=127.0.0.1 -e N8N_PORT=5678 -e N8N_PROTOCOL=http -e N8N_SECURE_COOKIE=false \
      -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
      -e N8N_TEMPLATES_ENABLED=false -e N8N_PERSONALIZATION_ENABLED=false -e N8N_HIRING_BANNER_ENABLED=false \
      -e N8N_BLOCK_ENV_ACCESS_IN_NODE=true -e N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true \
      -e EXECUTIONS_DATA_PRUNE=true -e EXECUTIONS_DATA_MAX_AGE=168 \
      -e GENERIC_TIMEZONE=Europe/Istanbul -e TZ=Europe/Istanbul -e AGOS_ENV=staging \
      "$IMG" >/dev/null
    say "  konteyner başlatıldı"
  fi
  ok=0; for i in $(seq 1 60); do case "$(health)" in *'"ok"'*) ok=1; break;; esac; sleep 3; done
  [ $ok = 1 ] && say "  healthz: ok" || { say "  healthz: YANIT YOK (docker logs $N | tail ile bakın)"; exit 1; }
  if ex n8n list:workflow 2>/dev/null | grep -qF "$WF_NAME"; then
    say "  test workflow'u zaten var"
  else
    cat <<JSON | docker exec -i -u node "$N" sh -c 'cat > /tmp/sel329-smoke.json'
[{"name":"$WF_NAME","active":false,"settings":{},
  "nodes":[
    {"parameters":{},"id":"0b7c9f5e-3f1d-4c55-9a0e-5b2f2a1c3290","name":"Manual Trigger","type":"n8n-nodes-base.manualTrigger","typeVersion":1,"position":[0,0]},
    {"parameters":{},"id":"5d1e8c43-2b7a-4f0e-8c39-1f6a7e2d9b11","name":"No Operation","type":"n8n-nodes-base.noOp","typeVersion":1,"position":[240,0]}],
  "connections":{"Manual Trigger":{"main":[[{"node":"No Operation","type":"main","index":0}]]}}}]
JSON
    ex n8n import:workflow --input=/tmp/sel329-smoke.json 2>&1 | grep -iE 'success|imported|error' | head -2 | sed 's/^/  içe aktarma: /' || true
    ex rm -f /tmp/sel329-smoke.json || true
  fi
  ex n8n update:workflow --all --active=false >/dev/null 2>&1 || true
  say "  workflow toplam=$(wf_total) aktif=$(wf_active)"
  say "APPLY tamam. Sıradaki: --test"
  exit 0
fi

# --- test ---
docker inspect "$N" >/dev/null 2>&1 || { say "HATA: '$N' yok, önce --apply"; exit 1; }
pass(){ printf '  %-34s %s\n' "$1" "$2"; }
R=0; chk(){ if [ "$2" = PASS ]; then pass "$1" "PASS${3:+ ($3)}"; else pass "$1" "FAIL${3:+ ($3)}"; R=1; fi; }
B=$(port_bind); [ -z "$B" ] && chk "port yayını yok" PASS || chk "port yayını yok" FAIL "$B"
[ "$(docker inspect -f '{{.Image}}' "$N")" = "$IMG" ] && chk "image prod ile aynı" PASS "${IMG:7:12}" || chk "image prod ile aynı" FAIL
case "$(health)" in *'"ok"'*) chk "healthz" PASS;; *) chk "healthz" FAIL;; esac
[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$N")" = "$NET" ] && chk "ayrı ağ" PASS "$NET" || chk "ayrı ağ" FAIL
PRODNETS=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$SRC")
case " $PRODNETS " in *" $NET "*) chk "prod n8n ile ağ paylaşımı yok" FAIL;; *) chk "prod n8n ile ağ paylaşımı yok" PASS;; esac
T=$(wf_total); A=$(wf_active)
[ "$A" = 0 ] && chk "aktif workflow = 0" PASS "toplam=$T" || chk "aktif workflow = 0" FAIL "aktif=$A"
CR=$(ex sh -c 'n8n export:credentials --all --output=/tmp/c.json >/dev/null 2>&1; if [ -s /tmp/c.json ]; then grep -o "\"id\"" /tmp/c.json | wc -l; else echo 0; fi; rm -f /tmp/c.json' 2>/dev/null || echo "?")
[ "$CR" = 0 ] && chk "credential = 0 (gönderim imkânsız)" PASS || chk "credential = 0 (gönderim imkânsız)" FAIL "sayı=$CR"
WID=$(ex n8n list:workflow 2>/dev/null | grep -F "$WF_NAME" | head -1 | cut -d'|' -f1 | tr -d ' ')
if [ -n "$WID" ]; then
  OUT=$(timeout 180 docker exec -u node "$N" n8n execute --id="$WID" 2>&1 || true)
  printf '%s' "$OUT" | grep -qi 'execution was successful' && chk "sentetik çalıştırma (Manual→NoOp)" PASS || chk "sentetik çalıştırma (Manual→NoOp)" FAIL "$(printf '%s' "$OUT" | grep -iE 'error|fail' | head -1 | cut -c1-100)"
else
  chk "sentetik çalıştırma (Manual→NoOp)" FAIL "test workflow'u yok"
fi
[ "$(wf_active)" = 0 ] && chk "çalıştırma sonrası aktif = 0" PASS || chk "çalıştırma sonrası aktif = 0" FAIL
say ""
[ $R = 0 ] && say "STAGING_N8N_TEST=PASS" || say "STAGING_N8N_TEST=FAIL"
