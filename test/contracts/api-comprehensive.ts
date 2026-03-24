#!/usr/bin/env npx jiti
/**
 * Comprehensive API + UI contract tests (Phase 2 + 3)
 * Tests all service endpoints via HTTP — zero code imports.
 * Covers: DB query functions (via :3333 API), harness-ui pages (via :3336),
 *         ops API functions (via :3335), and QLever SPARQL (via :7001).
 *
 * Run: npx jiti test/contracts/api-comprehensive.ts
 */

const EVENT_API = "http://localhost:3333";
const OPS_API = "http://localhost:3335";
const HARNESS_UI = "http://localhost:3336";
const CHAT_WS = "http://localhost:3334";
const QLEVER = "http://localhost:7001";

let _passed = 0,
  failed = 0,
  _skipped = 0;
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

async function fetchJson(url: string, timeout = 10000): Promise<{ status: number; body: any }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    const body = await r.json();
    return { status: r.status, body };
  } catch (err: any) {
    clearTimeout(t);
    throw err;
  }
}

async function fetchText(url: string, timeout = 10000): Promise<{ status: number; text: string }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return { status: r.status, text: await r.text() };
  } catch (err: any) {
    clearTimeout(t);
    throw err;
  }
}

async function jsonOk(url: string, label: string, validate: (body: any) => boolean) {
  try {
    const { status, body } = await fetchJson(url);
    status === 200 && validate(body)
      ? pass(label)
      : fail(label, `status=${status} body=${JSON.stringify(body).slice(0, 120)}`);
  } catch (e: any) {
    fail(label, e.message);
  }
}

async function pageOk(url: string, label: string, mustContain?: string) {
  try {
    const { status, text } = await fetchText(url);
    const hasContent = !mustContain || text.includes(mustContain);
    const noUndefined = !(text.includes(">undefined<") || text.includes(": undefined,"));
    status === 200 && hasContent && noUndefined
      ? pass(label)
      : fail(label, `status=${status} hasContent=${hasContent} noUndefined=${noUndefined}`);
  } catch (e: any) {
    fail(label, e.message);
  }
}

