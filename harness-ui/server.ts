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
import { renderProjects, renderProjectDetail } from "./pages/projects.ts";
import { renderOps } from "./pages/ops.ts";
import { renderChat } from "./pages/chat.ts";
import { renderErrors } from "./pages/errors.ts";
import { renderEventDetail } from "./pages/event-detail.ts";
import { renderFlow } from "./pages/flow.ts";
import { renderKnowledgePage } from "./pages/knowledge.ts";
import { renderStream } from "./pages/stream.ts";
import { renderGraph } from "./pages/graph.ts";
import { renderCIRuns } from "./pages/ci-runs.ts";
import { renderGitRepos } from "./pages/git.ts";

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
app.get("/ci", async (c) => c.html(await renderCIRuns()));
app.get("/git", async (c) => c.html(await renderGitRepos()));
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
    // Tar repos inside container, copy out
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
    // Copy into container and extract
    execSync(`docker cp "${hostPath}" soft-serve:/tmp/repos-restore.tar.gz`, { timeout: 30000 });
    execSync(`docker exec soft-serve tar xzf /tmp/repos-restore.tar.gz -C /soft-serve`, { timeout: 60000 });
    execSync(`docker exec soft-serve rm -f /tmp/repos-restore.tar.gz`, { timeout: 5000 });
    // Restart Soft Serve to pick up restored repos
    execSync(`docker restart soft-serve`, { timeout: 30000 });
    return c.json({ success: true, restored: filename });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// CI notification — receives POST from runner, logs to console
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

// Graph refresh — runs the full pipeline: parse AST → export triples → re-index QLever
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
      break; // stop on first failure
    }
  }
  const allOk = results.every((r) => r.ok);
  return c.json({ success: allOk, steps: results }, allOk ? 200 : 500);
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
