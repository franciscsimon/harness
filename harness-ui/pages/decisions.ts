import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchDecisions } from "../lib/api.ts";
import { relativeTime, escapeHtml, truncate } from "../lib/format.ts";

export async function renderDecisions(): Promise<string> {
  const decisions = (await fetchDecisions(100)) ?? [];

  const columns: TableColumn[] = [
    { key: "task", label: "Task", render: (v) => escapeHtml(truncate(String(v ?? "—"), 60)) },
    { key: "what", label: "Decision", render: (v) => escapeHtml(truncate(String(v ?? "—"), 80)) },
    { key: "outcome", label: "Outcome", render: (v) => badge(String(v ?? "unknown")) },
    { key: "ts", label: "When", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <h1>Decisions</h1>
      <p>${decisions.length} decisions</p>
    </div>
    ${renderTable(columns, decisions, { emptyMessage: "No decisions recorded yet" })}
  `;

  return layout(content, { title: "Decisions", activePath: "/decisions" });
}
