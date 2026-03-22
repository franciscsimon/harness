// ─── Home Page ─────────────────────────────────────────────────
// Aggregates stats from all backends. Each fetch is try/catch'd
// so the page renders even if backends are down.

import { layout } from "../components/layout.ts";
import { fetchStats, fetchDashboard, fetchIncidents } from "../lib/api.ts";
import { formatNumber, relativeTime } from "../lib/format.ts";

export async function renderHome(): Promise<string> {
  const [stats, dashboard, incidents] = await Promise.all([
    fetchStats().catch(() => null),
    fetchDashboard().catch(() => null),
    fetchIncidents("open").catch(() => null),
  ]);

  const content = `
    <div class="page-header">
      <h1>⚡ Harness Overview</h1>
    </div>

    <div class="grid grid-4">
      ${renderStatCard("Sessions", dashboard ? formatNumber(dashboard.totalSessions) : "—", dashboard ? `avg ${formatNumber(dashboard.avgEventsPerSession)} events/session` : "Event API unavailable", dashboard != null)}
      ${renderStatCard("Events", stats ? formatNumber(stats.total) : "—", stats?.byCategory ? `${Object.keys(stats.byCategory).length} categories` : "—", stats != null)}
      ${renderStatCard("Open Incidents", incidents ? String(incidents.length) : "—", incidents ? (incidents.length === 0 ? "All clear" : `${incidents.length} need attention`) : "Ops API unavailable", incidents != null)}
    </div>

    ${renderCategoryBreakdown(stats)}


  `;

  return layout(content, { title: "Home", activePath: "/" });
}

// ─── Sub-renderers ─────────────────────────────────────────────

function renderStatCard(label: string, value: string, sub: string, available: boolean): string {
  const color = available ? "var(--accent)" : "var(--text-dim)";
  return `<div class="stat-card">
    <div class="stat-value" style="color:${color}">${value}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function renderCategoryBreakdown(stats: any): string {
  if (!stats?.byCategory) return "";

  const cats = Object.entries(stats.byCategory as Record<string, number>)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  if (cats.length === 0) return "";

  const total = stats.total || 1;
  const rows = cats.map(([cat, count]) => {
    const pct = ((count as number) / total * 100).toFixed(1);
    return `<tr>
      <td>${cat}</td>
      <td style="font-weight:600">${formatNumber(count as number)}</td>
      <td style="color:var(--text-dim)">${pct}%</td>
    </tr>`;
  }).join("");

  return `<div class="section">
    <h2>Events by Category</h2>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Category</th><th>Count</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}


