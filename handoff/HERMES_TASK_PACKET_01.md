# HERMES GÖREV PAKETİ 01 — Baseline Sağlama ve Doğrulama

**TASK_NAME=** `AG_HERMES_BASELINE_AND_VERIFICATION_01`
**ROLE=** VERIFIER / BASELINE PROVIDER
**REQUESTED_BY=** Owner (alanyagroup07)
**DATE=** 2026-09-03
**MODE=** READ_ONLY + PRIVATE_REPO_COMMIT
**PRODUCTION_WRITE=** NO · **DEPLOYMENT=** NO · **REAL_CUSTOMER_ACTION=** NO
**owner_go=** false (bu paket canlı mutasyon yetkisi vermez)

---

## 0. Bağlam — neden bu paket var

Claude Opus 5 oturumu üç görev paketi teslim etti. Analiz ve booking matrisi tamam;
**kod değişikliği yapılamadı**, çünkü booking runtime kaynağı hiçbir git deposunda yok
ve canlı siteye bu ortamdan erişilemiyor. Bu paket, o tıkanıklığı açacak dört maddeyi
Hermes'e devrediyor.

**Önce raporları oku** (§1). Bulguları tekrar üretmek gerekmiyor — doğrulaman ve
eksik girdileri sağlaman yeterli.

---

## 1. İNCELENECEK RAPORLAR — tam yollar

**Depo:** `ALGRP/AG` (public)
**Branch:** `claude/alanyagroup-final-completion-me48z5`
**PR:** https://github.com/ALGRP/AG/pull/1 (açık, taslak, 3 commit, 22 dosya)
**Head commit:** `51ca976`

Klonlama:
```
git clone -b claude/alanyagroup-final-completion-me48z5 https://github.com/ALGRP/AG
```

### Okuma sırası

**A. En kritik bulgu — booking kapsam analizi**
```
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/FINDINGS_AND_CONFLICTS.md
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/TASK_STATUS.md
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/evidence/01_booking_coverage_analysis.txt
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/evidence/analyze_booking_coverage.py
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/data/README.md
```

**B. Neden reconciled candidate durduruldu + preflight aracı**
```
reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/ABSENT_FILES_MANIFEST.md
reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/TASK_STATUS.md
reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/evidence/01_baseline_verification.md
reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/preflight_baseline_check.sh   <-- GÖREV 1'de çalıştırılacak
```

