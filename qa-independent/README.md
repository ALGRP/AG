# qa-independent · PR #9 için AI saldırgan testleri (03.11.2026)

**Kaynak:**
- Bu testleri ayrı bir AI ajanı yazdı. Ajan PR #9'un kodunu yazmadı ve yazarın sonuçlarını görmedi.
- Sabitlenmiş commit `c0b3175` üzerinde, ayrı bir git worktree'de çalıştı.
- Ana oturum testleri ana checkout'ta yeniden koştu ve aynı sonucu aldı.
- SQL problarını temiz bir PostgreSQL 16 veritabanında ayrıca doğruladı.

**Bu bir kabul değildir.** `INDEPENDENT_ACCEPTED=NO`. İnsan bağımsız inceleyici bu testleri girdi olarak kullanır.

## `npm test` ile ilişki (V2.5 · 03.11.2026)

- Bu klasör artık `npm run check` içinde koşar: tip kontrolü `tsc -p qa-independent/tsconfig.json`, testler `npm test` deseninde.
- Bugün kırmızı olan 24 `[RULE]` testi `todo` olarak işaretli. Her birinin `todo` metni bulgu kimliğini ve paketi taşır (ör. `QA-F1 · Codex Paket-01`). `todo` testler koşar ve sonucu raporlanır, ama `npm test`'i kırmaz.
- **Kabul ölçütü:** düzeltmeyi yapan ilgili testteki `todo` seçeneğini kaldırır ve test geçer. Testin beklentisini koda uydurmak için gevşetmek yasaktır.
- Bulgu ve test eşlemesinin tek kaynağı: [`docs/konsey/TEK-KARAR-SKILL-ESLEMESI.md`](../docs/konsey/TEK-KARAR-SKILL-ESLEMESI.md).
- SQL probları (`sql/qa_probes.sql`) kopyalanmaz. Bunları `packages/db/src/schema-probes.test.ts` gerçek PostgreSQL'de koşar (`AG_TEST_PG=1` ile; ayar yoksa atlanır).

## Çalıştırma

```bash
node --test "qa-independent/**/*.test.ts"     # beklenen bugün: 83 test, 59 geçer, 24 todo, 0 kalır
npx tsc -p qa-independent/tsconfig.json       # tip kontrolü (çıkış 0)
node --test --test-name-pattern="A2.6" qa-independent/a02-partial-collection.test.ts   # tek bulgu
```

SQL problarını yalnız atılabilir bir veritabanında çalıştır:

```bash
psql -v ON_ERROR_STOP=1 -d <bos_db> -f packages/db/migrations/0001_network_core.sql
psql -d <bos_db> -f qa-independent/sql/qa_probes.sql
```

Bugünkü beklenen sonuç:
- 34 negatif prob (Q01–Q35; Q21 yapısal gözlem) **kabul ediliyor**; bu, F4 bulgusu.
- 5 kontrol (C01–C05) reddediliyor.
- R01–R08 RLS gözlemleri.

Aynı kontrolleri otomatik koşmak için:

```bash
AG_TEST_PG=1 PGHOST=… PGPORT=… PGUSER=… node --test packages/db/src/schema-probes.test.ts
```

## Dosyalar

| Dosya | Alan |
| -- | -- |
| `harness.ts`, `fixtures/approved-tariff.json` | Ortak düzenek (sentetik siteler, onaylı test tarifesi) |
| `a01` … `a13`, `w45-reconciliation` | Owner'ın 12 alanı + canlı kapı + W45 satır satır mutabakat |
| `sql/qa_probes.sql` | Veritabanı negatif probları ve RLS gözlemleri |

Tüm veriler sentetiktir; gerçek müşteri, tedarikçi veya ödeme bilgisi içermez.
