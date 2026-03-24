#!/usr/bin/env npx jiti

// ─── Lifecycle Management Test Suite ───────────────────────────
// Tests: CI webhook, incidents CRUD, backup scheduler, shared libs,
//        dashboard UI, lifecycle SSE, extensions deployment.
// Run: cd ~/harness/test && npx jiti lifecycle.ts
// Requires: XTDB running on :5433, ops API running on :3335

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const OPS_BASE = "http://localhost:3335";
const sql = postgres({
  host: "localhost",
  port: 5433,
  database: "xtdb",
  user: "xtdb",
  password: "xtdb",
  max: 2,
  idle_timeout: 10,
});
const _t = (v: string | null) => sql.typed(v as any, 25);
const _n = (v: number | null) => sql.typed(v as any, 20);

const HOME = process.env.HOME ?? "~";
const EXT_DIR = join(HOME, ".pi", "agent", "extensions");
const WORKFLOWS_DIR = join(HOME, ".pi", "agent", "workflows");

// ── Test Framework ─────────────────────────────────────────────

let _passed = 0;
let failed = 0;
let _skipped = 0;
const failures: string[] = [];

function ok(_name: string) {
  _passed++;
}
function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
}
function skip(_name: string, _reason: string) {
  _skipped++;
}
function assert(cond: boolean, name: string, reason: string) {
  cond ? ok(name) : fail(name, reason);
}

async function fetchJson(url: string, opts?: RequestInit): Promise<{ status: number; body: any }> {
  try {
    const res = await fetch(url, opts);
    const body = await res.json();
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  }
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  } catch (err) {
    return { status: 0, text: String(err) };
  }
}

// ── L0: Infrastructure Prerequisites ───────────────────────────

async function testInfra() {
  // L0.1 XTDB connection
  try {
    const rows = await sql`SELECT 1 as ok`;
    assert(Number(rows[0]?.ok) === 1, "L0.1 XTDB connection", "query failed");
  } catch (err) {
    fail("L0.1 XTDB connection", String(err));
  }

  // L0.2 Ops API running
  const { status } = await fetchJson(`${OPS_BASE}/api/health`);
  assert(status === 200, "L0.2 Ops API health", `status=${status}`);

  // L0.3 Shared libs exist
  const libs = ["lib/jsonld/context.ts", "lib/jsonld/ids.ts", "lib/db.ts"];
  for (const lib of libs) {
    const fullPath = join(HOME, "harness", lib);
    assert(existsSync(fullPath), `L0.3 ${lib} exists`, "not found");
  }
}

// ── L1: Shared Libs ────────────────────────────────────────────

