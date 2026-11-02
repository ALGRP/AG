# SEL-329 G1 madde 4 — Staging PostgreSQL yedek ve geri dönüş planı

Kapsam: yalnız `agos-staging-postgres` (agos-prod-01 üzerinde, 127.0.0.1:5434). Production veritabanları bu planın dışında.
Veri sınıfı: **gerçek müşteri verisi** (Owner kararı 2026-11-01). Yedek dosyası şifrelidir ve yalnız root okur.

| Konu | Karar |
|---|---|
| Sorumlu (geri dönüş sahibi) | Owner (Alanya Group). Bağımsız inceleyici atanınca kabulü o verir. |
| Yedek aracı | `outputs/sel329-staging-backup.sh` (`--apply`, `--restore-test`, `--list`) |
| Yedek yeri | `/var/backups/agos-staging/` (root 700). Dosyalar 600. |
| Şifreleme | openssl AES-256-CBC, pbkdf2 200 000 tur. Anahtar `/root/.secrets/agos-staging-backup.key` (root 600). |
| Saklama | Son 7 yedek. `REFERANS` dosyası hiç silinmez. |
| Sıklık | Şimdilik elle: her staging şema/veri değişikliğinden **önce** `--apply` ve ardından `--restore-test`. G2'de staging'e yazma başlarken günlük zamanlayıcı (systemd timer) önerilecek. |
| Doğrulama | `--restore-test`: aynı image'dan ağsız geçici konteyner, şema parmak izi ve tablo sayımları manifestle eşleşmeli. Sonuç `RESTORE_TEST=PASS`. |
| Hermes'in kanıtı | `ssh agos-staging-report` bölüm 7: son yedek yaşı, sha doğruluğu, restore testi sonucu. |

## Anahtarın kaybı

Anahtar yoksa yedekler açılamaz. Anahtarın bir kopyası Owner'ın parola yöneticisine **elle** konmalı:

```bash
ssh agos-prod-01 'cat /root/.secrets/agos-staging-backup.key'
```

Bu komut değeri ekrana basar. Yalnız Owner, kendi terminalinde çalıştırsın; sohbete, Linear'a veya loga yapıştırılmaz.

## Geri dönüş prosedürü (gerçek staging verisi bozulursa)

Owner-L3 onayı ile, sırayla. Canlı konteynerin üzerine **yazılmaz**; yan yana yeni konteyner kurulur.

1. `--list` ile geri dönülecek yedeği seç. O yedeğin `restore_test=PASS` olduğunu doğrula.
2. Bozuk konteyneri durdur ama silme: `docker stop agos-staging-postgres && docker rename agos-staging-postgres agos-staging-postgres-bozuk-<tarih>`.
3. Aynı image, aynı env dosyası, **yeni boş volume** ve aynı port bağlamasıyla (`127.0.0.1:5434`) `agos-staging-postgres` adıyla yeni konteyner başlat.
4. Yedeği çöz ve yükle: `openssl enc -d … | docker exec -i agos-staging-postgres pg_restore -U <APP_USER> -d <APP_DB>` (sahiplik korunur; `--no-owner` kullanma).
5. `sel329-staging-readonly-role.sh --apply` ile `agos_readonly` rolünü yeniden uygula.
6. `ssh agos-staging-report` ile kontrol et: bölüm 6'da referans eşleşmesi EVET, bölüm 5'te tablo sayımları yedek manifestiyle aynı olmalı.
7. Sorun yoksa, birkaç gün sonra bozuk konteyneri ve volume'unu sil. Sorun varsa 2. adımın tersiyle eski konteynere dön.

Bu prosedür henüz gerçek staging üzerinde **çalıştırılmadı**. Kanıtlanan kısım, yedeğin ayrı ve ağsız bir konteynere hatasız geri yüklendiği (`--restore-test`).
