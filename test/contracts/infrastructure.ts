#!/usr/bin/env npx jiti
/**
 * Contract: Infrastructure Health
 * Verifies all infrastructure services are running and responding.
 * No data needed — just running containers.
 * Run: cd ~/harness && NODE_PATH=xtdb-event-logger/node_modules npx jiti test/contracts/infrastructure.ts
 */

let passed = 0, failed = 0;
const failures: string[] = [];
function pass(name: string) { passed++; console.log(`  ✅ ${name}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  ❌ ${name}: ${reason}`); }

async function fetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return await res.text();
  } catch { return null; }
}

async function fetchStatus(url: string, timeoutMs = 5000): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.status;
  } catch { return null; }
}

async function main() {
  console.log("\n── Infrastructure Health Contracts ──\n");

  // ── XTDB Primary ──
  console.log("XTDB Primary (:5433 / :8083):");
  const primaryAlive = await fetchText("http://localhost:8083/healthz/alive");
  primaryAlive?.includes("Alive")
    ? pass("Primary is alive")
    : fail("Primary is alive", `got: ${primaryAlive}`);

  const primaryStarted = await fetchText("http://localhost:8083/healthz/started");
  primaryStarted?.includes("Started")
    ? pass("Primary is started (ingestion OK)")
    : fail("Primary is started", `got: ${primaryStarted}`);

  // ── XTDB Replica ──
  console.log("\nXTDB Replica (:5434 / :8084):");
  const replicaAlive = await fetchText("http://localhost:8084/healthz/alive");
  replicaAlive?.includes("Alive")
    ? pass("Replica is alive")
    : fail("Replica is alive", `got: ${replicaAlive}`);

  const replicaStarted = await fetchText("http://localhost:8084/healthz/started");
  replicaStarted?.includes("Started") || replicaStarted?.includes("Catching up")
    ? pass("Replica is started or catching up")
    : fail("Replica is started", `got: ${replicaStarted}`);

  // ── Redpanda ──
  console.log("\nRedpanda (:19092):");
  // Redpanda admin API on 9644 inside container, but we check via rpk or healthcheck
  const rpHealth = await fetchText("http://localhost:18082/topics");
  rpHealth !== null
    ? pass("Redpanda HTTP proxy responding")
    : fail("Redpanda HTTP proxy responding", "connection refused");

  // ── Garage ──
  console.log("\nGarage (:3900 / :3903):");
  const garageHealth = await fetchText("http://localhost:3903/health");
  garageHealth?.includes("operational")
    ? pass("Garage is operational")
    : fail("Garage is operational", `got: ${garageHealth}`);

  // Verify xtdb bucket exists via S3 API
  // Simple: try to list objects (will get 403 if no auth, but that means Garage is up)
  const s3Status = await fetchStatus("http://localhost:3900/xtdb");
  s3Status !== null
    ? pass("Garage S3 API responding")
    : fail("Garage S3 API responding", "connection refused");

  // ── XTDB Postgres wire protocol ──
  console.log("\nXTDB Postgres Protocol:");
  const postgres = (await import("postgres")).default;

  try {
    const sql = postgres({ host: "localhost", port: 5433, user: "xtdb", database: "xtdb", connect_timeout: 5 });
    const [row] = await sql`SELECT 1 AS ok`;
    row?.ok !== undefined ? pass("Primary accepts SQL queries") : fail("Primary SQL", `got: ${JSON.stringify(row)}`);
    await sql.end();
  } catch (err: any) {
    fail("Primary accepts SQL queries", err.message);
  }

  try {
    const sql = postgres({ host: "localhost", port: 5434, user: "xtdb", database: "xtdb", connect_timeout: 5 });
    const [row] = await sql`SELECT 1 AS ok`;
    row?.ok !== undefined ? pass("Replica accepts SQL queries") : fail("Replica SQL", `got: ${JSON.stringify(row)}`);
    await sql.end();
  } catch (err: any) {
    fail("Replica accepts SQL queries", err.message);
  }

  // ── Primary↔Replica Sync ──
  console.log("\nReplication:");
  try {
    const primary = postgres({ host: "localhost", port: 5433, user: "xtdb", database: "xtdb" });
    const replica = postgres({ host: "localhost", port: 5434, user: "xtdb", database: "xtdb" });
    const t = (v: string) => primary.typed(v as any, 25);
    const testId = `__infra_test_${Date.now()}`;

    await primary`INSERT INTO test_sync (_id, msg) VALUES (${t(testId)}, ${t("replication check")})`;
    // Give replica time to catch up
    await new Promise(r => setTimeout(r, 3000));
    const [row] = await replica`SELECT * FROM test_sync WHERE _id = ${t(testId)}`;
    row?.msg === "replication check"
      ? pass("Primary→Replica sync works")
      : fail("Primary→Replica sync", `row not found on replica`);

    await primary`DELETE FROM test_sync WHERE _id = ${t(testId)}`;
    await primary.end();
    await replica.end();
  } catch (err: any) {
    fail("Primary→Replica sync", err.message);
  }

  // ── Summary ──
  console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  • ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
