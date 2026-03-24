import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createLogger } from "../lib/logger.ts";
import { requestLogger } from "../lib/request-logger.ts";
import { apiMetrics } from "../lib/api-metrics.ts";
import { getMetricsSummary } from "../lib/api-metrics.ts";
import { validateBody } from "../lib/validate.ts";
import * as v from "valibot";
import { renderArtifacts, renderArtifactVersions } from "./pages/artifacts.ts";
import { renderAuth } from "./pages/auth.ts";
import { renderBuildDetail, renderBuilds } from "./pages/builds.ts";
import { renderChat } from "./pages/chat.ts";
import { renderCIRunDetail } from "./pages/ci-run-detail.ts";
import { renderCIRuns } from "./pages/ci-runs.ts";
import { renderDashboard } from "./pages/dashboard.ts";
import { renderDecisions } from "./pages/decisions.ts";
import { renderDeploys } from "./pages/deploys.ts";
import { renderDockerEvents } from "./pages/docker-events.ts";
import { renderErrors } from "./pages/errors.ts";
import { renderEventDetail } from "./pages/event-detail.ts";
import { renderFlow } from "./pages/flow.ts";
import { renderGitRepos } from "./pages/git.ts";
import { renderGitDetail } from "./pages/git-detail.ts";
import { renderGraph } from "./pages/graph.ts";
import { renderHome } from "./pages/home.ts";
import { renderKnowledgePage } from "./pages/knowledge.ts";
import { renderOps } from "./pages/ops.ts";
import { renderSessionDetail } from "./pages/session-detail.ts";
import { renderSessions } from "./pages/sessions.ts";
import { renderStream } from "./pages/stream.ts";

// ─── Config ────────────────────────────────────────────────────────

const UI_PORT = Number(process.env.UI_PORT ?? "3336");
const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger("harness-ui");

// ─── App ───────────────────────────────────────────────────────────

const app = new Hono();
app.use("*", requestLogger(log));
app.use("*", apiMetrics(log));

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
  const ext = `.${file.split(".").pop()}`;
  const contentType = STATIC_TYPES[ext];
  if (!contentType) return c.text("Not found", 404);
  try {
    const content = readFileSync(join(__dirname, "static", file), "utf-8");
    return c.body(content, 200, { "Content-Type": `${contentType}; charset=utf-8` });
  } catch {
    return c.text("Not found", 404);
  }
});

// ── Global pages (main nav) ────────────────────────────────────────

app.get("/", async (c) => c.html(await renderHome()));
app.get("/projects", (c) => c.redirect("/"));
app.get("/chat", async (c) => c.html(await renderChat()));
app.get("/auth", async (c) => c.html(await renderAuth()));

// ── Project-scoped pages ───────────────────────────────────────────
// All pages live under /projects/:projectId/:section
// The catch-all route dispatches to the correct page renderer.

app.get("/projects/:projectId/sessions/:sid{.+}", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const raw = c.req.param("sid");
  if (raw.endsWith("/flow")) {
    const sessionId = decodeURIComponent(raw.slice(0, -5));
    return c.html(await renderFlow(sessionId, projectId));
  }
  if (raw.endsWith("/knowledge")) {
    const sessionId = decodeURIComponent(raw.slice(0, -10));
    return c.html(await renderKnowledgePage(sessionId, projectId));
  }
  return c.html(await renderSessionDetail(raw, projectId));
});

app.get("/projects/:projectId/git/:repoName", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const repoName = decodeURIComponent(c.req.param("repoName"));
  return c.html(await renderGitDetail(repoName, projectId));
});

app.get("/projects/:projectId/ci/:runId{.+}", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const runId = decodeURIComponent(c.req.param("runId"));
  return c.html(await renderCIRunDetail(runId, projectId));
});

app.get("/projects/:projectId/builds/:buildId{.+}", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const buildId = decodeURIComponent(c.req.param("buildId"));
  return c.html(await renderBuildDetail(buildId, projectId));
});

