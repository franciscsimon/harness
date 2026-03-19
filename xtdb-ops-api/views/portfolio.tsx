import { html } from "hono/html";

function badge(phase: string) {
  const cls = `badge badge-${(phase || "active").toLowerCase().replace(/\s+/g, "-")}`;
  return html`<span class="${cls}">${phase || "unknown"}</span>`;
}

function formatTs(ts: string | number | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export function portfolioPage(
  projects: any[],
  stats: { total: number; active: number; incidents_open: number },
) {
  const projectCards = projects.map(
    (p) => html`
      <div class="card">
        <a href="/dashboard/project/${p._id}">
          <h3>${p.name || p._id}</h3>
        </a>
        <div style="margin:0.4rem 0">${badge(p.lifecycle_phase)}</div>
        <div style="font-size:0.85rem;color:#8b949e">
          Sessions: ${p.session_count ?? 0} · Last seen: ${formatTs(p.last_seen_ts)}
        </div>
      </div>`,
  );

  return html`
    <h1>Portfolio Dashboard</h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total Projects</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.active}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.incidents_open}</div>
        <div class="stat-label">Open Incidents</div>
      </div>
    </div>

    <h2>Projects</h2>
    <div class="grid">
      ${projectCards}
    </div>

    <div class="section">
      <h2>Live Events</h2>
      <div hx-ext="sse" sse-connect="/api/lifecycle/stream" sse-swap="lifecycle">
        <div id="events"></div>
      </div>
    </div>
  `;
}
