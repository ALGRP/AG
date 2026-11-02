#!/usr/bin/env bash
# SEL-329 G1 madde 4 — BACKUP_ROLLBACK_PLAN: staging PostgreSQL şifreli yedek + izole geri yükleme testi.
#   ssh agos-prod-01 'bash -s'                    < outputs/sel329-staging-backup.sh   # PLAN (hiçbir şey değişmez)
#   ssh agos-prod-01 'bash -s -- --apply'         < outputs/sel329-staging-backup.sh   # yedek al + manifest
#   ssh agos-prod-01 'bash -s -- --restore-test'  < outputs/sel329-staging-backup.sh   # son yedeği geçici konteynerde geri yükle, karşılaştır
#   ssh agos-prod-01 'bash -s -- --list'          < outputs/sel329-staging-backup.sh   # yedekleri ve test sonuçlarını listele
# Güvenlik:
#   - Canlı staging veritabanına YAZILMAZ. pg_dump salt-okunur; sayımlar agos_readonly rolüyle.
#   - Yedek /var/backups/agos-staging altında, root 700/600, AES-256 (openssl, pbkdf2) ile şifreli.
#     Anahtar /root/.secrets/agos-staging-backup.key (root 600). Anahtar ve veri ASLA yazdırılmaz.
#   - Geri yükleme testi: aynı image'dan geçici konteyner, AĞ YOK (--network none), port yok; bitince silinir.
#   - Çıktıda yalnız sayım, tablo adı, sha ve süre var; kullanıcı/db adı maskeli, satır içeriği yok.
set -euo pipefail
export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin
MODE=plan; case "${1:-}" in --apply) MODE=apply;; --restore-test) MODE=restore;; --list) MODE=list;; "") ;; *) echo "bilinmeyen arg"; exit 2;; esac
C=agos-staging-postgres
BD=/var/backups/agos-staging
KEY=/root/.secrets/agos-staging-backup.key
KEEP=${KEEP:-7}
T=agos-staging-restore-test
say(){ printf '%s\n' "$*"; }
[ "$(id -u)" = 0 ] || { say "HATA: root olarak çalıştırın"; exit 1; }
command -v openssl >/dev/null || { say "HATA: openssl yok"; exit 1; }
docker inspect "$C" >/dev/null 2>&1 || { say "HATA: $C konteyneri yok"; exit 1; }