async function testSharedLibs() {
  // L1.1 JSONLD_CONTEXT has all required namespaces
  const ctx = await import(join(HOME, "harness", "lib", "jsonld", "context.ts"));
  const requiredNs = ["ev", "prov", "schema", "xsd", "rdf", "doap", "foaf"];
  for (const ns of requiredNs) {
    assert(ns in ctx.NS, `L1.1 NS.${ns} defined`, "missing");
    assert(ns in ctx.JSONLD_CONTEXT, `L1.1 JSONLD_CONTEXT.${ns}`, "missing");
  }

  // L1.2 ID generation helpers
  const _ids = await import(join(HOME, "harness", "lib", "jsonld", "ids.ts"));
  const fnNames = ["piId", "piRef"];
  for (const fn of fnNames) {
    assert(typeof ctx[fn] === "function", `L1.2 ${fn} exported from context`, "not a function");
  }

  // L1.3 No remaining local JSONLD_CONTEXT duplicates (only re-exports allowed)
  const mustUseShared = ["xtdb-event-logger/rdf/namespaces.ts", "workflow-engine/rdf/namespaces.ts"];
  for (const file of mustUseShared) {
    const fullPath = join(HOME, "harness", file);
    if (!existsSync(fullPath)) {
      skip(`L1.3 ${file}`, "file not found");
      continue;
    }
    const content = readFileSync(fullPath, "utf-8");
    const hasImport = content.includes("from") && content.includes("lib/jsonld/context");
    const hasLocalDef = /export const JSONLD_CONTEXT\s*=\s*\{/.test(content);
    assert(hasImport, `L1.3a ${file} imports shared lib`, "no shared import");
    assert(!hasLocalDef, `L1.3b ${file} no local JSONLD_CONTEXT`, "local definition found");
  }
}

// ── L2: Extensions Deployed ────────────────────────────────────

async function testExtensions() {
  const lifecycleExts = ["project-lifecycle", "requirements-tracker", "deployment-tracker"];

  for (const ext of lifecycleExts) {
    const extDir = join(EXT_DIR, ext);
    assert(existsSync(join(extDir, "index.ts")), `L2.1 ${ext}/index.ts deployed`, "not found");
    assert(existsSync(join(extDir, "package.json")), `L2.1 ${ext}/package.json deployed`, "not found");

    // Check package.json declares pi.extensions
    const pkg = JSON.parse(readFileSync(join(extDir, "package.json"), "utf-8"));
    assert(!!pkg.pi?.extensions, `L2.2 ${ext} declares pi.extensions`, "missing pi.extensions");
  }
}

// ── L3: Workflow Templates ─────────────────────────────────────

async function testWorkflows() {
  const expected = ["feature", "bugfix", "refactor", "release", "onboarding", "incident-response", "decommission"];

  for (const name of expected) {
    const file = join(WORKFLOWS_DIR, `${name}.jsonld`);
    assert(existsSync(file), `L3.1 ${name}.jsonld exists`, "not found");

    if (existsSync(file)) {
      const content = readFileSync(file, "utf-8");
      let doc: any;
      try {
        doc = JSON.parse(content);
        ok(`L3.2 ${name}.jsonld valid JSON`);
      } catch (err) {
        fail(`L3.2 ${name}.jsonld valid JSON`, String(err));
        continue;
      }

      // Must have @context, @type schema:HowTo, schema:name, schema:step
      assert(!!doc["@context"], `L3.3a ${name} has @context`, "missing");
      assert(doc["@type"] === "schema:HowTo", `L3.3b ${name} @type=schema:HowTo`, `got ${doc["@type"]}`);
      assert(!!doc["schema:name"], `L3.3c ${name} has schema:name`, "missing");
      assert(Array.isArray(doc["schema:step"]) && doc["schema:step"].length > 0, `L3.3d ${name} has steps`, "no steps");
    }
  }
}

// ── L4: CI Webhook ─────────────────────────────────────────────

async function testCIWebhook() {
  // L4.1 Missing fields rejected
  const { status: s1 } = await fetchJson(`${OPS_BASE}/api/ci/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "test.finished" }), // missing project + subject
  });
  assert(s1 === 400, "L4.1 Rejects incomplete payload", `status=${s1}`);

  // L4.2 Valid test.finished event
  const testEvent = {
    type: "test.finished",
    project: "test-lifecycle-suite",
    subject: {
      status: "succeeded",
      suite_name: "unit-tests",
      passed: 42,
      failed: 0,
      skipped: 3,
      duration_ms: 12345,
    },
  };
  const { status: s2, body: b2 } = await fetchJson(`${OPS_BASE}/api/ci/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testEvent),
  });
  assert(s2 === 200, "L4.2 test.finished accepted", `status=${s2}, body=${JSON.stringify(b2)}`);
  assert(b2.received === true, "L4.2b received=true", JSON.stringify(b2));

  // L4.3 Valid deployment.finished event
  const deployEvent = {
    type: "deployment.finished",
    project: "test-lifecycle-suite",
    subject: {
      status: "succeeded",
      environment: "staging",
      version: "1.2.3",
      url: "https://staging.example.com",
    },
  };
  const { status: s3 } = await fetchJson(`${OPS_BASE}/api/ci/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deployEvent),
  });
  assert(s3 === 200, "L4.3 deployment.finished accepted", `status=${s3}`);

  // L4.4 Valid release.published event
  const releaseEvent = {
    type: "release.published",
    project: "test-lifecycle-suite",
    subject: {
      status: "published",
      version: "1.2.3",
      tag: "v1.2.3",
      notes: "Test release",
    },
  };
  const { status: s4 } = await fetchJson(`${OPS_BASE}/api/ci/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(releaseEvent),
  });
  assert(s4 === 200, "L4.4 release.published accepted", `status=${s4}`);

  // L4.5 Verify data landed in XTDB (wait a moment for XTDB eventual consistency)
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const testRows =
      await sql`SELECT * FROM test_runs WHERE project_id = 'test-lifecycle-suite' ORDER BY ts DESC LIMIT 1`;
    assert(testRows.length > 0, "L4.5a test_runs record exists", "no rows");
    if (testRows.length > 0) {
      assert(testRows[0].suite === "unit-tests", "L4.5b suite=unit-tests", `got ${testRows[0].suite}`);
    }
  } catch (err) {
    fail("L4.5a test_runs query", String(err));
  }

  try {
    const deployRows =
      await sql`SELECT * FROM deployments WHERE project_id = 'test-lifecycle-suite' ORDER BY ts DESC LIMIT 1`;
    assert(deployRows.length > 0, "L4.5c deployments record exists", "no rows");
  } catch (err) {
    fail("L4.5c deployments query", String(err));
  }

  try {
    const releaseRows =
      await sql`SELECT * FROM releases WHERE project_id = 'test-lifecycle-suite' ORDER BY ts DESC LIMIT 1`;
    assert(releaseRows.length > 0, "L4.5d releases record exists", "no rows");
  } catch (err) {
    fail("L4.5d releases query", String(err));
  }

  // L4.6 Lifecycle events emitted
  try {
    const levRows =
      await sql`SELECT * FROM lifecycle_events WHERE project_id = 'test-lifecycle-suite' ORDER BY ts DESC LIMIT 5`;
    assert(levRows.length >= 3, "L4.6 lifecycle_events emitted (>=3)", `found ${levRows.length}`);
  } catch (err) {
    fail("L4.6 lifecycle_events query", String(err));
  }

  // L4.7 Lifecycle events API
  const { status: s7, body: b7 } = await fetchJson(`${OPS_BASE}/api/lifecycle/events?limit=5`);
  assert(s7 === 200, "L4.7 GET /api/lifecycle/events", `status=${s7}`);
  assert(Array.isArray(b7), "L4.7b returns array", typeof b7);
}

