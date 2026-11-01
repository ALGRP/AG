# SEL-324 — Upstream Hermes giriş (ingress) ve onay kapısı statik incelemesi

- **Tarih:** 31.10.2026
- **Event:** `SEL324:upstream-ingress-approval-static-review:20261031`
- **Kaynak:** `NousResearch/hermes-agent` commit `c419cf7c864ac0ee511dbd9f7091a8bba0b567ee` (2026-10-31), salt-okunur sığ klon. **Kod çalıştırılmadı**, yalnız okundu.
- **Yazar:** Claude (bulut Linux oturumu). Bu belge yazarın kendi kabulü değildir; SEL-333/SEL-326 bağımsız incelemelerine girdi niteliğindedir.
- **Durum:** `CODE_CHANGED=NO; TEST_RUN=NO; G0=HOLD; INDEPENDENT_ACCEPTED=NO; LIVE_CHANGED=NO`

## 0. Neden bu yol

SEL-324'ün 28.10 video-spec maddeleri (1) deny-by-default Telegram/gateway allowlist + gerçek OS aktörü ve (2) MANUAL onay / metin tabanlı grant yasağı bugünkü turların hiçbirinde ele alınmadı; bütün turlar depolama/broker katmanındaydı. Owner'ın "farklı yolları dene, her adımı Linear'a yaz" talebi ve "başka oturumun deneyini tekrarlama" kuralı gereği bu tur **giriş katmanı** ile sınırlıdır. Broker/UID mimarisi (SEL-433) bu belgeyle değişmez; burada bulunan her şey **yapılandırma ve süreç-içi kontroldür**, upstream SECURITY.md §2.2 uyarınca sınır değildir.

## A. SEL-433 upstream satır referansları — DOĞRULANDI

| SEL-433 referansı | Bu commit'te | Sonuç |
|---|---|---|
| `hermes_cli/kanban_db_dispatch.py:2847` | 2847–2851: `env["HERMES_KANBAN_DB"]`, `HERMES_KANBAN_WORKSPACES_ROOT`, `HERMES_KANBAN_BOARD` pinleniyor | ✔ eşleşti |
| `gateway/session_kanban.py:163–164` | 163–168: `HERMES_KANBAN_TASK/BOARD/DB/RUN_ID/CLAIM_LOCK/WORKSPACE/WORKSPACES_ROOT` env sözlüğü | ✔ eşleşti |
| `tools/kanban_tools.py:312–318` | 314–320: `_board()` → `kbc.connect(board=board)` | ✔ eşleşti |
| `_handle_complete` 726+ / `_handle_block` 812+ | 726 ve 812 | ✔ eşleşti |
| `agent/transports/hermes_tools_mcp_server.py:57–62` | 57–64: `EXPOSED_TOOLS` içinde `kanban_complete/block/schedule/request_review/request_changes/comment`; yorum: "Without them a codex-runtime worker can't report completion and hangs" | ✔ eşleşti |

Ek gözlem: `tools/kanban_tools.py:250 _enforce_worker_task_ownership` sahipliği yalnız `HERMES_KANBAN_TASK` env'ine bağlıyor. Bu, Mac/Codex 10:26 kararını ("env karşılaştırması otorite olamaz") upstream kaynağında teyit eder. S2 adaptör yaması satır referanslı olduğundan **upstream sürümü bu commit'e sabitlenmeli** (bkz. C9).

## B. Upstream SECURITY.md — mimari kararın dayanağı doğrulandı

- §2.2: "The only security boundary against an adversarial LLM is the operating system." Onay kapısı, redaction, allowlist süreç-içi heuristiktir.
- §2.6 kural 2: Ağa açık her adaptör için allowlist zorunlu; allowlist yokken fail-open **hata** (in scope).
- §2.6 kural 3: Session id yetki sınırı değildir.
- §2.6 kural 4: "Within the authorized set, all callers are equally trusted… Operators who need capability separation should run separate agent instances with separate allowlists." → SEL-433 "board başına ayrı örnek" gerekçesi doğru alıntılanmış.
- §2.3: Alt süreçlere (shell, MCP, cron, code-exec) credential env'i süzülür; süreç-içi bileşenler (skill/plugin/hook) her şeyi okur.
- §4: non-root çalıştır, gateway'i VPN/firewall arkasında tut, her adaptöre allowlist.

## C. Telegram / gateway giriş yetkilendirmesi — bulgular

**C1. Allowlist kaynakları.** `plugins/platforms/telegram/gateway_env.py:24–28`: `allowed_users_env=TELEGRAM_ALLOWED_USERS`, `allow_all_env=TELEGRAM_ALLOW_ALL_USERS`, `group_allowed_chats_env=TELEGRAM_GROUP_ALLOWED_CHATS`, `allowlist_suppresses_pairing=True`. Ek genel anahtarlar `adapter.py:928–930`: `GATEWAY_ALLOWED_USERS`, `GATEWAY_ALLOW_ALL_USERS`, `TELEGRAM_GROUP_ALLOWED_USERS`.

