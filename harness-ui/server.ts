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
import { renderArtifacts } from "./pages/artifacts.ts";
import { renderProjects } from "./pages/projects.ts";
import { renderOps } from "./pages/ops.ts";
import { renderChat } from "./pages/chat.ts";

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
  // Prevent directory traversal
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

app.get("/", async (c) => {
  const html = await renderHome();
  return c.html(html);
});

app.get("/sessions", async (c) => {
  const html = await renderSessions();
  return c.html(html);
});

app.get("/sessions/:id", async (c) => {
  const html = await renderSessionDetail(c.req.param("id"));
  return c.html(html);
});

app.get("/dashboard", async (c) => {
  const html = await renderDashboard();
  return c.html(html);
});

app.get("/decisions", async (c) => {
  const html = await renderDecisions();
  return c.html(html);
});

app.get("/artifacts", async (c) => {
  const html = await renderArtifacts();
  return c.html(html);
});

app.get("/projects", async (c) => {
  const html = await renderProjects();
  return c.html(html);
});

app.get("/ops", async (c) => {
  const html = await renderOps();
  return c.html(html);
});

app.get("/chat", async (c) => {
  const html = await renderChat();
  return c.html(html);
});

// ── Start ──────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: UI_PORT }, () => {
  console.log(`🖥️  Harness UI running on http://localhost:${UI_PORT}`);
});