**C. İlk paket (kısmen aşıldı — düzeltmeler B'de)**
```
reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/BOOKING_ENGINE_MATRIX.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/EXECUTION_PLAN.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/TASK_STATUS.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/evidence/01_ag_repo_state.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/evidence/02_platform_repo_state.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/evidence/03_dependency_verification.md
reports/ALANYAGROUP_FINAL_COMPLETION_V1/evidence/04_target_reachability.md
```

> **Not:** C paketindeki iki bulgu B paketinde **düzeltildi** — envanterin "yok" denmesi
> yanlıştı (AGOS'ta var) ve telefon numarası doğrulandı. Çelişki görürsen B geçerlidir.

### Kaynak veri (private depo — AG'ye kopyalanmadı, bilinçli)
```
ALGRP/AGOS → ag-platform-v2-admin-cms/fixtures/AG_BOOKING_COVERAGE_INVENTORY.csv   (906 satır)
ALGRP/AGOS → ag-platform-v2-admin-cms/fixtures/AG_BOOKING_PRIORITY_MATRIX.csv      (699 satır)
ALGRP/AGOS → AG_BOOKING_OWNER_DECISION_01.md
```

---

## 2. GÖREV 1 — Baseline (EN ÖNCELİKLİ, diğer her şeyi açar)

`preflight_baseline_check.sh` betiğini **Mac'te** çalıştır:

```
cd <AG klonu>/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/
chmod +x preflight_baseline_check.sh
./preflight_baseline_check.sh
```

Varsayılan kök: `/Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04`
Farklıysa argüman olarak ver: `./preflight_baseline_check.sh /gerçek/yol`

**Betik hakkında:** salt-okunur — kök içinde hiçbir şey oluşturmaz/değiştirmez/silmez,
ağ erişimi yok, macOS'un varsayılan bash 3.2'sinde çalışır. Tam, eksik ve kök-yok
senaryolarına karşı test edildi. Çıkış kodları: `0` tam · `1` eksik · `2` kök bulunamadı.

**Teslim et:** betiğin **tam çıktısını olduğu gibi** (kısaltmadan), artı exit kodu.

### Sonuca göre
- **BASELINE_COMPLETE=YES** → Görev 1B'ye geç.
- **BASELINE_COMPLETE=NO** → eksik dosya listesini aynen ilet. Eksikleri **uydurma**;
  nerede olduklarını araştır ve raporla.

### Görev 1B — kaynağı git'e al (baseline tamsa)
Şu dosyaları **PRIVATE** bir depoya commit et — `ALGRP/AGOS` veya
`ALGRP/alanyagroup-platform`. **Public `ALGRP/AG` deposuna ASLA koyma.**

```
wp-content/mu-plugins/ag-booking-core.php
wp-content/mu-plugins/ag-booking-component-v1.php
wp-content/mu-plugins/ag-home-booking-shortcode.php
wp-content/mu-plugins/ag-homepage-live-pilot/        (klasörün tamamı)
CLE received/confirmed e-posta modülü                (preflight'ın bulduğu yol)
```

**Commit etmeden önce:** API anahtarı, SMTP/WhatsApp kimlik bilgisi, DB dump,
müşteri/sürücü verisi taraması yap. Bunlardan hiçbiri git'e girmemeli.

**Teslim et:** depo adı, branch, commit SHA, dosya listesi.

---

## 3. GÖREV 2 — TÜRSAB numarası (yasal/uyum)

Kayıtta çelişki var:

| Kaynak | Değer |
|---|---|
| Owner talimatı (iki kez) | **2165** |
| `alanyagroup-platform` MASTER_PROJECT_STATUS §1 | **12892** |
| AGOS deposu | referans yok (0 sonuç) |

**Yapılacak:** TÜRSAB sicil belgesinden doğru numarayı doğrula.
**Teslim et:** doğru numara + dayanak (belge referansı). Belgeyi görmeden hiçbir
numarayı yayına alma. Şu an sitede **hiçbiri yayınlanmadı** — bu doğru davranıştı.

---

## 4. GÖREV 3 — Private/VIP fiyat formülü tabanı

Owner tarafından verilen formül:
```
Private (Alanya dışı):  max(50, 50 + max(0, km−30) × 0.60)
```
`50 + (negatif olmayan)` her zaman ≥ 50 olduğundan **dıştaki `max(50, …)` hiçbir zaman
devreye giremiyor** — ölü kod.

Alanya formülünde taban gerçekten çalışıyor:
```
Private (Alanya):  max(55, 40 + max(0, km−30) × 0.40)   → km < 67.5 iken 55 tabanı devrede
```

Simetrik olması gerekiyorsa Alanya-dışı taban muhtemelen **40** olmalıydı:
`max(50, 40 + max(0, km−30) × 0.60)`

**Teslim et:** owner onaylı kesin formül. Karşılaştırma için mevcut yayınlanmış
"from €X" fiyatları: Belek €43 · Kemer €48 · Side €52 · Manavgat €55 · Alanya €77.

**Not:** Owner'ın verdiği formül, Alanya dışındaki her destinasyonu **+€10 ila +€22**
yukarı çekiyor. Kasıtlıysa sorun yok — ama sitedeki tüm "from €X" değerlerini ve SEO
snippet'lerini değiştireceği için teyit gerekiyor.

---

## 5. GÖREV 4 — Dil kapsamı (hreflang öncesi)

Belirtilen öncelik `EN → TR → DE → RU`. Ancak canlıda bu tiers dışında sayfalar var:

| Dil | Para sayfası (slug taramasından) | Örnek |
|---|---:|---|
| DE | 21 | `/alanya-24-7-flughafentransfer/` |
| TR | 14 | `/alanya-havaalani-transfer-hizmeti/` |
| **İskandinav (NO/DA/SV)** | **12** | `/alanya-flyplass-7-24-overfore/`, `/alanya-overfore/` |
| RU (latin slug) | 0 | — |

Ayrıca kayıt, sitenin **AR (Arapça)** içeriği olduğunu söylüyor.
699 form-suz URL'nin **178'i** `NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE` işaretli.

**Karar gerekiyor:** İskandinav + Arapça sayfalar → kapsama alınsın mı, olduğu gibi
bırakılsın mı, yoksa `noindex` mi? Sadece dört dil yayınlayan bir hreflang yeniden
kurgusu bu sayfaları öksüz bırakır.

**Teslim et:** her dil grubu için owner kararı.

---

## 6. YASAKLAR (bu paket için)

- Canlı WordPress mutasyonu yok (owner_go=false).
- `single-booking-engine-candidate/`, `deploy-package/`, production pull'lar, backup'lar
  ve proof/evidence klasörleri **değiştirilmeyecek**.
- Kaynak uydurma yok — eksikse eksik olarak raporla.
- Public `ALGRP/AG` deposuna kaynak kod, kimlik bilgisi veya 906 satırlık envanter
  konmayacak.
- Gerçek müşteri/sürücüye test mesajı yok. n8n workflow aktivasyonu yok.
- TÜRSAB numarası veya yeni fiyat, teyit gelmeden yayına alınmayacak.

---

## 7. TESLİM FORMATI

```
TASK_STATUS=
REPORTS_REVIEWED=            (okunan rapor yolları)
DISAGREEMENTS=               (raporlarda hatalı bulduğun tespitler — varsa)

BASELINE_SCRIPT_RUN=         YES|NO
BASELINE_SCRIPT_OUTPUT=      (tam çıktı, kısaltmadan)
BASELINE_SCRIPT_EXIT_CODE=
BASELINE_COMPLETE=           YES|NO
BASELINE_SOURCE=
BASELINE_SOURCE_DATE=
ABSENT_FILES=                (eksikse tam liste)

SOURCE_COMMITTED=            YES|NO
SOURCE_REPO=                 (private olmalı)
SOURCE_BRANCH=
SOURCE_COMMIT=
SOURCE_FILES=
SECRET_SCAN_RESULT=

TURSAB_VERIFIED_NUMBER=
TURSAB_EVIDENCE=

PRICING_FORMULA_CONFIRMED=
PRICING_BASE_VALUE=          (50 mi 40 mı)

LANGUAGE_DECISION_SCANDINAVIAN=
LANGUAGE_DECISION_ARABIC=

PRODUCTION_CHANGED=          NO
CREDENTIALS_IN_GIT=          NO
BLOCKERS=
NEXT_ACTION_FOR_CLAUDE=
```

---

## 8. Hermes bitirdiğinde Claude ne yapacak

`BASELINE_COMPLETE=YES` + kaynak private depoda olduğu anda, bu oturum şunları
uygulayabilir (hepsi zaten kayıtlı owner kararlarıyla):

- Canonical `[ag_booking_engine]` + `ag_hlp_render_booking_engine()`, üç alias aynı renderer'a
- E-posta opsiyonel (frontend/backend/API), boş e-posta booking'i engellemez
- Manuel koltuk seçimi kaldırılır; yolcu sayısı koltuk sayısını belirler; kapasite doğrulaması korunur
- Server-side fiyat otoritesi: 1=30 · 2=50 · 3=60 · 4=70 · 5=80 · 6=90; client fiyatına güvenilmez
- AYT↔GZP shuttle iki yönde de server-side reddedilir; private/VIP etkilenmez
- CLE received/confirmed davranışı regresyona uğramaz; çift voucher engellenir
- 24 maddelik test matrisi çalıştırılır ve sonuçlar dürüst raporlanır

**Kapsam doldurma** (384 para sayfası) ayrı bir OWNER GO ister — beş batch'e bölünmüş
durumda, `EXECUTION_PLAN.md`'de sıralı.
