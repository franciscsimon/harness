import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { createLogger } from "../lib/logger.ts";
import { requestLogger } from "../lib/request-logger.ts";
import {
  getArtifacts,
  getArtifactVersion,
  getArtifactVersionSummaries,
  getArtifactVersionsByPath,
  getCIRun,
  getCIRuns,
  getDashboardSessions,
  getDecisions,
  getDockerEvents,
  getDockerEventsSummary,
  getErrorPatterns,
  getErrorSummary,
  getErrors,
  getEvent,
  getEvents,
  getEventsSince,
  getProject,
  getProjectArtifacts,
  getProjectDecisions,
  getProjectDecommissions,
  getProjectDependencies,
  getProjections,
  getProjectLifecycleEvents,
  getProjectSessions,
  getProjects,
  getProjectTags,
  getSessionEvents,
  getSessionKnowledge,
  getSessionList,
  getSessions,
  getStats,
  getTestRuns,
  getToolUsageStats,
  resolveProjectId,
  wipeAllEvents,
} from "./lib/db.ts";
import { compactEvent } from "./lib/format.ts";
import { computeHealthScore, healthColor } from "./lib/health.ts";
import { generateKnowledgeMarkdown } from "./lib/knowledge.ts";

// ─── Config ────────────────────────────────────────────────────────

const UI_PORT = Number(process.env.UI_PORT ?? "3333");
const log = createLogger("xtdb-event-logger-ui");
const POLL_MS = Number(process.env.UI_POLL_MS ?? "500");

// ─── App ───────────────────────────────────────────────────────────

const app = new Hono();
app.use("*", requestLogger(log));
app.use("/*", cors({ origin: "*" }));

// ── SSE Stream ─────────────────────────────────────────────────────

app.get("/api/events/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    let lastSeq = -1;
    try {
      const initial = await getEvents({ limit: 50 });
      const reversed = initial.reverse();
      for (const row of reversed) {
        const ev = compactEvent(row);
        await stream.writeSSE({ event: "event", data: JSON.stringify(ev) });
        const seq = Number(row.seq);
        if (seq > lastSeq) lastSeq = seq;
      }
      const stats = await getStats();
      await stream.writeSSE({ event: "stats", data: JSON.stringify(stats) });
    } catch (_err) { console.error(_err); }

    while (true) {
      await stream.sleep(POLL_MS);
      try {
        const newRows = await getEventsSince(lastSeq);
        for (const row of newRows) {
          const ev = compactEvent(row);
          await stream.writeSSE({ event: "event", data: JSON.stringify(ev) });
          const seq = Number(row.seq);
          if (seq > lastSeq) lastSeq = seq;
        }
        if (newRows.length > 0) {
          const stats = await getStats();
          await stream.writeSSE({ event: "stats", data: JSON.stringify(stats) });
        }
      } catch (_err) { console.error(_err); }
    }
  });
});

// ── JSON API ───────────────────────────────────────────────────────

app.get("/api/events", async (c) => {
  const category = c.req.query("category") ?? undefined;
  const eventName = c.req.query("event_name") ?? undefined;
  const sessionId = c.req.query("session_id") ?? undefined;
  const afterSeq = c.req.query("after_seq") ? Number(c.req.query("after_seq")) : undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const rows = await getEvents({ category, eventName, sessionId, afterSeq, limit });
  return c.json(rows.map(compactEvent));
});

app.get("/api/sessions/list", async (c) => {
  const rawProjectId = c.req.query("project_id");
  const projectId = rawProjectId ? await resolveProjectId(rawProjectId) : undefined;
  let sessions = await getSessionList();
  if (projectId) {
    const projSessions = await getProjectSessions(projectId);
    const projSessionIds = new Set(projSessions.map((ps) => ps.session_id));
    sessions = sessions.filter((s) => projSessionIds.has(s.sessionId));
  }
  return c.json(sessions);
});

app.get("/api/sessions/:id{.+}/events", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const events = await getSessionEvents(id);
  return c.json(events.map(compactEvent));
});

app.get("/api/events/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getEvent(id);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.get("/api/sessions", async (c) => {
  const sessions = await getSessions();
  return c.json(sessions);
});

app.get("/api/stats", async (c) => {
  const stats = await getStats();
  return c.json(stats);
});

app.get("/api/dashboard", async (c) => {
  const [sessions, tools, errors] = await Promise.all([
    getDashboardSessions(),
    getToolUsageStats(),
    getErrorPatterns(),
  ]);
  const ranked = sessions.map((s) => ({
    ...s,
    healthScore: computeHealthScore(s),
    healthColor: healthColor(computeHealthScore(s)),
  }));
  return c.json({
    totalSessions: sessions.length,
    totalEvents: sessions.reduce((s, r) => s + r.eventCount, 0),
    avgEventsPerSession:
      sessions.length > 0 ? Math.round(sessions.reduce((s, r) => s + r.eventCount, 0) / sessions.length) : 0,
    overallErrorRate: sessions.length > 0 ? sessions.reduce((s, r) => s + r.errorRate, 0) / sessions.length : 0,
    sessions: ranked,
    toolUsage: tools,
    errorPatterns: errors,
  });
});

