// ─── Knowledge Page ────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/knowledge.ts
// Fetches session knowledge markdown from API, renders to HTML.

import { layout } from "../components/layout.ts";
import { fetchKnowledge } from "../lib/api.ts";
import { escapeHtml } from "../lib/format.ts";

function mdToHtml(md: string): string {
  return md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) return "";
      return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .replace(/^- `(.+)`$/gm, "<li><code>$1</code></li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "\n<br>\n");
}

export async function renderKnowledgePage(sessionId: string, projectId?: string): Promise<string> {
  const name = sessionId.split("/").pop() ?? sessionId;
  const md = await fetchKnowledge(sessionId);

  if (!md) {
    const content = `
      <div class="page-header"><h1>📝 Knowledge</h1></div>
      <p class="empty-msg">No knowledge data for this session.</p>
    `;
    return layout(content, { title: "Knowledge", activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
  }

  const html = mdToHtml(md);

  const content = `
    <div class="page-header">
      <h1>
        <a href="${projectId ? `/projects/${projectId}/sessions` : `/sessions`}" class="back-link">← Sessions</a>
        <span class="header-sep">·</span>
        <a href="${projectId ? `/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}` : `/sessions/${encodeURIComponent(sessionId)}`}" class="back-link">📂 ${escapeHtml(name)}</a>
        <span class="header-sep">·</span>
        📝 Knowledge
      </h1>
    </div>
    <div class="knowledge-content">
      ${html}
    </div>
    <div style="padding:16px 20px;max-width:960px;margin:0 auto">
      <a href="/api/sessions/${encodeURIComponent(sessionId)}/knowledge" class="btn" download="${escapeHtml(name)}.knowledge.md">📥 Download .md</a>
    </div>
  `;

  return layout(content, { title: `Knowledge — ${name}`, activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
}
