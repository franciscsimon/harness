import { layout } from "../components/layout.ts";
import { renderTable, type TableColumn } from "../components/table.ts";
import { badge } from "../components/badge.ts";
import { fetchArtifacts } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

export async function renderArtifacts(): Promise<string> {
  const artifacts = (await fetchArtifacts()) ?? [];

  const columns: TableColumn[] = [
    { key: "path", label: "Path", render: (v) => {
      const short = String(v ?? "—").replace(/.*harness\//, "");
      return `<code>${escapeHtml(short)}</code>`;
    }},
    { key: "kind", label: "Kind", render: (v) => badge(String(v ?? "file")) },
    { key: "operation", label: "Operation", render: (v) => badge(String(v ?? "—")) },
    { key: "content_hash", label: "Hash", render: (v) => `<code>${escapeHtml(String(v ?? "—").slice(0, 12))}</code>` },
    { key: "ts", label: "When", render: (v) => relativeTime(v) },
  ];

  const content = `
    <div class="page-header">
      <h1>Artifacts</h1>
      <p>${artifacts.length} tracked artifacts</p>
    </div>
    ${renderTable(columns, artifacts, { emptyMessage: "No artifacts tracked yet" })}
  `;

  return layout(content, { title: "Artifacts", activePath: "/artifacts" });
}
