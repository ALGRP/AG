#!/usr/bin/env bash
# SEL-434 — agos-staging-postgres portunu kalıcı olarak 127.0.0.1'e bağla.
# Varsayılan PLAN (hiçbir şey değişmez).  --apply: Owner onayıyla uygular.  --undo: eski konteynere döner.
#   ssh agos-prod-01 'bash -s' < outputs/sel434-prod-pg-lockdown.sh
#   ssh agos-prod-01 'bash -s -- --apply' < outputs/sel434-prod-pg-lockdown.sh
# Yöntem: aynı image + aynı veri volume'u + aynı env ile yeni konteyner; yalnız port -p 127.0.0.1:5434:5432.
# Eski konteyner SİLİNMEZ; durdurulup "<ad>-pre-sel434" adıyla saklanır (geri dönüş için).
# Env değerleri ekrana yazılmaz; root 600 geçici dosyadan okunur ve silinir.
set -euo pipefail
LC_ALL=C
C=agos-staging-postgres
OLD="${C}-pre-sel434"
MODE=plan
case "${1:-}" in --apply) MODE=apply;; --undo) MODE=undo;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
say(){ printf '%s\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "root gerekli"; exit 1; }

if [ "$MODE" = undo ]; then
  docker inspect "$OLD" >/dev/null 2>&1 || { say "geri dönülecek $OLD YOK"; exit 1; }
  docker stop "$C" >/dev/null 2>&1 || true
  docker rm "$C" >/dev/null 2>&1 || true
  docker rename "$OLD" "$C"; docker start "$C" >/dev/null
  say "UNDO tamam: eski konteyner geri geldi (port yine 0.0.0.0:5434; Hetzner duvarı koruyor)."
  exit 0
fi

docker inspect "$C" >/dev/null 2>&1 || { say "konteyner YOK: $C"; exit 1; }
docker inspect "$OLD" >/dev/null 2>&1 && { say "$OLD zaten var; önce durumu inceleyin (--undo veya elle)."; exit 1; }

IMG=$(docker inspect -f '{{.Image}}' "$C")
IMGNAME=$(docker inspect -f '{{.Config.Image}}' "$C")
HOSTPORT=$(docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}' "$C")
mapfile -t NETS < <(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$C" | sed '/^$/d')
mapfile -t MOUNTS < <(docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}}{{else}}{{.Source}}:{{.Destination}}{{end}}{{if not .RW}}:ro{{end}}{{"\n"}}{{end}}' "$C" | sed '/^$/d')
CMD=$(docker inspect -f '{{json .Config.Cmd}}' "$C")
ENTRY=$(docker inspect -f '{{json .Config.Entrypoint}}' "$C")
SHM=$(docker inspect -f '{{.HostConfig.ShmSize}}' "$C")

say "== mevcut =="
say "image=$IMGNAME ($IMG)"
say "port=${HOSTPORT:-YOK}  (boş IP = 0.0.0.0)"
say "ağlar=${NETS[*]:-YOK}"
say "mountlar=${#MOUNTS[@]}: $(printf '%s ' "${MOUNTS[@]}" | sed -E 's/[0-9a-f]{64}/<VOL:&>/g' | sed -E 's/<VOL:([0-9a-f]{12})[0-9a-f]+>/<vol \1…>/g')"
say "cmd=$CMD entrypoint=$ENTRY shm=$SHM"
say "env anahtarları: $(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$C" | cut -d= -f1 | tr '\n' ' ')"

say "== bu porta kim bağlı? (şu anki kurulu bağlantılar) =="
{ ss -Htn state established "( sport = :5434 or dport = :5434 )" 2>/dev/null || true; } | awk '{print $3" <- "$4}' | sed -E 's/:[0-9]+$//' | sort | uniq -c
say "(dış IP görürseniz o istemci 127.0.0.1'e geçince kopar; Hetzner duvarı zaten engellediği için beklenen: yok)"
say "aynı ağdaki konteynerler (bunlar 5432'ye ağ içinden bağlanır, etkilenmez):"
for n in "${NETS[@]}"; do
  say "  $n: $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$n" 2>/dev/null)"
