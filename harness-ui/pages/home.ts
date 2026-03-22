// ─── Home Page ─────────────────────────────────────────────────
// Shows all projects with summary cards. Click to enter a project.

import { layout } from "../components/layout.ts";
import { escapeHtml, relativeTime, formatNumber } from "../lib/format.ts";

const EVENT_API = process.env.EVENT_API ?? "http://localhost:3333";

export async function renderHome(): Promise<string> {
  let projects: any[] = [];
  try {
    const r = await fetch(`${EVENT_API}/api/projects`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) projects = await r.json();
  } catch { /* empty */ }

  const cards = projects.map((p: any) => {
    const name = p.name || p._id || "unknown";
    const phase = p.lifecycle_phase || "unknown";
    const phaseColor = phase === "active" ? "#238636" : phase === "archived" ? "#8b949e" : "#d29922";
    const sessionCount = p.session_count ?? 0;
    const lastSeen = p.last_seen_ts ? relativeTime(p.last_seen_ts) : "—";

    return `<a class="project-home-card" href="/projects/${encodeURIComponent(name)}/sessions">
      <div class="phc-header">
        <span class="phc-name">📂 ${escapeHtml(name)}</span>
        <span class="phc-phase" style="color:${phaseColor}">${escapeHtml(phase)}</span>
      </div>
      <div class="phc-stats">
        <span>${formatNumber(sessionCount)} sessions</span>
        <span>Last activity: ${lastSeen}</span>
      </div>
    </a>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1>⚡ Harness</h1>
      <span class="total-badge">${projects.length} project${projects.length !== 1 ? "s" : ""}</span>
    </div>

    <div class="project-home-grid">
      ${projects.length === 0
        ? '<p class="empty-msg">No projects found. Start a coding session to create your first project.</p>'
        : cards}
    </div>
  `;

  return layout(content, { title: "Home", activePath: "/" });
}
