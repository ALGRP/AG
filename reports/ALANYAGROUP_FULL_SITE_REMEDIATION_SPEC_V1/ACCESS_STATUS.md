# Erişim Durumu — 2026-09-12 11:52Z (doğrudan ölçüm)

> Bu dosya bu oturumun **kendi ölçümüdür**; başka bir kayıttan aktarılmamıştır. *Redaksiyon (2026-09-13): 1. satırdaki WordPress.com site tanımlayıcısı public kopyadan çıkarıldı (`AG/CLAUDE.md` §6); ölçümün kendisi değişmedi. Öncelik 1'e aynı tarihli yetki notu eklendi.*
> Owner talebi: "siteyi baştan sona düzenle, yayına al, hızı ve rezervasyon durumunu kontrol et."
> Bu dört işin hepsi siteye erişim gerektirir. Dört kanal denendi, dördü de kapalı.

| # | Kanal | Sonuç | Kimin açabileceği | Nasıl |
|---|---|---|---|---|
| 1 | **WordPress.com / Jetpack bağlayıcısı** | Site hesapta **kayıtlı** (site tanımlayıcısı gizlendi — hiçbir depoda tutulmaz, owner'ın WordPress.com hesabında görünür; platform `jetpack`, `www.alanyagroup.com`) ama `site_disconnected` — site kapsamlı MCP araçları çalışmıyor. Son güncelleme 2021-08-03. | **Owner** | WP admin → Jetpack → **Reconnect**. Bağlanınca bu oturum `content-authoring` + `site-editing` araçlarıyla sayfaları doğrudan envanterleyip düzenleyebilir. |
| 2 | **Semrush** | Abonelik aktif, **API birimi 0** — `domain_overview` ve `site_audit` reddedildi. | **Owner** | https://www.semrush.com/mcp-access — ek API birimi. Sonra hız/SEO denetimi buradan alınır. |
| 3 | **Doğrudan HTTPS** (konteyner → site) | `CONNECT alanyagroup.com:443` → **403 policy denial** (agent proxy). Cloudflare'a bile ulaşılamıyor. | **Owner** | code.claude.com → ortam ağ politikası → `alanyagroup.com` ve `www.alanyagroup.com` izin listesine. |
| 4 | **Hermes teslimatı** (kaynak kodun özel depoya commit'i) | `ALGRP/AGOS` ve `ALGRP/alanyagroup-platform`'da 2026-09-03'ten beri **0 commit**. `handoff/HERMES_TASK_PACKET_01.md` yanıtsız. | **Hermes / Owner** | Paketteki 1. görev: `preflight_baseline_check.sh` çalıştır, tamamsa runtime + CLE modülünü özel depoya commit et. |

## Öncelik sırası (en düşük eforla en çok kapı açan)

1. **Jetpack reconnect** — tek tıkla bu oturuma canlı sayfa okuma/yazma yetkisi verir. Kaynak kod olmadan bile sayfa envanteri, içerik ve UX düzenlemesi mümkün olur. Booking engine'in PHP tarafı (shortcode kaydı, server-side fiyat) yine kaynak gerektirir — o Hermes'te. **Not (2026-09-13):** bu cümle *yeteneği* anlatır, *yetkiyi* değil — reconnect yazma yetkisi vermez, OWNER GO ayrıdır (`AI_OPERATING_RULES.md#L4`); `alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L3,L5` ve `CURRENT_STATUS.md#L10` ("Jetpack: not needed now") owner tarafından bilinçli aşılmalı; "tek tık" ve eklentinin canlıda kurulu/aktif olduğu kayıtta doğrulanmadı (05 §1.1). Ölçüm satırları değişmedi.
2. **Semrush API birimi** — "sitenin hızını kontrol et" talebinin tek ölçülebilir kaynağı bu oturumda.
3. **Ağ izin listesi** — DOM doğrulaması ve HTTP/hız ölçümü için.
4. **Hermes baseline** — booking core değişiklikleri için zorunlu; diğer üçü bunu beklemez.

## Bugün ne yapıldı, ne yapılmadı

- **Yapılmadı:** sayfa düzenleme, form düzenleme, deploy, hız ölçümü, rezervasyon durumu sorgusu — hiçbiri erişim olmadan mümkün değil. **Hiçbir production dokunuşu olmadı.**
- **Yapıldı:** kayıttaki tüm tasarım/karar/denetim belgeleri beş bağımsız ajanla okundu, iddialar kaynağa karşı doğrulandı, sayfa-tipi bazlı tam düzeltme spesifikasyonu ve Codex görev paketi üretildi (bu klasördeki diğer dosyalar).

## "Yayına al" hakkında

Owner'ın 2026-09-05'te beş depoya dağıttırdığı brifing §5: *"Production'a deploy — yok."* Bu talep o kaydı geçersiz kılmaz; deploy için `AI_COMMAND_CENTER/OWNER_GO_LOG.md`'ye açık bir **OWNER GO** kaydı gerekir. Kayıt gelse bile bugün erişim yok. Deploy **yapılmadı**.
