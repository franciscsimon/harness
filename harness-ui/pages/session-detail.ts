import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchSessionEvents } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderSessionDetail(sessionId: string): Promise<string> {
  const events = (await fetchSessionEvents(sessionId)) ?? [];
  const shortId = sessionId.replace(/.*\/sessions\//, "").replace(/\.jsonl$/, "").slice(0, 50);

  const columns: TableColumn[] = [
    { key: "seq", label: "#" },
    { key: "event_name", label: "Event", render: (v) => badge(v ?? "unknown") },
    { key: "event_category", label: "Category" },
    { key: "ts", label: "Time", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <a href="/sessions" class="back-link">← Sessions</a>
      <h1>Session Detail</h1>
      <p class="mono">${escapeHtml(shortId)}</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${events.length}</div><div class="stat-label">Events</div></div>
    </div>
    ${renderTable(columns, events.slice(0, 200), { emptyMessage: "No events found" })}
    ${events.length > 200 ? `<p class="muted">Showing first 200 of ${events.length} events</p>` : ""}
  `;

  return layout(content, { title: `Session ${shortId}`, activePath: "/sessions" });
}
