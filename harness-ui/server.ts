import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderHome } from "./pages/home.ts";
import { renderSessions } from "./pages/sessions.ts";
import { renderSessionDetail } from "./pages/session-detail.ts";
import { renderDashboard } from "./pages/dashboard.ts";
import { renderDecisions } from "./pages/decisions.ts";
import { renderArtifacts, renderArtifactVersions } from "./pages/artifacts.ts";
import { renderProjects, renderProjectDetail } from "./pages/projects.ts";
import { renderOps } from "./pages/ops.ts";
import { renderChat } from "./pages/chat.ts";
import { renderErrors } from "./pages/errors.ts";
import { renderEventDetail } from "./pages/event-detail.ts";
import { renderFlow } from "./pages/flow.ts";
import { renderKnowledgePage } from "./pages/knowledge.ts";
import { renderStream } from "./pages/stream.ts";
import { renderGraph } from "./pages/graph.ts";

// ─── Config ────────────────────────────────────────────────────────

const UI_PORT = Number(process.env.UI_PORT ?? "3336");
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── App ───────────────────────────────────────────────────────────

const app = new Hono();

// ── Static files ───────────────────────────────────────────────────

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

app.get("/static/:file", (c) => {
  const file = c.req.param("file");
  if (file.includes("..") || file.includes("/")) return c.text("Not found", 404);
  const ext = "." + file.split(".").pop();
  const contentType = STATIC_TYPES[ext];
  if (!contentType) return c.text("Not found", 404);
  try {
    const content = readFileSync(join(__dirname, "static", file), "utf-8");
    return c.body(content, 200, { "Content-Type": contentType + "; charset=utf-8" });
  } catch {
    return c.text("Not found", 404);
  }
});

// ── Pages ──────────────────────────────────────────────────────────

app.get("/", async (c) => c.html(await renderHome()));
app.get("/sessions", async (c) => c.html(await renderSessions()));
app.get("/dashboard", async (c) => c.html(await renderDashboard()));
app.get("/decisions", async (c) => c.html(await renderDecisions()));
app.get("/artifacts", async (c) => c.html(await renderArtifacts()));
app.get("/projects", async (c) => c.html(await renderProjects()));
app.get("/errors", async (c) => {
  const severity = c.req.query("severity") || undefined;
  const component = c.req.query("component") || undefined;
  return c.html(await renderErrors({ severity, component }));
});
app.get("/stream", async (c) => c.html(await renderStream()));
app.get("/ops", async (c) => c.html(await renderOps()));
app.get("/chat", async (c) => c.html(await renderChat()));
app.get("/graph", async (c) => {
  const q = c.req.query("q") || undefined;
  const sparql = c.req.query("sparql") || undefined;
  return c.html(await renderGraph(q, sparql));
});

// SPARQL proxy to QLever
app.post("/api/sparql", async (c) => {
  const qleverUrl = process.env.QLEVER_URL ?? "http://localhost:7001";
  try {
    const body = await c.req.text();
    const resp = await fetch(qleverUrl, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    });
    const data = await resp.text();
    return c.body(data, resp.status, { "Content-Type": "application/json" });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Routes with path params (IDs contain slashes — need {.+} wildcard)
// Hono's {.+} is greedy — /sessions/:id{.+}/flow doesn't work because {.+} consumes /flow.
// So we use a single catch-all and dispatch based on suffix.
app.get("/sessions/:id{.+}", async (c) => {
  const raw = c.req.param("id");
  if (raw.endsWith("/flow")) {
    const sessionId = decodeURIComponent(raw.slice(0, -5));
    return c.html(await renderFlow(sessionId));
  }
  if (raw.endsWith("/knowledge")) {
    const sessionId = decodeURIComponent(raw.slice(0, -10));
    return c.html(await renderKnowledgePage(sessionId));
  }
  return c.html(await renderSessionDetail(raw));
});
app.get("/event/:id{.+}", async (c) => c.html(await renderEventDetail(c.req.param("id"))));
app.get("/projects/:id{.+}", async (c) => c.html(await renderProjectDetail(c.req.param("id"))));
app.get("/artifacts/versions", async (c) => {
  const path = c.req.query("path") ?? "";
  return c.html(await renderArtifactVersions(path));
});

// Proxy artifact content from :3333 so users stay on :3336
app.get("/artifacts/content/:id{.+}", async (c) => {
  const id = c.req.param("id");
  try {
    const upstream = `http://localhost:3333/artifacts/content/${encodeURIComponent(id)}`;
    const resp = await fetch(upstream);
    if (!resp.ok) return c.html(`<h1>Version not found</h1>`, 404);
    const html = await resp.text();
    return c.html(html);
  } catch {
    return c.html(`<h1>Event API unavailable</h1><p>Cannot reach localhost:3333</p>`, 502);
  }
});

// ── Start ──────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: UI_PORT }, () => {
  console.log(`🖥️  Harness UI running on http://localhost:${UI_PORT}`);
});
