import type { ArtifactRow, ProjectRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

const KIND_COLORS: Record<string, string> = {
  code: "#3b82f6",
  doc: "#22c55e",
  config: "#eab308",
  asset: "#8b5cf6",
  other: "#6b7280",
};

const OP_ICONS: Record<string, string> = {
  write: "📝",
  edit: "✏️",
};

// ─── Artifacts List Page ───────────────────────────────────────────

export function renderArtifacts(artifacts: ArtifactRow[], projects: ProjectRow[]): string {
  const projMap = new Map(projects.map(p => [p._id, p]));

  // Group by file path, show latest per file
  const byPath = new Map<string, ArtifactRow[]>();
  for (const a of artifacts) {
    const list = byPath.get(a.path) ?? [];
    list.push(a);
    byPath.set(a.path, list);
  }

  const cards = [...byPath.entries()]
    .sort((a, b) => Number(b[1][0].ts) - Number(a[1][0].ts))
    .map(([path, versions]) => {
      const latest = versions[0];
      const proj = projMap.get(latest.project_id ?? "");
      const projName = proj?.name ?? "";
      const color = KIND_COLORS[latest.kind] ?? "#6b7280";
      const fileName = path.split("/").pop() ?? path;

      return `<div class="art-card">
      <div class="art-card-top">
        <span class="art-op">${OP_ICONS[latest.operation] ?? "•"}</span>
        <span class="art-filename">${esc(fileName)}</span>
        <span class="art-kind-badge" style="--kind-color:${color}">${esc(latest.kind)}</span>
        <span class="art-versions">${versions.length} version${versions.length !== 1 ? "s" : ""}</span>
        <span class="dec-ago">${relativeTime(latest.ts)}</span>
      </div>
      <div class="art-path"><code>${esc(path)}</code></div>
      <div class="art-meta">
        ${projName ? `<span>Project: <a href="/projects/${encodeURIComponent(latest.project_id ?? "")}">${esc(projName)}</a></span>` : ""}
        ${latest.content_hash ? `<span>Hash: <code>${esc(latest.content_hash)}</code></span>` : ""}
      </div>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Artifacts — XTDB Event Stream</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/" class="back-link">← Stream</a>
        <span class="header-sep">·</span>
        <a href="/projects" class="back-link">📁 Projects</a>
        <span class="header-sep">·</span>
        <a href="/decisions" class="back-link">📋 Decisions</a>
        <span class="header-sep">·</span>
        📦 Artifacts
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">📂 Sessions</a>
        <span class="header-sep">·</span>
        <a href="/dashboard" class="back-link">📊 Dashboard</a>
      </h1>
      <span class="total-badge">${byPath.size} file${byPath.size !== 1 ? "s" : ""} · ${artifacts.length} version${artifacts.length !== 1 ? "s" : ""}</span>
    </div>
  </header>

  <main class="dec-list">
    ${artifacts.length === 0 ? '<p class="empty-msg">No artifacts tracked yet. Write or edit files in a session to start tracking.</p>' : cards}
  </main>
</body>
</html>`;
}

// ─── Artifact History Page (per file) ──────────────────────────────

export function renderArtifactHistory(path: string, artifacts: ArtifactRow[]): string {
  const fileName = path.split("/").pop() ?? path;

  const rows = artifacts
    .map(a => {
      const date = new Date(Number(a.ts)).toISOString().slice(0, 19).replace("T", " ");
      return `<div class="art-history-row">
      <div class="art-card-top">
        <span class="art-op">${OP_ICONS[a.operation] ?? "•"}</span>
        <span class="art-kind-badge" style="--kind-color:${KIND_COLORS[a.kind] ?? "#6b7280"}">${esc(a.operation)}</span>
        <span class="dec-date">${date}</span>
        <span class="dec-ago">${relativeTime(a.ts)}</span>
      </div>
      <div class="art-meta">
        ${a.content_hash ? `<span>Hash: <code>${esc(a.content_hash)}</code></span>` : ""}
        <span>Session: <code>${esc(a.session_id.split("/").pop() ?? a.session_id)}</code></span>
      </div>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fileName)} History — Artifacts</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <div class="header-top">
      <h1>
        <a href="/artifacts" class="back-link">← Artifacts</a>
        <span class="header-sep">·</span>
        📦 ${esc(fileName)}
      </h1>
      <span class="total-badge">${artifacts.length} version${artifacts.length !== 1 ? "s" : ""}</span>
    </div>
  </header>

  <main class="dec-list">
    <div class="art-path" style="margin-bottom:16px"><code>${esc(path)}</code></div>
    ${artifacts.length === 0 ? '<p class="empty-msg">No history for this file.</p>' : rows}
  </main>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
