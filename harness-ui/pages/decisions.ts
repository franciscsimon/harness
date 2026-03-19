// ─── Decisions Page ────────────────────────────────────────────
// Browse the decision log.

import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchDecisions } from "../lib/api.ts";
import { relativeTime, escapeHtml, truncate } from "../lib/format.ts";

export async function renderDecisions(): Promise<string> {
  let decisions: any[] = [];
  let fetchError = false;

  try {
    decisions = await fetchDecisions(100);
  } catch {
    fetchError = true;
  }

  const columns: TableColumn[] = [
    { key: "xt/id", label: "ID", render: (v, row) => {
      const id = v ?? row.id ?? row._id ?? "—";
      return `<span style="font-family:var(--mono);font-size:0.8rem">${escapeHtml(String(id).slice(-12))}</span>`;
    }},
    { key: "task", label: "Task", render: (v) => escapeHtml(truncate(String(v ?? "—"), 60)) },
    { key: "outcome", label: "Outcome", render: (v) => badge(String(v ?? "unknown")) },
    { key: "timestamp", label: "When", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <h1>📝 Decisions</h1>
      <p>${fetchError ? "Service unavailable" : `${decisions.length} decisions`}</p>
    </div>
    ${fetchError
      ? '<div class="card"><div class="empty-state">Service unavailable — cannot fetch decisions</div></div>'
      : renderTable(columns, decisions, { emptyMessage: "No decisions recorded yet" })
    }
  `;

  return layout(content, { title: "Decisions", activePath: "/decisions" });
}
