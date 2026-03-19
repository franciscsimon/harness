// ─── Artifacts Page ────────────────────────────────────────────
// Browse tracked files and versions.

import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchArtifacts } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderArtifacts(): Promise<string> {
  let artifacts: any[] = [];
  let fetchError = false;

  try {
    artifacts = await fetchArtifacts();
  } catch {
    fetchError = true;
  }

  const columns: TableColumn[] = [
    { key: "path", label: "Path", render: (v) => `<code>${escapeHtml(String(v ?? "—"))}</code>` },
    { key: "type", label: "Type", render: (v) => badge(String(v ?? "file")) },
    { key: "sessions", label: "Sessions", render: (v) => {
      if (Array.isArray(v)) return String(v.length);
      return String(v ?? "—");
    }},
    { key: "last_modified", label: "Last Modified", render: (v, row) => {
      const ts = v ?? row.lastModified ?? row.timestamp;
      return relativeTime(ts);
    }},
  ];

  const content = `
    <div class="page-header">
      <h1>📦 Artifacts</h1>
      <p>${fetchError ? "Service unavailable" : `${artifacts.length} tracked artifacts`}</p>
    </div>
    ${fetchError
      ? '<div class="card"><div class="empty-state">Service unavailable — cannot fetch artifacts</div></div>'
      : renderTable(columns, artifacts, { emptyMessage: "No artifacts tracked yet" })
    }
  `;

  return layout(content, { title: "Artifacts", activePath: "/artifacts" });
}
