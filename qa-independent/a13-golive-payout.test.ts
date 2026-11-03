// Go-live gate (production must fail closed) and "no live payment / payout / debt collection in code".
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { W45, harness } from "./harness.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MAIN = join(ROOT, "apps/api/src/main.ts");
const FIXTURE = join(ROOT, "qa-independent/fixtures/approved-tariff.json");
const ALL_FLAGS = {
  AG_ACCEPT_INDEPENDENT_REVIEW: "1",
  AG_ACCEPT_LEGAL_TAX: "1",
  AG_ACCEPT_TENANT_ISOLATION: "1",
  AG_ACCEPT_FINANCE_TESTS: "1",
  AG_ACCEPT_BACKUP_ROLLBACK: "1",
  AG_OWNER_LIVE_GO: "1",
};

/** Start main.ts on 127.0.0.1 with a random port; resolves with exit code, or "listening" (then killed). */
function boot(env: Record<string, string | undefined>): Promise<{ outcome: number | "listening"; out: string }> {
  return new Promise((done) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("AG_") && k !== "NODE_ENV" && k !== "TURNSTILE_SECRET") clean[k] = v;
    for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
    const p = spawn(process.execPath, [MAIN], { env: { ...clean, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let settled = false;
    const finish = (o: number | "listening") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ outcome: o, out });
    };
    const onData = (d: Buffer) => {
      out += d.toString();
      if (out.includes("listening on")) {
        p.kill("SIGTERM");
        finish("listening");
      }
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("exit", (code) => finish(code ?? -1));
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      finish(-2);
    }, 15000);
  });
}

describe("A13 go-live gate", () => {
  it("A13.1 NODE_ENV=production with every acceptance flag set and an approved tariff still refuses to start", async () => {
    const r = await boot({ NODE_ENV: "production", ...ALL_FLAGS, AG_SHUTTLE_TARIFF_FILE: FIXTURE });
    assert.equal(r.outcome, 1, r.out);
    assert.match(r.out, /refusing to start in production/);
    assert.match(r.out, /SEL-332/);
    assert.match(r.out, /CRS/);
    assert.doesNotMatch(r.out, /tarife .* Owner onaylı değil/, "tariff condition satisfied by the fixture");
  });

  it("A13.2 NODE_ENV=production with nothing set lists every unmet condition", async () => {
    const r = await boot({ NODE_ENV: "production", AG_ADMIN_TOKEN: "x" });
    assert.equal(r.outcome, 1);
    for (const s of ["Owner onaylı değil", "geçici statik yönetim anahtarı", "tenant", "Owner LIVE GO", "yedekleme"]) assert.ok(r.out.includes(s), s);
  });

  it("A13.3 [RULE] a misspelt production mode (NODE_ENV=prod / Production) must not start an unguarded server", async () => {
    const outcomes: Array<number | "listening"> = [];
    for (const mode of ["prod", "Production"]) outcomes.push((await boot({ NODE_ENV: mode, AG_ADMIN_TOKEN: "qa-temp-token" })).outcome);
    assert.ok(!outcomes.includes("listening"), `server started with NODE_ENV in [prod, Production]: ${JSON.stringify(outcomes)} (proposed tariff, static admin token, no human check, in-memory store)`);
  });
});

describe("A13 no live payment / payout / debt collection", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|cjs)$/.test(f) && !f.endsWith(".test.ts")) files.push(p);
    }
  };
  for (const d of ["packages/core/src", "packages/ssg/src", "packages/ssg/assets", "apps/api/src"]) walk(join(ROOT, d));

  it("A13.4 the only outbound network call in server code is the Turnstile check; no payment/bank/payout client exists", () => {
    const net = files.filter((f) => /\bfetch\s*\(|https?\.request\s*\(|\bnet\.connect\b|\btls\.connect\b|new\s+WebSocket\b|\bundici\b/.test(readFileSync(f, "utf8")));
    assert.deepEqual(net.map((f) => relative(ROOT, f)).sort(), ["apps/api/src/main.ts", "packages/ssg/assets/form.js"]);
    const main = readFileSync(MAIN, "utf8");
    assert.deepEqual([...main.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]), ["https://challenges.cloudflare.com/turnstile/v0/siteverify"]);
    const form = readFileSync(join(ROOT, "packages/ssg/assets/form.js"), "utf8");
    assert.deepEqual([...form.matchAll(/fetch\(\s*(\w+)\s*\+\s*"([^"]+)/g)].map((m) => m[2]).sort(), ["/v1/public/bookings", "/v1/public/bookings/", "/v1/public/shuttle-quote?route="]);
    const payment = files.filter((f) => /stripe|iyzico|paypal|paytr|craftgate|adyen|wise\.com|\bsepa\b|\biban\b|payout\s*\(|sendPayment|createTransfer|executePayout|chargeCard/i.test(readFileSync(f, "utf8")));
    assert.deepEqual(payment.map((f) => relative(ROOT, f)), []);
  });

  it("A13.5 every weekly report (open and closed) carries payout_execution = disabled_owner_go_required; nothing consumes finance outbox events", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    assert.equal((await h.close(W45)).body.payout_execution, "disabled_owner_go_required");
    assert.equal((await h.report(W45)).payout_execution, "disabled_owner_go_required");
    assert.equal((await h.report("2026-W46")).payout_execution, "disabled_owner_go_required");
    const consumers = files.filter((f) => /listOutbox\(/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f)).sort();
    assert.deepEqual(consumers, ["apps/api/src/service.ts", "apps/api/src/store.ts"], "outbox is only listed for the admin view, never executed");
  });
});