done

ARGS=(-d --name "$C" --restart unless-stopped -p 127.0.0.1:5434:5432)
[ "${#NETS[@]}" -gt 0 ] && ARGS+=(--network "${NETS[0]}")
for m in "${MOUNTS[@]}"; do ARGS+=(-v "$m"); done
[ "$SHM" != "67108864" ] && [ -n "$SHM" ] && ARGS+=(--shm-size "$SHM")
say "== yeni konteyner (env değerleri gizli) =="
say "docker run ${ARGS[*]} --env-file <root600-gecici> $IMG $( [ "$CMD" != "null" ] && echo "$CMD" | tr -d '[]",' )"
say "değişen tek şey: port 127.0.0.1'e bağlanır, restart=unless-stopped olur (eskisi 'no' idi)."

if [ "$MODE" = plan ]; then
  say ""
  say "PLAN tamam: hiçbir şey değişmedi. Uygulamak için --apply (kesinti ~10 sn)."
  exit 0
fi

# ---- APPLY ----
umask 077
EF=$(mktemp /root/.sel434-pgenv.XXXXXX)
trap 'rm -f "$EF"' EXIT
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$C" | sed '/^$/d' > "$EF"

say "== uygulanıyor =="
docker stop -t 30 "$C" >/dev/null
docker rename "$C" "$OLD"
CMDARR=()
if [ "$CMD" != "null" ]; then mapfile -t CMDARR < <(docker inspect -f '{{range .Config.Cmd}}{{println .}}{{end}}' "$OLD" | sed '/^$/d'); fi
if ! docker run "${ARGS[@]}" --env-file "$EF" "$IMG" "${CMDARR[@]}" >/dev/null; then
  say "HATA: yeni konteyner başlamadı; geri dönülüyor"
  docker rm -f "$C" >/dev/null 2>&1 || true
  docker rename "$OLD" "$C"; docker start "$C" >/dev/null
  say "GERİ DÖNÜLDÜ (değişiklik yok)"; exit 1
fi
for n in "${NETS[@]:1}"; do docker network connect "$n" "$C"; done

ok=0
for i in $(seq 1 30); do
  if docker exec "$C" sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}"'; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  say "HATA: yeni konteyner 30 sn içinde hazır olmadı; geri dönülüyor"
  docker logs --tail 20 "$C" 2>&1 | sed -E 's/(password|PASSWORD)[^ ]*/\1=<GIZLI>/g'
  docker rm -f "$C" >/dev/null; docker rename "$OLD" "$C"; docker start "$C" >/dev/null
  say "GERİ DÖNÜLDÜ"; exit 1
fi

say "== doğrulama =="
say "port: $(docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}' "$C")"
if command -v ss >/dev/null; then
  L=$(ss -Hltn | awk '{print $4}' | grep -E ':5434$' || true)
  say "dinleyen: $(echo $L)"
  if printf '%s\n' "$L" | grep -Eq '^(0\.0\.0\.0|\*|\[::\]):5434$'; then say "SONUC=FAIL (hâlâ tüm arayüzlerde)"; else say "SONUC=PASS (yalnız 127.0.0.1:5434)"; fi
else
  say "ss=YOK; docker port: $(docker port "$C" 5432/tcp | tr '\n' ' ')"
fi
say "pg_isready: OK"
say ""
say "APPLY tamam. Eski konteyner durduruldu ve '$OLD' adıyla saklanıyor (veri volume'u ortak, silinmedi)."
say "Geri dönüş: ssh agos-prod-01 'bash -s -- --undo' < outputs/sel434-prod-pg-lockdown.sh"
say "Birkaç gün sorun çıkmazsa eskisi silinebilir: docker rm $OLD"
