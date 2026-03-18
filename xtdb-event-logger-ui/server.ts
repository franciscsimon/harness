import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { streamSSE } from "hono/streaming";
import {
  getEvents,
  getEventsSince,
  getEvent,
  getSessions,
  getSessionList,
  getSessionEvents,
  getStats,
  getMaxSeq,
  getDashboardSessions,
  getToolUsageStats,
  getSessionKnowledge,
  getErrorPatterns,
  getProjections,
  getProjects,
  getProject,
  getProjectSessions,
  getDecisions,
  getProjectDecisions,
  getArtifacts,
  getArtifactVersionSummaries,
  getArtifactReadCounts,
  getArtifactVersionsByPath,
  getArtifactReadsByPath,
  getArtifactVersion,
  getAdjacentVersions,
  wipeAllEvents,
} from "./lib/db.ts";
import { compactEvent } from "./lib/format.ts";
import { computeHealthScore, healthColor } from "./lib/health.ts";
import { generateKnowledgeMarkdown } from "./lib/knowledge.ts";
import { renderIndex } from "./pages/index.ts";
import { renderEventDetail } from "./pages/event-detail.ts";
import { renderSessions } from "./pages/sessions.ts";
import { renderSessionDetail } from "./pages/session-detail.ts";
import { renderDashboard } from "./pages/dashboard.ts";
import { renderKnowledge } from "./pages/knowledge.ts";
import { renderFlow } from "./pages/flow.ts";
import { renderProjects, renderProjectDetail } from "./pages/projects.ts";
import { renderDecisions, renderProjectDecisionsSection } from "./pages/decisions.ts";
import { renderArtifacts } from "./pages/artifacts.ts";
import { renderArtifactVersions } from "./pages/artifact-versions.ts";
import { renderArtifactContent } from "./pages/artifact-content.ts";

// ─── Config ────────────────────────────────────────────────────────

const UI_PORT = Number(process.env.UI_PORT ?? "3333");
const POLL_MS = Number(process.env.UI_POLL_MS ?? "500");

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── App ───────────────────────────────────────────────────────────

const app = new Hono();

// ── Static files ───────────────────────────────────────────────────

app.get("/static/:file", (c) => {
  const file = c.req.param("file");
  // Only serve known files
  const allowed: Record<string, string> = {
    "style.css": "text/css",
    "stream.js": "application/javascript",
    "session.js": "application/javascript",
    "dashboard.js": "application/javascript",
  };
  const contentType = allowed[file];
  if (!contentType) return c.text("Not found", 404);

  try {
    const content = readFileSync(join(__dirname, "static", file), "utf-8");
    return c.body(content, 200, { "Content-Type": contentType + "; charset=utf-8" });
  } catch {
    return c.text("Not found", 404);
  }
});

// ── HTML Pages ─────────────────────────────────────────────────────

app.get("/", async (c) => {
  const [sessions, stats] = await Promise.all([getSessions(), getStats()]);
  const html = renderIndex(sessions, stats);
  return c.html(html);
});

app.get("/sessions", async (c) => {
  const sessions = await getSessionList();
  return c.html(renderSessions(sessions));
});

app.get("/dashboard", async (c) => {
  const [sessions, tools, errors] = await Promise.all([getDashboardSessions(), getToolUsageStats(), getErrorPatterns()]);
  return c.html(renderDashboard(sessions, tools, errors));
});

app.get("/projects", async (c) => {
  const projects = await getProjects();
  return c.html(renderProjects(projects));
});

app.get("/projects/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const project = await getProject(id);
  if (!project) return c.html("<h1>Project not found</h1>", 404);
  const [sessions, decisions] = await Promise.all([getProjectSessions(id), getProjectDecisions(id)]);
  const decisionsHtml = renderProjectDecisionsSection(decisions);
  return c.html(renderProjectDetail(project, sessions, decisionsHtml));
});

app.get("/decisions", async (c) => {
  const [decisions, projects] = await Promise.all([getDecisions(), getProjects()]);
  return c.html(renderDecisions(decisions, projects));
});

app.get("/artifacts", async (c) => {
  const [artifacts, projects, versionSummaries, readCounts] = await Promise.all([
    getArtifacts(), getProjects(), getArtifactVersionSummaries(), getArtifactReadCounts()
  ]);
  return c.html(renderArtifacts(artifacts, projects, versionSummaries, readCounts));
});

