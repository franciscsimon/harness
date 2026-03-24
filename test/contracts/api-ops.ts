#!/usr/bin/env npx jiti
/**
 * Contract: xtdb-ops-api (:3335)
 * Tests API response shapes and error responses.
 * Run: NODE_PATH=xtdb-event-logger/node_modules npx jiti test/contracts/api-ops.ts
 */

const OPS = "http://localhost:3335";
let _passed = 0,
  failed = 0;
const failures: string[] = [];
function pass(_name: string) {
  _passed++;
}
function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
}

async function json(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${OPS}${path}`, opts);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function html(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${OPS}${path}`);
  return { status: res.status, text: await res.text() };
}

async function main() {
  const health = await json("GET", "/api/health");
  health.status === 200 && health.body.overall && Array.isArray(health.body.components)
    ? pass("GET /api/health → { overall, components[] }")
    : fail("/api/health", `status=${health.status} keys=${Object.keys(health.body || {})}`);

  const primary = await json("GET", "/api/health/primary");
  primary.status === 200 && primary.body.status && primary.body.details
    ? pass("GET /api/health/primary → { status, details }")
    : fail("/api/health/primary", `status=${primary.status} keys=${Object.keys(primary.body || {})}`);

  const replica = await json("GET", "/api/health/replica");
  replica.status === 200 && replica.body.status && replica.body.details
    ? pass("GET /api/health/replica → { status, details }")
    : fail("/api/health/replica", `status=${replica.status}`);

  const redpanda = await json("GET", "/api/health/redpanda");
  redpanda.status === 200 && redpanda.body.status && redpanda.body.details
    ? pass("GET /api/health/redpanda → { status, details }")
    : fail("/api/health/redpanda", `status=${redpanda.status}`);
  const repl = await json("GET", "/api/replication");
  repl.status === 200 && repl.body.primary && repl.body.replica
    ? pass("GET /api/replication → { primary, replica }")
    : fail("/api/replication", `status=${repl.status} keys=${Object.keys(repl.body || {})}`);
  const sched = await json("GET", "/api/scheduler/status");
  sched.status === 200 && sched.body.running !== undefined
    ? pass("GET /api/scheduler/status → has running field")
    : fail("/api/scheduler/status", `status=${sched.status}`);
  const replStatus = await json("GET", "/api/replica/status");
  replStatus.status === 200 && replStatus.body.running !== undefined
    ? pass("GET /api/replica/status → has running field")
    : fail("/api/replica/status", `status=${replStatus.status}`);

  // Create
  const created = await json("POST", "/api/incidents", {
    severity: "low",
    title: "Contract test incident",
    description: "test",
  });
  (created.status === 200 || created.status === 201) && created.body._id
    ? pass("POST /api/incidents → creates incident with _id")
    : fail("POST /api/incidents", `status=${created.status}`);

  const incId = created.body?._id;

  // List
  const list = await json("GET", "/api/incidents");
  list.status === 200 && Array.isArray(list.body)
    ? pass("GET /api/incidents → array")
    : fail("GET /api/incidents", `status=${list.status}`);

  // Get by ID — note: this endpoint requires auth, so 401 is the expected "no auth" response
  if (incId) {
    const get = await json("GET", `/api/incidents/${incId}`);
    get.status === 200 || get.status === 401
      ? pass(`GET /api/incidents/:id → ${get.status} (${get.status === 401 ? "auth required" : "OK"})`)
      : fail("GET /api/incidents/:id", `unexpected status=${get.status}`);
  }
  const lifecycle = await json("GET", "/api/lifecycle/events");
  lifecycle.status === 200 && Array.isArray(lifecycle.body)
    ? pass("GET /api/lifecycle/events → array")
    : fail("/api/lifecycle/events", `status=${lifecycle.status}`);
  const topics = await json("GET", "/api/topics");
  topics.status === 200 && (topics.body.topics || Array.isArray(topics.body))
    ? pass("GET /api/topics → has topics")
    : fail("/api/topics", `status=${topics.status} keys=${Object.keys(topics.body || {})}`);
  const backups = await json("GET", "/api/backups");
  backups.status === 200 && Array.isArray(backups.body)
    ? pass("GET /api/backups → array")
    : fail("/api/backups", `status=${backups.status}`);
  const dash = await html("/dashboard");
  dash.status === 200 && dash.text.includes("<!DOCTYPE html")
    ? pass("GET /dashboard → 200 HTML")
    : fail("GET /dashboard", `status=${dash.status}`);

  // Missing incident — endpoint may require auth (401) or return 404
  const missing = await json("GET", "/api/incidents/__nonexistent__");
  missing.status === 404 || missing.status === 401
    ? pass(`GET /api/incidents/__nonexistent__ → ${missing.status}`)
    : fail("/api/incidents/missing", `expected 404 or 401, got ${missing.status}`);

  // Missing backup job
  const missingJob = await json("GET", "/api/backup/status/__nonexistent__");
  missingJob.status === 404
    ? pass("GET /api/backup/status/__nonexistent__ → 404")
    : fail("/api/backup/status/missing", `expected 404, got ${missingJob.status}`);

  // Create incident missing fields
  const badIncident = await json("POST", "/api/incidents", { description: "no severity/title" });
  badIncident.status === 400
    ? pass("POST /api/incidents missing fields → 400")
    : fail("POST /api/incidents validation", `expected 400, got ${badIncident.status}`);

  // CI webhook missing fields
  const badWebhook = await json("POST", "/api/ci/events", { type: "test.finished" });
  badWebhook.status === 400
    ? pass("POST /api/ci/events missing fields → 400")
    : fail("POST /api/ci/events validation", `expected 400, got ${badWebhook.status}`);

  // Restore with no body
  const badRestore = await json("POST", "/api/restore", {});
  badRestore.status === 400
    ? pass("POST /api/restore missing archive → 400")
    : fail("POST /api/restore validation", `expected 400, got ${badRestore.status}`);
  if (failures.length > 0) {
    failures.forEach((_f) => {});
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