**C2. Joker `*` herkesi açar.** `adapter.py:831–837 _env_allowlist_decision`: `return "*" in allowed_ids or user_id in allowed_ids`. Aynı şekilde `gateway/authz_mixin.py _allows`: `"*" in allowed`. → AGOS kabulü: allowlist içinde `*` **yasak**; negatif kontrol gerekir.

**C3. Fail-closed geri dönüş doğru.** `adapter.py:868–873`: allowlist yoksa `GATEWAY_ALLOW_ALL_USERS` truthy olmadıkça **deny** (#24457 düzeltmesi). Allow-all okumaları profil kapsamlı (`_scoped_gate_env`); multiplex'te default profilin opt-in'i ikinci botu açmamalı (#93522). SEL-433 madde 5 (`gateway.multiplex_profiles=false`) bu sınıfı da ortadan kaldırır.

**C4. DM politikası.** `gateway/platforms/access_policy_mixin.py`: `open | allowlist | disabled | pairing`. `pairing` modunda yabancı gönderen sunucu durumu (kod) yaratır; `gateway/run_inbound_unauthorized.py`: `ignore` modunda yabancıya hiç yanıt yok, owner'a süreç başına tek uyarı. → AGOS prod: `dm_policy=allowlist` + `unauthorized_dm_behavior=ignore`, `group_policy=disabled` (veya çok dar `TELEGRAM_GROUP_ALLOWED_CHATS`).

**C5. Kimlik kaynağı doğru.** `adapter.py:875–900 _source_from_message_for_auth`: sayısal `from_user.id`; kanal postunda `sender_chat.id`. Görünen ad yetkilendirmede kullanılmıyor (SimpleX notu: display name saldırgan kontrollü).

**C6. KRİTİK (yapılandırma): slash komut kapısı varsayılan olarak KAPALI.** `gateway/slash_access.py`: `allow_admin_from` tanımlı değilse gating devre dışı → allowlist'teki **her** kullanıcı **her** slash komutunu çalıştırır. Etkisi:
- `/kanban …` (`gateway/slash_commands.py:352–391`) argümanları filtresiz `hermes_cli/kanban.py run_slash` → `kanban_command`'a gider; `create / claim / complete / block / unblock / reassign / dispatch / archive / delete / comment / notify-subscribe` dahil tüm fiiller chat'ten erişilebilir. `session_commands.py:58 _KANBAN_READS` yalnız yerel-oturum sınıflandırmasıdır, Telegram yolunu kısıtlamaz.
- `/approvals manual|smart|off` ve `/yolo` `_SETTING_COMMANDS` içindedir (`session_commands.py:37–38`).
- `/approve always` (`run_busy.py:612–616`) → `tools/approval.py:410–425 _persist_choice` ile profilin `command_allowlist`'ine **kalıcı** yazar.
- Bare-word onay: blocking approval varken "yes/approve/always/session/👍/👎" komut olarak yorumlanır (`run_busy.py:618–640`); blocking approval yokken komut tetiklemez (tasarım gereği doğru). SEL-324 spec (2) "metin tabanlı grant yasağı" bu nedenle **allowed-set içindeki tek kullanıcı = Owner** ve `allow_admin_from` ile sağlanır; upstream per-caller yetki modellemez (§2.6 k.4).
→ Gerekli AGOS yapılandırması (config, sınır değil): `platforms.telegram.extra.allow_admin_from=[<Owner numeric id>]`, `user_allowed_commands=[]` (taban: `help`, `whoami`), grup kapsamı için `group_allow_admin_from` aynı.

**C7. Onay modu.** `hermes_cli/approval_mode.py`: `approvals.mode ∈ {manual, smart, off}`; `off` ve YOLO (`HERMES_YOLO_MODE`, `tools/approval.py:46`; `/yolo` oturum bayrağı) kapıyı kaldırır. `tools/approval_context.py:347–370`: `cron_mode`, `single_query_mode`, `unattended_mode` varsayılan **deny** (iyi). Dispatcher altında koşan kanban worker turn'lerinde kapının `unattended_turn()` üzerinden nasıl davrandığı (`tools/approval.py:340–345` çevresi) bu turda **tam izlenmedi**; S2'de ayrı okunmalı.

**C8. Upstream-native "kilit": managed scope.** `hermes_cli/managed_scope.py`: `/etc/hermes` (veya `HERMES_MANAGED_DIR`) altındaki IT config/env katmanı belirli anahtarları kullanıcı tarafından değiştirilemez yapar: `set_config_value` managed anahtarı reddeder (`approval_mode.py` bu `SystemExit`'i yakalar → chat'ten `/approvals off` **başarısız olur**), `is_env_managed` ile `TELEGRAM_ALLOWED_USERS` pinlenebilir, `pinned_terminal_backend` ile backend sabitlenir. Docstring: "v1 enforcement is filesystem permissions only" → dizin **root:root** olmalı; UID501 Hermes yazamaz. Bu, broker/UID mimarisinin yerine geçmez; ama C2–C7'deki deny-by-default yapılandırmayı aynı-UID ajanın kendisi tarafından geri alınamaz hâle getirmenin upstream-destekli yoludur. Hetzner: `/etc/hermes`. Mac: launchd `EnvironmentVariables` ile `HERMES_MANAGED_DIR` → root sahipli dizin (Mac'te ayrıca doğrulanacak).