// ── L5: Incidents CRUD ─────────────────────────────────────────

async function testIncidents() {
  // L5.1 Create incident
  const { status: s1, body: inc } = await fetchJson(`${OPS_BASE}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      severity: "high",
      title: "Test incident from lifecycle suite",
      description: "Automated test — safe to delete",
      project_id: "test-lifecycle-suite",
    }),
  });
  assert(s1 === 201, "L5.1 Create incident 201", `status=${s1}`);
  assert(!!inc._id, "L5.1b has _id", JSON.stringify(inc));

  if (!inc._id) return; // can't continue without ID

  // L5.2 Missing fields rejected
  const { status: s2 } = await fetchJson(`${OPS_BASE}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "no severity" }),
  });
  assert(s2 === 400, "L5.2 Missing severity rejected", `status=${s2}`);

  // L5.3 Get incident by ID
  const { status: s3, body: fetched } = await fetchJson(`${OPS_BASE}/api/incidents/${inc._id}`);
  assert(s3 === 200, "L5.3 Get incident 200", `status=${s3}`);
  assert(fetched.title === "Test incident from lifecycle suite", "L5.3b title matches", fetched.title);
  assert(fetched.status === "open", "L5.3c status=open", fetched.status);

  // L5.4 List incidents
  const { status: s4, body: list } = await fetchJson(`${OPS_BASE}/api/incidents?project_id=test-lifecycle-suite`);
  assert(s4 === 200, "L5.4 List incidents 200", `status=${s4}`);
  assert(Array.isArray(list) && list.length > 0, "L5.4b returns array with items", `length=${list?.length}`);

  // L5.5 Update incident (resolve)
  const { status: s5, body: updated } = await fetchJson(`${OPS_BASE}/api/incidents/${inc._id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved", notes: "Fixed by test" }),
  });
  assert(s5 === 200, "L5.5 Update incident 200", `status=${s5}`);
  assert(updated.status === "resolved", "L5.5b status=resolved", updated.status);

  // L5.6 404 for nonexistent
  const { status: s6 } = await fetchJson(`${OPS_BASE}/api/incidents/inc:nonexistent-id`);
  assert(s6 === 404, "L5.6 Nonexistent returns 404", `status=${s6}`);

  // L5.7 Filter by status
  const { status: s7, body: openList } = await fetchJson(`${OPS_BASE}/api/incidents?status=open`);
  assert(s7 === 200, "L5.7 Filter by status works", `status=${s7}`);
}

// ── L6: Backup Scheduler ───────────────────────────────────────

async function testScheduler() {
  // L6.1 Scheduler status
  const { status: s1, body: status } = await fetchJson(`${OPS_BASE}/api/scheduler/status`);
  assert(s1 === 200, "L6.1 Scheduler status 200", `status=${s1}`);
  assert("running" in status, "L6.1b has running field", JSON.stringify(status));

  // L6.2 Start scheduler (idempotent)
  const { status: s2 } = await fetchJson(`${OPS_BASE}/api/scheduler/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intervalHours: 24 }),
  });
  assert(s2 === 200, "L6.2 Start scheduler 200", `status=${s2}`);

  // L6.3 Stop scheduler
  const { status: s3 } = await fetchJson(`${OPS_BASE}/api/scheduler/stop`, { method: "POST" });
  assert(s3 === 200, "L6.3 Stop scheduler 200", `status=${s3}`);

  // L6.4 Verify stopped
  const { body: afterStop } = await fetchJson(`${OPS_BASE}/api/scheduler/status`);
  assert(afterStop.running === false, "L6.4 Scheduler stopped", `running=${afterStop.running}`);
}

// ── L7: Dashboard UI ──────────────────────────────────────────

