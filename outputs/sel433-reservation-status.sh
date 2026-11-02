#!/usr/bin/env bash
# SEL-433 — Mevcut rezervasyon otomasyonu (agos-reservation-api/worker) durum kontrolü. STRICTLY READ-ONLY.
#   ssh agos-prod-01 'bash -s' < outputs/sel433-reservation-status.sh
# Yazdırılan: açık/kapalı bayraklar, id SAYILARI (değer değil), bot kullanıcı adı, webhook durumu,
# tablo sayımları ve durum dağılımları, log sayımları. Token/ID/müşteri verisi YAZDIRILMAZ.
# Telegram'a yalnız okuma çağrıları: getMe, getWebhookInfo (mesaj gönderilmez). Token argv'ye girmez (curl -K -).
set -u
LC_ALL=C
say(){ printf '%s\n' "$*"; }
sec(){ printf '\n== %s ==\n' "$*"; }
D=/opt/agos-reservation-automation
API=agos-reservation-api; WK=agos-reservation-worker; PG=agos-reservation-postgres

sec "1) bayraklar (.env + konteyner env; yalnız true/false ve sayılar)"
envof(){ docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2>/dev/null; }
for c in $API $WK; do
  say "--- $c"
  envof "$c" | grep -E '^(AUTOMATION_WRITE_ENABLED|SHEET_WRITE_ENABLED|TELEGRAM_NOTIFICATIONS_ENABLED|TELEGRAM_ACTIONS_ENABLED|TELEGRAM_MAX_ATTEMPTS|TELEGRAM_CALLBACK_TTL_SECONDS|SITE_WEBHOOK_MAX_AGE_SECONDS)=' | sed 's/^/  /'
  for k in TELEGRAM_ALLOWED_CHAT_IDS TELEGRAM_APPROVER_USER_IDS TELEGRAM_VIEWER_USER_IDS; do
    v=$(envof "$c" | grep -E "^$k=" | cut -d= -f2-)
    n=$(printf '%s' "$v" | tr ',; ' '\n\n\n' | grep -cE '^-?[0-9]+$' || true)
    say "  $k adet=$n"
  done
  h=$(envof "$c" | grep -E '^TELEGRAM_DETAILS_BASE_URL=' | cut -d= -f2- | sed -E 's#^(https?://[^/]+).*#\1#')
  say "  TELEGRAM_DETAILS_BASE_URL host=${h:-YOK}"
done
[ -f "$D/.env" ] && grep -E '^(AUTOMATION_WRITE_ENABLED|SHEET_WRITE_ENABLED|TELEGRAM_NOTIFICATIONS_ENABLED|TELEGRAM_ACTIONS_ENABLED)=' "$D/.env" | sed 's/^/  .env: /'

sec "2) bot kimliği ve webhook (getMe / getWebhookInfo — salt okuma)"
TF=$(envof $WK | grep -E '^TELEGRAM_BOT_TOKEN_FILE=' | cut -d= -f2-)
if [ -n "$TF" ]; then
  TOK=$(docker exec $WK sh -c "cat '$TF'" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$TOK" ]; then
    say "  bot_id_on_eki=${TOK%%:*}   (token'ın ':' öncesi kamuya açık bot numarası)"
    say "  token_sha256_on_eki=$(printf '%s' "$TOK" | sha256sum | cut -c1-12)  (Hermes token'ı ile karşılaştırma için)"
    printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$TOK" | curl -s -m 8 -K - | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d.get("result",{}); print("  getMe ok=%s username=@%s" % (d.get("ok"), r.get("username")))' 2>/dev/null || say "  getMe: hata"
    printf 'url = "https://api.telegram.org/bot%s/getWebhookInfo"\n' "$TOK" | curl -s -m 8 -K - | python3 -c '
import sys,json,re,time
d=json.load(sys.stdin).get("result",{})
u=d.get("url") or ""
print("  webhook_set=%s host=%s pending=%s" % (bool(u), re.sub(r"^https?://([^/]+).*",r"\1",u) or "-", d.get("pending_update_count")))
le=d.get("last_error_date")
if le: print("  son_hata=%s (%d dk önce)" % ((d.get("last_error_message") or "")[:80], (time.time()-le)//60))
else: print("  son_hata=YOK")' 2>/dev/null || say "  getWebhookInfo: hata"
    unset TOK
  else say "  token dosyası okunamadı"; fi
else say "  TELEGRAM_BOT_TOKEN_FILE tanımlı değil"; fi

sec "3) servis sağlığı"
for c in $API $WK $PG; do say "  $c: $(docker inspect -f '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} restart_sayisi={{.RestartCount}} baslama={{.State.StartedAt}}' $c 2>/dev/null)"; done
say "  source-bridge: $(systemctl is-active agos-reservation-source-bridge) (User=root)"

sec "4) veri akışı (yalnız sayım; READ ONLY)"
q(){ docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -e Q="$1" $PG sh -c 'psql -X -At -F" | " -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -c "$Q"' 2>&1 | sed 's/^/  /'; }
for t in reservations source_events outbox_jobs target_syncs telegram_updates telegram_action_tokens workflow_decisions outbound_customer_replies; do
  cols=$(q "select string_agg(column_name, ',') from information_schema.columns where table_schema='public' and table_name='$t'" | tr -d ' ')
  tc=""; for c in created_at received_at inserted_at updated_at; do case ",$cols," in *",$c,"*) tc=$c; break;; esac; done
  if [ -n "$tc" ]; then
    say "--- $t (zaman kolonu: $tc)"
    q "select 'toplam='||count(*)||' son24s='||count(*) filter (where $tc > now()-interval '24 hours')||' son7g='||count(*) filter (where $tc > now()-interval '7 days')||' en_son='||coalesce(to_char(max($tc),'YYYY-MM-DD HH24:MI'),'-') from public.$t"
  else
    say "--- $t"; q "select 'toplam='||count(*) from public.$t"
  fi
  for s in status state kind type channel target event_type source; do
    case ",$cols," in *",$s,"*) q "select '  $s='||coalesce($s::text,'NULL')||' adet='||count(*) from public.$t group by $s order by count(*) desc limit 8";; esac
  done
done

sec "5) worker/api logları (son 24 saat, yalnız sayım)"
for c in $API $WK; do
  L=$(docker logs --since 24h $c 2>&1)
  say "--- $c satir=$(printf '%s\n' "$L" | grep -c .)"
  for p in 'telegram' 'sendMessage' 'notif' 'error' 'fail' 'retry' 'webhook' 'approved' 'rejected' 'sheet'; do
    say "  [$p]=$(printf '%s\n' "$L" | grep -ci -- "$p")"
  done
done

sec "6) README / docs başlıkları"
grep -hE '^#{1,3} ' "$D/README.md" 2>/dev/null | head -40 | sed 's/^/  /'
ls -1 "$D/docs" 2>/dev/null | head -30 | sed 's/^/  docs\/ /'

sec "7) n8n booking alert akışı"
docker exec agos-n8n n8n list:workflow --active=true 2>/dev/null | sed 's/^/  aktif: /'

sec "son"
say "SEL433_STATUS=DONE  LIVE_CHANGED=NO"
