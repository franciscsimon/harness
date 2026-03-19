// ─── Dashboard Page ────────────────────────────────────────────
// Session health overview: totals, tool usage, error patterns.

import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchDashboard } from "../lib/api.ts";
import { formatNumber, escapeHtml } from "../lib/format.ts";

export async function renderDashboard(): Promise<string> {
  const data = await fetchDashboard();

  if (!data) {
    const content = `
      <div class="page-header">
        <h1>📊 Dashboard</h1>
        <p>Session health analytics</p>
      </div>
      <div class="card"><div class="empty-state">Service unavailable — cannot fetch dashboard data</div></div>
    `;
    return layout(content, { title: "Dashboard", activePath: "/dashboard" });
  }

  // Extract what's available from the dashboard response
  const totalSessions = data.totalSessions ?? data.sessions ?? 0;
  const totalEvents = data.totalEvents ?? data.events ?? 0;
  const activeSessions = data.activeSessions ?? 0;

  // Tool usage stats (if present)
  const toolUsage: Record<string, number> = data.toolUsage ?? data.toolCounts ?? {};
  const toolRows = Object.entries(toolUsage)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([name, count]) => ({ name, count }));

  const toolColumns: TableColumn[] = [
    { key: "name", label: "Tool", render: (v) => `<code>${escapeHtml(String(v))}</code>` },
    { key: "count", label: "Invocations", render: (v) => `<strong>${formatNumber(v)}</strong>` },
  ];

  // Error patterns (if present)
  const errorPatterns: any[] = data.errorPatterns ?? data.errors ?? [];
  const errorColumns: TableColumn[] = [
    { key: "pattern", label: "Error Pattern", render: (v) => escapeHtml(String(v ?? "—")) },
    { key: "count", label: "Occurrences", render: (v) => `<strong>${v}</strong>` },
    { key: "severity", label: "Severity", render: (v) => badge(String(v ?? "unknown")) },
  ];

  // Event category breakdown
  const categories: Record<string, number> = data.eventsByCategory ?? data.categories ?? {};
  const catRows = Object.entries(categories)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([category, count]) => ({ category, count }));

  const catColumns: TableColumn[] = [
    { key: "category", label: "Category", render: (v) => badge(String(v)) },
    { key: "count", label: "Count", render: (v) => `<strong>${formatNumber(v)}</strong>` },
  ];

  const content = `
    <div class="page-header">
      <h1>📊 Dashboard</h1>
      <p>Session health analytics</p>
    </div>

    <div class="grid grid-3" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${formatNumber(totalSessions)}</div>
        <div class="stat-label">Total Sessions</div>
        <div class="stat-sub">${activeSessions} active</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${formatNumber(totalEvents)}</div>
        <div class="stat-label">Total Events</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${toolRows.length}</div>
        <div class="stat-label">Distinct Tools</div>
      </div>
    </div>

    ${toolRows.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2>Tool Usage</h2></div>
      ${renderTable(toolColumns, toolRows, { emptyMessage: "No tool data" })}
    </div>` : ""}

    ${catRows.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2>Events by Category</h2></div>
      ${renderTable(catColumns, catRows, { emptyMessage: "No category data" })}
    </div>` : ""}

    ${errorPatterns.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2>Error Patterns</h2></div>
      ${renderTable(errorColumns, errorPatterns, { emptyMessage: "No errors — all clear!" })}
    </div>` : `
    <div class="section">
      <div class="section-header"><h2>Error Patterns</h2></div>
      <div class="empty-state">No errors detected — all clear! ✓</div>
    </div>`}
  `;

  return layout(content, { title: "Dashboard", activePath: "/dashboard" });
}
