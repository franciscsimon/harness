// ─── Home Page ─────────────────────────────────────────────────
// Aggregates stats from all backends. Each fetch is try/catch'd
// so the page renders even if backends are down.

import { layout } from "../components/layout.ts";
import { healthDot } from "../components/badge.ts";
import { fetchStats, fetchDashboard, fetchHealth, fetchIncidents, checkAllContainers } from "../lib/api.ts";
import type { ContainerStatus } from "../lib/api.ts";
import { formatNumber, relativeTime } from "../lib/format.ts";

export async function renderHome(): Promise<string> {
  const [stats, dashboard, health, incidents, containers] = await Promise.all([
    fetchStats().catch(() => null),
    fetchDashboard().catch(() => null),
    fetchHealth().catch(() => null),
    fetchIncidents("open").catch(() => null),
    checkAllContainers().catch(() => [] as ContainerStatus[]),
  ]);

  const content = `
    <div class="page-header">
      <h1>⚡ Harness Overview</h1>
      <p>Unified view across all harness services</p>
    </div>

    ${renderBackendStatus(containers)}

    <div class="grid grid-4" style="margin-top:1.5rem">
      ${renderStatCard("Sessions", dashboard ? formatNumber(dashboard.totalSessions) : "—", dashboard ? `avg ${formatNumber(dashboard.avgEventsPerSession)} events/session` : "Event API unavailable", dashboard != null)}
      ${renderStatCard("Events", stats ? formatNumber(stats.total) : "—", stats?.byCategory ? `${Object.keys(stats.byCategory).length} categories` : "—", stats != null)}
      ${renderStatCard("Open Incidents", incidents ? String(incidents.length) : "—", incidents ? (incidents.length === 0 ? "All clear" : `${incidents.length} need attention`) : "Ops API unavailable", incidents != null)}
      ${renderStatCard("System Health", health ? capitalize(health.overall) : "—", health ? healthSummary(health) : "Ops API unavailable", health != null)}
    </div>

    ${renderHealthDetail(health)}

    ${renderCategoryBreakdown(stats)}

    <div class="section">
      <div class="section-header">
        <h2>Quick Links</h2>
      </div>
      <div class="grid grid-3">
        <a href="/sessions" class="card" style="text-decoration:none">
          <h3>📋 Sessions</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Browse agent sessions and events</p>
        </a>
        <a href="/projects" class="card" style="text-decoration:none">
          <h3>📁 Projects</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Portfolio overview and lifecycle</p>
        </a>
        <a href="/ops" class="card" style="text-decoration:none">
          <h3>🔧 Operations</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Infrastructure health and backups</p>
        </a>
        <a href="/dashboard" class="card" style="text-decoration:none">
          <h3>📊 Dashboard</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Session health analytics</p>
        </a>
        <a href="/decisions" class="card" style="text-decoration:none">
          <h3>📝 Decisions</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Decision log browser</p>
        </a>
        <a href="/artifacts" class="card" style="text-decoration:none">
          <h3>📦 Artifacts</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Tracked files and versions</p>
        </a>
        <a href="/graph" class="card" style="text-decoration:none">
          <h3>🕸️ Graph</h3>
          <p style="color:var(--text-dim);font-size:0.85rem">Call graph & SPARQL explorer</p>
        </a>
      </div>
    </div>
  `;

  return layout(content, { title: "Home", activePath: "/" });
}

// ─── Sub-renderers ─────────────────────────────────────────────

function renderBackendStatus(containers: ContainerStatus[]): string {
  if (!containers.length) return `<p style="color:var(--text-dim)">Container status unavailable</p>`;
  const dots = containers.map((c) =>
    `<span class="backend-status">
      <span class="backend-dot" style="background:${c.ok ? "#238636" : "#da3633"}"></span>
      ${c.name} :${c.port}
    </span>`
  ).join("\n");
  const up = containers.filter((c) => c.ok).length;
  return `<div style="display:flex;gap:0.75rem;flex-wrap:wrap">${dots}</div>
    <p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.4rem">${up}/${containers.length} services up</p>`;
}

function renderStatCard(label: string, value: string, sub: string, available: boolean): string {
  const color = available ? "var(--accent)" : "var(--text-dim)";
  return `<div class="stat-card">
    <div class="stat-value" style="color:${color}">${value}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function renderHealthDetail(health: any): string {
  if (!health) {
    return `<div class="section">
      <h2>System Health</h2>
      <div class="card"><div class="empty-state">Ops API unavailable — cannot fetch health data</div></div>
    </div>`;
  }

  const rows = (health.components || []).map((c: any) => {
    const statusColor = c.status === "healthy" ? "#238636" : c.status === "degraded" ? "#d29922" : "#da3633";
    const details = c.details || {};
    let detailStr = "";
    if (c.name === "primary" || c.name === "replica") {
      detailStr = details.pgwire ? "pgwire ✓" : "pgwire ✗";
      if (details.port) detailStr += ` :${details.port}`;
    } else if (c.name === "redpanda") {
      detailStr = details.healthy ? "cluster healthy" : "cluster unhealthy";
    } else {
      detailStr = JSON.stringify(details).slice(0, 80);
    }
    return `<tr>
      <td>${c.name}</td>
      <td><span style="color:${statusColor};font-weight:600">${c.status}</span></td>
      <td style="color:var(--text-dim);font-size:0.85rem">${detailStr}</td>
    </tr>`;
  }).join("");

  return `<div class="section">
    <h2>System Health</h2>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Component</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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

function healthSummary(h: any): string {
  if (!h.components) return h.overall || "unknown";
  const ok = h.components.filter((c: any) => c.status === "healthy").length;
  const total = h.components.length;
  return `${ok}/${total} components healthy`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
