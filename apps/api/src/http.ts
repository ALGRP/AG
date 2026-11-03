import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { SiteRecord } from "@ag/core";
import type { BookingService, ServiceResult } from "./service.ts";

export interface HttpOptions {
  readonly service: BookingService;
  readonly sites: ReadonlyMap<string, SiteRecord>;
  readonly devOrigins: readonly string[];
  /**
   * GEÇİCİ yönetim anahtarı. Yoksa /v1/admin/* tamamen kapalıdır.
   * Gerçek yönetim girişi (kimlik sağlayıcı + zorunlu 2FA) AÇIK karardır (Linear SEL-332).
   */
  readonly adminToken?: string;
  /** Güvenilir ters vekil (Cloudflare/Nginx) arkasındaysa istemci IP'si bu başlıktan okunur. */
  readonly trustProxyHeader?: string;
  readonly publicRateLimitPerMinute?: number;
}

const MAX_BODY = 32 * 1024;

class TokenBucket {
  readonly #hits = new Map<string, { count: number; resetAt: number }>();
  readonly #limit: number;
  constructor(limit: number) {
    this.#limit = limit;
  }
  allow(key: string, now = Date.now()): boolean {
    const cur = this.#hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.#hits.set(key, { count: 1, resetAt: now + 60_000 });
      if (this.#hits.size > 50_000) this.#hits.clear();
      return true;
    }
    cur.count++;
    return cur.count <= this.#limit;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(json);
}

function reply(res: ServerResponse, r: ServiceResult<unknown>, headers: Record<string, string> = {}) {
  send(res, r.status, r.body, headers);
}

async function readJson(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const ct = req.headers["content-type"] ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) return { ok: false, status: 415, error: "json_required" };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return { ok: false, status: 413, error: "body_too_large" };
    chunks.push(chunk as Buffer);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createApiServer(opts: HttpOptions): Server {
  const allowedOrigins = new Set<string>(opts.devOrigins);
  for (const s of opts.sites.values()) for (const d of s.domains) allowedOrigins.add(`https://${d}`);
  const limiter = new TokenBucket(opts.publicRateLimitPerMinute ?? 20);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://internal");
      const path = url.pathname;
      const origin = req.headers.origin;
      const cors: Record<string, string> =
        origin && allowedOrigins.has(origin)
          ? {
              "access-control-allow-origin": origin,
              "access-control-allow-methods": "GET, POST",
              "access-control-allow-headers": "content-type, idempotency-key, x-lookup-token",
              "access-control-max-age": "600",
              vary: "Origin",
            }
          : { vary: "Origin" };

      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (path === "/healthz") return send(res, 200, { ok: true });

      const forwarded = opts.trustProxyHeader ? req.headers[opts.trustProxyHeader.toLowerCase()] : undefined;
      const ip = (typeof forwarded === "string" ? forwarded.split(",")[0]!.trim() : req.socket.remoteAddress) ?? "unknown";

      // ---- Herkese açık uçlar (uydu siteler) ----
      if (path.startsWith("/v1/public/")) {
        if (!limiter.allow(`${ip}`)) return send(res, 429, { error: "rate_limited" }, { ...cors, "retry-after": "60" });

        if (req.method === "POST" && path === "/v1/public/bookings") {
          const body = await readJson(req);
          if (!body.ok) return send(res, body.status, { error: body.error }, cors);
          const key = req.headers["idempotency-key"];
          const r = await opts.service.submit({
            raw: body.value,
            origin,
            ip,
            idempotencyKey: typeof key === "string" ? key : undefined,
          });
          return reply(res, r, cors);
        }

        const lookup = /^\/v1\/public\/bookings\/(AG-[23456789A-HJKMNP-Z]{6})$/.exec(path);
        if (req.method === "GET" && lookup) {
          const token = req.headers["x-lookup-token"];
          return reply(res, await opts.service.lookup(lookup[1]!, typeof token === "string" ? token : undefined), cors);
        }

        if (req.method === "GET" && path === "/v1/public/shuttle-quote") {
          const pax = Number(url.searchParams.get("passengers"));
          return reply(
            res,
            opts.service.quoteShuttle(url.searchParams.get("route") ?? "", url.searchParams.get("date") ?? "", pax),
            { ...cors, "cache-control": "public, max-age=300" },
          );
        }
        return send(res, 404, { error: "not_found" }, cors);
      }

      // ---- Yönetim uçları (merkezi panel) ----
      if (path.startsWith("/v1/admin/")) {
        const auth = req.headers.authorization ?? "";
        if (!opts.adminToken || !auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), opts.adminToken)) {
          return send(res, 401, { error: "unauthorized" });
        }
        if (req.method === "GET" && path === "/v1/admin/bookings") return reply(res, await opts.service.listBookings());
        if (req.method === "GET" && path === "/v1/admin/ledger/balances") return reply(res, await opts.service.ledgerBalances());
        if (req.method === "GET" && path === "/v1/admin/outbox") return reply(res, await opts.service.outbox());

        const confirm = /^\/v1\/admin\/bookings\/([A-Z0-9-]+)\/confirm$/.exec(path);
        if (req.method === "POST" && confirm) return reply(res, await opts.service.confirm(confirm[1]!));

        const approve = /^\/v1\/admin\/bookings\/([A-Z0-9-]+)\/approve-price$/.exec(path);
        if (req.method === "POST" && approve) {
          const body = await readJson(req);
          if (!body.ok) return send(res, body.status, { error: body.error });
          return reply(res, await opts.service.approveShuttlePrice(approve[1]!, (body.value ?? {}) as Record<string, unknown>));
        }

        const done = /^\/v1\/admin\/bookings\/([A-Z0-9-]+)\/complete$/.exec(path);
        if (req.method === "POST" && done) {
          const body = await readJson(req);
          if (!body.ok) return send(res, body.status, { error: body.error });
          return reply(res, await opts.service.completePrivate(done[1]!, (body.value ?? {}) as Record<string, unknown>));
        }

        const run = /^\/v1\/admin\/shuttle-runs\/([A-Za-z0-9-]+)\/(assign|complete)$/.exec(path);
        if (req.method === "POST" && run) {
          const body = await readJson(req);
          if (!body.ok) return send(res, body.status, { error: body.error });
          const v = (body.value ?? {}) as Record<string, unknown>;
          return reply(
            res,
            run[2] === "assign"
              ? await opts.service.assignRun(run[1]!, v.carrierPayeeId)
              : await opts.service.completeRun(run[1]!, v.paidRefs),
          );
        }
        return send(res, 404, { error: "not_found" });
      }

      return send(res, 404, { error: "not_found" });
    } catch (err) {
      // Kişisel veri loglanmaz: yalnız hata türü.
      console.error("unhandled_error", err instanceof Error ? err.name + ": " + err.message : "unknown");
      if (!res.headersSent) send(res, 500, { error: "internal_error" });
      else res.end();
    }
  });
}
