import type { ProjectRow, SessionProjectRow, LifecycleEventRow, ProjectDependencyRow, ProjectTagRow, DecommissionRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

export interface ProjectLifecycleData {
  lifecycleEvents: LifecycleEventRow[];
  dependencies: ProjectDependencyRow[];
  tags: ProjectTagRow[];
  decommissions: DecommissionRow[];
}

// ─── Identity type badge colors ────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "git-remote": "#3b82f6",
  "git-local": "#8b5cf6",
  path: "#f97316",
};

const PHASE_COLORS: Record<string, string> = {
  planning: "#a855f7",
  active: "#22c55e",
  maintenance: "#eab308",
  deprecated: "#f97316",
  decommissioned: "#ef4444",
};

// ─── Project List Page ─────────────────────────────────────────────

export function renderProjects(projects: ProjectRow[]): string {
  const cards = projects
    .map((p) => {
      const color = TYPE_COLORS[p.identity_type] ?? "#6b7280";
      const sessions = Number(p.session_count) || 0;
      const phase = p.lifecycle_phase ?? "active";
      const phaseColor = PHASE_COLORS[phase] ?? "#6b7280";
      return `<a class="proj-card" href="/projects/${encodeURIComponent(p._id)}">
      <div class="proj-card-top">
        <span class="proj-card-name">${esc(p.name)}</span>
        <span class="proj-type-badge" style="--type-color:${color}">${esc(p.identity_type)}</span>
        <span class="proj-type-badge" style="--type-color:${phaseColor}">${esc(phase)}</span>
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
        <a href="/ops" class="back-link">Ops</a>
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

export function renderProjectDetail(project: ProjectRow, sessions: SessionProjectRow[], decisionsHtml?: string, lifecycle?: ProjectLifecycleData): string {
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
        <tr><td class="proj-label">Phase</td><td><span class="proj-type-badge" style="--type-color:${PHASE_COLORS[project.lifecycle_phase ?? "active"] ?? "#6b7280"}">${esc(project.lifecycle_phase ?? "active")}</span></td></tr>
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

    ${renderLifecycleSection(lifecycle)}

    <section class="proj-jsonld-section">
      <h2>JSON-LD</h2>
      <pre class="proj-jsonld">${esc(jsonld)}</pre>
    </section>
  </main>
</body>
</html>`;
}

// ─── Lifecycle Section ─────────────────────────────────────────────

function renderLifecycleSection(data?: ProjectLifecycleData): string {
  if (!data) return "";
  const { lifecycleEvents, dependencies, tags, decommissions } = data;
  const hasAny = lifecycleEvents.length > 0 || dependencies.length > 0 || tags.length > 0 || decommissions.length > 0;
  if (!hasAny) return "";

  let html = "";

  // Tags
  if (tags.length > 0) {
    const tagBadges = tags.map(t => `<span class="proj-type-badge" style="--type-color:#6366f1">${esc(t.tag)}</span>`).join(" ");
    html += `<section class="proj-sessions-section"><h2>Tags</h2><div style="padding:0.5rem 0">${tagBadges}</div></section>`;
  }

  // Dependencies
  if (dependencies.length > 0) {
    const depRows = dependencies.map(d =>
      `<tr><td><code>${esc(d.name)}</code></td><td>${esc(d.version)}</td><td><span class="proj-type-badge" style="--type-color:#64748b">${esc(d.dep_type)}</span></td></tr>`
    ).join("\n");
    html += `<section class="proj-sessions-section"><h2>Dependencies <span class="total-badge">${dependencies.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Name</th><th>Version</th><th>Type</th></tr></thead><tbody>${depRows}</tbody></table></section>`;
  }

  // Lifecycle events (phase transitions)
  if (lifecycleEvents.length > 0) {
    const evRows = lifecycleEvents.map(e => {
      const phaseColor = PHASE_COLORS[e.event_type] ?? "#6b7280";
      return `<tr>
        <td><span class="proj-type-badge" style="--type-color:${phaseColor}">${esc(e.event_type)}</span></td>
        <td>${esc(e.summary)}</td>
        <td>${relativeTime(e.ts)}</td>
      </tr>`;
    }).join("\n");
    html += `<section class="proj-sessions-section"><h2>Lifecycle Events <span class="total-badge">${lifecycleEvents.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Event</th><th>Summary</th><th>When</th></tr></thead><tbody>${evRows}</tbody></table></section>`;
  }

  // Decommissions
  if (decommissions.length > 0) {
    const decomRows = decommissions.map(d =>
      `<tr><td>${esc(d.reason)}</td><td>${esc(d.decommissioned_by)}</td><td>${relativeTime(d.ts)}</td></tr>`
    ).join("\n");
    html += `<section class="proj-sessions-section"><h2>Decommission Records <span class="total-badge">${decommissions.length}</span></h2>
      <table class="proj-info-table"><thead><tr><th>Reason</th><th>By</th><th>When</th></tr></thead><tbody>${decomRows}</tbody></table></section>`;
  }

  return html;
}

// ─── Helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
