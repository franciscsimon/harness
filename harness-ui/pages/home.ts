// ─── Home Page ─────────────────────────────────────────────────
// Aggregates stats from all backends. Each fetch is try/catch'd
// so the page renders even if backends are down.

import { layout } from "../components/layout.ts";
import { fetchStats, fetchDashboard, fetchIncidents, checkAllContainers } from "../lib/api.ts";
import type { ContainerStatus } from "../lib/api.ts";
import { formatNumber, relativeTime } from "../lib/format.ts";

export async function renderHome(): Promise<string> {
  const [stats, dashboard, incidents, containers] = await Promise.all([
    fetchStats().catch(() => null),
    fetchDashboard().catch(() => null),
    fetchIncidents("open").catch(() => null),
    checkAllContainers().catch(() => [] as ContainerStatus[]),
  ]);

  const content = `
    <div class="page-header">
      <h1>⚡ Harness Overview</h1>
    </div>

    <div class="grid grid-4">
      ${renderStatCard("Sessions", dashboard ? formatNumber(dashboard.totalSessions) : "—", dashboard ? `avg ${formatNumber(dashboard.avgEventsPerSession)} events/session` : "Event API unavailable", dashboard != null)}
      ${renderStatCard("Events", stats ? formatNumber(stats.total) : "—", stats?.byCategory ? `${Object.keys(stats.byCategory).length} categories` : "—", stats != null)}
      ${renderStatCard("Open Incidents", incidents ? String(incidents.length) : "—", incidents ? (incidents.length === 0 ? "All clear" : `${incidents.length} need attention`) : "Ops API unavailable", incidents != null)}
      ${renderStatCard("System Health", containers.length ? `${containers.filter(c => c.ok).length}/${containers.length} up` : "—", containers.length ? (containers.every(c => c.ok) ? "All services healthy" : "Some services down") : "Unavailable", containers.length > 0 && containers.every(c => c.ok))}
    </div>

    ${renderSystemHealth(containers)}

    ${renderCategoryBreakdown(stats)}


  `;

  return layout(content, { title: "Home", activePath: "/" });
}

// ─── Sub-renderers ─────────────────────────────────────────────

function renderSystemHealth(containers: ContainerStatus[]): string {
  if (!containers.length) {
    return `<div class="section">
      <h2>System Health</h2>
      <div class="card"><div class="empty-state">Container status unavailable</div></div>
    </div>`;
  }

  const rows = containers.map((c) => `<tr>
    <td><span class="backend-dot" style="background:${c.ok ? "#238636" : "#da3633"};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></span>${c.name}</td>
    <td><code>:${c.port}</code></td>
    <td>${c.role}</td>
    <td style="color:${c.ok ? "#238636" : "#da3633"};font-weight:600">${c.ok ? "Up" : "Down"}</td>
  </tr>`).join("\n");

  return `<div class="section">
    <h2>System Health</h2>
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Service</th><th>Port</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

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


