#!/usr/bin/env npx jiti
// ─── Chaos Test: Service Down ────────────────────────────────
// Stops each service container, verifies other services survive,
// then restarts and verifies recovery.
// WARNING: Destructive — only run in isolated environments.
//
// Usage: npx jiti test/chaos/service-down.ts [service-name]

import { execSync } from "node:child_process";

const HEALTH_TIMEOUT_MS = 15_000;

interface ChaosResult {
  service: string;
  stopOk: boolean;
  othersHealthy: boolean;
  restartOk: boolean;
  recoveryMs: number;
}

const SERVICES = [
  { name: "harness-ci-runner-1", healthUrl: "http://localhost:3337/api/health" },
  { name: "harness-build-service-1", healthUrl: "http://localhost:3339/api/health" },
  { name: "harness-ops-api-1", healthUrl: "http://localhost:3335/api/health" },
  { name: "harness-docker-event-collector-1", healthUrl: "http://localhost:3338/api/health" },
];

async function checkHealth(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function testServiceDown(target: typeof SERVICES[0]): Promise<ChaosResult> {
  const others = SERVICES.filter((s) => s.name !== target.name);

  // Stop
  let stopOk = false;
  try {
    execSync(`docker stop ${target.name}`, { timeout: 30_000, stdio: "pipe" });
    stopOk = true;
  } catch { /* container might not exist */ }

  // Check others still healthy
  await new Promise((r) => setTimeout(r, 3000));
  const healthChecks = await Promise.all(others.map((s) => checkHealth(s.healthUrl)));
  const othersHealthy = healthChecks.every(Boolean);

  // Restart
  let restartOk = false;
  const restartStart = Date.now();
  try {
    execSync(`docker start ${target.name}`, { timeout: 30_000, stdio: "pipe" });
    // Wait for recovery
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (await checkHealth(target.healthUrl)) {
        restartOk = true;
        break;
      }
    }
  } catch { /* restart failed */ }

  return {
    service: target.name,
    stopOk,
    othersHealthy,
    restartOk,
    recoveryMs: Date.now() - restartStart,
  };
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const targets = filter ? SERVICES.filter((s) => s.name.includes(filter)) : SERVICES;

  console.log(`\n💥 Chaos Test: Service Down (${targets.length} services)\n`);
  console.log("⚠️  This will stop and restart containers!\n");

  const results: ChaosResult[] = [];
  for (const target of targets) {
    process.stdout.write(`  Testing ${target.name}...`);
    const result = await testServiceDown(target);
    results.push(result);
    const icon = result.othersHealthy && result.restartOk ? "✅" : "❌";
    console.log(` ${icon} others=${result.othersHealthy ? "ok" : "degraded"} recovery=${result.recoveryMs}ms`);
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  for (const r of results) {
    console.log(`  ${r.service}: stop=${r.stopOk} others=${r.othersHealthy} restart=${r.restartOk} recovery=${r.recoveryMs}ms`);
  }

  const allPassed = results.every((r) => r.othersHealthy && r.restartOk);
  process.exit(allPassed ? 0 : 1);
}

main();
