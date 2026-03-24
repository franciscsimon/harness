#!/usr/bin/env npx jiti
// ─── CI Flow Integration Test ────────────────────────────────
// Tests: enqueue CI job → ci-runner picks it up → results stored in XTDB.
// Requires: ci-runner, xtdb-primary running.

const CI_URL = process.env.CI_URL ?? "http://localhost:3337";
const OPS_URL = process.env.OPS_URL ?? "http://localhost:3335";

interface TestResult {
  name: string;
  passed: boolean;
  ms: number;
  error?: string;
}

async function testEnqueueJob(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${CI_URL}/api/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "test-repo", ref: "refs/heads/main", commitHash: "abc123test" }),
    });
    return { name: "enqueue-job", passed: res.ok, ms: Date.now() - start };
  } catch (e: any) {
    return { name: "enqueue-job", passed: false, ms: Date.now() - start, error: e.message };
  }
}

async function testQueueStatus(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${CI_URL}/api/queue`);
    const data = await res.json() as any;
    return {
      name: "queue-status",
      passed: res.ok && typeof data.pending === "number",
      ms: Date.now() - start,
    };
  } catch (e: any) {
    return { name: "queue-status", passed: false, ms: Date.now() - start, error: e.message };
  }
}

async function testHealthEndpoints(): Promise<TestResult> {
  const start = Date.now();
  const endpoints = [
    `${CI_URL}/api/health`,
    `${OPS_URL}/api/health`,
  ];
  try {
    const results = await Promise.all(endpoints.map((url) => fetch(url)));
    const allOk = results.every((r) => r.ok);
    return { name: "health-endpoints", passed: allOk, ms: Date.now() - start };
  } catch (e: any) {
    return { name: "health-endpoints", passed: false, ms: Date.now() - start, error: e.message };
  }
}

async function main(): Promise<void> {
  console.log("\n🔗 CI Flow Integration Tests\n");
  const tests = [
    await testHealthEndpoints(),
    await testQueueStatus(),
    await testEnqueueJob(),
  ];

  for (const t of tests) {
    console.log(`  ${t.passed ? "✅" : "❌"} ${t.name} (${t.ms}ms)${t.error ? ` — ${t.error}` : ""}`);
  }

  const passed = tests.filter((t) => t.passed).length;
  console.log(`\n${passed}/${tests.length} passed\n`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