async function testDashboard() {
  // L7.1 Portfolio page loads
  const { status: s1, text: html } = await fetchText(`${OPS_BASE}/dashboard`);
  assert(s1 === 200, "L7.1 Dashboard loads", `status=${s1}`);
  assert(html.includes("Portfolio Dashboard"), "L7.1b has title", "missing title");
  assert(html.includes("htmx.org"), "L7.1c has htmx", "missing htmx script");

  // L7.2 Stats section
  assert(html.includes("Total Projects"), "L7.2a Total Projects stat", "missing");
  assert(html.includes("Active"), "L7.2b Active stat", "missing");
  assert(html.includes("Open Incidents"), "L7.2c Open Incidents stat", "missing");

  // L7.3 SSE connection wired
  assert(html.includes("sse-connect"), "L7.3 SSE connection in HTML", "no sse-connect");

  // L7.4 Project detail page (use test-lifecycle-suite if projects table has it, otherwise any)
  try {
    const projects = await sql`SELECT _id FROM projects LIMIT 1`;
    if (projects.length > 0) {
      const pid = projects[0]._id;
      const { status: s4, text: projectHtml } = await fetchText(`${OPS_BASE}/dashboard/project/${pid}`);
      assert(s4 === 200, "L7.4 Project detail loads", `status=${s4}`);
      assert(projectHtml.includes("Requirements"), "L7.4b has Requirements section", "missing");
      assert(projectHtml.includes("Releases"), "L7.4c has Releases section", "missing");
      assert(projectHtml.includes("Deployments"), "L7.4d has Deployments section", "missing");
      assert(projectHtml.includes("Test Runs"), "L7.4e has Test Runs section", "missing");
      assert(projectHtml.includes("Incidents"), "L7.4f has Incidents section", "missing");
    } else {
      skip("L7.4 Project detail page", "no projects in database");
    }
  } catch (err) {
    skip("L7.4 Project detail page", `projects query failed: ${err}`);
  }

  // L7.5 404 for nonexistent project
  const { status: s5 } = await fetchText(`${OPS_BASE}/dashboard/project/nonexistent-project-id`);
  assert(s5 === 404, "L7.5 Nonexistent project 404", `status=${s5}`);
}

// ── L8: XTDB Table Existence ───────────────────────────────────

async function testTables() {
  const expectedTables = [
    "projects",
    "lifecycle_events",
    "requirements",
    "requirement_links",
    "test_runs",
    "deployments",
    "releases",
    "environments",
    "incidents",
    "workflow_runs",
    "workflow_step_runs",
  ];

  for (const table of expectedTables) {
    try {
      await sql.unsafe(`SELECT 1 FROM ${table} LIMIT 0`);
      ok(`L8.1 Table ${table} exists`);
    } catch (err) {
      // Table might not exist yet if no data was inserted
      fail(`L8.1 Table ${table} exists`, String(err));
    }
  }
}

// ── L9: Projects Schema ────────────────────────────────────────

async function testProjectSchema() {
  try {
    const projects = await sql`SELECT * FROM projects LIMIT 1`;
    if (projects.length > 0) {
      const p = projects[0];
      assert("lifecycle_phase" in p, "L9.1 lifecycle_phase column", "missing");
      assert("config_json" in p, "L9.2 config_json column", "missing");
      assert(
        ["active", "planning", "maintenance", "deprecated", "decommissioned"].includes(p.lifecycle_phase),
        "L9.3 lifecycle_phase valid value",
        `got ${p.lifecycle_phase}`,
      );
    } else {
      skip("L9.1-3 Project schema", "no projects in database");
    }
  } catch (err) {
    fail("L9.1 Projects query", String(err));
  }
}

// ── Cleanup ────────────────────────────────────────────────────

async function cleanup() {
  try {
    // Remove test data
    await sql`DELETE FROM test_runs WHERE project_id = 'test-lifecycle-suite'`;
    await sql`DELETE FROM deployments WHERE project_id = 'test-lifecycle-suite'`;
    await sql`DELETE FROM releases WHERE project_id = 'test-lifecycle-suite'`;
    await sql`DELETE FROM lifecycle_events WHERE project_id = 'test-lifecycle-suite'`;
    await sql`DELETE FROM incidents WHERE project_id = 'test-lifecycle-suite'`;
  } catch (_err) {}
}

// ── Runner ─────────────────────────────────────────────────────

async function main() {
  await testInfra();
  await testSharedLibs();
  await testExtensions();
  await testWorkflows();
  await testCIWebhook();
  await testIncidents();
  await testScheduler();
  await testDashboard();
  await testTables();
  await testProjectSchema();
  await cleanup();
  if (failures.length > 0) {
    for (const _f of failures)
  }

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(2);
});
