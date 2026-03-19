// ─── Artifacts Page ────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/artifacts.ts
// Changes: data via API fetch, layout() wrapper.
// Note: The original takes versioned data from DB; the API returns flat artifacts.
// We group by path and show version counts.

import { layout } from "../components/layout.ts";
import { fetchArtifacts, fetchArtifactVersions } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

const KIND_COLORS: Record<string, string> = {
  code: "#3b82f6", doc: "#22c55e", config: "#eab308", asset: "#8b5cf6", other: "#6b7280",
};

const OP_ICONS: Record<string, string> = { write: "📝", edit: "✏️" };

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export async function renderArtifacts(): Promise<string> {
  const artifacts = (await fetchArtifacts()) ?? [];

  // Group by path — most recent first
  const byPath = new Map<string, any[]>();
  for (const a of artifacts) {
    const list = byPath.get(a.path) ?? [];
    list.push(a);
    byPath.set(a.path, list);
  }

  const paths = [...byPath.keys()].sort((a, b) => {
    const tsA = Number(byPath.get(a)?.[0]?.ts ?? 0);
    const tsB = Number(byPath.get(b)?.[0]?.ts ?? 0);
    return tsB - tsA;
  });

  const cards = paths.map((path) => {
    const versions = byPath.get(path)!;
    const latest = versions[0];
    const fileName = path.split("/").pop() ?? path;
    const relPath = path.replace(/.*harness\//, "");
    const kind = latest.kind ?? "other";
    const color = KIND_COLORS[kind] ?? "#6b7280";
    const latestSession = (latest.session_id ?? "").split("/").pop() ?? "";

    return `<div class="art-card" data-path="${escapeHtml(path)}" data-session="${escapeHtml(latest.session_id ?? "")}">
      <div class="art-card-top">
        <span class="art-op">${OP_ICONS[latest.operation] ?? "•"}</span>
        <a href="/artifacts/versions?path=${encodeURIComponent(path)}" class="art-filename">${escapeHtml(fileName)}</a>
        <span class="art-kind-badge" style="--kind-color:${color}">${escapeHtml(kind)}</span>
        <span class="art-versions">${versions.length} version${versions.length !== 1 ? "s" : ""}</span>
        <span class="dec-ago">${relativeTime(latest.ts)}</span>
      </div>
      <div class="art-path"><code>${escapeHtml(relPath)}</code></div>
      <div class="art-meta">
        ${latest.content_hash ? `<span>Hash: <code>${escapeHtml(String(latest.content_hash).slice(0, 12))}</code></span>` : ""}
        ${latestSession ? `<span>Session: <code>${escapeHtml(latestSession)}</code></span>` : ""}
      </div>
    </div>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1>📦 Artifacts</h1>
      <span class="total-badge">${paths.length} file${paths.length !== 1 ? "s" : ""} · ${artifacts.length} version${artifacts.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="art-filter-bar">
      <input type="text" id="art-search" placeholder="🔍 Filter by filename..." oninput="filterArtifacts()">
    </div>
    <main class="dec-list">
      ${paths.length === 0 ? '<p class="empty-msg">No artifacts tracked yet.</p>' : cards}
    </main>
    <script>
    function filterArtifacts() {
      var q = document.getElementById('art-search').value.toLowerCase();
      document.querySelectorAll('.art-card').forEach(function(c) {
        var match = !q || c.dataset.path.toLowerCase().includes(q);
        c.style.display = match ? '' : 'none';
      });
    }
    </script>
  `;

  return layout(content, { title: "Artifacts", activePath: "/artifacts" });
}

// ─── Artifact Versions Page ────────────────────────────────────

export async function renderArtifactVersions(path: string): Promise<string> {
  // Use artifact_versions API (has correct IDs for content links)
  const versions = (await fetchArtifactVersions(path)) ?? [];
  const fileName = path.split("/").pop() ?? path;

  const rows = versions.map((v: any) => `
    <div class="art-card">
      <div class="art-card-top">
        <span class="art-op">${OP_ICONS[v.operation] ?? "•"}</span>
        <span class="art-filename">v${v.version ?? "?"} · ${escapeHtml(v.operation ?? "—")}</span>
        <span class="art-kind-badge" style="--kind-color:${KIND_COLORS[v.kind ?? "other"] ?? "#6b7280"}">${escapeHtml(v.kind ?? "other")}</span>
        <span class="dec-ago">${relativeTime(v.ts)}</span>
      </div>
      <div class="art-meta">
        ${v.content_hash ? `<span>Hash: <code>${escapeHtml(String(v.content_hash).slice(0, 16))}</code></span>` : ""}
        ${v.session_id ? `<span>Session: <code>${escapeHtml(String(v.session_id).split("/").pop())}</code></span>` : ""}
        ${v._id ? `<a href="/artifacts/content/${encodeURIComponent(v._id)}" class="sb-link" style="font-size:0.8rem">📄 View content</a>` : ""}
      </div>
    </div>
  `).join("\n");

  const content = `
    <div class="page-header">
      <h1><a href="/artifacts" class="back-link">← Artifacts</a> · ${escapeHtml(fileName)}</h1>
      <span class="total-badge">${versions.length} version${versions.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="art-path" style="margin-bottom:1rem"><code>${escapeHtml(path)}</code></div>
    <div class="dec-list">
      ${versions.length === 0 ? '<p class="empty-msg">No versions found for this path.</p>' : rows}
    </div>
  `;

  return layout(content, { title: fileName + " versions", activePath: "/artifacts" });
}