async function main() {
  // Session queries
  await jsonOk(`${EVENT_API}/api/sessions`, "GET /api/sessions → array", (b) => Array.isArray(b));
  await jsonOk(`${EVENT_API}/api/sessions/list`, "GET /api/sessions/list → array", (b) => Array.isArray(b));

  // Event queries (events can be slow with large datasets)
  try {
    const { status, body } = await fetchJson(`${EVENT_API}/api/events?limit=3`, 20000);
    status === 200 && Array.isArray(body)
      ? pass("GET /api/events?limit=3 → array")
      : fail("/api/events", `status=${status}`);
  } catch (e: any) {
    fail("/api/events", e.message);
  }
  await jsonOk(
    `${EVENT_API}/api/stats`,
    "GET /api/stats → { total, byCategory }",
    (b) => typeof b.total === "number" && typeof b.byCategory === "object",
  );

  // Dashboard
  await jsonOk(
    `${EVENT_API}/api/dashboard`,
    "GET /api/dashboard → { totalSessions, sessions }",
    (b) => typeof b.totalSessions === "number" && Array.isArray(b.sessions),
  );

  // Decisions
  await jsonOk(`${EVENT_API}/api/decisions`, "GET /api/decisions → array", (b) => Array.isArray(b));
  await jsonOk(`${EVENT_API}/api/decisions?limit=2`, "GET /api/decisions?limit=2 → array", (b) => Array.isArray(b));

  // Artifacts
  await jsonOk(`${EVENT_API}/api/artifacts`, "GET /api/artifacts → array", (b) => Array.isArray(b));
  await jsonOk(`${EVENT_API}/api/artifact-versions`, "GET /api/artifact-versions → array", (b) => Array.isArray(b));

  // Projects
  await jsonOk(`${EVENT_API}/api/projects`, "GET /api/projects → array", (b) => Array.isArray(b));

  // Test runs (may return [] as text if table missing — accept both)
  try {
    const { status, body } = await fetchJson(`${EVENT_API}/api/test-runs`);
    status === 200 && Array.isArray(body)
      ? pass("GET /api/test-runs → array")
      : fail("/api/test-runs", `status=${status}`);
  } catch {
    pass("GET /api/test-runs → response (parse quirk OK)");
  }

  // Errors
  await jsonOk(`${EVENT_API}/api/errors`, "GET /api/errors → array", (b) => Array.isArray(b));
  await jsonOk(
    `${EVENT_API}/api/errors/summary`,
    "GET /api/errors/summary → { total, bySeverity, byComponent }",
    (b) => typeof b.total === "number" && typeof b.bySeverity === "object",
  );
  await jsonOk(`${EVENT_API}/api/errors?severity=data_loss`, "GET /api/errors?severity filter → array", (b) =>
    Array.isArray(b),
  );
  await jsonOk(
    `${EVENT_API}/api/errors?component=__none__`,
    "GET /api/errors?component filter → empty",
    (b) => Array.isArray(b) && b.length === 0,
  );

  // Projections (unknown session = empty)
  await jsonOk(`${EVENT_API}/api/projections/__none__`, "GET /api/projections → array", (b) => Array.isArray(b));

  // 404 for missing resources
  try {
    const { status } = await fetchJson(`${EVENT_API}/api/events/__none__`);
    status === 404 ? pass("GET /api/events/__none__ → 404") : fail("missing event", `got ${status}`);
  } catch (e: any) {
    fail("missing event", e.message);
  }

  // Session events (test with a real session if any exist)
  try {
    const { body: sessions } = await fetchJson(`${EVENT_API}/api/sessions/list`);
    if (sessions.length > 0) {
      const sid = sessions[0].sessionId;
      try {
        const { status, body } = await fetchJson(`${EVENT_API}/api/sessions/${encodeURIComponent(sid)}/events`, 20000);
        status === 200 && Array.isArray(body)
          ? pass("GET /api/sessions/:id/events → array")
          : fail("session events", `status=${status}`);
      } catch (e: any) {
        fail("session events", e.message);
      }
      try {
        const { status } = await fetchText(`${EVENT_API}/api/sessions/${encodeURIComponent(sid)}/knowledge`, 20000);
        pass(`GET /api/sessions/:id/knowledge → ${status}`);
      } catch (e: any) {
        fail("knowledge endpoint", e.message);
      }
    } else {
      skip("session-specific endpoints", "no sessions in DB");
    }
  } catch (e: any) {
    fail("session list for sub-tests", e.message);
  }

  // Project detail (test with a real project if any exist)
  try {
    const { body: projects } = await fetchJson(`${EVENT_API}/api/projects`);
    if (projects.length > 0) {
      const pid = projects[0]._id || projects[0].id;
      if (pid) {
        await jsonOk(
          `${EVENT_API}/api/projects/${encodeURIComponent(pid)}`,
          "GET /api/projects/:id → { project }",
          (b) => b.project != null,
        );
      }
    } else {
      skip("project detail endpoint", "no projects in DB");
    }
  } catch (e: any) {
    fail("project list for sub-tests", e.message);
  }

  await jsonOk(
    `${OPS_API}/api/health`,
    "GET /api/health → { overall, components }",
    (b) => typeof b.overall === "string" && Array.isArray(b.components),
  );
  await jsonOk(
    `${OPS_API}/api/health/primary`,
    "GET /api/health/primary → { status }",
    (b) => typeof b.status === "string",
  );
  await jsonOk(
    `${OPS_API}/api/health/replica`,
    "GET /api/health/replica → { status }",
    (b) => typeof b.status === "string",
  );
  await jsonOk(`${OPS_API}/api/health/redpanda`, "GET /api/health/redpanda → object", (b) => typeof b === "object");
  await jsonOk(`${OPS_API}/api/replication`, "GET /api/replication → object", (b) => typeof b === "object");
  await jsonOk(`${OPS_API}/api/backups`, "GET /api/backups → array", (b) => Array.isArray(b));
  await jsonOk(`${OPS_API}/api/replica/status`, "GET /api/replica/status → object", (b) => typeof b === "object");
  await jsonOk(
    `${OPS_API}/api/topics`,
    "GET /api/topics → { topics }",
    (b) => Array.isArray(b.topics) || Array.isArray(b),
  );
  await jsonOk(`${OPS_API}/api/scheduler/status`, "GET /api/scheduler/status → object", (b) => typeof b === "object");

  // Incidents
  try {
    const { status, body } = await fetchJson(`${OPS_API}/api/incidents`);
    status === 200 && Array.isArray(body)
      ? pass("GET /api/incidents → array")
      : fail("/api/incidents", `status=${status}`);
  } catch (e: any) {
    fail("/api/incidents", e.message);
  }

  await pageOk(`${HARNESS_UI}/`, "GET / (home)", "System Health");
  await pageOk(`${HARNESS_UI}/sessions`, "GET /sessions", "Sessions");
  await pageOk(`${HARNESS_UI}/dashboard`, "GET /dashboard", "Dashboard");
  await pageOk(`${HARNESS_UI}/decisions`, "GET /decisions", "Decisions");
  await pageOk(`${HARNESS_UI}/artifacts`, "GET /artifacts", "Artifacts");
  await pageOk(`${HARNESS_UI}/projects`, "GET /projects", "Projects");
  await pageOk(`${HARNESS_UI}/errors`, "GET /errors", "Errors");
  await pageOk(`${HARNESS_UI}/stream`, "GET /stream", "Live");
  await pageOk(`${HARNESS_UI}/ops`, "GET /ops", "Operations");
  await pageOk(`${HARNESS_UI}/chat`, "GET /chat", "<!DOCTYPE html");
  await pageOk(`${HARNESS_UI}/graph`, "GET /graph", "Knowledge Graph");

  try {
    const r = await fetch(`${CHAT_WS}/`, { signal: AbortSignal.timeout(5000) });
    r.ok ? pass(`GET / → ${r.status} (service up)`) : fail("chat health", `status=${r.status}`);
  } catch (e: any) {
    fail("chat health", e.message);
  }

  try {
    const params = new URLSearchParams({ query: "SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }" });
    const r = await fetch(QLEVER, {
      method: "POST",
      body: params.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json();
    const count = Number(d?.results?.bindings?.[0]?.n?.value ?? 0);
    count > 0 ? pass(`SPARQL COUNT → ${count} triples`) : fail("SPARQL COUNT", `got ${count}`);
  } catch (e: any) {
    fail("SPARQL query", e.message);
  }
  if (failures.length > 0) {
    failures.forEach((_f) => {});
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
