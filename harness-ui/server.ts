import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderHome } from "./pages/home.ts";
import { renderSessions } from "./pages/sessions.ts";
import { renderSessionDetail } from "./pages/session-detail.ts";
import { renderDashboard } from "./pages/dashboard.ts";
import { renderDecisions } from "./pages/decisions.ts";
import { renderArtifacts, renderArtifactVersions } from "./pages/artifacts.ts";

import { renderOps } from "./pages/ops.ts";
import { renderChat } from "./pages/chat.ts";
import { renderErrors } from "./pages/errors.ts";
import { renderEventDetail } from "./pages/event-detail.ts";
import { renderFlow } from "./pages/flow.ts";
import { renderKnowledgePage } from "./pages/knowledge.ts";
import { renderStream } from "./pages/stream.ts";
import { renderGraph } from "./pages/graph.ts";
import { renderCIRuns } from "./pages/ci-runs.ts";
import { renderCIRunDetail } from "./pages/ci-run-detail.ts";
import { renderGitRepos } from "./pages/git.ts";
import { renderDeploys } from "./pages/deploys.ts";
import { renderDockerEvents } from "./pages/docker-events.ts";

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

// ── Global pages (main nav) ────────────────────────────────────────

app.get("/", async (c) => c.html(await renderHome()));
app.get("/projects", (c) => c.redirect("/"));
app.get("/chat", async (c) => c.html(await renderChat()));

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

app.get("/projects/:projectId/ci/:runId{.+}", async (c) => {
  const projectId = decodeURIComponent(c.req.param("projectId"));
  const runId = decodeURIComponent(c.req.param("runId"));
  return c.html(await renderCIRunDetail(runId, projectId));
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

// CI job enqueue — receives POST from Soft Serve hook, writes job file for runner
app.post("/api/ci/enqueue", async (c) => {
  try {
    const body = await c.req.json();
    const { repo, ref, commitHash, commitMessage, pusher } = body;
    if (!repo || !commitHash) return c.json({ error: "Missing repo or commitHash" }, 400);

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
      commitHash,
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
    const files = readdirSync(backupDir).filter(f => f.startsWith("git-repos-") && f.endsWith(".tar.gz")).sort().reverse();
    const backups = files.map(f => {
      const st = statSync(pathJoin(backupDir, f));
      return { filename: f, sizeBytes: st.size, created: st.mtime.toISOString() };
    });
    return c.json(backups);
  } catch { return c.json([]); }
});

app.post("/api/git/restore", async (c) => {
  try {
    const { filename } = await c.req.json();
    if (!filename || filename.includes("..")) return c.json({ error: "Invalid filename" }, 400);
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
  } catch { return c.json({ error: "process-compose not reachable" }, 503); }
});

app.post("/api/pc/restart/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/restart/${name}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch { return c.json({ error: "process-compose not reachable" }, 503); }
});

app.post("/api/pc/stop/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/stop/${name}`, { method: "PATCH", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch { return c.json({ error: "process-compose not reachable" }, 503); }
});

app.post("/api/pc/start/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/start/${name}`, { method: "POST", signal: AbortSignal.timeout(10000) });
    return c.json({ success: r.ok, status: r.status });
  } catch { return c.json({ error: "process-compose not reachable" }, 503); }
});

app.get("/api/pc/logs/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const r = await fetch(`${PC_API}/process/logs/${name}?limit=100`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return c.json({ error: `PC returned ${r.status}` }, 502);
    return c.json(await r.json());
  } catch { return c.json({ error: "process-compose not reachable" }, 503); }
});

// Deploy API — trigger rolling container deploy
app.post("/api/deploy", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { commitHash, service, trigger = "manual" } = body as any;
    console.log(`[Deploy] Triggered by ${trigger}${commitHash ? ` for ${commitHash.slice(0, 8)}` : ""}${service ? ` (service: ${service})` : ""}`);

    // Read service definitions from embedded config
    const services = service
      ? [service]
      : ["event-api", "chat-ws", "ops-api", "harness-ui", "ci-runner"];

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
        console.log(`[Deploy] ✅ ${svcName} deployed`);
      } catch (e: any) {
        results.push({ name: svcName, ok: false, error: e.stderr?.slice(0, 200) ?? String(e).slice(0, 200) });
        console.error(`[Deploy] ❌ ${svcName} failed: ${e.stderr?.slice(0, 100)}`);
      }
    }

    const allOk = results.every(r => r.ok);
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
    const emoji = body.status === "passed" ? "✅" : "❌";
    console.log(`[CI] ${emoji} ${body.repo}@${body.commitHash?.slice(0, 8)} — ${body.status} (${body.durationMs}ms, ${body.stepsFailed}/${body.stepsTotal} failed)`);
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
      results.push({ step: name, ok: false, duration: Date.now() - t0, output: (e.stderr || e.message || "").slice(-300) });
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

// ── Start ──────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: UI_PORT }, () => {
  console.log(`🖥️  Harness UI running on http://localhost:${UI_PORT}`);
});
