// ─── Build Service ───────────────────────────────────────────────
// HTTP API for building Docker images from source and pushing to
// the OCI registry (Zot). Runs as a standalone container on :3339.
//
// Endpoints:
//   GET  /api/health       — status, current build, uptime
//   POST /api/build        — trigger a build
//   GET  /api/builds       — last 100 builds from XTDB
//   GET  /api/builds/:id   — single build detail
//
// Triggered by: CI runner on test pass, manual API call from UI

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import postgres from "postgres";
import { runBuild, getCurrentBuild, type BuildRequest } from "./builder.ts";
import { recordBuild, closeRecorder } from "./recorder.ts";

const PORT = Number(process.env.PORT ?? "3339");
const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");
const HARNESS_UI_URL = process.env.HARNESS_UI_URL ?? "http://harness-ui:3336";

const app = new Hono();
const startedAt = Date.now();
let totalBuilds = 0;
let lastBuildId: string | null = null;

// Read-only connection for queries
const sql = postgres({
  host: XTDB_HOST, port: XTDB_PORT,
  database: "xtdb", user: "xtdb", password: "xtdb",
  max: 2, idle_timeout: 30, connect_timeout: 5,
});

// ─── Health ──────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    uptime: Date.now() - startedAt,
    totalBuilds,
    lastBuildId,
    currentBuild: getCurrentBuild(),
  });
});

// ─── Trigger Build ───────────────────────────────────────────────

app.post("/api/build", async (c) => {
  const current = getCurrentBuild();
  if (current) {
    return c.json({ error: "Build already in progress", build: current }, 409);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const req: BuildRequest = {
    repo: body.repo ?? "harness",
    commit: body.commit ?? body.commitHash,
    services: body.services,
    trigger: body.trigger ?? "api",
  };

  // Run build asynchronously — respond immediately with build ID
  const buildPromise = (async () => {
    try {
      const result = await runBuild(req);
      await recordBuild(result);
      totalBuilds++;
      lastBuildId = result.id;

      // Notify harness-ui via SSE
      try {
        await fetch(`${HARNESS_UI_URL}/api/ci/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "build",
            buildId: result.id,
            status: result.status,
            repo: result.repo,
            commit: result.commit,
            services: result.services.length,
            durationMs: result.durationMs,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch { /* intentionally silent — notification is best-effort */ }

      console.log(`[server] Build complete: ${result.id} (${result.status})`);
    } catch (err: any) {
      console.error(`[server] Build failed:`, err.message);
    }
  })();

  // Don't await — return immediately
  void buildPromise;

  return c.json({ accepted: true, message: "Build started", repo: req.repo }, 202);
});

// ─── Build History ───────────────────────────────────────────────

app.get("/api/builds", async (c) => {
  try {
    const rows = await sql`
      SELECT _id, repo, commit_hash, status, trigger, services_total,
             services_ok, services_failed, duration_ms, ts, service_results
      FROM builds ORDER BY ts DESC LIMIT 100
    `;
    return c.json(rows);
  } catch (err: any) {
    console.error("[server] Failed to fetch builds:", err.message);
    return c.json([]);
  }
});

// ─── Single Build Detail ─────────────────────────────────────────

app.get("/api/builds/:id", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  try {
    const t = (v: string) => sql.typed(v as any, 25);
    const rows = await sql`
      SELECT _id, repo, commit_hash, status, trigger, services_total,
             services_ok, services_failed, duration_ms, ts, jsonld, service_results
      FROM builds WHERE _id = ${t(id)}
    `;
    if (rows.length === 0) return c.json({ error: "Build not found" }, 404);
    return c.json(rows[0]);
  } catch (err: any) {
    console.error("[server] Failed to fetch build:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── Start ───────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`✅ Build service listening on :${PORT}`);
  console.log(`   XTDB:     ${XTDB_HOST}:${XTDB_PORT}`);
  console.log(`   Registry: ${process.env.REGISTRY ?? "localhost:5050"}`);
});

process.on("SIGTERM", async () => {
  console.log("[server] Shutting down...");
  await closeRecorder();
  await sql.end();
  process.exit(0);
});