**C9. Güncelleme davranışı (mobil sohbetin 3. önerisi).** `hermes_cli/main.py:2275–2420`: `hermes update` **manuel** komut; `--check` yalnız rapor; `is_managed()` (`HERMES_MANAGED` / paket yöneticisi işareti) güncellemeyi **reddeder** (exit 2, `refused` makbuzu); dashboard/Tauri updater aynı `UpdateLock`'u paylaşır. Çekirdek için zamanlanmış otomatik güncelleme bulunmadı; `plugins.auto_update_check_hours` (varsayılan 24) yalnız **kontrol** eder, uygulamaz (`gateway/run.py:4363`). → S2 kapısı için sürüm sabitleme: HEAD = `c419cf7c…` (veya SEL-433'ün başvurduğu sürüm) + `HERMES_MANAGED` işareti; adaptör regresyon testi güncellemeden önce koşar.

**C10. Broker için yeniden kullanılabilir upstream parçalar.** `hermes_cli/gateway_runtime_discovery.py:106–121 socket_peer_uid` (Linux `SO_PEERCRED`, macOS `getpeereid`) ve `:50–74 home_mode_unsafe` (0700/ACL/grup denetimi); `gateway/control_socket.py:404–411` aynı-UID eşleştirme; control socket sözleşmesi "bağlantı başına tek JSON satırı, 64 KiB istek / 512 KiB yanıt sınırı". SEL-433'ün "iki OS adaptörü, byte-aynı çekirdek" hedefiyle uyumlu; broker bu helper'ları kopyalayabilir (upstream'e bağımlılık yerine pinlenmiş kopya önerilir).

## D. AGOS için somut kabul kontrolleri (önce READ_ONLY, değişiklik yalnız Owner L3)

Mac `agosorchestrator` profili ve Hetzner için:

1. `TELEGRAM_ALLOWED_USERS` yalnız Owner'ın sayısal id'si; `*` yok; `TELEGRAM_ALLOW_ALL_USERS`, `GATEWAY_ALLOW_ALL_USERS`, `GATEWAY_ALLOWED_USERS` **tanımsız**.
2. `dm_policy=allowlist` (pairing değil); `unauthorized_dm_behavior=ignore`; `group_policy=disabled` veya dar `TELEGRAM_GROUP_ALLOWED_CHATS`.
3. `allow_admin_from=[Owner]`, `user_allowed_commands=[]`; grup kapsamı aynı.
4. `approvals.mode=manual`; `cron_mode/unattended_mode/single_query_mode=deny`; `HERMES_YOLO_MODE` tanımsız; `command_allowlist` boş veya incelenmiş.
5. `gateway.multiplex_profiles=false`.
6. Managed scope: `/etc/hermes` (root:root, dizin 0755, dosyalar 0644) ile 1–5 pinli; sentetik profilde `hermes config set approvals.mode off` **reddi** gözlenir.
7. Sürüm pin: `git rev-parse HEAD` = referans commit; `hermes update` → exit 2 (managed); `hermes update --check` yalnız rapor.
8. Negatif testler (fake-only, S1 VM): allowlist dışı id → yanıt yok + owner'a tek uyarı; allowed-non-admin `/kanban complete t_x` → reddedilir; `/approvals off` → managed reddi; blocking approval yokken bare "yes" komut tetiklemez.

## E. Sınırlar ve dürüst notlar

- Statik inceleme; kurulu Mac sürümü ile upstream HEAD **farklı olabilir** (Mac `kanban_db.py` SHA `676215ca…` upstream ile karşılaştırılmadı). Satır numaraları bu commit'e aittir.
- Gerçek `agosorchestrator` config/env **okunmadı**; D listesi varsayım değil, kontrol listesidir.
- Hiçbir bulgu upstream güvenlik açığı iddiası değildir; C6 upstream'in belgelediği varsayılan davranıştır (§2.6 k.4) ve AGOS'ta yapılandırmayla kapatılır.
- Bu belge kabul değildir; SEL-333 (Codex) ve SEL-326 (agosreview) ayrı kalır.
