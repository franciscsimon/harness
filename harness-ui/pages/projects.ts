// ─── Projects Page ─────────────────────────────────────────────
// Based on xtdb-event-logger-ui/pages/projects.ts
// Note: No /api/projects endpoint exists yet on :3333.
// We derive project info from decisions & artifacts (which have project_id).
// TODO: Add GET /api/projects to event-logger-ui and port the full project cards.

import { layout } from "../components/layout.ts";
import { fetchDecisions, fetchArtifacts, fetchDashboard, fetchIncidents } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

const PHASE_COLORS: Record<string, string> = {
  planning: "#a855f7",
  active: "#22c55e",
  maintenance: "#eab308",
  deprecated: "#f97316",
  decommissioned: "#ef4444",
};

export async function renderProjects(): Promise<string> {
  const [decisions, artifacts, dashboard, incidents] = await Promise.all([
    fetchDecisions(500),
    fetchArtifacts(),
    fetchDashboard(),
    fetchIncidents(),
  ]);

  // Derive projects from decisions + artifacts project_id fields
  const projectMap = new Map<string, { decisions: number; artifacts: number; lastTs: number }>();

  for (const d of (decisions ?? [])) {
    if (!d.project_id) continue;
    const p = projectMap.get(d.project_id) ?? { decisions: 0, artifacts: 0, lastTs: 0 };
    p.decisions++;
    if (Number(d.ts) > p.lastTs) p.lastTs = Number(d.ts);
    projectMap.set(d.project_id, p);
  }

  for (const a of (artifacts ?? [])) {
    if (!a.project_id) continue;
    const p = projectMap.get(a.project_id) ?? { decisions: 0, artifacts: 0, lastTs: 0 };
    p.artifacts++;
    if (Number(a.ts) > p.lastTs) p.lastTs = Number(a.ts);
    projectMap.set(a.project_id, p);
  }

  const projects = [...projectMap.entries()]
    .sort((a, b) => b[1].lastTs - a[1].lastTs)
    .map(([id, data]) => {
      const name = id.split("/").pop() ?? id;
      return `<a class="proj-card" href="/projects/${encodeURIComponent(id)}">
      <div class="proj-card-top">
        <span class="proj-card-name">${escapeHtml(name)}</span>
        <span class="proj-type-badge" style="--type-color:#22c55e">active</span>
        <span class="ses-card-count">${data.decisions} decisions · ${data.artifacts} artifacts</span>
      </div>
      <div class="proj-card-meta">
        <code class="proj-canonical">${escapeHtml(id)}</code>
      </div>
      <div class="proj-card-meta">
        <span>Last activity: ${relativeTime(String(data.lastTs))}</span>
      </div>
    </a>`;
    }).join("\n");

  const totalSessions = dashboard?.totalSessions ?? "—";
  const openIncidents = (incidents ?? []).filter((i: any) => i.status === "open");

  const content = `
    <div class="page-header">
      <h1>📁 Projects</h1>
      <span class="total-badge">${projectMap.size} project${projectMap.size !== 1 ? "s" : ""}</span>
    </div>

    <div class="dash-stats">
      <div class="dash-stat-card"><div class="dash-stat-label">Projects</div><div class="dash-stat-value">${projectMap.size}</div></div>
      <div class="dash-stat-card"><div class="dash-stat-label">Sessions</div><div class="dash-stat-value">${totalSessions}</div></div>
      <div class="dash-stat-card"><div class="dash-stat-label">Open Incidents</div><div class="dash-stat-value" style="color:${openIncidents.length > 0 ? "#ef4444" : "#22c55e"}">${openIncidents.length}</div></div>
    </div>

    <main class="ses-list">
      ${projectMap.size === 0 ? '<p class="empty-msg">No projects found. Projects are derived from decisions and artifacts with project_id fields.</p>' : projects}
    </main>
  `;

  return layout(content, { title: "Projects", activePath: "/projects" });
}

// ─── Project Detail Page ───────────────────────────────────────

export async function renderProjectDetail(projectId: string): Promise<string> {
  const [decisions, artifacts] = await Promise.all([
    fetchDecisions(500),
    fetchArtifacts(),
  ]);

  const projDecisions = (decisions ?? []).filter((d: any) => d.project_id === projectId);
  const projArtifacts = (artifacts ?? []).filter((a: any) => a.project_id === projectId);
  const name = projectId.split("/").pop() ?? projectId;

  // Decision cards (ported from xtdb-event-logger-ui/pages/decisions.ts)
  const OUTCOME_ICONS: Record<string, string> = { success: "✅", failure: "❌", deferred: "⏸️" };
  const OUTCOME_COLORS: Record<string, string> = { success: "#22c55e", failure: "#ef4444", deferred: "#eab308" };

  const decisionCards = projDecisions.map((d: any) => {
    const icon = OUTCOME_ICONS[d.outcome] ?? "•";
    const color = OUTCOME_COLORS[d.outcome] ?? "#6b7280";
    const date = d.ts ? new Date(Number(d.ts)).toISOString().slice(0, 10) : "—";
    return `<div class="dec-card">
      <div class="dec-card-top">
        <span class="dec-outcome-badge" style="--outcome-color:${color}">${icon} ${escapeHtml(d.outcome ?? "unknown")}</span>
        <span class="dec-date">${date}</span>
        <span class="dec-ago">${relativeTime(d.ts)}</span>
      </div>
      <div class="dec-what">${escapeHtml(d.what ?? "—")}</div>
      <div class="dec-detail"><span class="dec-label">Task:</span> ${escapeHtml(d.task ?? "—")}</div>
      <div class="dec-detail"><span class="dec-label">Why:</span> ${escapeHtml(d.why ?? "—")}</div>
    </div>`;
  }).join("\n");

  // Artifact cards
  const artifactRows = projArtifacts.map((a: any) => {
    const fileName = (a.path ?? "").split("/").pop() ?? a.path;
    return `<div class="art-card">
      <div class="art-card-top">
        <span class="art-op">${a.operation === "write" ? "📝" : "✏️"}</span>
        <span class="art-filename">${escapeHtml(fileName)}</span>
        <span class="art-kind-badge" style="--kind-color:#3b82f6">${escapeHtml(a.kind ?? "file")}</span>
        <span class="dec-ago">${relativeTime(a.ts)}</span>
      </div>
      <div class="art-path"><code>${escapeHtml(a.path?.replace(/.*harness\//, "") ?? "—")}</code></div>
    </div>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1><a href="/projects" class="back-link">← Projects</a> · 📁 ${escapeHtml(name)}</h1>
    </div>

    <section class="proj-info">
      <table class="proj-info-table">
        <tr><td class="proj-label">ID</td><td><code>${escapeHtml(projectId)}</code></td></tr>
        <tr><td class="proj-label">Decisions</td><td>${projDecisions.length}</td></tr>
        <tr><td class="proj-label">Artifacts</td><td>${projArtifacts.length}</td></tr>
      </table>
    </section>

    <section class="proj-sessions-section">
      <h2>📋 Decisions <span class="total-badge">${projDecisions.length}</span></h2>
      <div class="dec-list">
        ${projDecisions.length === 0 ? '<p class="empty-msg">No decisions for this project.</p>' : decisionCards}
      </div>
    </section>

    <section class="proj-sessions-section">
      <h2>📦 Artifacts <span class="total-badge">${projArtifacts.length}</span></h2>
      <div class="dec-list">
        ${projArtifacts.length === 0 ? '<p class="empty-msg">No artifacts for this project.</p>' : artifactRows}
      </div>
    </section>
  `;

  return layout(content, { title: name, activePath: "/projects" });
}
