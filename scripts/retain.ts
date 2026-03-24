#!/usr/bin/env npx jiti
/**
 * Retention policy: delete records older than configured age per entity type.
 * Run: npx jiti scripts/retain.ts [--dry-run]
 *
 * Default retention (days):
 *   lifecycle_events: 90
 *   test_runs: 180
 *   workflow_step_runs: 180
 *   backup_records: 365
 *   Everything else: kept forever
 */
import { connectXtdb } from "../lib/db.ts";

const RETENTION_DAYS: Record<string, number> = {
  lifecycle_events: 90,
  test_runs: 180,
  workflow_step_runs: 180,
  backup_records: 365,
};

const dryRun = process.argv.includes("--dry-run");
const sql = connectXtdb();
const t = (v: string) => sql.typed(v as any, 25);
const n = (v: number) => sql.typed(v as any, 20);

async function main() {
  let _totalDeleted = 0;

  for (const [table, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
      const rows = await sql`SELECT _id FROM ${sql(table)} WHERE ts < ${n(cutoff)}`;
      const count = rows.length;

      if (count === 0) {
        continue;
      }

      if (dryRun) {
      } else {
        for (const row of rows) {
          await sql`DELETE FROM ${sql(table)} WHERE _id = ${t(row._id)}`;
        }
      }
      _totalDeleted += count;
    } catch (_err) {}
  }
  await sql.end();
}

main().catch((_err) => {
  process.exit(1);
});
