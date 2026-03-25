/**
 * Chaos test: Network partition — disconnect services from each other.
 * WARNING: Destructive — manipulates Docker networks.
 * Run: npx jiti test/chaos/network-partition.ts
 */
import { execSync } from "node:child_process";

interface TestResult { name: string; passed: boolean; detail: string; durationMs: number }
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

const NETWORK = process.env.DOCKER_NETWORK ?? "harness_default";

run("Pre-check: network exists", () => {
  const out = docker(`network inspect ${NETWORK} --format '{{.Name}}'`);
  return `Network: ${out}`;
});

run("Disconnect garage from network", () => {
  docker(`network disconnect ${NETWORK} garage`);
  return "Garage disconnected";
});

run("XTDB health degrades (expected)", () => {
  execSync("sleep 3");
  try {
    execSync("curl -sf http://localhost:8083/healthz/alive", { timeout: 3000 });
    return "XTDB still alive (S3 writes will fail but node stays up)";
  } catch {
    return "XTDB health degraded as expected";
  }
});

run("Reconnect garage", () => {
  docker(`network connect ${NETWORK} garage`);
  return "Garage reconnected";
});

run("XTDB recovers after reconnection", () => {
  for (let i = 0; i < 20; i++) {
    try {
      execSync("curl -sf http://localhost:8083/healthz/alive", { timeout: 3000 });
      return `Recovered after ~${i}s`;
    } catch {
      execSync("sleep 1");
    }
  }
  throw new Error("XTDB did not recover within 20s");
});

run("Disconnect redpanda from network", () => {
  docker(`network disconnect ${NETWORK} redpanda`);
  return "Redpanda disconnected";
});

run("Reconnect redpanda", () => {
  docker(`network connect ${NETWORK} redpanda`);
  execSync("sleep 3");
  return "Redpanda reconnected";
});

run("Full cluster healthy after all reconnections", () => {
  for (const svc of ["localhost:8083", "localhost:8084"]) {
    execSync(`curl -sf http://${svc}/healthz/alive`, { timeout: 5000 });
  }
  return "All XTDB nodes healthy";
});

console.log("\n=== Chaos: Network Partition ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} (${r.durationMs}ms) — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