app.post("/projects/:projectId/builds/trigger", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const buildUrl = process.env.BUILD_SERVICE_URL ?? "http://build-service:3339";
  try {
    await fetch(`${buildUrl}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "harness", trigger: "manual" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* intentionally silent — best-effort trigger */
  }
  return c.redirect(`/projects/${projectId}/builds`);
});

app.get("/projects/:projectId/events/:eventId{.+}", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const eventId = c.req.param("eventId");
  return c.html(await renderEventDetail(eventId, projectId));
});

app.get("/projects/:projectId/artifacts/versions", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const path = c.req.query("path") ?? "";
  return c.html(await renderArtifactVersions(path, projectId));
});

app.get("/projects/:projectId/:section", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const section = c.req.param("section");

  switch (section) {
    case "sessions":
      return c.html(await renderSessions(projectId));
    case "stream":
      return c.html(await renderStream(projectId));
    case "dashboard":
      return c.html(await renderDashboard(projectId));
    case "decisions":
      return c.html(await renderDecisions(projectId));
    case "artifacts":
      return c.html(await renderArtifacts(projectId));
    case "errors": {
      const severity = c.req.query("severity") || undefined;
      const component = c.req.query("component") || undefined;
      return c.html(await renderErrors({ severity, component }, projectId));
    }
    case "ci":
      return c.html(await renderCIRuns(projectId));
    case "builds":
      return c.html(await renderBuilds(projectId));
    case "git":
      return c.html(await renderGitRepos(projectId));
    case "graph": {
      const q = c.req.query("q") || undefined;
      const sparql = c.req.query("sparql") || undefined;
      return c.html(await renderGraph(q, sparql, projectId));
    }
    case "ops":
      return c.html(await renderOps(projectId));
    case "deploys":
      return c.html(await renderDeploys(projectId));
    case "docker-events":
      return c.html(await renderDockerEvents(projectId));
    default:
      return c.text("Not found", 404);
  }
});

// Bare project route → redirect to overview
app.get("/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  return c.redirect(`/projects/${encodeURIComponent(projectId)}/sessions`);
});

// ── API endpoints ──────────────────────────────────────────────────

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

// ── Event-API proxy (browser can't reach event-api directly) ───
const EVENT_API = process.env.EVENT_API_URL ?? "http://event-api:3333";

// SSE stream proxy
app.get("/api/events/stream", async (c) => {
  try {
    const upstream = await fetch(`${EVENT_API}/api/events/stream`, {
      signal: AbortSignal.timeout(0), // no timeout — SSE is long-lived
      headers: { Accept: "text/event-stream" },
    });
    if (!upstream.ok) return c.text("Upstream error", 502);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return c.text(`SSE proxy error: ${(e as Error).message}`, 502);
  }
});

// Events REST proxy
app.get("/api/events", async (c) => {
  try {
    const qs = c.req.url.includes("?") ? `?${c.req.url.split("?")[1]}` : "";
    const r = await fetch(`${EVENT_API}/api/events${qs}`, { signal: AbortSignal.timeout(10_000) });
    const data = await r.json();
    return c.json(data, r.status as any);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Sessions REST proxy (for chat.js dashboard link)
app.get("/api/sessions/:path{.+}", async (c) => {
  try {
    const path = c.req.param("path");
    const r = await fetch(`${EVENT_API}/api/sessions/${path}`, { signal: AbortSignal.timeout(10_000) });
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("json")) return c.json(await r.json(), r.status as any);
    return c.body(await r.text(), r.status as any, { "Content-Type": ct });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// CI job enqueue — receives POST from Soft Serve hook, writes job file for runner
const CIEnqueueSchema = v.object({
  repo: v.string(),
  ref: v.optional(v.string(), "refs/heads/main"),
  commit: v.optional(v.string()),
  commitHash: v.optional(v.string()),
  commitMessage: v.optional(v.string(), ""),
  pusher: v.optional(v.string(), "unknown"),
});

app.post("/api/ci/enqueue", async (c) => {
  try {
    const parsed = await validateBody(c, CIEnqueueSchema);
    if (parsed.error) return parsed.response;
    const { repo, ref, commit, commitHash, commitMessage, pusher } = parsed.data;
    const hash = commitHash ?? commit;
    if (!hash) return c.json({ error: "Missing commitHash or commit" }, 400);

    const { randomUUID } = await import("node:crypto");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { homedir } = await import("node:os");

    const queueDir = process.env.CI_QUEUE_DIR ?? pathJoin(homedir(), ".ci-runner", "queue");
    mkdirSync(queueDir, { recursive: true });

    const job = {
      id: `ci-${Date.now()}-${randomUUID().slice(0, 8)}`,
      repo,
      ref: ref ?? "refs/heads/main",
      commitHash: hash,
      commitMessage: commitMessage ?? "",
      pusher: pusher ?? "unknown",
      timestamp: Date.now(),
    };

    const jobFile = pathJoin(queueDir, `${job.id}.json`);
    writeFileSync(jobFile, JSON.stringify(job, null, 2));

    return c.json({ queued: true, id: job.id, file: jobFile });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Git repo backup/restore via Soft Serve container
app.post("/api/git/backup", async (c) => {
  try {
    const { execSync } = await import("node:child_process");
    const { join: pathJoin } = await import("node:path");
    const { mkdirSync } = await import("node:fs");
    const backupDir = pathJoin(__dirname, "..", "data", "backups");
    mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `git-repos-${ts}.tar.gz`;
    const hostPath = pathJoin(backupDir, filename);
    execSync(`docker exec soft-serve tar czf /tmp/repos-backup.tar.gz -C /soft-serve repos`, { timeout: 60000 });
    execSync(`docker cp soft-serve:/tmp/repos-backup.tar.gz "${hostPath}"`, { timeout: 30000 });
    execSync(`docker exec soft-serve rm -f /tmp/repos-backup.tar.gz`, { timeout: 5000 });
    const { statSync } = await import("node:fs");
    const size = statSync(hostPath).size;
    return c.json({ success: true, filename, path: hostPath, sizeBytes: size });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/api/git/backups", async (c) => {
  try {
    const { join: pathJoin } = await import("node:path");
    const { readdirSync, statSync } = await import("node:fs");
    const backupDir = pathJoin(__dirname, "..", "data", "backups");
    const files = readdirSync(backupDir)
      .filter((f) => f.startsWith("git-repos-") && f.endsWith(".tar.gz"))
      .sort()
      .reverse();
    const backups = files.map((f) => {
      const st = statSync(pathJoin(backupDir, f));
      return { filename: f, sizeBytes: st.size, created: st.mtime.toISOString() };
    });
    return c.json(backups);
  } catch {
    return c.json([]);
  }
});

const GitRestoreSchema = v.object({ filename: v.string() });

app.post("/api/git/restore", async (c) => {
  try {
    const parsed = await validateBody(c, GitRestoreSchema);
    if (parsed.error) return parsed.response;
    const { filename } = parsed.data;
    if (filename.includes("..")) return c.json({ error: "Invalid filename" }, 400);
    const { execSync } = await import("node:child_process");
    const { join: pathJoin } = await import("node:path");
    const { existsSync } = await import("node:fs");
    const hostPath = pathJoin(__dirname, "..", "data", "backups", filename);
    if (!existsSync(hostPath)) return c.json({ error: "Backup not found" }, 404);
    execSync(`docker cp "${hostPath}" soft-serve:/tmp/repos-restore.tar.gz`, { timeout: 30000 });
    execSync(`docker exec soft-serve tar xzf /tmp/repos-restore.tar.gz -C /soft-serve`, { timeout: 60000 });
    execSync(`docker exec soft-serve rm -f /tmp/repos-restore.tar.gz`, { timeout: 5000 });
    execSync(`docker restart soft-serve`, { timeout: 30000 });
    return c.json({ success: true, restored: filename });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Process Compose proxy ────────────────────────────────────────
const PC_API = process.env.PC_API ?? "http://localhost:8080";

app.get("/api/pc/processes", async (c) => {
  try {
    const r = await fetch(`${PC_API}/processes`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return c.json({ error: `PC returned ${r.status}` }, 502);
    return c.json(await r.json());
  } catch {
    return c.json({ error: "process-compose not reachable" }, 503);
  }
});

app.post("/api/pc/restart/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/restart/${name}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch {
    return c.json({ error: "process-compose not reachable" }, 503);
  }
});

app.post("/api/pc/stop/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/stop/${name}`, { method: "PATCH", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch {
    return c.json({ error: "process-compose not reachable" }, 503);
  }
});

app.post("/api/pc/start/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/start/${name}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch {
    return c.json({ error: "process-compose not reachable" }, 503);
  }
});

