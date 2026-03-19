import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchSessionList } from "../lib/api.ts";
import { relativeTime, escapeHtml, formatDuration } from "../lib/format.ts";

export async function renderSessions(): Promise<string> {
  const sessions = (await fetchSessionList()) ?? [];

  const columns: TableColumn[] = [
    { key: "sessionId", label: "Session", render: (v) => {
      const short = String(v).replace(/.*\/sessions\//, "").replace(/\.jsonl$/, "").slice(0, 50);
      return `<a href="/sessions/${encodeURIComponent(v)}">${escapeHtml(short)}</a>`;
    }},
    { key: "eventCount", label: "Events" },
    { key: "turnCount", label: "Turns" },
    { key: "errorRate", label: "Error Rate", render: (v) => {
      const pct = ((v ?? 0) * 100).toFixed(1) + "%";
      const color = v > 0.1 ? "#da3633" : v > 0.05 ? "#d29922" : "#238636";
      return `<span style="color:${color}">${pct}</span>`;
    }},
    { key: "durationMs", label: "Duration", render: (v) => formatDuration(v) },
    { key: "lastTs", label: "Last Activity", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <h1>Sessions</h1>
      <p>${sessions.length} sessions tracked</p>
    </div>
    ${renderTable(columns, sessions, { emptyMessage: "No sessions found" })}
  `;

  return layout(content, { title: "Sessions", activePath: "/sessions" });
}
