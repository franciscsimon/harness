#!/usr/bin/env npx jiti
// ─── Data Integrity: Primary-Replica Sync ────────────────────
// Writes a test record to XTDB primary, waits, reads from replica.
// Verifies data consistency across the cluster.
//
// Usage: npx jiti test/data/primary-replica-sync.ts

import postgres from "postgres";

const PRIMARY_PORT = Number(process.env.XTDB_PRIMARY_PORT ?? "5433");
const REPLICA_PORT = Number(process.env.XTDB_REPLICA_PORT ?? "5434");
const DB_OPTS = {
  host: "localhost",
  database: "xtdb",
  user: process.env.XTDB_USER ?? "xtdb",
  password: process.env.XTDB_PASSWORD ?? "xtdb",
  max: 1,
};

async function main(): Promise<void> {
  console.log("\n🔄 Primary-Replica Sync Test\n");

  const primary = postgres({ ...DB_OPTS, port: PRIMARY_PORT });
  const replica = postgres({ ...DB_OPTS, port: REPLICA_PORT });

  const testId = `sync-test-${Date.now()}`;
  const testValue = `test-value-${Math.random().toString(36).slice(2)}`;

  // Write to primary
  console.log(`  Writing to primary (port ${PRIMARY_PORT})...`);
  try {
    await primary`
      INSERT INTO sync_test (_id, value, _valid_from)
      VALUES (${testId}, ${testValue}, CURRENT_TIMESTAMP)`;
    console.log(`  ✅ Written: ${testId}`);
  } catch (e: any) {
    console.log(`  ❌ Write failed: ${e.message}`);
    await primary.end();
    await replica.end();
    process.exit(1);
  }

  // Wait for replication
  console.log("  Waiting for replication (5s)...");
  await new Promise((r) => setTimeout(r, 5000));

  // Read from replica
  console.log(`  Reading from replica (port ${REPLICA_PORT})...`);
  try {
    const rows = await replica`SELECT value FROM sync_test WHERE _id = ${testId}`;
    if (rows.length > 0 && rows[0].value === testValue) {
      console.log(`  ✅ Replica has correct value`);
    } else if (rows.length > 0) {
      console.log(`  ❌ Value mismatch: expected=${testValue} got=${rows[0].value}`);
    } else {
      console.log(`  ❌ Record not found on replica (replication lag?)`);
    }
  } catch (e: any) {
    console.log(`  ⚠️  Replica read failed: ${e.message}`);
  }

  // Cleanup
  try {
    await primary`DELETE FROM sync_test WHERE _id = ${testId}`;
  } catch { /* table might not support delete */ }

  await primary.end();
  await replica.end();
  console.log("\n  Done.\n");
}

main();
