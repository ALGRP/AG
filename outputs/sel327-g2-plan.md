# G2 — Canonical booking PG intake ve dayanıklı outbox · Uygulama planı

Tarih: 2026-11-02 · Linear: SEL-327, SEL-161 · Önkoşul: G1 (SEL-329) kapanışı.
Durum: **PLAN.** Sunucuda hiçbir şey değişmedi. G1 bağımsız inceleyici kabulü gelmeden staging'e yazma yok.

## Amaç

Bir web sitesinden gelen her rezervasyon talebi:

1. tek bir veritabanına **tam olarak bir kez** yazılır;
2. aynı anda **tam olarak bir** outbox olayı üretir;
3. tekrar gönderilirse çift kayıt oluşmaz;
4. değiştirilmiş bir tekrar reddedilir (409).

Outbox, n8n'in (G4) işleyeceği dayanıklı iş kuyruğudur. G2'de outbox'ı **hiçbir şey tüketmez**: müşteriye, sürücüye veya Telegram'a gönderim yoktur.

## Neden önce kaynak haritası

Sunucuda rezervasyon tutan üç PostgreSQL var. Hangisinin "tek kayıt kaynağı" olduğu kayıtlarda çelişkili (SEL-327 açılış notu).

| Konteyner | Gözlenen | Yazan servis (bilinen) |
|---|---|---|
| `ag-transfer-platform-…-db-1` | ~548 reservation; 22 Ekim canary satırları 611–618 | transfer-platform API (5 site formu) |
| `agos-reservation-postgres` | 135 reservation, `outbox_jobs`, `source_events`, `telegram_*` | agos-reservation-api/worker, source-bridge |
| `agos-staging-postgres` | 19 tablo, 201 reservation (gerçek müşteri verisi); **G1 resmi staging** | bilinen istemci yok |

G2 bu sorulara kanıtla cevap vermeden yazma tasarlamaz:

- Canlı formlar hangi veritabanına yazıyor?
- source-bridge neyi nereye taşıyor?
- Hangi şemada idempotency (`request_id` unique) ve outbox zaten var?

## Adımlar

### G2.0 — Kaynak haritası (SALT-OKUNUR) · *şimdi çalıştırılabilir*

- `outputs/sel327-booking-source-map.sh` → `ssh agos-prod-01 'bash -s' < …`
- Her rezervasyon veritabanı için şunları raporlar:
  - referans veren konteyner ve servisler;
  - tablolar ve kesin sayımlar;
  - `reservations` / `outbox` tablolarının kolonları, kısıtları ve unique indeksleri;
  - kaynak/domain/durum değer dağılımı;
  - son kayıt zamanı.
- Satır içeriği ve müşteri verisi yazdırmaz.
- **Çıkış:** `VERIFIED_READ_ONLY_SOURCE_MAP`. Ardından Owner kararı: üretimde canonical veritabanı hangisi; G2 staging'de hangi şema sözleşmesini doğrulayacak.

### G2.1 — Şema sözleşmesi (yalnız aday SQL; uygulama yok)

G2.0 sonucuna göre canonical şema ile staging şemasının farkı çıkarılır. Eksik olanlar **yalnız ekleyen** (additive) bir aday migration olarak yazılır:

- `reservations`:
  - `tenant` + `request_id` UNIQUE;
  - `payload_sha256`: replay ayrımı için;
  - `source_domain`, `channel`, `schema_version`;
  - `is_test`: test kayıtları gerçek dispatch'e giremez (CHECK + view filtresi).
- Gidiş ve dönüş ayrı bacak (`reservation_legs`).
- `booking_outbox`:
  - `id`, `reservation_id`, `event_type` (created/updated/cancelled);
  - `dedup_key` UNIQUE;
  - `payload`, `status` (PENDING/CLAIMED/DONE/DEAD_LETTER);
  - `attempts`, `available_at`, `lease_owner`, `lease_until`.
- Intake fonksiyonu `agos_intake_booking(jsonb)`. Rezervasyonu ve outbox kaydını **tek transaction** içinde yazar:
  - aynı `request_id` + aynı hash → mevcut kaydı döner (idempotent), yeni outbox yok;
  - aynı `request_id` + farklı hash → `SQLSTATE` 409 eşdeğeri, hiçbir şey değişmez;
  - zorunlu alan eksik → tüm transaction geri alınır.
- `agos_cancel_booking`, `agos_update_booking`: sürüm artar ve olay başına tek outbox yazılır.
- Yazma rolü `agos_intake`: NOLOGIN, yalnız bu fonksiyonlarda EXECUTE yetkisi (SECURITY DEFINER), tablolara doğrudan yazma yok.
- Geri alma SQL'i: yalnız eklenen nesneleri kaldırır; mevcut 201 kayda dokunmaz.
- **Çıkış:** `CANONICAL_SCHEMA_CONTRACT` (aday SQL + geri alma SQL + diff raporu).

