import { layout } from "../components/layout.ts";
import { badge } from "../components/badge.ts";
import { fetchStats, fetchIncidents, fetchDashboard } from "../lib/api.ts";
import { escapeHtml, relativeTime } from "../lib/format.ts";

export async function renderProjects(): Promise<string> {
  const [stats, incidents, dashboard] = await Promise.all([
    fetchStats(),
    fetchIncidents(),
    fetchDashboard(),
  ]);

  const openIncidents = (incidents ?? []).filter((i: any) => i.status === "open");
  const totalSessions = dashboard?.totalSessions ?? "—";
  const totalEvents = stats?.total ?? "—";

  const content = `
    <div class="page-header">
      <h1>Projects</h1>
      <p>Portfolio overview</p>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${totalEvents}</div><div class="stat-label">Events</div></div>
      <div class="stat-card">
        <div class="stat-value" style="color:${openIncidents.length > 0 ? "#da3633" : "#238636"}">${openIncidents.length}</div>
        <div class="stat-label">Open Incidents</div>
      </div>
    </div>

    ${stats?.byCategory ? `
    <h2>Events by Category</h2>
    <div class="stats-row">
      ${Object.entries(stats.byCategory).map(([k, v]) =>
        `<div class="stat-card"><div class="stat-value">${v}</div><div class="stat-label">${escapeHtml(k)}</div></div>`
      ).join("")}
    </div>
    ` : ""}

    ${openIncidents.length > 0 ? `
    <h2>Open Incidents</h2>
    <div class="card-list">
      ${openIncidents.map((i: any) => `
        <div class="card-item">
          ${badge(i.severity ?? "unknown")}
          <strong>${escapeHtml(String(i.title ?? "Untitled"))}</strong>
          <span class="muted">${relativeTime(i.started_ts ?? i.ts)}</span>
        </div>
      `).join("")}
    </div>
    ` : ""}
  `;

  return layout(content, { title: "Projects", activePath: "/projects" });
}
