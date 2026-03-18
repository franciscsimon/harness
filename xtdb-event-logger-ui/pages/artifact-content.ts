import type { ArtifactVersionRow, ArtifactVersionSummary } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";
import { renderMarkdown } from "../lib/markdown.ts";

const OP_ICONS: Record<string, string> = { write: "📝", edit: "✏️" };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function shortSession(s: string): string { return s.split("/").pop() ?? s; }

export function renderArtifactContent(
  version: ArtifactVersionRow,
  prev: ArtifactVersionSummary | null,
  next: ArtifactVersionSummary | null,
): string {
  const fileName = version.path.split("/").pop() ?? version.path;
  const isMarkdown = /\.md$/i.test(version.path);
  const renderedContent = isMarkdown ? renderMarkdown(version.content ?? "") : `<pre class="artc-raw-block">${esc(version.content ?? "")}</pre>`;

  let provHtml = "";
  if (version.jsonld) {
    try {
      const jld = JSON.parse(version.jsonld);
      const chain: string[] = [];
      if (jld["prov:wasAttributedTo"]?.["@id"]) chain.push(`Session: <code>${esc(jld["prov:wasAttributedTo"]["@id"])}</code>`);
      if (jld["prov:specializationOf"]?.["@id"]) chain.push(`Artifact: <code>${esc(jld["prov:specializationOf"]["@id"])}</code>`);
      if (jld["prov:wasDerivedFrom"]?.["@id"]) chain.push(`Derived: <code>${esc(jld["prov:wasDerivedFrom"]["@id"])}</code>`);
      provHtml = chain.length > 0
        ? `<div class="artv-prov-chain">${chain.map(c => `<span class="artv-prov-node">${c}</span>`).join('<span class="artv-prov-arrow">←</span>')}</div>`
        : "";
      provHtml += `<pre class="jsonld-block">${esc(JSON.stringify(jld, null, 2))}</pre>`;
    } catch { provHtml = `<pre class="jsonld-block">${esc(version.jsonld)}</pre>`; }
  }

  const prevLink = prev ? `<a href="/artifacts/content/${encodeURIComponent(prev._id)}" class="btn btn-sm">◀ v${prev.version}</a>` : `<span class="btn btn-sm btn-disabled">◀</span>`;
  const nextLink = next ? `<a href="/artifacts/content/${encodeURIComponent(next._id)}" class="btn btn-sm">v${next.version} ▶</a>` : `<span class="btn btn-sm btn-disabled">▶</span>`;

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fileName)} v${version.version} — Artifacts</title>
<link rel="stylesheet" href="/static/style.css">
</head><body>
<header><div class="header-top">
  <h1>
    <a href="/artifacts" class="back-link">← Artifacts</a>
    <span class="header-sep">·</span>
    <a href="/artifacts/versions?path=${encodeURIComponent(version.path)}" class="back-link">📦 ${esc(fileName)}</a>
    <span class="header-sep">·</span> v${version.version}
    <span class="header-sep">·</span>
    <a href="http://localhost:3334" class="back-link">💬 Chat</a>
  </h1>
</div></header>
<main class="artc-page">
  <div class="artc-breadcrumb">
    <a href="/sessions/${encodeURIComponent(version.session_id)}">${esc(shortSession(version.session_id))}</a>
    → ${version.operation}
    → ${esc(fileName)} v${version.version}
  </div>
  <div class="artc-nav">
    ${prevLink}
    <div class="artv-card-top" style="flex:1;justify-content:center">
      <span class="artv-version">v${version.version}</span>
      <span class="art-op">${OP_ICONS[version.operation] ?? "•"}</span>
      <span class="art-kind-badge" style="--kind-color:${version.operation === "edit" ? "#f97316" : "#22c55e"}">${esc(version.operation)}</span>
      <span class="artv-size">${formatSize(Number(version.size_bytes) || 0)}</span>
      <span class="artv-hash"><code>${esc(version.content_hash ?? "")}</code></span>
      <span class="dec-ago">${relativeTime(version.ts)}</span>
    </div>
    ${nextLink}
  </div>
  <div class="artc-tabs">
    <button class="btn btn-sm artv-tab-active" onclick="showTab('rendered',this)">Rendered</button>
    <button class="btn btn-sm" onclick="showTab('raw',this)">Raw</button>
    ${provHtml ? `<button class="btn btn-sm" onclick="showTab('prov',this)">Provenance</button>` : ""}
  </div>
  <div class="artc-content">
    <div id="tab-rendered">${renderedContent}</div>
    <div id="tab-raw" style="display:none"><pre class="artc-raw-block">${esc(version.content ?? "")}</pre></div>
    ${provHtml ? `<div id="tab-prov" style="display:none">${provHtml}</div>` : ""}
  </div>
</main>
<script>
function showTab(name, btn) {
  document.querySelectorAll('.artc-content > div').forEach(d => d.style.display = 'none');
  document.querySelectorAll('.artc-tabs .btn').forEach(b => b.classList.remove('artv-tab-active'));
  document.getElementById('tab-' + name).style.display = '';
  btn.classList.add('artv-tab-active');
}
</script>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
