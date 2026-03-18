import type { DecisionRow, ProjectRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

// ─── Outcome styling ──────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, string> = {
  success: "#22c55e",
  failure: "#ef4444",
  deferred: "#eab308",
};

const OUTCOME_ICONS: Record<string, string> = {
  success: "✅",
  failure: "❌",
  deferred: "⏸️",
};

// ─── All Decisions Page ────────────────────────────────────────────

export function renderDecisions(decisions: DecisionRow[], projects: ProjectRow[]): string {
  const projMap = new Map(projects.map((p) => [p._id, p]));

  const rows = decisions
    .map((d) => {
      const proj = projMap.get(d.project_id);
      const projName = proj?.name ?? d.project_id;
      const icon = OUTCOME_ICONS[d.outcome] ?? "•";
      const color = OUTCOME_COLORS[d.outcome] ?? "#6b7280";
      const date = new Date(Number(d.ts)).toISOString().slice(0, 10);

      return `<div class="dec-card">
      <div class="dec-card-top">
        <span class="dec-outcome-badge" style="--outcome-color:${color}">${icon} ${esc(d.outcome)}</span>
        <a class="dec-project-link" href="/projects/${encodeURIComponent(d.project_id)}">${esc(projName)}</a>
        <span class="dec-date">${date}</span>
        <span class="dec-ago">${relativeTime(d.ts)}</span>
      </div>
      <div class="dec-what">${esc(d.what)}</div>
      <div class="dec-detail">
        <span class="dec-label">Task:</span> ${esc(d.task)}
      </div>
      <div class="dec-detail">
        <span class="dec-label">Why:</span> ${esc(d.why)}
      </div>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Decisions — XTDB Event Stream</title>
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
        📋 Decisions
        <span class="header-sep">·</span>
        <a href="/sessions" class="back-link">📂 Sessions</a>
        <span class="header-sep">·</span>
        <a href="/artifacts" class="back-link">📦 Artifacts</a>
        <span class="header-sep">·</span>
        <a href="/dashboard" class="back-link">📊 Dashboard</a>
      </h1>
      <span class="total-badge">${decisions.length} decision${decisions.length !== 1 ? "s" : ""}</span>
    </div>
  </header>

  <main class="dec-list">
    ${decisions.length === 0 ? '<p class="empty-msg">No decisions logged yet. Use log_decision in a session to record decisions.</p>' : rows}
  </main>
</body>
</html>`;
}

// ─── Project Decisions (embeddable section) ────────────────────────

export function renderProjectDecisionsSection(decisions: DecisionRow[]): string {
  if (decisions.length === 0) {
    return `<section class="dec-section">
      <h2>📋 Decisions <span class="total-badge">0</span></h2>
      <p class="empty-msg">No decisions logged for this project.</p>
    </section>`;
  }

  const rows = decisions
    .map((d) => {
      const icon = OUTCOME_ICONS[d.outcome] ?? "•";
      const color = OUTCOME_COLORS[d.outcome] ?? "#6b7280";
      const date = new Date(Number(d.ts)).toISOString().slice(0, 10);

      return `<div class="dec-card">
      <div class="dec-card-top">
        <span class="dec-outcome-badge" style="--outcome-color:${color}">${icon} ${esc(d.outcome)}</span>
        <span class="dec-date">${date}</span>
        <span class="dec-ago">${relativeTime(d.ts)}</span>
      </div>
      <div class="dec-what">${esc(d.what)}</div>
      <div class="dec-detail">
        <span class="dec-label">Task:</span> ${esc(d.task)}
      </div>
      <div class="dec-detail">
        <span class="dec-label">Why:</span> ${esc(d.why)}
      </div>
    </div>`;
    })
    .join("\n");

  return `<section class="dec-section">
    <h2>📋 Decisions <span class="total-badge">${decisions.length}</span></h2>
    <div class="dec-section-list">${rows}</div>
  </section>`;
}

// ─── Helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
