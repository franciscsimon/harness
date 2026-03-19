// ─── Session Detail Page ───────────────────────────────────────
// Shows event timeline for a single session.

import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchSessionEvents } from "../lib/api.ts";
import { relativeTime, escapeHtml, formatDate } from "../lib/format.ts";

export async function renderSessionDetail(sessionId: string): Promise<string> {
  let events: any[] = [];
  let fetchError = false;

  try {
    events = await fetchSessionEvents(sessionId);
  } catch {
    fetchError = true;
  }

  const columns: TableColumn[] = [
    { key: "seq", label: "#", render: (v) => `<span style="color:var(--text-dim)">${v ?? "—"}</span>` },
    { key: "event_name", label: "Event", render: (v) => badge(String(v ?? "unknown")) },
    { key: "timestamp", label: "Time", render: (v) => `<span title="${formatDate(v)}">${relativeTime(v)}</span>` },
    {
      key: "xt/id",
      label: "Details",
      render: (v, row) => {
        const id = v ?? row.id ?? row._id;
        return id ? `<a href="#" title="${escapeHtml(String(id))}">view</a>` : "—";
      },
    },
  ];

  const content = `
    <div class="page-header">
      <h1>Session Events</h1>
      <p style="font-family:var(--mono);font-size:0.85rem;word-break:break-all">${escapeHtml(sessionId)}</p>
      <p>${events.length} events</p>
    </div>
    <div style="margin-bottom:1rem">
      <a href="/sessions" style="color:var(--accent)">&larr; Back to sessions</a>
    </div>
    ${fetchError
      ? '<div class="card"><div class="empty-state">Service unavailable — cannot fetch session events</div></div>'
      : renderTable(columns, events, { emptyMessage: "No events found for this session" })
    }
  `;

  return layout(content, { title: "Session Detail", activePath: "/sessions" });
}
