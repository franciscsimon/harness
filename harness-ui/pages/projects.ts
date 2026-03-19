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
