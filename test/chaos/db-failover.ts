/**
 * Chaos test: DB failover — stop primary, verify replica handles reads.
 * WARNING: Destructive — stops xtdb-primary container.
 * Run: npx jiti test/chaos/db-failover.ts
 */
import { execSync } from "node:child_process";

const XTDB_PRIMARY = process.env.XTDB_URL ?? "postgresql://localhost:5432/xtdb";
const XTDB_REPLICA = process.env.XTDB_REPLICA_URL ?? "postgresql://localhost:5433/xtdb";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

const results: TestResult[] = [];

function run(name: string, fn: () => string) {
  const start = Date.now();
  try {
    const detail = fn();
    results.push({ name, passed: true, detail, durationMs: Date.now() - start });
  } catch (e: any) {
    results.push({ name, passed: false, detail: e.message, durationMs: Date.now() - start });
  }
}

function docker(cmd: string): string {
  return execSync(`docker ${cmd}`, { encoding: "utf-8", timeout: 30_000 }).trim();
}

// ── Tests ────────────────────────────────────────────────────────

run("Pre-check: primary is healthy", () => {
  const health = execSync(`curl -sf http://localhost:8083/healthz/alive`, { encoding: "utf-8", timeout: 5000 });
  return `Primary alive: ${health.length > 0}`;
});

run("Pre-check: replica is healthy", () => {
  const health = execSync(`curl -sf http://localhost:8084/healthz/alive`, { encoding: "utf-8", timeout: 5000 });
  return `Replica alive: ${health.length > 0}`;
});

run("Stop primary container", () => {
  docker("stop xtdb-events");
  return "Primary stopped";
});

run("Replica still responds after primary down", () => {
  // Give a moment for the cluster to notice
  execSync("sleep 2");
  const health = execSync(`curl -sf http://localhost:8084/healthz/alive`, { encoding: "utf-8", timeout: 5000 });
  return `Replica still alive: ${health.length > 0}`;
});

run("Restart primary", () => {
  docker("start xtdb-events");
  // Wait for primary to come back
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`curl -sf http://localhost:8083/healthz/alive`, { timeout: 2000 });
      return `Primary restarted after ~${i}s`;
    } catch {
      execSync("sleep 1");
    }
  }
  throw new Error("Primary did not recover within 30s");
});

run("Primary healthy after restart", () => {
  const health = execSync(`curl -sf http://localhost:8083/healthz/alive`, { encoding: "utf-8", timeout: 5000 });
  return `Primary recovered: ${health.length > 0}`;
});

// ── Report ───────────────────────────────────────────────────────

console.log("\n=== Chaos: DB Failover ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} (${r.durationMs}ms) — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
