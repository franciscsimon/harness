import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchDashboard } from "../lib/api.ts";
import { escapeHtml, formatDuration } from "../lib/format.ts";

export async function renderDashboard(): Promise<string> {
  const data = await fetchDashboard();

  if (!data) {
    return layout(`<div class="page-header"><h1>Dashboard</h1></div><div class="empty-state">Event Logger API unavailable</div>`,
      { title: "Dashboard", activePath: "/dashboard" });
  }

  const sessions: any[] = data.sessions ?? [];
  const toolUsage: any[] = data.toolUsage ?? [];
  const errorPatterns: any[] = data.errorPatterns ?? [];

  const sessionCols: TableColumn[] = [
    { key: "sessionId", label: "Session", render: (v) => {
      const short = String(v).replace(/.*\/sessions\//, "").replace(/\.jsonl$/, "").slice(0, 40);
      return `<a href="/sessions/${encodeURIComponent(v)}">${escapeHtml(short)}</a>`;
    }},
    { key: "eventCount", label: "Events" },
    { key: "healthScore", label: "Health", render: (v, row) => {
      const color = row.healthColor === "green" ? "#238636" : row.healthColor === "yellow" ? "#d29922" : "#da3633";
      return `<span style="color:${color};font-weight:bold">${v ?? "—"}</span>`;
    }},
    { key: "errorRate", label: "Errors", render: (v) => ((v ?? 0) * 100).toFixed(1) + "%" },
    { key: "turnCount", label: "Turns" },
    { key: "durationMs", label: "Duration", render: (v) => formatDuration(v) },
  ];

  const toolCols: TableColumn[] = [
    { key: "tool_name", label: "Tool" },
    { key: "count", label: "Calls" },
    { key: "error_count", label: "Errors" },
    { key: "error_rate", label: "Error %", render: (v) => ((v ?? 0) * 100).toFixed(1) + "%" },
  ];

  const content = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Session health overview</p>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${data.totalSessions ?? 0}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${data.totalEvents ?? 0}</div><div class="stat-label">Events</div></div>
      <div class="stat-card"><div class="stat-value">${data.avgEventsPerSession ?? 0}</div><div class="stat-label">Avg/Session</div></div>
      <div class="stat-card"><div class="stat-value">${((data.overallErrorRate ?? 0) * 100).toFixed(1)}%</div><div class="stat-label">Error Rate</div></div>
    </div>

    <h2>Sessions by Health</h2>
    ${renderTable(sessionCols, sessions, { emptyMessage: "No sessions" })}

    <h2>Tool Usage</h2>
    ${renderTable(toolCols, toolUsage, { emptyMessage: "No tool data" })}

    ${errorPatterns.length > 0 ? `
    <h2>Error Patterns</h2>
    <ul>${errorPatterns.map((e: any) => `<li><strong>${escapeHtml(e.tool_name ?? "unknown")}</strong>: ${e.count} errors — ${escapeHtml(e.sample_error ?? "")}</li>`).join("")}</ul>
    ` : ""}
  `;

  return layout(content, { title: "Dashboard", activePath: "/dashboard" });
}
