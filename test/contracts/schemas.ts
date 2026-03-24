#!/usr/bin/env npx jiti
// ─── API Contract Schema Tests ───────────────────────────────
// Validates response shapes from all public API endpoints (Phase 5.6).
// Checks status codes, required fields, and error format consistency.

interface ContractTest {
  name: string;
  method: string;
  url: string;
  expectedStatus: number;
  requiredFields?: string[];
  errorFormat?: boolean;
}

const BASE_URLS: Record<string, string> = {
  "event-api": process.env.EVENT_API_URL ?? "http://localhost:3333",
  "ops-api": process.env.OPS_API_URL ?? "http://localhost:3335",
  "harness-ui": process.env.HARNESS_UI_URL ?? "http://localhost:3336",
  "ci-runner": process.env.CI_URL ?? "http://localhost:3337",
  "collector": process.env.COLLECTOR_URL ?? "http://localhost:3338",
  "build-service": process.env.BUILD_URL ?? "http://localhost:3339",
};

const CONTRACTS: ContractTest[] = [
  // event-api
  { name: "event-api: GET /api/stats", method: "GET", url: `${BASE_URLS["event-api"]}/api/stats`, expectedStatus: 200, requiredFields: ["totalEvents"] },

  // ops-api
  { name: "ops-api: GET /api/health", method: "GET", url: `${BASE_URLS["ops-api"]}/api/health`, expectedStatus: 200, requiredFields: ["overall"] },
  { name: "ops-api: GET /api/incidents", method: "GET", url: `${BASE_URLS["ops-api"]}/api/incidents`, expectedStatus: 200 },
  { name: "ops-api: GET /api/backups", method: "GET", url: `${BASE_URLS["ops-api"]}/api/backups`, expectedStatus: 200 },
  { name: "ops-api: GET /api/metrics", method: "GET", url: `${BASE_URLS["ops-api"]}/api/metrics`, expectedStatus: 200, requiredFields: ["total", "avgMs"] },

  // ci-runner
  { name: "ci-runner: GET /api/health", method: "GET", url: `${BASE_URLS["ci-runner"]}/api/health`, expectedStatus: 200 },
  { name: "ci-runner: GET /api/queue", method: "GET", url: `${BASE_URLS["ci-runner"]}/api/queue`, expectedStatus: 200, requiredFields: ["pending"] },
  { name: "ci-runner: GET /api/metrics", method: "GET", url: `${BASE_URLS["ci-runner"]}/api/metrics`, expectedStatus: 200 },

  // collector
  { name: "collector: GET /api/health", method: "GET", url: `${BASE_URLS["collector"]}/api/health`, expectedStatus: 200, requiredFields: ["status"] },
  { name: "collector: GET /api/stats/containers", method: "GET", url: `${BASE_URLS["collector"]}/api/stats/containers`, expectedStatus: 200 },

  // build-service
  { name: "build-service: GET /api/health", method: "GET", url: `${BASE_URLS["build-service"]}/api/health`, expectedStatus: 200 },
  { name: "build-service: GET /api/metrics", method: "GET", url: `${BASE_URLS["build-service"]}/api/metrics`, expectedStatus: 200 },

  // Error format: POST with bad body should return { error: string }
  { name: "ci-runner: POST /api/enqueue bad body → 400", method: "POST", url: `${BASE_URLS["ci-runner"]}/api/enqueue`, expectedStatus: 400, errorFormat: true },
  { name: "ops-api: POST /api/incidents bad body → 400", method: "POST", url: `${BASE_URLS["ops-api"]}/api/incidents`, expectedStatus: 400, errorFormat: true },
];

interface TestResult { name: string; passed: boolean; ms: number; error?: string }

async function runContract(test: ContractTest): Promise<TestResult> {
  const start = Date.now();
  try {
    const opts: RequestInit = { method: test.method };
    if (test.method === "POST") {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = "{}"; // intentionally bad/empty body for error format tests
    }

    const res = await fetch(test.url, opts);
    const body = await res.json() as any;

    if (res.status !== test.expectedStatus) {
      return { name: test.name, passed: false, ms: Date.now() - start, error: `Expected ${test.expectedStatus}, got ${res.status}` };
    }

    if (test.requiredFields) {
      for (const field of test.requiredFields) {
        if (!(field in body)) {
          return { name: test.name, passed: false, ms: Date.now() - start, error: `Missing required field: ${field}` };
        }
      }
    }

    if (test.errorFormat && typeof body.error !== "string") {
      return { name: test.name, passed: false, ms: Date.now() - start, error: "Error response missing { error: string } format" };
    }

    return { name: test.name, passed: true, ms: Date.now() - start };
  } catch (e: any) {
    return { name: test.name, passed: false, ms: Date.now() - start, error: e.message };
  }
}

async function main(): Promise<void> {
  console.log(`\n📋 API Contract Tests (${CONTRACTS.length} contracts)\n`);

  const results: TestResult[] = [];
  for (const contract of CONTRACTS) {
    const result = await runContract(contract);
    results.push(result);
    console.log(`  ${result.passed ? "✅" : "❌"} ${result.name} (${result.ms}ms)${result.error ? ` — ${result.error}` : ""}`);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} contracts passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
