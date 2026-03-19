import type { ArtifactVersionRow, ArtifactReadRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { computeLineDiff, renderDiffHtml } from "../lib/diff.ts";

const OP_ICONS: Record<string, string> = { write: "📝", edit: "✏️" };

const NAV = `<a href="/" class="back-link">← Stream</a>
<span class="header-sep">·</span><a href="/artifacts" class="back-link">📦 Artifacts</a>
<span class="header-sep">·</span><a href="/sessions" class="back-link">📂 Sessions</a>
<span class="header-sep">·</span><a href="/dashboard" class="back-link">📊 Dashboard</a>
<span class="header-sep">·</span><a href="/ops" class="back-link">Ops</a>
<span class="header-sep">·</span><a href="http://localhost:3334" class="back-link">💬 Chat</a>`;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function shortSession(s: string): string { return s.split("/").pop() ?? s; }

export function renderArtifactVersions(
  path: string,
  versions: ArtifactVersionRow[],
  reads: ArtifactReadRow[],
): string {
  const fileName = path.split("/").pop() ?? path;
  const chronological = [...versions].sort((a, b) => Number(a.ts) - Number(b.ts));
  const isMarkdown = /\.md$/i.test(path);

  const cards = [...versions].map((v, idx) => {
    const chronIdx = chronological.findIndex(c => c._id === v._id);
    const prev = chronIdx > 0 ? chronological[chronIdx - 1] : null;
    const cardId = `v-${v.version}-${idx}`;

    let diffHtml = "";
    if (prev) {
      const lines = computeLineDiff(prev.content ?? "", v.content ?? "");
      diffHtml = renderDiffHtml(lines);
    }

    const contentHtml = isMarkdown ? renderMarkdown(v.content ?? "") : `<pre>${esc(v.content ?? "")}</pre>`;

    let provHtml = "";
    if (v.jsonld) {
      try {
        const jld = JSON.parse(v.jsonld);
        const chain: string[] = [];
        if (jld["prov:wasAttributedTo"]?.["@id"]) chain.push(`Session: <code>${esc(jld["prov:wasAttributedTo"]["@id"])}</code>`);
        if (jld["prov:specializationOf"]?.["@id"]) chain.push(`Artifact: <code>${esc(jld["prov:specializationOf"]["@id"])}</code>`);
        if (jld["prov:wasDerivedFrom"]?.["@id"]) chain.push(`Derived from: <code>${esc(jld["prov:wasDerivedFrom"]["@id"])}</code>`);
        provHtml = chain.length > 0
          ? `<div class="artv-prov-chain">${chain.map(c => `<span class="artv-prov-node">${c}</span>`).join('<span class="artv-prov-arrow">←</span>')}</div>`
          : "";
        provHtml += `<pre class="jsonld-block">${esc(JSON.stringify(jld, null, 2))}</pre>`;
      } catch { provHtml = `<pre class="jsonld-block">${esc(v.jsonld)}</pre>`; }
    }

    return `<div class="artv-card">
  <div class="artv-card-top">
    <span class="artv-version">v${v.version}</span>
    <span class="art-op">${OP_ICONS[v.operation] ?? "•"}</span>
    <span class="art-kind-badge" style="--kind-color:${v.operation === "edit" ? "#f97316" : "#22c55e"}">${esc(v.operation)}</span>
    <span class="artv-size">${formatSize(Number(v.size_bytes) || 0)}</span>
    <span class="artv-hash"><code>${esc(v.content_hash ?? "")}</code></span>
    <span class="dec-ago">${relativeTime(v.ts)}</span>
    <a href="/artifacts/content/${encodeURIComponent(v._id)}" class="btn btn-sm" style="margin-left:auto">View full</a>
  </div>
  <div class="art-meta">
    <span>Session: <a href="/sessions/${encodeURIComponent(v.session_id)}">${esc(shortSession(v.session_id))}</a></span>
    ${v.tool_call_id ? `<span>Tool: <code>${esc(v.tool_call_id.slice(0, 16))}</code></span>` : ""}
  </div>
  <div class="content-block">
    <div class="content-block-header" onclick="toggleBlock(this)">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Content</span>
      <span class="content-block-size">${formatSize(Number(v.size_bytes) || 0)}</span>
    </div>
    <div class="content-block-body collapsed">${contentHtml}</div>
  </div>
  ${prev ? `<div class="content-block">
    <div class="content-block-header" onclick="toggleBlock(this)">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Diff from v${prev.version}</span>
    </div>
    <div class="content-block-body collapsed"><div class="artv-diff">${diffHtml}</div></div>
  </div>` : ""}
  ${provHtml ? `<div class="content-block">
    <div class="content-block-header" onclick="toggleBlock(this)">
      <span class="content-block-toggle">▶</span>
      <span class="content-block-key">Provenance</span>
    </div>
    <div class="content-block-body collapsed">${provHtml}</div>
  </div>` : ""}
</div>`;
  }).join("\n");

  const readsHtml = reads.length > 0
    ? `<div class="artv-reads"><h3>📖 Reads (${reads.length})</h3>${reads.map(r =>
      `<div class="artv-read-row">Read by <a href="/sessions/${encodeURIComponent(r.session_id)}">${esc(shortSession(r.session_id))}</a> · ${relativeTime(r.ts)}</div>`
    ).join("\n")}</div>`
    : "";

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fileName)} Versions — Artifacts</title>
<link rel="stylesheet" href="/static/style.css">
</head><body>
<header><div class="header-top">
  <h1>${NAV} <span class="header-sep">·</span> 📦 ${esc(fileName)}</h1>
  <span class="total-badge">${versions.length} version${versions.length !== 1 ? "s" : ""}</span>
</div></header>
<main class="dec-list">
  <div class="art-path" style="margin-bottom:16px"><code>${esc(path)}</code></div>
  ${cards}
  ${readsHtml}
</main>
<script>
function toggleBlock(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector('.content-block-toggle');
  body.classList.toggle('collapsed');
  toggle.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}
</script>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
