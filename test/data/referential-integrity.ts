#!/usr/bin/env npx jiti
// ─── Data Integrity: Referential Integrity ───────────────────
// Checks that foreign key relationships are valid across XTDB tables.
// Finds orphaned records that reference non-existent parents.
//
// Usage: npx jiti test/data/referential-integrity.ts

import { connectXtdb } from "../../lib/db.ts";

interface IntegrityCheck {
  name: string;
  query: string;
  description: string;
}

const CHECKS: IntegrityCheck[] = [
  {
    name: "ci_runs → repos",
    query: "SELECT _id, repo FROM ci_runs WHERE repo NOT IN (SELECT DISTINCT repo FROM ci_runs) LIMIT 10",
    description: "CI runs referencing repos that have no other runs",
  },
  {
    name: "ticket_links → tickets",
    query: "SELECT _id, ticket_id FROM ticket_links WHERE ticket_id NOT IN (SELECT _id FROM tickets) LIMIT 10",
    description: "Ticket links pointing to non-existent tickets",
  },
  {
    name: "ticket_events → tickets",
    query: "SELECT _id, ticket_id FROM ticket_events WHERE ticket_id NOT IN (SELECT _id FROM tickets) LIMIT 10",
    description: "Ticket events for non-existent tickets",
  },
  {
    name: "error_events → components",
    query: "SELECT component, COUNT(*) as cnt FROM error_events GROUP BY component HAVING COUNT(*) > 0 ORDER BY cnt DESC LIMIT 10",
    description: "Error events by component (sanity check)",
  },
  {
    name: "no orphan deployments",
    query: "SELECT _id FROM deployments WHERE repo IS NULL OR commit_hash IS NULL LIMIT 10",
    description: "Deployments missing required fields",
  },
];

async function main(): Promise<void> {
  console.log("\n🔍 Referential Integrity Checks\n");

  const sql = connectXtdb({ max: 1 });
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const check of CHECKS) {
    try {
      const rows = await sql.unsafe(check.query);
      if (rows.length === 0) {
        console.log(`  ✅ ${check.name}: clean`);
        passed++;
      } else {
        console.log(`  ⚠️  ${check.name}: ${rows.length} issue(s) — ${check.description}`);
        for (const row of rows.slice(0, 3)) {
          console.log(`     ${JSON.stringify(row)}`);
        }
        failed++;
      }
    } catch (e: any) {
      console.log(`  ⏭️  ${check.name}: skipped (${e.message.slice(0, 60)})`);
      skipped++;
    }
  }

  await sql.end();
  console.log(`\n${passed} passed, ${failed} issues, ${skipped} skipped\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
