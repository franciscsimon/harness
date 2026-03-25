#!/usr/bin/env npx jiti
/**
 * Performance load test using autocannon.
 * Usage: npx jiti test/performance/load-test.ts
 *
 * §6.1 — Integrates autocannon for proper load testing + P95 regression detection.
 */
import autocannon from "autocannon";

const BASE_URL = process.env.TARGET_URL ?? "http://localhost:3336";
const DURATION = Number(process.env.LOAD_DURATION ?? 10); // seconds
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 20);

/** Baseline P95 in ms — if current run exceeds this by >20%, fail. */
const BASELINE_P95_MS = Number(process.env.BASELINE_P95_MS ?? 500);
const REGRESSION_THRESHOLD = 0.2; // 20%

interface LoadResult {
  url: string;
  requests: { total: number; average: number; p50: number; p95: number; p99: number };
  latency: { average: number; p50: number; p95: number; p99: number; max: number };
  throughput: { average: number; total: number };
  errors: number;
  timeouts: number;
  duration: number;
}

async function runLoad(url: string, title: string): Promise<LoadResult> {
  console.log(`\n🔥 ${title}: ${url} — ${CONNECTIONS} connections, ${DURATION}s`);

  const result = await autocannon({
    url,
    connections: CONNECTIONS,
    duration: DURATION,
    timeout: 10,
  });

  const lr: LoadResult = {
    url,
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      p50: result.requests.p50 ?? 0,
      p95: result.requests.p95 ?? 0,
      p99: result.requests.p99 ?? 0,
    },
    latency: {
      average: result.latency.average,
      p50: result.latency.p50,
      p95: result.latency.p95,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    throughput: {
      average: result.throughput.average,
      total: result.throughput.total,
    },
    errors: result.errors,
    timeouts: result.timeouts,
    duration: DURATION,
  };

  console.log(`  Requests: ${lr.requests.total} total, ${lr.requests.average}/s avg`);
  console.log(`  Latency:  P50=${lr.latency.p50}ms  P95=${lr.latency.p95}ms  P99=${lr.latency.p99}ms  max=${lr.latency.max}ms`);
  console.log(`  Errors: ${lr.errors}  Timeouts: ${lr.timeouts}`);

  return lr;
}

async function main() {
  const endpoints = [
    { path: "/api/health", title: "Health check" },
    { path: "/api/sessions", title: "Sessions list" },
    { path: "/api/metrics", title: "Metrics" },
  ];

  const results: LoadResult[] = [];
  let regressions = 0;

  for (const ep of endpoints) {
    const result = await runLoad(`${BASE_URL}${ep.path}`, ep.title);
    results.push(result);

    // P95 regression detection
    if (BASELINE_P95_MS > 0 && result.latency.p95 > BASELINE_P95_MS * (1 + REGRESSION_THRESHOLD)) {
      console.log(`  ❌ REGRESSION: P95 ${result.latency.p95}ms > baseline ${BASELINE_P95_MS}ms (+${Math.round(REGRESSION_THRESHOLD * 100)}% threshold)`);
      regressions++;
    } else {
      console.log(`  ✅ P95 within baseline`);
    }
  }

  console.log(`\n=== Load Test Summary ===`);
  console.log(`Endpoints tested: ${results.length}`);
  console.log(`Total requests: ${results.reduce((s, r) => s + r.requests.total, 0)}`);
  console.log(`Regressions: ${regressions}`);

  if (regressions > 0) {
    console.log(`\n❌ FAILED — ${regressions} P95 regression(s) detected`);
    process.exit(1);
  }
  console.log(`\n✅ PASSED — all endpoints within P95 baseline`);
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
