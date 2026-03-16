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
  const [sessions, tools] = await Promise.all([getDashboardSessions(), getToolUsageStats()]);
  return c.html(renderDashboard(sessions, tools));
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
  const [sessions, tools] = await Promise.all([getDashboardSessions(), getToolUsageStats()]);
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
  });
});

app.get("/api/sessions/:id{.+}/knowledge", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const knowledge = await getSessionKnowledge(id);
  if (!knowledge) return c.json({ error: "Session not found" }, 404);
  const md = generateKnowledgeMarkdown(id, knowledge);
  return c.text(md, 200, { "Content-Type": "text/markdown; charset=utf-8" });
});

app.post("/api/wipe", async (c) => {
  const deleted = await wipeAllEvents();
  return c.json({ deleted, message: `Erased ${deleted} events` });
});

// ─── Start ─────────────────────────────────────────────────────────

console.log(`\n  📊 XTDB Event Stream UI`);
console.log(`  → http://localhost:${UI_PORT}\n`);

serve({ fetch: app.fetch, port: UI_PORT });
