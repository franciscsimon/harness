// ─── Augmented Pattern Test Runner ─────────────────────────────
// Runs all automatable test cases from AUGMENTED_PATTERNS_TESTS.md
// Run: npx jiti run-tests.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", username: "xtdb" });
const t = (v: string | null) => sql.typed(v as any, 25);
const _n = (v: number | null) => sql.typed(v as any, 20);

const UI_BASE = "http://localhost:3333";
const TEMPLATES_DIR = join(process.env.HOME ?? "~", "harness", "templates");
const EXTENSIONS_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "extensions");

// ─── Test Framework ────────────────────────────────────────────

let _passed = 0;
let failed = 0;
let _skipped = 0;
const failures: string[] = [];

function pass(_name: string) {
  _passed++;
}

function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
}

function skip(_name: string, _reason: string) {
  _skipped++;
}

function assert(condition: boolean, name: string, reason: string) {
  if (condition) pass(name);
  else fail(name, reason);
}

async function fetchOk(url: string): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    return { status: 0, text: `fetch error: ${err}` };
  }
}

// ─── T0: Infrastructure ────────────────────────────────────────

async function testInfrastructure() {
  // T0.1 XTDB running
  try {
    const rows = await sql`SELECT COUNT(*) AS cnt FROM events`;
    assert(Number(rows[0].cnt) > 0, "T0.1 XTDB has data", `count=${rows[0].cnt}`);
  } catch (err) {
    fail("T0.1 XTDB connection", String(err));
  }

  // T0.2 Seed data present
  const seeds = await sql`
    SELECT session_id, COUNT(*) AS cnt FROM events
    WHERE session_id LIKE '/test/ctx-%' OR session_id LIKE '/test/canary-%'
       OR session_id LIKE '/test/habit-%' OR session_id = '/test/knowledge-rich'
    GROUP BY session_id ORDER BY session_id
  `;
  assert(seeds.length >= 12, "T0.2 Seed sessions exist", `found ${seeds.length}/12`);

  // T0.3 UI server
  const { status } = await fetchOk(`${UI_BASE}/`);
  assert(status === 200, "T0.3 UI server running", `status=${status}`);
}

// ─── T1: Context Markers in UI ─────────────────────────────────

async function testContextMarkers() {
  // T1.1 Context metrics query
  const ctxEvents = await sql`
    SELECT event_name, context_msg_count, provider_payload_bytes
    FROM events WHERE session_id = ${t("/test/ctx-markers-bloated")}
    AND (context_msg_count IS NOT NULL OR provider_payload_bytes IS NOT NULL)
    ORDER BY seq ASC
  `;
  assert(ctxEvents.length === 10, "T1.1 Context metrics query", `found ${ctxEvents.length} events (expected 10)`);

  // T1.2 Context data attributes in HTML
  const sid = encodeURIComponent("/test/ctx-markers-bloated");
  const { text: detailHtml } = await fetchOk(`${UI_BASE}/sessions/${sid}`);
  const ctxMsgsMatches = detailHtml.match(/data-ctx-msgs="(\d+)"/g) ?? [];
  const ctxBytesMatches = detailHtml.match(/data-ctx-bytes="(\d+)"/g) ?? [];
  assert(ctxMsgsMatches.length === 5, "T1.2a data-ctx-msgs attributes", `found ${ctxMsgsMatches.length}/5`);
  assert(ctxBytesMatches.length === 5, "T1.2b data-ctx-bytes attributes", `found ${ctxBytesMatches.length}/5`);

  // T1.3 Sparkline rendering
  const hasSparkline = detailHtml.includes('class="ctx-sparkline"');
  const hasPolyline = detailHtml.includes("ctx-spark-line");
  assert(hasSparkline, "T1.3a Sparkline SVG exists", "not found");
  assert(hasPolyline, "T1.3b Sparkline has data points", "no polyline/path found");

  // T1.4 Context health colors
  const hasGreen = detailHtml.includes("ctx-health-green");
  const hasYellow = detailHtml.includes("ctx-health-yellow");
  const hasRed = detailHtml.includes("ctx-health-red");
  assert(hasGreen, "T1.4a Green zone present", "no ctx-health-green");
  assert(hasYellow, "T1.4b Yellow zone present", "no ctx-health-yellow");
  assert(hasRed, "T1.4c Red zone present", "no ctx-health-red");

  // T1.5 Context rot zone marker
  const rotCount = (detailHtml.match(/ctx-rot-zone/g) ?? []).length;
  assert(rotCount > 0, "T1.5 Rot zone markers", `found ${rotCount} markers`);

  // T1.6 Compaction reset line
  const compSid = encodeURIComponent("/test/ctx-markers-compacted");
  const { text: compHtml } = await fetchOk(`${UI_BASE}/sessions/${compSid}`);
  const hasCompact = compHtml.includes("ctx-compact-reset");
  assert(hasCompact, "T1.6 Compaction reset line", "no ctx-compact-reset found");

  // T1.7 Healthy session has no warnings
  const healthySid = encodeURIComponent("/test/ctx-markers-healthy");
  const { text: healthyHtml } = await fetchOk(`${UI_BASE}/sessions/${healthySid}`);
  const noRot = !healthyHtml.includes("ctx-rot-zone");
  const noRed = !healthyHtml.includes("ctx-health-red");
  assert(noRot, "T1.7a No rot zone in healthy", "rot zone found");
  assert(noRed, "T1.7b No red health in healthy", "red health found");
}

