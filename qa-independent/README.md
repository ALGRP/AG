# qa-independent · PR #9 için AI saldırgan testleri (03.11.2026)

**Kaynak:**
- Bu testleri ayrı bir AI ajanı yazdı. Ajan PR #9'un kodunu yazmadı ve yazarın sonuçlarını görmedi.
- Sabitlenmiş commit `c0b3175` üzerinde, ayrı bir git worktree'de çalıştı.
- Ana oturum testleri ana checkout'ta yeniden koştu ve aynı sonucu aldı.
- SQL problarını temiz bir PostgreSQL 16 veritabanında ayrıca doğruladı.

**Bu bir kabul değildir.** `INDEPENDENT_ACCEPTED=NO`. İnsan bağımsız inceleyici bu testleri girdi olarak kullanır.

## Neden `npm test` dışında?

`npm run check` yalnız `packages/*/src` ve `apps/*/src` altını koşar. Bu klasördeki `[RULE]` testleri iş kuralını kodlar ve **bugün 27'si bilerek kırmızıdır**: her biri açık bir bulguyu belgeler (`docs/konsey/E-pr9-bagimsiz-qa-plani.md` §3). Düzeltme turundan sonra hepsi yeşile dönmeli; o zaman ana test setine alınması önerilir.

## Çalıştırma

```bash
node --test "qa-independent/**/*.test.ts"     # beklenen bugün: 83 test, 56 geçer, 27 kalır ([RULE] testleri)
npx tsc -p qa-independent/tsconfig.json       # tip kontrolü (çıkış 0)
node --test --test-name-pattern="A2.6" qa-independent/a02-partial-collection.test.ts   # tek bulgu
```

SQL problarını yalnız atılabilir bir veritabanında çalıştır:

```bash
psql -v ON_ERROR_STOP=1 -d <bos_db> -f packages/db/migrations/0001_network_core.sql
psql -d <bos_db> -f qa-independent/sql/qa_probes.sql
```

Bugünkü beklenen sonuç:
- 34 negatif prob (Q01–Q35, Q21 yapısal gözlem) **kabul ediliyor**; bu, F4 bulgusu.
- 5 kontrol (C01–C05) reddediliyor.
- R01–R08 RLS gözlemleri.

## Dosyalar

| Dosya | Alan |
| -- | -- |
| `harness.ts`, `fixtures/approved-tariff.json` | Ortak düzenek (sentetik siteler, onaylı test tarifesi) |
| `a01` … `a13`, `w45-reconciliation` | Owner'ın 12 alanı + canlı kapı + W45 satır satır mutabakat |
| `sql/qa_probes.sql` | Veritabanı negatif probları ve RLS gözlemleri |

Tüm veriler sentetiktir; gerçek müşteri, tedarikçi veya ödeme bilgisi içermez.
