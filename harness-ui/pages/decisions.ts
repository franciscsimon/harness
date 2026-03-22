// ─── Decisions Page ────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/decisions.ts
// Changes: data via API fetch, layout() wrapper.

import { layout } from "../components/layout.ts";
import { fetchDecisions } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

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

export async function renderDecisions(projectId?: string): Promise<string> {
  const decisions = (await fetchDecisions(200, projectId)) ?? [];

  const rows = decisions.map((d: any) => {
    const icon = OUTCOME_ICONS[d.outcome] ?? "•";
    const color = OUTCOME_COLORS[d.outcome] ?? "#6b7280";
    const date = d.ts ? new Date(Number(d.ts)).toISOString().slice(0, 10) : "—";
    const projId = d.project_id ?? "";
    const projName = projId.split("/").pop() ?? projId;

    return `<div class="dec-card">
      <div class="dec-card-top">
        <span class="dec-outcome-badge" style="--outcome-color:${color}">${icon} ${escapeHtml(d.outcome ?? "unknown")}</span>
        ${projId ? `<a class="dec-project-link" href="/projects/${encodeURIComponent(projId)}">${escapeHtml(projName)}</a>` : ""}
        <span class="dec-date">${date}</span>
        <span class="dec-ago">${relativeTime(d.ts)}</span>
      </div>
      <div class="dec-what">${escapeHtml(d.what ?? "—")}</div>
      <div class="dec-detail">
        <span class="dec-label">Task:</span> ${escapeHtml(d.task ?? "—")}
      </div>
      <div class="dec-detail">
        <span class="dec-label">Why:</span> ${escapeHtml(d.why ?? "—")}
      </div>
    </div>`;
  }).join("\n");

  const content = `
    <div class="page-header">
      <h1>📋 Decisions</h1>
      <span class="total-badge">${decisions.length} decision${decisions.length !== 1 ? "s" : ""}</span>
    </div>
    <main class="dec-list">
      ${decisions.length === 0 ? '<p class="empty-msg">No decisions logged yet. Use log_decision in a session to record decisions.</p>' : rows}
    </main>
  `;

  return layout(content, { title: "Decisions", activePath: projectId ? `/projects/${projectId}/decisions` : "/decisions", projectId, activeSection: "decisions" });
}
