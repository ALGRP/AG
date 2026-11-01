# S1 çalıştırma kılavuzu — SEL-433 broker servisi + Hermes adaptörü

Hedef: `agos-hermes-s1-audit-20261031` (Hetzner S1, canlıdan ayrı VM).
Her blok kısa ve tek başına kopyalanabilir. **Canlı Hermes, gerçek board,
müşteri verisi yok.** `G0=HOLD` her aşamada geçerli.

## Kapı T — yalıtılmış test (önceki S1 koşularıyla aynı yetki sınıfı)

Geçici dizin, sayısal UID'ler, sentetik board. Hesap/servis/dosya izni
değişikliği yok; `/var/lib/agos`, `/run/agos-broker` **kullanılmaz**.

T1 — kaynağı sabitle (`<HEAD>` = PR'daki tam commit SHA):

```sh
rm -rf /tmp/agos-s1-433 && git clone -q https://github.com/ALGRP/AG.git /tmp/agos-s1-433 && cd /tmp/agos-s1-433 && git checkout -q <HEAD> && git rev-parse HEAD
```

T2 — kritik dosya hash'leri (PR gövdesindeki değerlerle karşılaştır):

```sh
cd /tmp/agos-s1-433/security && sha256sum sel324-isolation-lab/lab/capability.py sel433-s1-broker/agos_broker/capability.py sel433-s1-broker/agos_broker/ledger.py sel433-s1-broker/agos_broker/service.py sel433-s1-broker/agos_broker/backup.py
```

T3 — tüm takımlar (≈1 dk + mutasyon ≈4 dk):

```sh
cd /tmp/agos-s1-433 && sh security/sel433-s1-broker/run_all.sh /tmp/agos-s1-433-evidence; echo EXIT=$?
```

T4 — kanıt parmak izi (çıktının tamamını Linear'a yapıştır):

```sh
cat /tmp/agos-s1-433-evidence/STATUS.txt /tmp/agos-s1-433-evidence/exit_codes.txt && sha256sum /tmp/agos-s1-433-evidence/s1_battery_results.json /tmp/agos-s1-433-evidence/SHA256SUMS
```

T5 — `/tmp` VM silinince gider; kanıtı dışarı al (Mac'te):

```sh
scp -i ~/.ssh/agos-hermes-s1 -o IdentitiesOnly=yes -r root@91.98.193.12:/tmp/agos-s1-433-evidence ~/agos-evidence/
```

Beklenen: `SUITES_ALL_PASS=YES`, lab 16/16, lab 28/28, unit 29/29,
battery 56/56, mutasyon 9/9 KILLED, `VERIFY_OK`, broker `0.4 SAFE`.
Herhangi bir FAIL → dur, çıktıyı kaydet, kabul iddiası yok.

## Kapı I — S1'e servis kurulumu (AYRI Owner onayı gerekir; bu pakette YAPILMADI)

Onay metni şunu kapsamalı: `/opt/agos-broker` kopyası, sysusers/tmpfiles
uygulaması, `/etc/agos-broker/broker.json` (yalnız public key),
`/etc/agos-dispatcher/` imza anahtarı yeri ve sahipliği, sentetik board
DB'leri, `agos-broker.service` kurulumu/başlatılması. Plan:

1. Mevcut S1 iskeletinin sahiplik anlık görüntüsü (geri dönüş için):
   `python3 -m agos_broker.backup snapshot-owner --db /var/lib/agos/kanban/<board>/kanban.db --out /root/sel433-owner-<board>.json`
2. Paketi `/opt/agos-broker` altına `root:root 0755/0644` kopyala; `deploy/`
   dosyalarını `/etc/systemd/system`, `/etc/tmpfiles.d`, `/etc/sysusers.d`
   altına koy; `systemd-sysusers`, `systemd-tmpfiles --create`.
3. Sentetik board DB'lerini broker UID ile oluştur (`create_native_fixture`),
   `0600 agosbroker`. Mevcut `s1-fixture.txt` dosyalarına dokunma.
4. İmza anahtarı yalnız dispatcher güven alanında (`0600`); broker
   config'ine yalnız public key. Anahtar Linear'a/Git'e yazılmaz.
5. `python3 -B -s -m agos_broker.daemon --config /etc/agos-broker/broker.json --check` → `OK`
6. `systemctl start agos-broker` → `systemctl status`, `journalctl -u agos-broker`.
   `MemoryDenyWriteExecute=yes` ile cryptography/cffi davranışı burada doğrulanır.
7. Gerçek yollarla kabul: işçi UID'leriyle (`runuser -u agosw-…`) T bataryasındaki
   izolasyon/yetki/nonce/restart/backup kontrollerinin aynısı.

Geri dönüş (her adım): `systemctl stop agos-hermes-worker@* agos-broker` →
`systemctl disable` → servis durmuşken yedek
(`python3 -m agos_broker.backup backup …`) → sahiplik geri alma
(`python3 -m agos_broker.backup rollback-owner --snapshot /root/sel433-owner-<board>.json`)
→ unit/tmpfiles/sysusers dosyalarını kaldır, `systemctl daemon-reload`.

## Kapı S2 — Hermes adaptörü (AYRI onay; SEL-333 incelemesinden SONRA)

`hermes_adapter/UPSTREAM_PATCH_c419cf7c.diff` yalnız `NousResearch/hermes-agent@c419cf7c`
için yazıldı. S1'deki kurulu Hermes sürümü önce bu commit ile byte-düzeyinde
karşılaştırılmalı (Mac `kanban_db.py` SHA `676215ca…` henüz karşılaştırılmadı).
İzole dalda, sentetik board ile, `HERMES_KANBAN_BROKER_MODE=1`.

## Kapı L3 — canlıya geçiş

Bu pakette yok. SEL-333 + SEL-326 bağımsız kabul + Owner L3 + tek board
(`agos-control`) + çalışan geri dönüş şartı.