### G2.2 — Yerel kanıt (izole PostgreSQL, sentetik veri)

Aday SQL boş bir PG'de ve G2.0'daki staging şemasının boş kopyasında çalıştırılır. Test seti (`tenant='TEST'`, `is_test=true`, uydurma isimler):

| # | Senaryo | Beklenen |
|---|---|---|
| T1 | Yeni talep → okuma | 1 kayıt, 2 bacak (gidiş-dönüş), 1 outbox |
| T2 | Aynı talep tekrar | Aynı id, outbox hâlâ 1 |
| T3 | Aynı request_id, değişmiş içerik | 409, hiçbir şey değişmez |
| T4 | 20 paralel aynı talep | 1 kayıt, 1 outbox |
| T5 | Eksik zorunlu alan / geçersiz bacak | Tümü geri alınır, 0 kayıt |
| T6 | İptal, sonra tekrar iptal | Durum CANCELLED, 1 iptal olayı |
| T7 | İzinli alan güncellemesi | Sürüm +1, 1 güncelleme olayı |
| T8 | Yanlış tenant | Reddedilir |
| T9 | DB yeniden başlatma | Kayıtlar ve outbox aynen duruyor |
| T10 | 2 işçi aynı outbox'ı alıyor (SKIP LOCKED) | Her iş bir kez; lease süresi dolunca yeniden alınabilir; N denemeden sonra DEAD_LETTER |
| T11 | `is_test` kaydı dispatch görünümünde | Görünmez |
| T12 | `agos_intake` rolüyle tabloya doğrudan INSERT | Yetki hatası |

Shuttle fiyat kuralı (1=30, 2=50, 3=60, 4+ kişi başına +10 €) bu aşamada yalnız **doğrulama verisi** olarak taşınır; fiyat hesaplama G3'tedir.

- **Çıkış:** `IDEMPOTENCY_PROOF` + `AUTHZ_NEGATIVE_TEST` (yerel).

### G2.3 — Staging'de uygulama (Owner-L3, G1 kapandıktan sonra)

1. `sel329-staging-backup.sh --apply` ve `--restore-test` (PASS şart).
2. Migration `--apply`: yalnız eklenen nesneler. Mevcut 201 kayıt ve 19 tablo verisi değişmez; sayımlar önce ve sonra karşılaştırılır.
3. T1–T12 staging'de `tenant='TEST'` ile çalıştırılır.
4. Test kayıtları ya silinir ya da `is_test` olarak bırakılır (Owner seçer).
5. DB konteyneri yeniden başlatılır ve T9 tekrarlanır.
6. Geri alma provası: rollback SQL geçici kopyada denenir (restore-test konteyneri).

- **Çıkış:** staging kanıt paketi. Hermes rapor v4'e "intake/outbox" bölümünü ekler: yalnız TEST tenant sayımları, PENDING/DEAD_LETTER sayısı.

### G2.4 — Bağımsız kabul

Geliştiricinin (ve Hermes'in) PASS'i kabul değildir. G1'deki bağımsız inceleyici kanıt paketini inceler ve Linear'a kabulünü yazar.

## Kapsam dışı (G2'de YOK)

- Canlı web sitesi formlarını bu fonksiyona bağlamak (G3, ayrı Owner-L3).
- Outbox'ı tüketen n8n workflow'u (G4).
- Müşteri, sürücü ya da Telegram mesajı (G6).
- Üretim veritabanlarına yazma.
- Tarihî kayıtların taşınması veya backfill.

## Owner kararları

1. G2.0 sonrası: üretimde canonical veritabanı hangisi?
2. Intake yöntemi: DB fonksiyonu (öneri: uygulama bağımsız, test edilebilir) mi, mevcut agos-reservation-api kodu mu?
3. Test kayıtları staging'de kalsın mı, silinsin mi?
4. Bağımsız inceleyici (G1 ile aynı kişi olabilir).

## Risk ve önlemler

| Risk | Önlem |
|---|---|
| Staging'de gerçek müşteri verisi var | Yalnız ekleyen migration; öncesinde şifreli yedek ve restore-test; sayım karşılaştırması |
| Test kaydının gerçek işe karışması | `is_test` + CHECK + dispatch görünümü filtresi; outbox tüketicisi yok |
| Çift kayıt / yarış durumu | UNIQUE(tenant, request_id) + payload hash + T4/T10 |
| Yanlış veritabanına yazma | G2.0 haritası ve Owner kararı olmadan G2.1'e geçilmez |