app.get("/api/sessions/:id{.+}/knowledge", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const knowledge = await getSessionKnowledge(id);
  if (!knowledge) return c.json({ error: "Session not found" }, 404);
  const md = generateKnowledgeMarkdown(id, knowledge);
  return c.text(md, 200, { "Content-Type": "text/markdown; charset=utf-8" });
});

app.get("/api/decisions", async (c) => {
  const sessionId = c.req.query("session_id");
  const rawProjectId = c.req.query("project_id");
  const projectId = rawProjectId ? await resolveProjectId(rawProjectId) : undefined;
  const decisions = projectId ? await getProjectDecisions(projectId) : await getDecisions();
  const filtered = sessionId ? decisions.filter((d) => d.session_id === sessionId) : decisions;
  return c.json(filtered);
});

app.get("/api/artifacts", async (c) => {
  const sessionId = c.req.query("session_id");
  const rawProjectId = c.req.query("project_id");
  const projectId = rawProjectId ? await resolveProjectId(rawProjectId) : undefined;
  const artifacts = projectId ? await getProjectArtifacts(projectId) : await getArtifacts();
  const filtered = sessionId ? artifacts.filter((a) => a.session_id === sessionId) : artifacts;
  return c.json(filtered);
});

app.get("/api/artifact-versions", async (c) => {
  const path = c.req.query("path");
  if (path) {
    const versions = await getArtifactVersionsByPath(path);
    return c.json(versions);
  }
  const summaries = await getArtifactVersionSummaries();
  return c.json(summaries);
});

app.get("/api/artifact-versions/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const version = await getArtifactVersion(id);
  if (!version) return c.json({ error: "not found" }, 404);
  return c.json(version);
});

app.get("/api/projects", async (c) => {
  const projects = await getProjects();
  return c.json(projects);
});

app.get("/api/projects/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const project = await getProject(id);
  if (!project) return c.json({ error: "Not found" }, 404);
  const [sessions, dependencies, tags, decommissions, lifecycleEvents] = await Promise.all([
    getProjectSessions(id),
    getProjectDependencies(id),
    getProjectTags(id),
    getProjectDecommissions(id),
    getProjectLifecycleEvents(id),
  ]);
  return c.json({ project, sessions, dependencies, tags, decommissions, lifecycleEvents });
});

app.get("/api/test-runs", async (c) => {
  const projectId = c.req.query("project_id") || undefined;
  const limit = Number(c.req.query("limit") ?? "50");
  try {
    const rows = projectId ? await getTestRuns(projectId, limit) : await getTestRuns(undefined, limit);
    return c.json(rows);
  } catch {
    return c.json([]);
  }
});

app.get("/api/ci-runs", async (c) => {
  const projectId = c.req.query("project_id");
  let runs = await getCIRuns();
  if (projectId) {
    // CI runs have a repo field — filter by project name matching repo
    runs = runs.filter((r: any) => r.repo === projectId);
  }
  return c.json(runs);
});

app.get("/api/ci-runs/:id", async (c) => {
  const run = await getCIRun(c.req.param("id"));
  if (!run) return c.json({ error: "Not found" }, 404);
  return c.json(run);
});

app.get("/api/projections/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const projections = await getProjections(id);
  return c.json(projections);
});

app.get("/api/errors", async (c) => {
  const severity = c.req.query("severity") || undefined;
  const component = c.req.query("component") || undefined;
  const projectId = c.req.query("project_id") || undefined;
  const limit = Number(c.req.query("limit") ?? "100");
  const errors = await getErrors({ severity, component, limit, projectId });
  return c.json(errors);
});

app.get("/api/errors/summary", async (c) => {
  const summary = await getErrorSummary();
  return c.json(summary);
});

// ── Docker Events ────────────────────────────────────────────────

app.get("/api/docker-events", async (c) => {
  const severity = c.req.query("severity") || undefined;
  const action = c.req.query("action") || undefined;
  const service = c.req.query("service") || undefined;
  const limit = Number(c.req.query("limit") ?? "100");
  const events = await getDockerEvents({ severity, action, service, limit });
  return c.json(events);
});

app.get("/api/docker-events/summary", async (c) => {
  const summary = await getDockerEventsSummary();
  return c.json(summary);
});

app.post("/api/wipe", async (c) => {
  const deleted = await wipeAllEvents();
  return c.json({ deleted, message: `Erased ${deleted} events` });
});

serve({ fetch: app.fetch, port: UI_PORT }, () => {
  log.info({ port: UI_PORT }, "xtdb-event-logger-ui listening");
});

// ── Graceful shutdown ────────────────────────────────────────────
process.on("SIGTERM", () => { log.info("SIGTERM received, shutting down"); process.exit(0); });
process.on("SIGINT", () => { log.info("SIGINT received, shutting down"); process.exit(0); });
