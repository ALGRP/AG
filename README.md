# AG Network

Antalya transfer ve turizm operasyonu için uçtan uca ağ. 10–20 statik (SSG) uydu site, TypeScript/Node.js merkez sistemine bağlanır. Merkez rezervasyonları toplar, shuttle havuzunu yönetir, shuttle'da %20 site / %10 AGOS / %70 tedarikçi paylarını hesaplar, haftalık hesap kapanışı ve dekont eşleştirme raporlarını üretir, bildirimleri outbox ile dağıtır. Müşteri ödemesini tedarikçi tahsil eder; sistem para göndermez.

> **LOCAL_ONLY aday.** Canlı sistem, DNS, CRS veritabanı, ödeme ve müşteri mesajı değişmedi. Linear G0 → G1 → G2 kapıları geçerlidir.

- Mimari, SEO stratejisi, API akışları ve yol haritası: [`docs/MIMARI.md`](docs/MIMARI.md)
- Linear kararlarıyla farklar ve açık kararlar: [`docs/KARARLAR-VE-CELISKILER.md`](docs/KARARLAR-VE-CELISKILER.md)

## Paketler

| Yol | İçerik |
| -- | -- |
| `packages/core` | Saf domain kuralları: shuttle tarifesi, 20/10/70, K15 hesap satırı ve haftalık rapor, durum modeli, havuz, form doğrulama |
| `apps/api` | Merkez HTTP API'si: uydu intake, sorgulama, fiyat önizleme, admin uçları |
| `packages/ssg` | Statik site üretici: SEO etiketleri, hreflang, sitemap, JSON-LD, CSP, rezervasyon ve sorgulama formları |
| `packages/db` | PostgreSQL şema adayı (CRS eşlemesine kadar uygulanmaz) |
| `sites/*` | Site içerikleri (Markdown) ve ayarları |

## Komutlar

```bash
npm install
npm run check          # tip kontrolü + tüm testler
npm run dev:api        # yerel API (AG_ADMIN_TOKEN tanımlıysa admin uçları açılır)
npm run build:sites    # dist/sites/<site-id>/
npm run report:sample  # sentetik hafta → docs/ornek-hafta-2026-W45.html
```

Gereksinim: Node.js ≥ 22.18 (TypeScript doğrudan çalışır, derleme adımı yoktur).
