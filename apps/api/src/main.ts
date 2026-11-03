import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PASS_POLICY_DECK_V3, SHUTTLE_DIRECT_SPLIT_PROPOSED, SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord } from "@ag/core";
import { createApiServer } from "./http.ts";
import { BookingService } from "./service.ts";
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
// Onaylanmamış tarife (K8) ya da onay bekleyen kararlarla üretimde açılmaz.
if (env.NODE_ENV === "production" && shuttleTariff.approval !== "approved") {
  console.error(`refusing to start: shuttle tariff ${shuttleTariff.id} is "${shuttleTariff.approval}" (Owner approval required)`);
  process.exit(1);
}
const devOrigins = (env.AG_DEV_ORIGINS ?? "http://localhost:4321").split(",").filter(Boolean);

const turnstileSecret = env.TURNSTILE_SECRET;
async function verifyHuman(token: string | undefined, ip: string): Promise<boolean> {
  if (!turnstileSecret) return true; // yalnız yerel geliştirme
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: ip }),
  });
  const data = (await r.json()) as { success?: boolean };
  return data.success === true;
}
if (!turnstileSecret) console.warn("TURNSTILE_SECRET not set: human check disabled (local only)");

const service = new BookingService({
  store: new MemoryStore(),
  sites,
  shuttleTariff,
  // K4 önerisi (90/10) onaylanana kadar "proposed": AG kendi sitesinden gelen shuttle için otomatik pay yazılmaz.
  splitPolicies: { partnerSourced: SHUTTLE_SPLIT_V1, direct: SHUTTLE_DIRECT_SPLIT_PROPOSED },
  passPolicy: PASS_POLICY_DECK_V3,
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
  ...(env.AG_ADMIN_TOKEN ? { adminToken: env.AG_ADMIN_TOKEN } : {}),
  ...(env.AG_TRUST_PROXY_HEADER ? { trustProxyHeader: env.AG_TRUST_PROXY_HEADER } : {}),
}).listen(port, "127.0.0.1", () => {
  console.log(`ag api listening on http://127.0.0.1:${port} (sites: ${sites.size}, tariff: ${shuttleTariff.id})`);
});
