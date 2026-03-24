#!/usr/bin/env npx jiti
/**
 * Contract: xtdb-event-logger-ui API (:3333)
 * Tests API response shapes and error responses.
 * Run: NODE_PATH=xtdb-event-logger/node_modules npx jiti test/contracts/api-event-logger.ts
 */

const UI = "http://localhost:3333";
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

async function json(path: string): Promise<any> {
  const res = await fetch(`${UI}${path}`);
  return { status: res.status, body: await res.json() };
}

async function _html(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${UI}${path}`);
  return { status: res.status, text: await res.text() };
}

async function main() {
  const stats = await json("/api/stats");
  stats.status === 200 && typeof stats.body.total === "number" && typeof stats.body.byCategory === "object"
    ? pass("GET /api/stats → { total: number, byCategory: object }")
    : fail("/api/stats shape", `status=${stats.status} body=${JSON.stringify(stats.body).slice(0, 100)}`);

  const sessions = await json("/api/sessions/list");
  sessions.status === 200 && Array.isArray(sessions.body)
    ? pass("GET /api/sessions/list → array")
    : fail("/api/sessions/list shape", `status=${sessions.status}`);

  if (sessions.body.length > 0) {
    const s = sessions.body[0];
    s.sessionId && (s.firstTs !== undefined || s.startTs !== undefined)
      ? pass("/api/sessions/list[0] has sessionId + timestamp")
      : fail("/api/sessions/list[0] shape", `keys: ${Object.keys(s).join(",")}`);
  } else {
    pass("/api/sessions/list is empty (OK for fresh DB)");
  }

  const dashboard = await json("/api/dashboard");
  dashboard.status === 200 && dashboard.body.sessions !== undefined
    ? pass("GET /api/dashboard → has sessions field")
    : fail("/api/dashboard shape", `status=${dashboard.status} keys=${Object.keys(dashboard.body)}`);

  const decisions = await json("/api/decisions");
  decisions.status === 200 && Array.isArray(decisions.body)
    ? pass("GET /api/decisions → array")
    : fail("/api/decisions shape", `status=${decisions.status}`);

  const artifacts = await json("/api/artifacts");
  artifacts.status === 200 && Array.isArray(artifacts.body)
    ? pass("GET /api/artifacts → array")
    : fail("/api/artifacts shape", `status=${artifacts.status}`);

  const artVersions = await json("/api/artifact-versions?path=__nonexistent__");
  artVersions.status === 200 && Array.isArray(artVersions.body)
    ? pass("GET /api/artifact-versions → array (empty for unknown path)")
    : fail("/api/artifact-versions shape", `status=${artVersions.status}`);

  const events = await json("/api/events?limit=5");
  events.status === 200 && Array.isArray(events.body)
    ? pass("GET /api/events?limit=5 → array")
    : fail("/api/events shape", `status=${events.status}`);

  const projects = await json("/api/projects");
  projects.status === 200 && Array.isArray(projects.body)
    ? pass("GET /api/projects → array")
    : fail("/api/projects shape", `status=${projects.status}`);

  const testRuns = await json("/api/test-runs");
  testRuns.status === 200 && Array.isArray(testRuns.body)
    ? pass("GET /api/test-runs → array")
    : fail("/api/test-runs shape", `status=${testRuns.status}`);

  const projections = await json("/api/projections/__nonexistent__");
  projections.status === 200 && Array.isArray(projections.body)
    ? pass("GET /api/projections → array (empty for unknown session)")
    : fail("/api/projections shape", `status=${projections.status}`);

  const missingEvent = await json("/api/events/__nonexistent__");
  missingEvent.status === 404
    ? pass("GET /api/events/__nonexistent__ → 404")
    : fail("/api/events/missing", `expected 404, got ${missingEvent.status}`);

  const errors = await json("/api/errors");
  errors.status === 200 && Array.isArray(errors.body)
    ? pass("GET /api/errors → array")
    : fail("/api/errors shape", `status=${errors.status}`);

  const errorsSummary = await json("/api/errors/summary");
  errorsSummary.status === 200 &&
  typeof errorsSummary.body.total === "number" &&
  typeof errorsSummary.body.bySeverity === "object" &&
  typeof errorsSummary.body.byComponent === "object"
    ? pass("GET /api/errors/summary → { total, bySeverity, byComponent }")
    : fail("/api/errors/summary shape", `status=${errorsSummary.status} keys=${Object.keys(errorsSummary.body)}`);

  const errorsFiltered = await json("/api/errors?severity=data_loss&limit=5");
  errorsFiltered.status === 200 && Array.isArray(errorsFiltered.body)
    ? pass("GET /api/errors?severity=data_loss&limit=5 → array")
    : fail("/api/errors?severity filter", `status=${errorsFiltered.status}`);

  const errorsCompFilter = await json("/api/errors?component=__nonexistent__");
  errorsCompFilter.status === 200 && Array.isArray(errorsCompFilter.body) && errorsCompFilter.body.length === 0
    ? pass("GET /api/errors?component=__nonexistent__ → empty array")
    : fail("/api/errors?component filter", `status=${errorsCompFilter.status} len=${errorsCompFilter.body?.length}`);
  if (failures.length > 0) {
    failures.forEach((_f) => {});
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
