#!/usr/bin/env npx jiti
/**
 * Run npm audit and persist results to XTDB dependency_audits table.
 * Usage: npx jiti scripts/audit-to-xtdb.ts
 */
import { execSync } from "node:child_process";
import { connectXtdb } from "../lib/db.ts";

async function main() {
  const sql = connectXtdb();
  let audit: any;
  try {
    const raw = execSync("npm audit --json 2>/dev/null", { encoding: "utf-8", timeout: 30000 });
    audit = JSON.parse(raw);
  } catch (e: any) {
    if (e.stdout) audit = JSON.parse(e.stdout);
    else { console.error("npm audit failed"); process.exit(1); }
  }

  const vulns = audit.vulnerabilities ?? {};
  for (const [pkg, info] of Object.entries(vulns) as any[]) {
    await sql`INSERT INTO dependency_audits
      (_id, package_name, severity, title, url, fixable, ts, _valid_from)
      VALUES (${`audit:${pkg}:${Date.now()}`}, ${pkg}, ${info.severity ?? "unknown"},
        ${info.via?.[0]?.title ?? pkg}, ${info.via?.[0]?.url ?? ""}, ${!!info.fixAvailable},
        ${Date.now()}, CURRENT_TIMESTAMP)`;
  }

  const count = Object.keys(vulns).length;
  console.log(`Persisted ${count} audit findings to XTDB`);
  await sql.end();
}
main();