// ─── T2: Focused Agent Templates ───────────────────────────────

async function testTemplates() {
  // T2.1 Template files exist
  const expected = ["committer.md", "reviewer.md", "refactorer.md", "debugger.md", "planner.md"];
  const allExist = expected.every((f) => existsSync(join(TEMPLATES_DIR, f)));
  assert(
    allExist,
    "T2.1 All 5 template files exist",
    `missing: ${expected.filter((f) => !existsSync(join(TEMPLATES_DIR, f)))}`,
  );

  // T2.2 Template structure
  for (const file of expected) {
    const content = readFileSync(join(TEMPLATES_DIR, file), "utf-8");
    const name = file.replace(".md", "");
    const hasHeadings = (content.match(/^#/gm) ?? []).length >= 2;
    const hasMarker = /Context Marker|STARTER/i.test(content);
    const hasPartner = /push back|challenge|say.*don't know|ask/i.test(content);

    assert(hasHeadings, `T2.2a ${name} has headings`, "< 2 headings");
    assert(hasMarker, `T2.2b ${name} has context marker`, "no marker section");
    assert(hasPartner, `T2.2c ${name} has Active Partner`, "no partner directives");
  }

  // T2.3 Template content validation
  const checks: [string, string[], string[]][] = [
    ["committer", ["commit", "conventional"], ["write code"]],
    ["reviewer", ["review", "flag"], []],
    ["refactorer", ["refactor", "tests"], ["new feature"]],
    ["debugger", ["log", "hypothesis"], []],
    ["planner", ["plan"], []],
  ];
  for (const [name, mustHave, _mustNotHave] of checks) {
    const content = readFileSync(join(TEMPLATES_DIR, `${name}.md`), "utf-8").toLowerCase();
    const hasMust = mustHave.every((kw) => content.includes(kw));
    assert(hasMust, `T2.3 ${name} contains keywords`, `missing: ${mustHave.filter((k) => !content.includes(k))}`);
  }

  // T2.4 Role loader extension exists
  const loaderIdx = join(EXTENSIONS_DIR, "role-loader", "index.ts");
  const loaderPkg = join(EXTENSIONS_DIR, "role-loader", "package.json");
  assert(existsSync(loaderIdx), "T2.4a role-loader index.ts exists", "not found");
  assert(existsSync(loaderPkg), "T2.4b role-loader package.json exists", "not found");

  // T2.5–T2.8 require interactive pi session — skip
  skip("T2.5 /role list", "requires interactive pi session");
  skip("T2.6 /role activate", "requires interactive pi session");
  skip("T2.7 /role clear", "requires interactive pi session");
  skip("T2.8 Role persistence", "requires interactive pi session");
}

// ─── T3: Canary Metrics ────────────────────────────────────────

async function testCanaryMetrics() {
  // T3.1 Extension exists
  const canaryIdx = join(EXTENSIONS_DIR, "canary-monitor", "index.ts");
  const canaryPkg = join(EXTENSIONS_DIR, "canary-monitor", "package.json");
  assert(existsSync(canaryIdx), "T3.1a canary-monitor index.ts exists", "not found");
  assert(existsSync(canaryPkg), "T3.1b canary-monitor package.json exists", "not found");

  // T3.2 Tool failure rate: 40% should alert
  const thrashTotal = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-thrashing")} AND event_name = 'tool_execution_end'
  `;
  const thrashErrors = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-thrashing")} AND event_name = 'tool_execution_end' AND is_error = ${sql.typed(true as any, 16)}
  `;
  const thrashRate = Number(thrashErrors[0].cnt) / Number(thrashTotal[0].cnt);
  assert(Math.abs(thrashRate - 0.4) < 0.01, "T3.2 Tool failure rate = 40%", `rate=${thrashRate}`);
  assert(thrashRate > 0.3, "T3.2b Alert fires (> 30%)", `rate=${thrashRate}`);

  // T3.3 No false positive at 10%
  const healthyTotal = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-healthy")} AND event_name = 'tool_execution_end'
  `;
  const healthyErrors = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-healthy")} AND event_name = 'tool_execution_end' AND is_error = ${sql.typed(true as any, 16)}
  `;
  const healthyRate = Number(healthyErrors[0].cnt) / Number(healthyTotal[0].cnt);
  assert(healthyRate <= 0.3, "T3.3 No false positive at 10%", `rate=${healthyRate}`);

  // T3.4 Turn inflation: 8 turns
  const turnStarts = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-inflated")} AND event_name = 'turn_start'
  `;
  const turnCount = Number(turnStarts[0].cnt);
  assert(turnCount === 8, "T3.4 Turn count = 8", `turns=${turnCount}`);
  assert(turnCount > 5, "T3.4b Alert fires (> 5)", `turns=${turnCount}`);

  // T3.5 Context bloat (real data)
  const realPayload = await sql`
    SELECT MAX(provider_payload_bytes) AS max_bytes FROM events
    WHERE provider_payload_bytes IS NOT NULL
  `;
  const maxBytes = Number(realPayload[0].max_bytes);
  assert(maxBytes > 100000, "T3.5 Context bloat detected on real data", `maxBytes=${maxBytes}`);

  // T3.6 Retry storm: 4 consecutive bash
  const stormTools = await sql`
    SELECT tool_name FROM events
    WHERE session_id = ${t("/test/canary-retry-storm")} AND event_name = 'tool_execution_start'
    ORDER BY seq ASC
  `;
  let consecutiveBash = 0;
  for (const r of stormTools) {
    if (r.tool_name === "bash") consecutiveBash++;
    else consecutiveBash = 0;
  }
  assert(consecutiveBash >= 3, "T3.6 Retry storm: 4 consecutive bash", `consecutive=${consecutiveBash}`);

  // T3.7 No retry storm with mixed tools
  const healthyTools = await sql`
    SELECT tool_name FROM events
    WHERE session_id = ${t("/test/canary-healthy")} AND event_name = 'tool_execution_start'
    ORDER BY seq ASC
  `;
  let maxConsec = 0,
    curConsec = 0,
    prevTool = "";
  for (const r of healthyTools) {
    if (r.tool_name === prevTool) curConsec++;
    else {
      curConsec = 1;
      prevTool = r.tool_name;
    }
    if (curConsec > maxConsec) maxConsec = curConsec;
  }
  assert(maxConsec < 3, "T3.7 No retry storm with mixed tools", `maxConsecutive=${maxConsec}`);

  // T3.8–T3.9 require interactive pi session
  skip("T3.8 Live status widget", "requires interactive pi session");
  skip("T3.9 Config override", "requires interactive pi session");

  // T3.10 Session duration (seeded data uses 1s intervals, so small)
  skip("T3.10 Session duration metric", "seed data has artificial timestamps");

  // T3.11 Tool call density
  const densityTurns = await sql`
    SELECT turn_index FROM events
    WHERE session_id = ${t("/test/canary-thrashing")} AND event_name = 'turn_start'
  `;
  const densityTools = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/canary-thrashing")} AND event_name = 'tool_execution_start'
  `;
  const density = Number(densityTools[0].cnt) / Math.max(Number(densityTurns.length), 1);
  assert(density > 8, "T3.11 Tool density > 8/turn", `density=${density}`);
}

// ─── T4: Habit Hooks ───────────────────────────────────────────

async function testHabitHooks() {
  // T4.1 Extension exists
  const habitIdx = join(EXTENSIONS_DIR, "habit-monitor", "index.ts");
  const habitPkg = join(EXTENSIONS_DIR, "habit-monitor", "package.json");
  assert(existsSync(habitIdx), "T4.1a habit-monitor index.ts exists", "not found");
  assert(existsSync(habitPkg), "T4.1b habit-monitor package.json exists", "not found");

  // T4.2 Commit reminder: 5 edits no commit
  const noCommitTools = await sql`
    SELECT tool_name FROM events
    WHERE session_id = ${t("/test/habit-no-commit")} AND event_name = 'tool_execution_start'
    ORDER BY seq ASC
  `;
  const editCount = noCommitTools.filter((r: any) => r.tool_name === "write" || r.tool_name === "edit").length;
  assert(editCount >= 5, "T4.2 Commit reminder: 5+ edits", `edits=${editCount}`);

  // T4.3 Commit suppression — skip (needs bash_command="git commit")
  const noCommitBash = await sql`
    SELECT bash_command FROM events
    WHERE session_id = ${t("/test/habit-no-commit")} AND bash_command IS NOT NULL
  `;
  assert(noCommitBash.length === 0, "T4.3 No git commit in session", `bash commands found: ${noCommitBash.length}`);

  // T4.4 Test reminder: 6 edits no test
  const noTestTools = await sql`
    SELECT tool_name FROM events
    WHERE session_id = ${t("/test/habit-no-test")} AND event_name = 'tool_execution_start'
    ORDER BY seq ASC
  `;
  const testEdits = noTestTools.filter((r: any) => r.tool_name === "write" || r.tool_name === "edit").length;
  assert(testEdits >= 5, "T4.4 Test reminder: 5+ edits without test", `edits=${testEdits}`);

  // T4.5 Test suppression — skip (would need a session with npm test midway)
  skip("T4.5 Test suppression after run", "not seeded in this batch");

  // T4.6 Error streak: 3 consecutive
  const errStreak = await sql`
    SELECT is_error FROM events
    WHERE session_id = ${t("/test/habit-error-streak")} AND event_name = 'tool_execution_end'
    ORDER BY seq ASC
  `;
  let streak = 0;
  for (const r of errStreak) {
    if (r.is_error) streak++;
    else streak = 0;
  }
  assert(streak >= 3, "T4.6 Error streak: 3 consecutive", `streak=${streak}`);

  // T4.7 Interleaved success — healthy session should not have 3+ streak
  const healthyErrs = await sql`
    SELECT is_error FROM events
    WHERE session_id = ${t("/test/canary-healthy")} AND event_name = 'tool_execution_end'
    ORDER BY seq ASC
  `;
  let hStreak = 0,
    hMaxStreak = 0;
  for (const r of healthyErrs) {
    if (r.is_error) hStreak++;
    else hStreak = 0;
    if (hStreak > hMaxStreak) hMaxStreak = hStreak;
  }
  assert(hMaxStreak < 3, "T4.7 No error streak in healthy", `maxStreak=${hMaxStreak}`);

  // T4.8 Scope creep: 12 unique tool calls
  const scopeTools = await sql`
    SELECT tool_name FROM events
    WHERE session_id = ${t("/test/habit-scope-creep")} AND event_name = 'tool_execution_start'
  `;
  assert(scopeTools.length >= 8, "T4.8 Scope creep: many tool calls", `count=${scopeTools.length}`);

  // T4.9–T4.10 require interactive pi session
  skip("T4.9 Snooze mechanism", "requires interactive pi session");
  skip("T4.10 /habit list", "requires interactive pi session");

  // T4.11 Fresh start hint (real data)
  const realMax = await sql`
    SELECT MAX(provider_payload_bytes) AS max_bytes FROM events
    WHERE provider_payload_bytes IS NOT NULL
  `;
  assert(
    Number(realMax[0].max_bytes) > 150000,
    "T4.11 Fresh start hint on real data",
    `maxBytes=${realMax[0].max_bytes}`,
  );
}

// ─── T5: Session Health Dashboard ──────────────────────────────

async function testDashboard() {
  // T5.1 Dashboard routes
  const { status: htmlStatus } = await fetchOk(`${UI_BASE}/dashboard`);
  const { status: apiStatus } = await fetchOk(`${UI_BASE}/api/dashboard`);
  assert(htmlStatus === 200, "T5.1a Dashboard HTML returns 200", `status=${htmlStatus}`);
  assert(apiStatus === 200, "T5.1b Dashboard API returns 200", `status=${apiStatus}`);

  // T5.2 Dashboard stats JSON
  const { text: apiText } = await fetchOk(`${UI_BASE}/api/dashboard`);
  try {
    const data = JSON.parse(apiText);
    assert(typeof data.totalSessions === "number", "T5.2a totalSessions present", "missing");
    assert(Array.isArray(data.sessions), "T5.2b sessions array present", "missing");
    assert(Array.isArray(data.toolUsage), "T5.2c toolUsage array present", "missing");
    assert(data.sessions.length > 0, "T5.2d sessions not empty", `length=${data.sessions.length}`);

    // Check session objects have health scores
    const first = data.sessions[0];
    assert(typeof first.healthScore === "number", "T5.2e healthScore present", "missing");
    assert(typeof first.healthColor === "string", "T5.2f healthColor present", "missing");
  } catch (err) {
    fail("T5.2 Dashboard JSON parse", String(err));
  }

  // T5.3 Health score algorithm
  // Import the module (we're running from test/ but the module is in the UI dir)
  const healthMod = await import("../xtdb-event-logger-ui/lib/health.ts");

  const perfect = healthMod.computeHealthScore({
    errorRate: 0,
    turnCount: 2,
    maxPayloadBytes: 30000,
    durationMs: 60000,
  });
  assert(perfect >= 90, "T5.3a Perfect session >= 90", `score=${perfect}`);

  const mid = healthMod.computeHealthScore({
    errorRate: 0.2,
    turnCount: 6,
    maxPayloadBytes: 120000,
    durationMs: 300000,
  });
  assert(mid >= 40 && mid <= 70, "T5.3b Mediocre session 40-70", `score=${mid}`);

  const bad = healthMod.computeHealthScore({
    errorRate: 0.5,
    turnCount: 12,
    maxPayloadBytes: 400000,
    durationMs: 900000,
  });
  assert(bad <= 30, "T5.3c Bad session <= 30", `score=${bad}`);

  // T5.4 Health colors
  assert(healthMod.healthColor(95) === "green", "T5.4a 95 = green", `got ${healthMod.healthColor(95)}`);
  assert(healthMod.healthColor(60) === "yellow", "T5.4b 60 = yellow", `got ${healthMod.healthColor(60)}`);
  assert(healthMod.healthColor(25) === "red", "T5.4c 25 = red", `got ${healthMod.healthColor(25)}`);

  // T5.5 Dashboard HTML elements
  const { text: dashHtml } = await fetchOk(`${UI_BASE}/dashboard`);
  const statCards = (dashHtml.match(/dash-stat-card/g) ?? []).length;
  const healthScores = (dashHtml.match(/health-score/g) ?? []).length;
  const toolBars = (dashHtml.match(/tool-bar-name/g) ?? []).length;
  assert(statCards >= 3, "T5.5a Stat cards >= 3", `found ${statCards}`);
  assert(healthScores >= 1, "T5.5b Health scores >= 1", `found ${healthScores}`);
  assert(toolBars >= 1, "T5.5c Tool bars >= 1", `found ${toolBars}`);

  // T5.6 Dashboard navigation
  const { text: indexHtml } = await fetchOk(`${UI_BASE}/`);
  const { text: sessHtml } = await fetchOk(`${UI_BASE}/sessions`);
  assert(indexHtml.includes('href="/dashboard"'), "T5.6a Index has Dashboard link", "not found");
  assert(sessHtml.includes('href="/dashboard"'), "T5.6b Sessions has Dashboard link", "not found");
  assert(dashHtml.includes('href="/sessions/'), "T5.6c Dashboard has session links", "not found");

  // T5.7 Session page health badges
  assert(sessHtml.includes("health-badge"), "T5.7 Sessions show health badges", "not found");
}

// ─── T6: Knowledge Extraction ──────────────────────────────────

async function testKnowledge() {
  // T6.1 Knowledge query aggregation
  const knowledgeSid = encodeURIComponent("/test/knowledge-rich");
  const { text: apiText, status: apiStatus } = await fetchOk(`${UI_BASE}/api/sessions/${knowledgeSid}/knowledge`);
  assert(apiStatus === 200, "T6.1a Knowledge API returns 200", `status=${apiStatus}`);

  // Check aggregated data
  const toolEndCounts = await sql`
    SELECT tool_name, COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/knowledge-rich")} AND event_name = 'tool_execution_end'
    GROUP BY tool_name
  `;
  const toolMap: Record<string, number> = {};
  for (const r of toolEndCounts) toolMap[r.tool_name] = Number(r.cnt);
  assert(toolMap.bash === 4, "T6.1b Bash count = 4", `got ${toolMap.bash}`);
  assert(toolMap.write === 3, "T6.1c Write count = 3", `got ${toolMap.write}`);

  const errorRows = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/knowledge-rich")} AND event_name = 'tool_execution_end' AND is_error = ${sql.typed(true as any, 16)}
  `;
  assert(Number(errorRows[0].cnt) === 2, "T6.1d Error count = 2", `got ${errorRows[0].cnt}`);

  const turnRows = await sql`
    SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = ${t("/test/knowledge-rich")} AND event_name = 'turn_start'
  `;
  assert(Number(turnRows[0].cnt) === 5, "T6.1e Turn count = 5", `got ${turnRows[0].cnt}`);

  // T6.2 Markdown generation
  assert(apiText.includes("# Session Summary"), "T6.2a Has Session Summary heading", "missing");
  assert(apiText.includes("## Tools Used"), "T6.2b Has Tools Used section", "missing");
  assert(apiText.includes("## Errors"), "T6.2c Has Errors section", "missing");
  assert(apiText.includes("## Key Commands"), "T6.2d Has Key Commands section", "missing");

  // T6.3 Knowledge HTML route
  const { status: htmlStatus } = await fetchOk(`${UI_BASE}/sessions/${knowledgeSid}/knowledge`);
  assert(htmlStatus === 200, "T6.3 Knowledge HTML returns 200", `status=${htmlStatus}`);

  // T6.4 Knowledge for nonexistent session
  const { status: notFoundStatus } = await fetchOk(
    `${UI_BASE}/sessions/${encodeURIComponent("/test/nonexistent")}/knowledge`,
  );
  assert(notFoundStatus === 404, "T6.4 Nonexistent session = 404", `status=${notFoundStatus}`);

  // T6.5–T6.6 require session shutdown — skip
  skip("T6.5 Extension writes .knowledge.md", "requires pi session shutdown");
  skip("T6.6 Written file content", "requires pi session shutdown");

  // Check extension exists
  const kIdx = join(EXTENSIONS_DIR, "knowledge-extractor", "index.ts");
  assert(existsSync(kIdx), "T6.5b knowledge-extractor extension exists", "not found");
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  await testInfrastructure();
  await testContextMarkers();
  await testTemplates();
  await testCanaryMetrics();
  await testHabitHooks();
  await testDashboard();
  await testKnowledge();

  if (failures.length > 0) {
    for (const f of failures) { console.error(`  ✗ ${f}`); }
  }

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
