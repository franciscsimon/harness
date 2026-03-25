/**
 * Chaos test: Disk full — fill a volume and verify graceful degradation.
 * WARNING: Destructive — fills Docker volume with data.
 * Run: npx jiti test/chaos/disk-full.ts
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
  return execSync(`docker ${cmd}`, { encoding: "utf-8", timeout: 60_000 }).trim();
}

run("Pre-check: XTDB primary healthy", () => {
  execSync("curl -sf http://localhost:8083/healthz/alive", { timeout: 5000 });
  return "Healthy";
});

run("Create test volume fill (100MB)", () => {
  // Create a large file inside the XTDB container's buffer directory
  docker("exec xtdb-events sh -c 'dd if=/dev/zero of=/var/lib/xtdb/buffers/chaos-fill bs=1M count=100 2>&1'");
  return "100MB fill file created in buffer dir";
});

run("XTDB still responds under disk pressure", () => {
  const health = execSync("curl -sf http://localhost:8083/healthz/alive", { encoding: "utf-8", timeout: 5000 });
  return `Still alive: ${health.length > 0}`;
});

run("Clean up fill file", () => {
  docker("exec xtdb-events rm -f /var/lib/xtdb/buffers/chaos-fill");
  return "Fill file removed";
});

run("XTDB healthy after cleanup", () => {
  execSync("curl -sf http://localhost:8083/healthz/alive", { timeout: 5000 });
  return "Healthy";
});

console.log("\n=== Chaos: Disk Full ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} (${r.durationMs}ms) — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
