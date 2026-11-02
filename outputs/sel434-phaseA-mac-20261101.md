# SEL-434 Aşama A — Mac read-only envanter (agosorchestrator) — 2026-11-01T18:52:11Z

## 1) Gateway durumu
```
Launchd plist: /Users/a1453/Library/LaunchAgents/ai.hermes.gateway-agosorchestrator.plist
✓ Service definition matches the current Hermes install
✗ Gateway service is not loaded
  Service definition exists locally but launchd has not loaded it.
  Run: hermes gateway start

Other profiles:
  ✓ agosdev          — PID 969
  ✓ agosreview       — PID 971
--- launchctl
Could not find service "ai.hermes.gateway-agosorchestrator" in domain for port
```

## 2) hermes-agent HEAD
- HEAD: `165c889e5b4277b56dadd42949a4112c1e6175a6`
- Beklenen (165c889e...): EŞLEŞİYOR

## 3) SHA-256
```
eb4d43e3210767cacd1ca6c833321b322e4b8432086b0b935270c05fc4c4e6c6  gateway/slash_access.py
6b542220964ddaebc176ddbccb833174ab309cde97e0e2ba7a309c7b98ce26f9  hermes_cli/managed_scope.py
676215ca8bbe2f8732121189913433fc9db824b9b948bc6330205d37ef4f919e  hermes_cli/kanban_db.py
7ea8dbc5d26e997232beb41fe8caed7a7d36fbb08dd6bc9370936a468262d8c6  hermes_cli/backup.py
```

## 4) .env anahtar satır sayıları (değer yok)
- .env: VAR
- TELEGRAM_ALLOWED_USERS: 1
- TELEGRAM_ALLOW_ALL_USERS: 0
- GATEWAY_ALLOW_ALL_USERS: 0
- GATEWAY_ALLOWED_USERS: 0
- TELEGRAM_GROUP_ALLOWED_CHATS: 0
- HERMES_YOLO_MODE: 0
- HERMES_MANAGED_DIR: 0
- TELEGRAM_ALLOWED_USERS: '*' sayısı=0, id adedi=2
- GATEWAY_ALLOWED_USERS: anahtar YOK

## 5) config.yaml
- config.yaml: VAR
### Anahtar sayıları
- allow_admin_from: 0
- user_allowed_commands: 0
- group_allow_admin_from: 0
- dm_policy: 0
- group_policy: 0
- unauthorized_dm_behavior: 0
- multiplex_profiles: 0
- command_allowlist: 1
### Politika değerleri
```
approvals.mode: smart
106:  cron_mode: deny
```

## 6) Pairing / gateway.json / /etc/hermes
- /Users/a1453/.hermes/profiles/agosorchestrator/platforms/pairing/: VAR
  - telegram-approved.json
- /Users/a1453/.hermes/profiles/agosorchestrator/gateway.json: YOK
- /Users/a1453/.hermes/gateway.json: YOK
- /etc/hermes: YOK

## 7) Mod / sahip
```
drwx------ a1453  ~/.hermes
drwx------ a1453  ~/.hermes/profiles/agosorchestrator
-rw------- a1453  ~/.hermes/profiles/agosorchestrator/.env
-rw------- a1453  ~/.hermes/profiles/agosorchestrator/config.yaml
```
