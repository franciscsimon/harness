// ─── Home Page ─────────────────────────────────────────────────
// Aggregates stats from all backends. Each fetch is try/catch'd
// so the page renders even if backends are down.

import { layout } from "../components/layout.ts";
import { badge, healthDot } from "../components/badge.ts";
import { fetchStats, fetchHealth, fetchIncidents } from "../lib/api.ts";
import { formatNumber, relativeTime } from "../lib/format.ts";

export async function renderHome(): Promise<string> {
  // Fetch from all backends in parallel — each can fail independently
  const [stats, health, incidents] = await Promise.all([
    fetchStats().catch(() => null),
    fetchHealth().catch(() => null),
    fetchIncidents("open").catch(() => null),
  ]);

  const content = `
    <div class="page-header">
      <h1>⚡ Harness Overview</h1>
      <p>Unified view across all harness services</p>
    </div>

    ${renderBackendStatus(stats, health)}

    <div class="grid grid-4" style="margin-top:1.5rem">
      ${renderStatCard("Sessions", stats ? formatNumber(stats.totalSessions) : "—", stats ? `${stats.activeSessions} active` : "Event API unavailable", stats != null)}
      ${renderStatCard("Events", stats ? formatNumber(stats.totalEvents) : "—", stats?.latestEvent ? relativeTime(stats.latestEvent) : "—", stats != null)}
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
      </div>
    </div>
  `;

  return layout(content, { title: "Home", activePath: "/" });
}

// ─── Sub-renderers ─────────────────────────────────────────────

function renderBackendStatus(stats: any, health: any): string {
  const eventOk = stats != null;
  const opsOk = health != null;

  return `<div style="display:flex;gap:0.75rem;flex-wrap:wrap">
    <span class="backend-status">
      <span class="backend-dot" style="background:${eventOk ? "#238636" : "#da3633"}"></span>
      Event API :3333
    </span>
    <span class="backend-status">
      <span class="backend-dot" style="background:${opsOk ? "#238636" : "#da3633"}"></span>
      Ops API :3335
    </span>
    <span class="backend-status">
      <span class="backend-dot" style="background:#484f58"></span>
      Chat WS :3334
    </span>
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

function renderHealthDetail(health: any): string {
  if (!health) {
    return `<div class="section">
      <h2>System Health</h2>
      <div class="card"><div class="empty-state">Ops API unavailable — cannot fetch health data</div></div>
    </div>`;
  }

  return `<div class="section">
    <h2>System Health</h2>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Component</th><th>Status</th><th>Latency</th></tr></thead>
        <tbody>
          <tr>
            <td>XTDB Primary</td>
            <td>${healthDot(health.primary?.ok ?? false)}</td>
            <td>${health.primary?.latencyMs != null ? health.primary.latencyMs + "ms" : "—"}</td>
          </tr>
          <tr>
            <td>XTDB Replica</td>
            <td>${healthDot(health.replica?.ok ?? false)}</td>
            <td>${health.replica?.latencyMs != null ? health.replica.latencyMs + "ms" : "—"}</td>
          </tr>
          <tr>
            <td>Redpanda</td>
            <td>${healthDot(health.redpanda?.ok ?? false)}</td>
            <td>${health.redpanda?.topics != null ? health.redpanda.topics + " topics" : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderCategoryBreakdown(stats: any): string {
  if (!stats?.eventsByCategory) return "";

  const cats = Object.entries(stats.eventsByCategory as Record<string, number>)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  if (cats.length === 0) return "";

  const rows = cats.map(([cat, count]) =>
    `<tr><td>${cat}</td><td style="font-weight:600">${formatNumber(count as number)}</td></tr>`
  ).join("");

  return `<div class="section">
    <h2>Events by Category</h2>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Category</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function healthSummary(h: any): string {
  const parts: string[] = [];
  if (h.primary?.ok) parts.push("DB ✓");
  else parts.push("DB ✗");
  if (h.replica?.ok) parts.push("Replica ✓");
  else parts.push("Replica ✗");
  if (h.redpanda?.ok) parts.push("Kafka ✓");
  else parts.push("Kafka ✗");
  return parts.join(" · ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