app.get("/api/pc/logs/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/logs/${name}?limit=100`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return c.json({ error: `PC returned ${r.status}` }, 502);
    return c.json(await r.json());
  } catch {
    return c.json({ error: "process-compose not reachable" }, 503);
  }
});

// Deploy API — trigger rolling container deploy
const DeploySchema = v.object({
  commitHash: v.optional(v.string()),
  service: v.optional(v.string()),
  trigger: v.optional(v.string(), "manual"),
});

app.post("/api/deploy", async (c) => {
  try {
    const parsed = await validateBody(c, DeploySchema);
    if (parsed.error) return parsed.response;
    const { commitHash, service, trigger } = parsed.data;

    // Read service definitions from embedded config
    const services = service ? [service] : ["event-api", "chat-ws", "ops-api", "harness-ui", "ci-runner"];

    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const svcName of services) {
      try {
        // Pull latest image and recreate container
        execSync(`docker compose -p harness -f /app/docker-compose.yml up -d --no-deps --pull always ${svcName}`, {
          timeout: 120_000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        results.push({ name: svcName, ok: true });
      } catch (e: any) {
        results.push({ name: svcName, ok: false, error: e.stderr?.slice(0, 200) ?? String(e).slice(0, 200) });
      }
    }

    const allOk = results.every((r) => r.ok);
    return c.json({ success: allOk, trigger, commitHash, services: results }, allOk ? 200 : 207);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Deploy history
app.get("/api/deploy/history", async (c) => {
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const historyPath = join(__dirname, "..", "data", "deploy-history.json");
    if (!existsSync(historyPath)) return c.json({ deploys: [] });
    return c.json(JSON.parse(readFileSync(historyPath, "utf-8")));
  } catch {
    return c.json({ deploys: [] });
  }
});

// CI notification
app.post("/api/ci/notify", async (c) => {
  try {
    const body = await c.req.json();
    const _emoji = body.status === "passed" ? "✅" : "❌";
    return c.json({ received: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// Graph refresh
app.post("/api/graph/refresh", async (c) => {
  const root = join(__dirname, "..");
  const steps: { name: string; cmd: string }[] = [
    { name: "Parse call graph", cmd: "NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts" },
    { name: "Export triples", cmd: "NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts" },
    { name: "Re-index QLever", cmd: "./scripts/qlever-index.sh" },
  ];
  const results: { step: string; ok: boolean; duration: number; output?: string }[] = [];
  for (const { name, cmd } of steps) {
    const t0 = Date.now();
    try {
      const out = execSync(cmd, { cwd: root, timeout: 120_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      results.push({ step: name, ok: true, duration: Date.now() - t0, output: out.slice(-200) });
    } catch (e: any) {
      results.push({
        step: name,
        ok: false,
        duration: Date.now() - t0,
        output: (e.stderr || e.message || "").slice(-300),
      });
      break;
    }
  }
  const allOk = results.every((r) => r.ok);
  return c.json({ success: allOk, steps: results }, allOk ? 200 : 500);
});

// Proxy artifact content from :3333
app.get("/artifacts/content/:id{.+}", async (c) => {
  const id = c.req.param("id");
  try {
    const upstream = `${process.env.EVENT_API_URL ?? "http://localhost:3333"}/artifacts/content/${encodeURIComponent(id)}`;
    const resp = await fetch(upstream);
    if (!resp.ok) return c.html(`<h1>Version not found</h1>`, 404);
    const html = await resp.text();
    return c.html(html);
  } catch {
    return c.html(`<h1>Event API unavailable</h1><p>Cannot reach localhost:3333</p>`, 502);
  }
});

// ── Auth management (upload/status/delete auth.json for chat-ws) ──

const CHAT_AUTH_DIR = process.env.CHAT_AUTH_DIR ?? "/app/chat-auth";

app.get("/api/auth/status", async (c) => {
  try {
    const authPath = join(CHAT_AUTH_DIR, "auth.json");
    const { existsSync, readFileSync } = await import("node:fs");
    if (!existsSync(authPath)) {
      return c.json({ configured: false });
    }
    const data = JSON.parse(readFileSync(authPath, "utf-8"));
    // Return provider names only, never tokens
    const providers = Object.keys(data).filter((k) => data[k]?.type);
    return c.json({ configured: true, providers });
  } catch (e) {
    return c.json({ configured: false, error: (e as Error).message }, 500);
  }
});

const AuthUploadSchema = v.object({
  auth: v.pipe(v.record(v.string(), v.unknown()), v.check((o) => Object.keys(o).length > 0, "Empty auth object")),
});

app.post("/api/auth/upload", async (c) => {
  try {
    const parsed = await validateBody(c, AuthUploadSchema);
    if (parsed.error) return parsed.response;
    const authJson = parsed.data.auth;
    const keys = Object.keys(authJson);
    const { mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
    mkdirSync(CHAT_AUTH_DIR, { recursive: true });
    const authPath = join(CHAT_AUTH_DIR, "auth.json");
    writeFileSync(authPath, JSON.stringify(authJson, null, 2), "utf-8");
    chmodSync(authPath, 0o600);
    return c.json({ success: true, providers: keys.filter((k) => authJson[k]?.type) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.post("/api/auth/delete", async (c) => {
  try {
    const { existsSync, unlinkSync } = await import("node:fs");
    const authPath = join(CHAT_AUTH_DIR, "auth.json");
    if (existsSync(authPath)) unlinkSync(authPath);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Start ──────────────────────────────────────────────────────────

app.get("/api/metrics", (c) => c.json(getMetricsSummary()));
serve({ fetch: app.fetch, port: UI_PORT }, () => {
  log.info({ port: UI_PORT }, "harness-ui listening");
});
