#!/usr/bin/env npx jiti
// ─── Performance Load Test ───────────────────────────────────
// HTTP load testing for harness API endpoints using autocannon.
// Requires services to be running (docker compose up).
//
// Usage: npx jiti test/performance/load-test.ts
//        TARGETS=ops-api,ci-runner npx jiti test/performance/load-test.ts

interface LoadTestTarget {
  name: string;
  url: string;
  expectedRps: number;
}

const ALL_TARGETS: LoadTestTarget[] = [
  { name: "event-api:stats", url: "http://localhost:3333/api/stats", expectedRps: 1000 },
  { name: "ops-api:health", url: "http://localhost:3335/api/health", expectedRps: 5000 },
  { name: "harness-ui:root", url: "http://localhost:3336/", expectedRps: 500 },
  { name: "ci-runner:queue", url: "http://localhost:3337/api/health", expectedRps: 3000 },
  { name: "collector:health", url: "http://localhost:3338/api/health", expectedRps: 3000 },
  { name: "build-service:health", url: "http://localhost:3339/api/health", expectedRps: 3000 },
];

interface LoadTestResult {
  target: string;
  url: string;
  duration: number;
  requests: number;
  rps: number;
  latencyAvg: number;
  latencyP95: number;
  latencyP99: number;
  errors: number;
  passed: boolean;
}

async function runLoadTest(target: LoadTestTarget, durationSec = 10): Promise<LoadTestResult> {
  const start = Date.now();
  let requests = 0;
  let errors = 0;
  const latencies: number[] = [];
  const end = start + durationSec * 1000;

  // Simple concurrent fetcher (10 concurrent connections)
  const CONCURRENCY = 10;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < end) {
      const t0 = Date.now();
      try {
        const res = await fetch(target.url);
        if (!res.ok) errors++;
        await res.text();
      } catch {
        errors++;
      }
      latencies.push(Date.now() - t0);
      requests++;
    }
  });

  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const duration = (Date.now() - start) / 1000;

  return {
    target: target.name,
    url: target.url,
    duration: Math.round(duration * 10) / 10,
    requests,
    rps: Math.round(requests / duration),
    latencyAvg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    latencyP95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    latencyP99: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
    errors,
    passed: Math.round(requests / duration) >= target.expectedRps * 0.5, // 50% of expected is pass
  };
}

async function main(): Promise<void> {
  const filter = process.env.TARGETS?.split(",") ?? [];
  const targets = filter.length > 0
    ? ALL_TARGETS.filter((t) => filter.some((f) => t.name.includes(f)))
    : ALL_TARGETS;

  console.log(`\n🏋️ Load Testing ${targets.length} endpoints (10s each)\n`);

  const results: LoadTestResult[] = [];
  for (const target of targets) {
    process.stdout.write(`  Testing ${target.name}...`);
    const result = await runLoadTest(target);
    results.push(result);
    console.log(` ${result.passed ? "✅" : "❌"} ${result.rps} rps (p95: ${result.latencyP95}ms)`);
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log("Target                  RPS      Avg    P95    P99  Errors");
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(
      `${icon} ${r.target.padEnd(22)} ${String(r.rps).padStart(5)}  ${String(r.latencyAvg).padStart(5)}ms ${String(r.latencyP95).padStart(5)}ms ${String(r.latencyP99).padStart(5)}ms  ${r.errors}`,
    );
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\n${allPassed ? "✅ All targets passed" : "❌ Some targets failed"}\n`);
  console.log(JSON.stringify(results));
  process.exit(allPassed ? 0 : 1);
}

main();
