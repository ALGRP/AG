import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseShuttleTariff } from "@ag/core";
import { buildSite } from "./build.ts";

// Kullanım:
//   npm run build:sites                       → sites/ altındaki tüm siteler
//   npm run build:sites -- --site ornek-alanya-transfer
// Ortam: AG_API_BASE (varsayılan http://127.0.0.1:8787), AG_SHUTTLE_TARIFF_FILE

const root = resolve(import.meta.dirname, "../../..");
const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    out: { type: "string", default: "dist/sites" },
  },
});

const apiBase = process.env.AG_API_BASE ?? "http://127.0.0.1:8787";
const tariffFile = resolve(root, process.env.AG_SHUTTLE_TARIFF_FILE ?? "config/shuttle-tariff.example.json");
const shuttleTariff = existsSync(tariffFile) ? parseShuttleTariff(JSON.parse(readFileSync(tariffFile, "utf8"))) : undefined;

const sitesDir = join(root, "sites");
const ids = values.site ?? readdirSync(sitesDir).filter((d) => existsSync(join(sitesDir, d, "site.json")));
let failed = 0;
for (const id of ids) {
  try {
    const report = buildSite({
      siteDir: join(sitesDir, id),
      outDir: join(root, values.out!, id),
      apiBase,
      ...(shuttleTariff ? { shuttleTariff } : {}),
    });
    console.log(`✔ ${report.siteId}: ${report.pages} pages, ${report.indexable ? "INDEXABLE" : "noindex preview"}`);
    for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  } catch (err) {
    failed++;
    console.error(`✘ ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exitCode = failed > 0 ? 1 : 0;
