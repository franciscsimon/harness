import type { ProjectRow, SessionProjectRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

// ─── Identity type badge colors ────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "git-remote": "#3b82f6",
  "git-local": "#8b5cf6",
  path: "#f97316",
};

// ─── Project List Page ─────────────────────────────────────────────

export function renderProjects(projects: ProjectRow[]): string {
  const cards = projects
    .map((p) => {
      const color = TYPE_COLORS[p.identity_type] ?? "#6b7280";
      const sessions = Number(p.session_count) || 0;
      return `<a class="proj-card" href="/projects/${encodeURIComponent(p._id)}">
      <div class="proj-card-top">
        <span class="proj-card-name">${esc(p.name)}</span>
        <span class="proj-type-badge" style="--type-color:${color}">${esc(p.identity_type)}</span>
        <span class="ses-card-count">${sessions} session${sessions !== 1 ? "s" : ""}</span>
      </div>
      <div class="proj-card-meta">
        <code class="proj-canonical">${esc(p.canonical_id)}</code>
      </div>
      <div class="proj-card-meta">
        <span>First seen: ${relativeTime(p.first_seen_ts)}</span>
        <span>Last seen: ${relativeTime(p.last_seen_ts)}</span>
      </div>
      ${p.git_remote_url ? `<div class="proj-card-meta"><span>Remote: <code>${esc(p.git_remote_url)}</code></span></div>` : ""}
      ${p.git_root_path ? `<div class="proj-card-meta"><span>Path: <code>${esc(p.git_root_path)}</code></span></div>` : ""}
    </a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projects — XTDB Event Stream</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        📁 Projects
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">📂 Sessions</a>
        <span class="header-sep">·</span>
        <a href="/decisions" class="back-link">📋 Decisions</a>
        <span class="header-sep">·</span>
        <a href="/artifacts" class="back-link">📦 Artifacts</a>
        <span class="header-sep">·</span>
        <a href="/dashboard" class="back-link">📊 Dashboard</a>
        <span class="header-sep">·</span>
        <a href="http://localhost:3334" class="back-link">💬 Chat</a>
      </h1>
      <span class="total-badge">${projects.length} project${projects.length !== 1 ? "s" : ""}</span>
    </div>
  </header>

  <main class="ses-list">
    ${projects.length === 0 ? '<p class="empty-msg">No projects registered yet. Start a pi session in a directory to auto-register.</p>' : cards}
  </main>
</body>
</html>`;
}

// ─── Project Detail Page ───────────────────────────────────────────

export function renderProjectDetail(project: ProjectRow, sessions: SessionProjectRow[], decisionsHtml?: string): string {
  const color = TYPE_COLORS[project.identity_type] ?? "#6b7280";

  const sessionRows = sessions
    .map((s) => {
      const name = s.session_id.split("/").pop() ?? s.session_id;
      return `<a class="proj-session-row" href="/sessions/${encodeURIComponent(s.session_id)}">
      <div class="proj-session-top">
        <span class="proj-session-name">${esc(name)}</span>
        ${s.is_first_session ? '<span class="proj-first-badge">first session</span>' : ""}
        <span class="proj-session-ago">${relativeTime(s.ts)}</span>
      </div>
      <div class="proj-session-meta">
        <span>cwd: <code>${esc(s.cwd)}</code></span>
      </div>
    </a>`;
    })
    .join("\n");

  let jsonld = "";
  try {
    jsonld = JSON.stringify(JSON.parse(project.jsonld), null, 2);
  } catch {
    jsonld = project.jsonld;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(project.name)} — Projects</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/projects" class="back-link">← Projects</a>
        <span class="header-sep">·</span>
        📁 ${esc(project.name)}
      </h1>
      <span class="proj-type-badge" style="--type-color:${color}">${esc(project.identity_type)}</span>
    </div>
  </header>

  <main class="proj-detail">
    <section class="proj-info">
      <table class="proj-info-table">
        <tr><td class="proj-label">ID</td><td><code>${esc(project._id)}</code></td></tr>
        <tr><td class="proj-label">Canonical</td><td><code>${esc(project.canonical_id)}</code></td></tr>
        <tr><td class="proj-label">Type</td><td><span class="proj-type-badge" style="--type-color:${color}">${esc(project.identity_type)}</span></td></tr>
        ${project.git_remote_url ? `<tr><td class="proj-label">Remote</td><td><code>${esc(project.git_remote_url)}</code></td></tr>` : ""}
        ${project.git_root_path ? `<tr><td class="proj-label">Path</td><td><code>${esc(project.git_root_path)}</code></td></tr>` : ""}
        <tr><td class="proj-label">Sessions</td><td>${project.session_count}</td></tr>
        <tr><td class="proj-label">First seen</td><td>${relativeTime(project.first_seen_ts)}</td></tr>
        <tr><td class="proj-label">Last seen</td><td>${relativeTime(project.last_seen_ts)}</td></tr>
      </table>
    </section>

    <section class="proj-sessions-section">
      <h2>Sessions <span class="total-badge">${sessions.length}</span></h2>
      <div class="proj-sessions-list">
        ${sessions.length === 0 ? '<p class="empty-msg">No sessions recorded.</p>' : sessionRows}
      </div>
    </section>

    ${decisionsHtml ?? ""}

    <section class="proj-jsonld-section">
      <h2>JSON-LD</h2>
      <pre class="proj-jsonld">${esc(jsonld)}</pre>
    </section>
  </main>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