app.get("/artifacts/versions", async (c) => {
  const path = c.req.query("path") ?? "";
  if (!path) return c.html("<h1>Missing path parameter</h1>", 400);
  const [versions, reads] = await Promise.all([
    getArtifactVersionsByPath(path), getArtifactReadsByPath(path)
  ]);
  if (versions.length === 0) return c.html("<h1>No versions found for this path</h1>", 404);
  return c.html(renderArtifactVersions(path, versions, reads));
});

app.get("/artifacts/content/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const version = await getArtifactVersion(id);
  if (!version) return c.html("<h1>Version not found</h1>", 404);
  const { prev, next } = await getAdjacentVersions(version.path, Number(version.ts));
  return c.html(renderArtifactContent(version, prev, next));
});

app.get("/sessions/:id{.+}/flow", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const projections = await getProjections(id);
  return c.html(renderFlow(id, projections));
});

app.get("/sessions/:id{.+}/knowledge", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const knowledge = await getSessionKnowledge(id);
  if (!knowledge) return c.html("<h1>Session not found</h1>", 404);
  return c.html(renderKnowledge(id, knowledge));
});

app.get("/sessions/:id{.+}", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const events = await getSessionEvents(id);
  if (events.length === 0) return c.html("<h1>Session not found</h1>", 404);
  return c.html(renderSessionDetail(id, events));
});

app.get("/event/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getEvent(id);
  if (!row) return c.html("<h1>Event not found</h1>", 404);
  return c.html(renderEventDetail(row));
});

// ── JSON API ───────────────────────────────────────────────────────

app.get("/api/events/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    // Send initial batch (last 50 events, newest first → reverse for chronological)
    let lastSeq = -1;
    try {
      const initial = await getEvents({ limit: 50 });
      const reversed = initial.reverse(); // oldest first for client prepend order
      for (const row of reversed) {
        const ev = compactEvent(row);
        await stream.writeSSE({ event: "event", data: JSON.stringify(ev) });
        const seq = Number(row.seq);
        if (seq > lastSeq) lastSeq = seq;
      }

      // Send initial stats
      const stats = await getStats();
      await stream.writeSSE({ event: "stats", data: JSON.stringify(stats) });
    } catch (err) {
      console.error("[ui] Initial SSE fetch failed:", err);
    }

    // Poll loop
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

        // Update stats periodically when there are new events
        if (newRows.length > 0) {
          const stats = await getStats();
          await stream.writeSSE({ event: "stats", data: JSON.stringify(stats) });
        }
      } catch (err) {
        // XTDB might be temporarily unavailable — keep trying
        console.error("[ui] SSE poll error:", err);
      }
    }
  });
});

// ── JSON API (after SSE to avoid route conflict) ───────────────────

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
  const sessions = await getSessionList();
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
  const [sessions, tools, errors] = await Promise.all([getDashboardSessions(), getToolUsageStats(), getErrorPatterns()]);
  const ranked = sessions.map((s) => ({
    ...s,
    healthScore: computeHealthScore(s),
    healthColor: healthColor(computeHealthScore(s)),
  }));
  return c.json({
    totalSessions: sessions.length,
    totalEvents: sessions.reduce((s, r) => s + r.eventCount, 0),
    avgEventsPerSession: sessions.length > 0 ? Math.round(sessions.reduce((s, r) => s + r.eventCount, 0) / sessions.length) : 0,
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
  const projectId = c.req.query("project_id");
  const decisions = projectId ? await getProjectDecisions(projectId) : await getDecisions();
  const filtered = sessionId ? decisions.filter(d => d.session_id === sessionId) : decisions;
  return c.json(filtered);
});

app.get("/api/artifacts", async (c) => {
  const sessionId = c.req.query("session_id");
  const artifacts = await getArtifacts();
  const filtered = sessionId ? artifacts.filter(a => a.session_id === sessionId) : artifacts;
  return c.json(filtered);
});

app.post("/api/wipe", async (c) => {
  const deleted = await wipeAllEvents();
  return c.json({ deleted, message: `Erased ${deleted} events` });
});

// ─── Start ─────────────────────────────────────────────────────────

console.log(`\n  📊 XTDB Event Stream UI`);
console.log(`  → http://localhost:${UI_PORT}\n`);

serve({ fetch: app.fetch, port: UI_PORT });
