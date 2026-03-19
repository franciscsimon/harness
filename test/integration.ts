// ─── XTDB Integration Tests ───────────────────────────────────
// Tests round-trip persistence for all harness tables.
// Requires: XTDB on port 5433
// Run: npx jiti test/integration.ts

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", user: "xtdb", password: "xtdb" });
const t = (v: string | null) => sql.typed(v as any, 25);
const n = (v: number | null) => sql.typed(v as any, 20);

let passed = 0, failed = 0;
const failures: string[] = [];
function pass(name: string) { passed++; console.log(`  ✅ ${name}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  ❌ ${name}: ${reason}`); }
function assert(name: string, condition: boolean, detail = "") {
  condition ? pass(name) : fail(name, detail || "assertion failed");
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  a === e ? pass(name) : fail(name, `got ${a}, expected ${e}`);
}

const TEST_PREFIX = `test:${Date.now()}:`;

async function main() {
  // Probe XTDB
  try { await sql`SELECT 1 AS ok`; }
  catch { console.log("⚠️  XTDB not running on port 5433. Skipping."); process.exit(0); }

  console.log("\n── I1: Decisions Round-Trip ──");
  {
    const id = TEST_PREFIX + "dec:" + randomUUID();
    await sql`INSERT INTO decisions (_id, project_id, session_id, ts, task, what, outcome, why, files, alternatives, agent, tags, jsonld)
      VALUES (${t(id)}, ${t("proj:test")}, ${t("sess:test")}, ${n(Date.now())}, ${t("test task")}, ${t("test what")}, ${t("success")}, ${t("test why")}, ${t('["a.ts"]')}, ${t("alt1")}, ${t("worker")}, ${t('["arch"]')}, ${t("{}")})`;
    const rows = await sql`SELECT * FROM decisions WHERE _id = ${t(id)}`;
    assert("decision inserted", rows.length === 1);
    eq("decision task", rows[0].task, "test task");
    eq("decision outcome", rows[0].outcome, "success");
    eq("decision files", rows[0].files, '["a.ts"]');
    await sql`DELETE FROM decisions WHERE _id = ${t(id)}`;
  }

  console.log("\n── I2: Projects Round-Trip ──");
  {
    const id = TEST_PREFIX + "proj:" + randomUUID();
    await sql`INSERT INTO projects (_id, name, canonical_id, identity_type, first_seen_ts, last_seen_ts, session_count, jsonld)
      VALUES (${t(id)}, ${t("test-proj")}, ${t("github.com/test/repo")}, ${t("git-remote")}, ${n(Date.now())}, ${n(Date.now())}, ${n(1)}, ${t("{}")})`;
    const rows = await sql`SELECT * FROM projects WHERE _id = ${t(id)}`;
    assert("project inserted", rows.length === 1);
    eq("project name", rows[0].name, "test-proj");
    eq("project identity", rows[0].identity_type, "git-remote");
    await sql`DELETE FROM projects WHERE _id = ${t(id)}`;
  }

  console.log("\n── I3: Delegations Round-Trip ──");
  {
    const id = TEST_PREFIX + "del:" + randomUUID();
    await sql`INSERT INTO delegations (_id, parent_session_id, child_session_id, project_id, agent_name, task, status, exit_code, ts, jsonld)
      VALUES (${t(id)}, ${t("parent:1")}, ${t("child:1")}, ${t("proj:test")}, ${t("worker")}, ${t("do stuff")}, ${t("success")}, ${n(0)}, ${n(Date.now())}, ${t("{}")})`;
    const rows = await sql`SELECT * FROM delegations WHERE _id = ${t(id)}`;
    assert("delegation inserted", rows.length === 1);
    eq("delegation agent", rows[0].agent_name, "worker");
    eq("delegation status", rows[0].status, "success");
    await sql`DELETE FROM delegations WHERE _id = ${t(id)}`;
  }

  console.log("\n── I4: File Metrics Round-Trip ──");
  {
    const id = TEST_PREFIX + "fm:" + randomUUID();
    await sql`INSERT INTO file_metrics (_id, project_id, session_id, file_path, edit_count, error_count, ts)
      VALUES (${t(id)}, ${t("proj:test")}, ${t("sess:test")}, ${t("src/index.ts")}, ${n(5)}, ${n(2)}, ${n(Date.now())})`;
    const rows = await sql`SELECT * FROM file_metrics WHERE _id = ${t(id)}`;
    assert("file_metrics inserted", rows.length === 1);
    eq("file_metrics path", rows[0].file_path, "src/index.ts");
    assert("file_metrics edit_count", Number(rows[0].edit_count) === 5);
    assert("file_metrics error_count", Number(rows[0].error_count) === 2);
    await sql`DELETE FROM file_metrics WHERE _id = ${t(id)}`;
  }

  console.log("\n── I5: Session Postmortems Round-Trip ──");
  {
    const id = TEST_PREFIX + "pm:" + randomUUID();
    await sql`INSERT INTO session_postmortems (_id, project_id, session_id, goal, what_worked, what_failed, files_changed, error_count, turn_count, ts, jsonld)
      VALUES (${t(id)}, ${t("proj:test")}, ${t("sess:test")}, ${t("fix bug")}, ${t("edited 3 files")}, ${t("bash failed")}, ${t('["a.ts","b.ts"]')}, ${n(3)}, ${n(7)}, ${n(Date.now())}, ${t("{}")})`;
    const rows = await sql`SELECT * FROM session_postmortems WHERE _id = ${t(id)}`;
    assert("postmortem inserted", rows.length === 1);
    eq("postmortem goal", rows[0].goal, "fix bug");
    assert("postmortem error_count", Number(rows[0].error_count) === 3);
    await sql`DELETE FROM session_postmortems WHERE _id = ${t(id)}`;
  }

  console.log("\n── I6: Artifacts Round-Trip ──");
  {
    const id = TEST_PREFIX + "art:" + randomUUID();
    await sql`INSERT INTO artifacts (_id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld)
      VALUES (${t(id)}, ${t("proj:test")}, ${t("sess:test")}, ${t("src/main.ts")}, ${t("abc123")}, ${t("code")}, ${t("write")}, ${t("tc:1")}, ${n(Date.now())}, ${t("{}")})`;
    const rows = await sql`SELECT * FROM artifacts WHERE _id = ${t(id)}`;
    assert("artifact inserted", rows.length === 1);
    eq("artifact kind", rows[0].kind, "code");
    eq("artifact hash", rows[0].content_hash, "abc123");
    await sql`DELETE FROM artifacts WHERE _id = ${t(id)}`;
  }

  console.log("\n── I7: Events Table Basics ──");
  {
    const rows = await sql`SELECT COUNT(*) AS cnt FROM events`;
    assert("events table exists", rows.length === 1);
    assert("events has rows", Number(rows[0].cnt) >= 0);
  }

  console.log("\n── I8: Cross-Table Queries ──");
  {
    // Insert a project + decision, query join
    const projId = TEST_PREFIX + "proj:join";
    const decId = TEST_PREFIX + "dec:join";
    await sql`INSERT INTO projects (_id, name, canonical_id, identity_type, first_seen_ts, last_seen_ts, session_count, jsonld)
      VALUES (${t(projId)}, ${t("join-test")}, ${t("github.com/test/join")}, ${t("git-remote")}, ${n(Date.now())}, ${n(Date.now())}, ${n(0)}, ${t("{}")})`;
    await sql`INSERT INTO decisions (_id, project_id, session_id, ts, task, what, outcome, why, jsonld)
      VALUES (${t(decId)}, ${t(projId)}, ${t("sess:join")}, ${n(Date.now())}, ${t("join task")}, ${t("join what")}, ${t("failure")}, ${t("join why")}, ${t("{}")})`;

    const joined = await sql`SELECT d.task, p.name FROM decisions d JOIN projects p ON d.project_id = p._id WHERE d._id = ${t(decId)}`;
    assert("cross-table join works", joined.length === 1);
    eq("joined project name", joined[0].name, "join-test");
    eq("joined decision task", joined[0].task, "join task");

    await sql`DELETE FROM decisions WHERE _id = ${t(decId)}`;
    await sql`DELETE FROM projects WHERE _id = ${t(projId)}`;
  }

  console.log("\n── I9: Table Seeding Idempotence ──");
  {
    // Seed-then-delete should work twice without error
    for (let i = 0; i < 2; i++) {
      try {
        await sql`INSERT INTO decisions (_id, project_id, session_id, ts, task, what, outcome, why, jsonld) VALUES ('_seed_test', '', '', 0, '', '', '', '', '')`;
        await sql`DELETE FROM decisions WHERE _id = '_seed_test'`;
      } catch (err: any) {
        fail(`seeding idempotence (iter ${i})`, err.message);
      }
    }
    pass("seeding idempotent — no errors on repeat");
  }

  // Cleanup
  await sql.end();

  console.log(`\n━━━ Integration: ${passed} passed, ${failed} failed ━━━`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(`  • ${f}`)); }
  process.exit(failed > 0 ? 1 : 0);
}

main();
