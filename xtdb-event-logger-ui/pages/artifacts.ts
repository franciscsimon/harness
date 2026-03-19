import type { ArtifactRow, ProjectRow, ArtifactVersionSummary } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

const KIND_COLORS: Record<string, string> = {
  code: "#3b82f6", doc: "#22c55e", config: "#eab308", asset: "#8b5cf6", other: "#6b7280",
};

const OP_ICONS: Record<string, string> = { write: "📝", edit: "✏️" };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const NAV = `<a href="/" class="back-link">← Stream</a>
<span class="header-sep">·</span><a href="/projects" class="back-link">📁 Projects</a>
<span class="header-sep">·</span><a href="/decisions" class="back-link">📋 Decisions</a>
<span class="header-sep">·</span>📦 Artifacts
<span class="header-sep">·</span><a href="/sessions" class="back-link">📂 Sessions</a>
<span class="header-sep">·</span><a href="/dashboard" class="back-link">📊 Dashboard</a>
<span class="header-sep">·</span><a href="/ops" class="back-link">Ops</a>
<span class="header-sep">·</span><a href="http://localhost:3334" class="back-link">💬 Chat</a>`;

export function renderArtifacts(
  artifacts: ArtifactRow[],
  projects: ProjectRow[],
  versionSummaries: ArtifactVersionSummary[],
  readCounts: Record<string, number>,
): string {
  const projMap = new Map(projects.map(p => [p._id, p]));

  const vByPath = new Map<string, ArtifactVersionSummary[]>();
  for (const v of versionSummaries) {
    const list = vByPath.get(v.path) ?? [];
    list.push(v);
    vByPath.set(v.path, list);
  }

  const byPath = new Map<string, ArtifactRow[]>();
  for (const a of artifacts) {
    if (!a.path.endsWith(".md")) continue;
    const list = byPath.get(a.path) ?? [];
    list.push(a);
    byPath.set(a.path, list);
  }

  const allPaths = new Set([...vByPath.keys(), ...byPath.keys()]);
  const sessions = [...new Set(versionSummaries.map(v => v.session_id))];

  const cards = [...allPaths]
    .sort((a, b) => {
      const tsA = Number(vByPath.get(a)?.[0]?.ts ?? byPath.get(a)?.[0]?.ts ?? 0);
      const tsB = Number(vByPath.get(b)?.[0]?.ts ?? byPath.get(b)?.[0]?.ts ?? 0);
      return tsB - tsA;
    })
    .map(path => {
      const versions = vByPath.get(path) ?? [];
      const artRows = byPath.get(path) ?? [];
      const latest = versions[0] ?? artRows[0];
      if (!latest) return "";
      const proj = projMap.get((latest as any).project_id ?? "");
      const projName = proj?.name ?? "";
      const fileName = path.split("/").pop() ?? path;
      const relPath = versions[0]?.relative_path ?? path;
      const versionCount = versions.length || artRows.length;
      const totalSize = versions.reduce((s, v) => s + (Number(v.size_bytes) || 0), 0);
      const reads = readCounts[path] ?? 0;
      const color = KIND_COLORS[(artRows[0] as any)?.kind ?? "other"] ?? "#6b7280";
      const latestSession = latest.session_id?.split("/").pop() ?? "";

      return `<div class="art-card" data-path="${esc(path)}" data-session="${esc(latest.session_id)}">
      <div class="art-card-top">
        <span class="art-op">${OP_ICONS[latest.operation] ?? "•"}</span>
        <a href="/artifacts/versions?path=${encodeURIComponent(path)}" class="art-filename">${esc(fileName)}</a>
        <span class="art-kind-badge" style="--kind-color:${color}">${esc((artRows[0] as any)?.kind ?? "doc")}</span>
        <span class="art-versions">${versionCount} version${versionCount !== 1 ? "s" : ""}</span>
        <span class="art-size">${formatSize(totalSize)}</span>
        ${reads > 0 ? `<span class="art-reads">📖 ${reads}</span>` : ""}
        <span class="dec-ago">${relativeTime(latest.ts)}</span>
      </div>
      <div class="art-path"><code>${esc(relPath)}</code></div>
      <div class="art-meta">
        ${projName ? `<span>Project: <a href="/projects/${encodeURIComponent((latest as any).project_id ?? "")}">${esc(projName)}</a></span>` : ""}
        <span>Session: <code>${esc(latestSession)}</code></span>
      </div>
    </div>`;
    })
    .join("\n");

  const sessionOpts = sessions.map(s =>
    `<option value="${esc(s)}">${esc(s.split("/").pop() ?? s)}</option>`
  ).join("\n");

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artifacts — XTDB Event Stream</title>
<link rel="stylesheet" href="/static/style.css">
</head><body>
<header><div class="header-top">
  <h1>${NAV}</h1>
  <span class="total-badge">${allPaths.size} file${allPaths.size !== 1 ? "s" : ""} · ${versionSummaries.length} version${versionSummaries.length !== 1 ? "s" : ""}</span>
</div></header>
<div class="art-filter-bar">
  <input type="text" id="art-search" placeholder="🔍 Filter by filename..." oninput="filterArtifacts()">
  <select id="art-session" onchange="filterArtifacts()">
    <option value="">All sessions</option>
    ${sessionOpts}
  </select>
</div>
<main class="dec-list">
  ${allPaths.size === 0 ? '<p class="empty-msg">No artifacts tracked yet.</p>' : cards}
</main>
<script>
function filterArtifacts() {
  const q = document.getElementById('art-search').value.toLowerCase();
  const s = document.getElementById('art-session').value;
  document.querySelectorAll('.art-card').forEach(c => {
    const matchPath = !q || c.dataset.path.toLowerCase().includes(q);
    const matchSession = !s || c.dataset.session === s;
    c.style.display = matchPath && matchSession ? '' : 'none';
  });
}
</script>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
