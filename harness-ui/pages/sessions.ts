import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchSessions } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderSessions(): Promise<string> {
  const sessions = await fetchSessions(100);

  const columns: TableColumn[] = [
    { key: "session_id", label: "Session", render: (v) => `<a href="/sessions/${encodeURIComponent(v)}">${escapeHtml(String(v).slice(-40))}</a>` },
    { key: "event_count", label: "Events" },
    { key: "cwd", label: "Directory", render: (v) => escapeHtml(String(v ?? "—").replace(/.*\//, "…/")) },
    { key: "last_ts", label: "Last Activity", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <h1>Sessions</h1>
      <p>${sessions.length} sessions</p>
    </div>
    ${renderTable(columns, sessions, { emptyMessage: "No sessions found" })}
  `;

  return layout(content, { title: "Sessions", activePath: "/sessions" });
}
