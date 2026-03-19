// ─── Projects Page ─────────────────────────────────────────────
// Portfolio grid of project cards with lifecycle badges.

import { layout } from "../components/layout.ts";
import { badge } from "../components/badge.ts";
import { fetchStats, fetchIncidents } from "../lib/api.ts";
import { escapeHtml, relativeTime } from "../lib/format.ts";

export async function renderProjects(): Promise<string> {
  const [stats, incidents] = await Promise.all([
    fetchStats().catch(() => null),
    fetchIncidents().catch(() => null),
  ]);

  if (!stats && !incidents) {
    const content = `
      <div class="page-header">
        <h1>📁 Projects</h1>
        <p>Portfolio overview</p>
      </div>
      <div class="card"><div class="empty-state">Service unavailable — cannot fetch project data</div></div>
    `;
    return layout(content, { title: "Projects", activePath: "/projects" });
  }

  // Build project cards from available data
  // Stats might contain project-level breakdown; incidents give health signals
  const openIncidents = incidents?.filter((i: any) => i.status === "open") ?? [];
  const projectMap = new Map<string, any>();

  // Gather projects from stats if available
  if (stats && (stats as any).projects) {
    for (const p of (stats as any).projects) {
      projectMap.set(p.name ?? p.project ?? p.id, p);
    }
  }

  // If no structured project list, show summary cards
  const projects = Array.from(projectMap.values());

  const content = `
    <div class="page-header">
      <h1>📁 Projects</h1>
      <p>Portfolio overview</p>
    </div>

    <div class="grid grid-3" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${stats ? (stats as any).totalSessions ?? "—" : "—"}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${openIncidents.length > 0 ? "var(--red)" : "var(--green)"}">${openIncidents.length}</div>
        <div class="stat-label">Open Incidents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${projects.length || "—"}</div>
        <div class="stat-label">Projects</div>
      </div>
    </div>

    ${projects.length > 0 ? renderProjectGrid(projects) : ""}

    ${openIncidents.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2>Open Incidents</h2></div>
      <div class="card">
        ${openIncidents.map((i: any) => `
          <div style="padding:0.75rem;border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:0.5rem">
              ${badge(i.severity ?? "open")}
              <strong>${escapeHtml(String(i.title ?? i.description ?? "Untitled"))}</strong>
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim);margin-top:0.25rem">
              ${relativeTime(i.created_at ?? i.timestamp)}
            </div>
          </div>
        `).join("")}
      </div>
    </div>` : ""}

    ${projects.length === 0 ? `
    <div class="section">
      <div class="section-header"><h2>Project Portfolio</h2></div>
      <div class="empty-state">No project data available from the API. Projects are tracked via the event logger and ops API.</div>
    </div>` : ""}
  `;

  return layout(content, { title: "Projects", activePath: "/projects" });
}

function renderProjectGrid(projects: any[]): string {
  const cards = projects.map((p) => {
    const name = p.name ?? p.project ?? "Unknown";
    const phase = p.lifecycle_phase ?? p.phase ?? "active";
    const sessions = p.sessions ?? p.session_count ?? "—";
    const lastActivity = p.last_activity ?? p.last_ts;

    return `
      <div class="card" style="padding:1rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
          <strong>${escapeHtml(name)}</strong>
          ${badge(phase)}
        </div>
        <div style="font-size:0.85rem;color:var(--text-dim)">
          Sessions: ${sessions}
          ${lastActivity ? ` · Last: ${relativeTime(lastActivity)}` : ""}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="section">
      <div class="section-header"><h2>Project Portfolio</h2></div>
      <div class="grid grid-3">${cards}</div>
    </div>
  `;
}
