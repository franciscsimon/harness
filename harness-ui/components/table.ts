// ─── Reusable Table Renderer ───────────────────────────────────

import { escapeHtml } from "../lib/format.ts";

export interface TableColumn {
  key: string;
  label: string;
  /** Optional cell renderer. Default: escapeHtml(String(value)) */
  render?: (value: any, row: any) => string;
}

export function renderTable(
  columns: TableColumn[],
  rows: any[],
  opts?: { emptyMessage?: string; className?: string },
): string {
  const className = opts?.className ?? "data-table";
  const emptyMsg = opts?.emptyMessage ?? "No data available";

  if (rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyMsg)}</div>`;
  }

  const headerCells = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const val = row[col.key];
          const rendered = col.render ? col.render(val, row) : escapeHtml(val != null ? String(val) : "—");
          return `<td>${rendered}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table class="${className}">
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
}
