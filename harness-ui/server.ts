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
app.get("/ops", async (c) => c.html(await renderOps()));
app.get("/chat", async (c) => c.html(await renderChat()));

// Routes with path params (IDs contain slashes — need {.+} wildcard)
app.get("/sessions/:id{.+}", async (c) => c.html(await renderSessionDetail(c.req.param("id"))));
app.get("/projects/:id{.+}", async (c) => c.html(await renderProjectDetail(c.req.param("id"))));
app.get("/artifacts/versions", async (c) => {
  const path = c.req.query("path") ?? "";
  return c.html(await renderArtifactVersions(path));
});

// ── Start ──────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: UI_PORT }, () => {
  console.log(`🖥️  Harness UI running on http://localhost:${UI_PORT}`);
});