AU=$(docker exec "$C" sh -c 'printf %s "$POSTGRES_USER"'); AD=$(docker exec "$C" sh -c 'printf %s "${POSTGRES_DB:-postgres}"')
esc(){ printf '%s' "$1" | sed 's/[^A-Za-z0-9_]/\\&/g'; }
mask(){ sed -e "s/\b$(esc "$AU")\b/<APP_USER>/g" -e "s/\b$(esc "$AD")\b/<APP_DB>/g"; }
RO_ENV=(-e PGOPTIONS=-c\ default_transaction_read_only=on)
# canlı DB'de salt-okunur sorgu
q(){ docker exec "${RO_ENV[@]}" -e Q="$1" "$C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "$Q"'; }
HAS_RO=$(q "select count(*) from pg_roles where rolname='agos_readonly' and not rolsuper and not rolcanlogin")
qro(){ if [ "$HAS_RO" = 1 ]; then docker exec "${RO_ENV[@]}" -e Q="$1" "$C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "SET ROLE agos_readonly" -c "$Q"'; else q "$1"; fi; }
# şema parmak izi: sahip/yetki/yorum/oturum satırları hariç (aynı image'daki pg_dump ile karşılaştırılabilir)
norm(){ grep -vE '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog\.set_config)' | grep -v '^[[:space:]]*$' | sha256sum | cut -c1-64; }
live_schema_sha(){ docker exec "${RO_ENV[@]}" "$C" sh -c 'pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" --schema-only --no-owner --no-privileges' | norm; }
live_counts(){ for t in $(q "select tablename from pg_tables where schemaname='public' order by 1"); do printf 't %s %s\n' "$t" "$(qro "select count(*) from public.\"$t\"")"; done; }
latest(){ ls -1 "$BD"/agos-staging-*.manifest 2>/dev/null | sort | tail -1; }
mval(){ sed -n "s/^$1=//p" "$2" | head -1; }

say "== durum =="
say "  konteyner: $C  image: $(docker inspect -f '{{.Config.Image}}' "$C")  durum: $(docker inspect -f '{{.State.Status}}' "$C")"
say "  db boyutu: $(q "select pg_size_pretty(pg_database_size(current_database()))")  public tablo: $(q "select count(*) from pg_tables where schemaname='public'")  agos_readonly: $([ "$HAS_RO" = 1 ] && echo VAR || echo YOK)"
say "  yedek dizini: $BD $([ -d "$BD" ] && echo "VAR ($(stat -c '%a %U' "$BD"), $(ls -1 "$BD"/*.dump.enc 2>/dev/null | wc -l) yedek)" || echo YOK)"
say "  anahtar: $([ -f "$KEY" ] && echo "VAR ($(stat -c '%a %U' "$KEY"))" || echo "YOK (apply'da oluşturulur)")"
say "  boş disk ($(dirname "$BD")): $(df -h --output=avail "$(dirname "$BD")" | tail -1 | tr -d ' ')"

if [ "$MODE" = plan ]; then
  cat <<EOF

== PLAN (hiçbir şey değişmedi) ==
--apply:
  1. $BD (root 700) ve $KEY (32 bayt rastgele, root 600) yoksa oluşturulur.
  2. pg_dump -Fc (salt-okunur) → openssl aes-256-cbc pbkdf2 → $BD/agos-staging-<zaman>.dump.enc (600).
  3. İlk yedekte $BD/REFERANS (salt-okunur) yazılır: Owner kararıyla resmi staging referansı
     (image kimliği, şema parmak izi, tablo listesi). Sonraki yedekler bunu değiştirmez.
  3b. Manifest: image kimliği, pg sürümü, yedek sha256/boyut, şema parmak izi, tablo başına KESİN sayım
     (yedekten önce ve sonra ölçülür; aynı değilse tutarlilik=DEGISTI yazılır). Satır içeriği yok.
  4. En yeni $KEEP yedek tutulur, eskileri silinir.
--restore-test:
  5. Son yedeğin sha'sı doğrulanır, aynı image'dan '$T' konteyneri ağsız ve portsuz açılır,
     yedek çözülüp pg_restore ile yüklenir, şema parmak izi ve tablo sayımları manifestle karşılaştırılır,
     konteyner ve diski silinir. Sonuç <yedek>.restoretest dosyasına yazılır.
Canlı staging veritabanına hiçbir aşamada yazılmaz; servis durdurulmaz.
EOF
  exit 0
fi

if [ "$MODE" = list ]; then
  say ""; say "== yedekler =="
  for m in $(ls -1 "$BD"/agos-staging-*.manifest 2>/dev/null | sort); do
    b=${m%.manifest}; r="$b.restoretest"
    say "  $(basename "$b")  boyut=$(mval dump_boyut "$m")  sha=$(mval dump_sha256 "$m" | cut -c1-12)  tablo=$(mval tablo_sayisi "$m")  tutarlilik=$(mval tutarlilik "$m")  restore_test=$([ -f "$r" ] && mval sonuc "$r" || echo YAPILMADI)"
  done
  exit 0
fi

if [ "$MODE" = apply ]; then
  install -d -m 700 -o root -g root "$BD" /root/.secrets
  if [ ! -f "$KEY" ]; then umask 077; openssl rand -hex 32 > "$KEY.tmp"; chmod 600 "$KEY.tmp"; mv "$KEY.tmp" "$KEY"; say "  anahtar oluşturuldu (değer yazdırılmadı)"; fi
  TS=$(date -u +%Y%m%dT%H%M%SZ); B="$BD/agos-staging-$TS"
  umask 077
  say ""; say "== yedek =="
  C1=$(live_counts)
  S0=$(date +%s)
  set +e
  docker exec "${RO_ENV[@]}" "$C" sh -c 'pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -Fc' \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY" -out "$B.dump.enc.tmp"
  rc=("${PIPESTATUS[@]}"); set -e
  if [ "${rc[0]}" != 0 ] || [ "${rc[1]}" != 0 ] || [ ! -s "$B.dump.enc.tmp" ]; then rm -f "$B.dump.enc.tmp"; say "  YEDEK: FAIL (pg_dump=${rc[0]} openssl=${rc[1]})"; exit 1; fi
  mv "$B.dump.enc.tmp" "$B.dump.enc"
  C2=$(live_counts)
  [ "$C1" = "$C2" ] && TUT=AYNI || TUT=DEGISTI
  SHA=$(sha256sum "$B.dump.enc" | cut -c1-64)
  {
    say "zaman=$TS"
    say "konteyner=$C"
    say "image=$(docker inspect -f '{{.Config.Image}}' "$C")"
    say "image_id=$(docker inspect -f '{{.Image}}' "$C")"
    say "pg_surum=$(q "show server_version")"
    say "dump_sha256=$SHA"
    say "dump_boyut=$(stat -c %s "$B.dump.enc")"
    say "sifreleme=openssl aes-256-cbc pbkdf2 iter=200000 anahtar_dosyasi=$KEY"
    say "sema_sha256=$(live_schema_sha)"
    say "tutarlilik=$TUT"
    say "tablo_sayisi=$(printf '%s\n' "$C2" | grep -c '^t ' || true)"
    say "toplam_satir=$(printf '%s\n' "$C2" | awk '{s+=$3} END{print s+0}')"
    printf '%s\n' "$C2"
  } > "$B.manifest"
  chmod 600 "$B.manifest" "$B.dump.enc"
  # Owner kararı (SEL-329 madde 1, 2026-11-02): ilk yedekteki ortam kimliği resmi staging REFERANSIDIR. Döndürülmez, üzerine yazılmaz.
  if [ ! -f "$BD/REFERANS" ]; then
    { say "# SEL-329 G1 STAGING_BOOKING_PG referansı (Owner kararı 2026-11-02). Değiştirmeyin."
      say "kaynak_yedek=$(basename "$B")"; grep -E '^(zaman|konteyner|image|image_id|pg_surum|sema_sha256|tablo_sayisi)=' "$B.manifest"
      grep '^t ' "$B.manifest" | awk '{print "tablo " $2}'; } > "$BD/REFERANS"
    chmod 400 "$BD/REFERANS"; say "  REFERANS kaydedildi: $BD/REFERANS (image, şema parmak izi, tablo listesi; sayım içermez)"
  fi
  say "  YEDEK: PASS  dosya=$(basename "$B").dump.enc  boyut=$(stat -c %s "$B.dump.enc")  sha=${SHA:0:12}  süre=$(( $(date +%s)-S0 ))s"
  say "  tablo=$(mval tablo_sayisi "$B.manifest")  toplam_satir=$(mval toplam_satir "$B.manifest")  tutarlilik=$TUT  sema_sha=$(mval sema_sha256 "$B.manifest" | cut -c1-12)"
  # saklama
  n=0; for f in $(ls -1 "$BD"/agos-staging-*.manifest | sort -r); do n=$((n+1)); [ $n -le "$KEEP" ] && continue; b=${f%.manifest}; rm -f "$b.dump.enc" "$b.manifest" "$b.restoretest"; say "  eski yedek silindi: $(basename "$b")"; done
  say ""; say "Sıradaki: --restore-test"
  exit 0
fi

# --- restore-test ---
M=$(latest); [ -n "$M" ] || { say "HATA: yedek yok, önce --apply"; exit 1; }
B=${M%.manifest}; R="$B.restoretest"
say ""; say "== geri yükleme testi: $(basename "$B") =="
[ "$(sha256sum "$B.dump.enc" | cut -c1-64)" = "$(mval dump_sha256 "$M")" ] && say "  yedek sha: PASS" || { say "  yedek sha: FAIL (dosya değişmiş)"; exit 1; }
IMG=$(mval image_id "$M")
docker image inspect "$IMG" >/dev/null 2>&1 || { say "  image $IMG yerelde yok: FAIL"; exit 1; }
if docker inspect "$T" >/dev/null 2>&1; then
  [ "$(docker inspect -f '{{index .Config.Labels "agos.sel329"}}' "$T")" = restore-test ] || { say "HATA: '$T' adlı başka bir konteyner var; dokunulmadı"; exit 1; }
  docker rm -f -v "$T" >/dev/null
fi
cleanup(){ docker rm -f -v "$T" >/dev/null 2>&1 || true; }
trap cleanup EXIT
S0=$(date +%s)
docker run -d --name "$T" --label agos.sel329=restore-test --network none --memory 1g --cpus 1 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=restoretest -e POSTGRES_DB=restoretest "$IMG" >/dev/null
ok=0; for i in $(seq 1 60); do
  if docker logs "$T" 2>&1 | grep -q 'PostgreSQL init process complete' && docker exec "$T" pg_isready -q -U restoretest -d restoretest 2>/dev/null; then ok=1; break; fi
  sleep 2
done
[ $ok = 1 ] || { say "  geçici konteyner hazır olmadı: FAIL"; exit 1; }
say "  geçici konteyner: hazır (ağ=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$T"), port=$(docker port "$T" | wc -l))"
ERR=$( { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY" -in "$B.dump.enc" \
        | docker exec -i "$T" pg_restore -U restoretest -d restoretest --no-owner --no-privileges; echo "PIPE_RC=${PIPESTATUS[0]}"; } 2>&1 || true)
DEC_RC=$(printf '%s\n' "$ERR" | sed -n 's/^PIPE_RC=//p' | tail -1)
[ "$DEC_RC" = 0 ] && say "  şifre çözme: PASS" || { say "  şifre çözme: FAIL (openssl=$DEC_RC)"; exit 1; }
NERR=$(printf '%s\n' "$ERR" | grep -c 'ERROR:' || true)
say "  pg_restore hata sayısı: $NERR"
[ "$NERR" = 0 ] || printf '%s\n' "$ERR" | grep 'ERROR:' | head -3 | cut -c1-140 | mask | sed 's/^/    /'
rq(){ docker exec "$T" psql -X -q -At -U restoretest -d restoretest -c "$1"; }
SS=$(docker exec "$T" pg_dump -U restoretest -d restoretest --schema-only --no-owner --no-privileges | norm)
[ "$SS" = "$(mval sema_sha256 "$M")" ] && SM=PASS || SM=FAIL
say "  şema parmak izi: $SM"
tot=0; okc=0; bad=""
while read -r _ t n; do
  tot=$((tot+1)); r=$(rq "select count(*) from public.\"$t\"" 2>/dev/null || echo HATA)
  if [ "$r" = "$n" ]; then okc=$((okc+1)); else bad="$bad $t(beklenen=$n,geri_yuklenen=$r)"; fi
done < <(grep '^t ' "$M")
say "  tablo sayımları: $okc/$tot eşleşti${bad:+ — farklı:$bad}"
DUR=$(( $(date +%s)-S0 ))
[ "$NERR" = 0 ] && [ "$SM" = PASS ] && [ "$okc" = "$tot" ] && [ "$tot" -gt 0 ] && RES=PASS || RES=FAIL
{ say "zaman=$(date -u +%Y%m%dT%H%M%SZ)"; say "sonuc=$RES"; say "pg_restore_hata=$NERR"; say "sema=$SM"; say "tablo_eslesme=$okc/$tot"; say "sure_sn=$DUR"; } > "$R"; chmod 600 "$R"
say "  süre: ${DUR}s"
say "RESTORE_TEST=$RES"
