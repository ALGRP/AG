import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord } from "@ag/core";
import { createApiServer } from "./http.ts";
import { BookingService } from "./service.ts";
import { devOriginsForEnvironment, verifyLocalHuman, type HumanVerification } from "./human.ts";
import { MemoryStore } from "./store.ts";

// Yerel çalıştırma: `npm run dev:api`.
// UYARI: MemoryStore kalıcı değildir. Üretim deposu merkezi rezervasyon PostgreSQL'idir (CRS);
// bağlantı G1 kapısı (Linear SEL-329) ve CRS eşlemesi (SEL-331) kapanmadan yapılmaz.

const root = resolve(import.meta.dirname, "../../..");
const readJson = (p: string): unknown => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const env = process.env;
const sitesRaw = readJson(env.AG_SITES_FILE ?? "config/sites.registry.example.json") as unknown[];
const sites = new Map<string, SiteRecord>(sitesRaw.map((s) => parseSiteRecord(s)).map((s) => [s.id, s]));
const shuttleTariff = parseShuttleTariff(readJson(env.AG_SHUTTLE_TARIFF_FILE ?? "config/shuttle-tariff.example.json"));
// Canlıya geçiş koşulları (Owner karar taslağı 03.11.2026, madde 7). Üretim modunda HER BİRİ sağlanmadan
// sunucu açılmaz. Bu sürümde kimlik sağlayıcı + 2FA ve gerçek CRS bağlantısı olmadığı için üretim açılışı
// her zaman reddedilir — bilinçli olarak. SEL-324 / SEL-326 güvenlik kapıları ayrıca geçerlidir.
// Fail closed unless a developer explicitly selected a local-only mode.
if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
  const unmet: string[] = [];
  if (shuttleTariff.approval !== "approved") unmet.push(`tarife ${shuttleTariff.id} Owner onaylı değil (K8)`);
  // Kimlik sağlayıcı + 2FA entegrasyonu bu sürümde YAZILMADI; bir ortam değişkeni bunu karşılayamaz.
  unmet.push("iki adımlı doğrulamalı yönetici girişi (kimlik sağlayıcı entegrasyonu) bu sürümde yok — SEL-332");
  if (env.AG_ADMIN_TOKEN) unmet.push("geçici statik yönetim anahtarı üretimde kullanılamaz");
  // Kalıcı depo bu sürümde bellek içi; CRS adaptörü yazılmadı.
  unmet.push("gerçek CRS bağlantısı (PostgreSQL adaptörü) bu sürümde yok; staging doğrulaması gerekli (G1, SEL-329/331)");
  for (const [k, label] of [
    ["AG_ACCEPT_INDEPENDENT_REVIEW", "insan tarafından bağımsız güvenlik ve iş kuralı kabulü"],
    ["AG_ACCEPT_LEGAL_TAX", "mali müşavir ve hukuk incelemesi"],
    ["AG_ACCEPT_TENANT_ISOLATION", "tenant ve kullanıcı yetki izolasyonu"],
    ["AG_ACCEPT_FINANCE_TESTS", "iade, eksik tahsilat, haftalık kapanış ve fiyat testleri (staging)"],
    ["AG_ACCEPT_BACKUP_ROLLBACK", "yedekleme ve geri dönüş planı"],
    ["AG_OWNER_LIVE_GO", "ayrı ve açık Owner LIVE GO"],
  ] as const) {
    if (!env[k]) unmet.push(label);
  }
  if (unmet.length > 0) {
    console.error(`refusing to start in production — unmet live conditions:\n - ${unmet.join("\n - ")}`);
    process.exit(1);
  }
}
const devOrigins = devOriginsForEnvironment(env.NODE_ENV, env.AG_DEV_ORIGINS);
// Temporary local-only site credentials; never use as a substitute for SEL-332 verified IdP.
const siteTokens: Record<string, string> = {};
if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
  const raw = env.AG_SITE_TOKENS ? JSON.parse(env.AG_SITE_TOKENS) as unknown : {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AG_SITE_TOKENS must be a JSON object");
  for (const [token, siteId] of Object.entries(raw)) {
    if (token.length < 24 || typeof siteId !== "string" || !sites.has(siteId) || (env.AG_ADMIN_TOKEN && token === env.AG_ADMIN_TOKEN)) {
      throw new Error("invalid local site token configuration");
    }
    siteTokens[token] = siteId;
  }
}

const turnstileSecret = env.TURNSTILE_SECRET;
async function verifyHuman(token: string | undefined, ip: string): Promise<HumanVerification> {
  if (!token || token.length > 2048) return { ok: false };
  if (!turnstileSecret) {
    // Explicitly local/test only; this fixture is forgeable and MUST NOT be considered live protection.
    if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") return { ok: false };
    return verifyLocalHuman(token);
  }
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return { ok: false };
    const data = (await r.json()) as { success?: boolean; hostname?: string; action?: string };
    return {
      ok: data.success === true,
      ...(typeof data.hostname === "string" ? { hostname: data.hostname } : {}),
      ...(typeof data.action === "string" ? { action: data.action } : {}),
    };
  } catch {
    return { ok: false }; // network error and timeout fail closed
  }
}
if (!turnstileSecret) console.warn("TURNSTILE_SECRET not set: synthetic local-only human challenge (NOT production security)");

const service = new BookingService({
  store: new MemoryStore(),
  sites,
  shuttleTariff,
  // K15: shuttle %20 site / %10 AGOS / %70 tedarikçi — tek kaynak.
  shuttlePolicy: SHUTTLE_SPLIT_V1,
  pool: { slotMinutes: 60, vehicleCapacity: 10 },
  devOrigins,
  clock: () => new Date(),
  random: {
    id: randomUUID,
    index: (max) => randomInt(max),
    token: () => randomBytes(24).toString("base64url"),
  },
  verifyHuman,
});

const port = Number(env.PORT ?? 8787);
createApiServer({
  service,
  sites,
  devOrigins,
  siteTokens,
  ...(env.AG_ADMIN_TOKEN ? { adminToken: env.AG_ADMIN_TOKEN } : {}),
  ...(env.AG_TRUST_PROXY_HEADER ? { trustProxyHeader: env.AG_TRUST_PROXY_HEADER } : {}),
}).listen(port, "127.0.0.1", () => {
  console.log(`ag api listening on http://127.0.0.1:${port} (sites: ${sites.size}, tariff: ${shuttleTariff.id})`);
});
