import type { SessionKnowledge } from "../lib/db.ts";
import { generateKnowledgeMarkdown } from "../lib/knowledge.ts";

export function renderKnowledge(sessionId: string, knowledge: SessionKnowledge): string {
  const name = sessionId.split("/").pop() ?? sessionId;
  const md = generateKnowledgeMarkdown(sessionId, knowledge);

  // Simple markdown → HTML (no external dep)
  const html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^\| (.+) \|$/gm, (line) => {
      const cells = line.split("|").filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^-+$/.test(c))) return '';
      return `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`;
    })
    .replace(/^- `(.+)`$/gm, '<li><code>$1</code></li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '\n<br>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Knowledge — ${esc(name)}</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">Sessions</a>
        <span class="header-sep">·</span>
        <a href="/sessions/${encodeURIComponent(sessionId)}" class="back-link">${esc(name)}</a>
        <span class="header-sep">·</span>
        📝 Knowledge
        <span class="header-sep">·</span>
        <a href="/ops" class="back-link">Ops</a>
        <span class="header-sep">·</span>
        <a href="http://localhost:3334" class="back-link">💬 Chat</a>
      </h1>
    </div>
  </header>
  <main class="detail-page">
    ${html}
    <br>
    <a href="/api/sessions/${encodeURIComponent(sessionId)}/knowledge" class="btn" download="${esc(name)}.knowledge.md">Download .md</a>
  </main>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
