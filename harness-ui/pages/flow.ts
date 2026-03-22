// ─── Flow Page ─────────────────────────────────────────────────
// Ported from xtdb-event-logger-ui/pages/flow.ts
// Shows projection-based flow: tasks, reasoning traces, results, changes.

import { layout } from "../components/layout.ts";
import { fetchProjections } from "../lib/api.ts";
import { relativeTime, escapeHtml } from "../lib/format.ts";

const TYPE_COLORS: Record<string, string> = {
  AgentTaskRequested: "#3b82f6",
  AgentReasoningTrace: "#22c55e",
  AgentResultProduced: "#8b5cf6",
  ProjectStateChanged: "#f97316",
};

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#6b7280";
}

function parseJsonArray(val: unknown): string[] {
  if (!val) return [];
  try {
    const arr = typeof val === "string" ? JSON.parse(val) : val;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function renderCardBody(p: any): string {
  switch (p.type) {
    case "AgentTaskRequested": {
      const prompt = p.prompt ?? p.prompt_text ?? "";
      return `<div class="flow-field">
        <span class="field-k">prompt:</span>
        <span>${escapeHtml(trunc(String(prompt), 300))}</span>
      </div>`;
    }
    case "AgentReasoningTrace": {
      const turnIndex = p.turn_index ?? "—";
      const toolCount = p.tool_count ?? 0;
      const thinkingIds = parseJsonArray(p.thinking_event_ids);
      const toolCallIds = parseJsonArray(p.tool_call_event_ids);
      const toolSummary = p.tools_summary ?? "";
      return `<div class="flow-field"><span class="field-k">turn:</span> ${escapeHtml(String(turnIndex))}</div>
        <div class="flow-field"><span class="field-k">tools:</span> ${escapeHtml(String(toolCount))} calls</div>
        ${toolSummary ? `<div class="flow-field"><span class="field-k">summary:</span> ${escapeHtml(trunc(String(toolSummary), 200))}</div>` : ""}
        <div class="flow-field" style="color:var(--text-dim);font-size:11px">
          ${thinkingIds.length} thinking · ${toolCallIds.length} tool calls
        </div>`;
    }
    case "AgentResultProduced": {
      const output = p.output_summary ?? "";
      const totalTurns = p.total_turns ?? "—";
      const totalMsgs = p.total_msg_count ?? "—";
      return `<div class="flow-field"><span class="field-k">turns:</span> ${escapeHtml(String(totalTurns))}, <span class="field-k">messages:</span> ${escapeHtml(String(totalMsgs))}</div>
        ${output ? `<div class="flow-field"><span class="field-k">output:</span> ${escapeHtml(trunc(String(output), 300))}</div>` : ""}`;
    }
    case "ProjectStateChanged": {
      const mutations = p.mutations ?? "";
      const mutCount = p.mutating_tool_count ?? 0;
      return `<div class="flow-field"><span class="field-k">mutations:</span> ${escapeHtml(String(mutCount))} tool calls</div>
        ${mutations ? `<div class="flow-field">${escapeHtml(trunc(String(mutations), 300))}</div>` : ""}`;
    }
    default:
      return `<div class="flow-field" style="color:var(--text-dim)">Unknown projection type</div>`;
  }
}

function hasContent(p: any): boolean {
  switch (p.type) {
    case "AgentTaskRequested": return !!(p.prompt || p.prompt_text);
    case "AgentReasoningTrace": return true;
    case "AgentResultProduced": return !!(p.output_summary || p.total_turns);
    case "ProjectStateChanged": return !!(p.mutations || p.mutating_tool_count);
    default: return false;
  }
}

export async function renderFlow(sessionId: string, projectId?: string): Promise<string> {
  const projections = (await fetchProjections(sessionId)) ?? [];
  const name = sessionId.split("/").pop() ?? sessionId;

  const withContent = projections.filter(hasContent);
  const emptyCount = projections.length - withContent.length;

  const cards = withContent.map((p: any) => {
    const color = typeColor(p.type);
    const typeName = p.type?.replace(/([A-Z])/g, " $1").trim() ?? "Unknown";
    return `<div class="flow-card" style="--type-color:${color}">
      <div class="flow-card-header">
        <span class="flow-type-badge" style="background:color-mix(in srgb, ${color} 20%, transparent);color:${color};border:1px solid color-mix(in srgb, ${color} 30%, transparent)">${escapeHtml(typeName)}</span>
        <span class="flow-task-id" style="color:var(--text-dim);font-size:11px">${escapeHtml(p.task_id ?? "")}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text-dim)">${relativeTime(p.ts)}</span>
      </div>
      <div class="flow-card-body">${renderCardBody(p)}</div>
    </div>`;
  }).join("\n");

  const emptyNote = emptyCount > 0
    ? `<p style="color:var(--text-dim);font-size:12px;padding:0 4px">${emptyCount} empty projection${emptyCount > 1 ? "s" : ""} collapsed</p>`
    : "";

  const content = `
    <div class="page-header">
      <h1>
        <a href="${projectId ? `/projects/${projectId}/sessions` : `/sessions`}" class="back-link">← Sessions</a>
        <span class="header-sep">·</span>
        <a href="${projectId ? `/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}` : `/sessions/${encodeURIComponent(sessionId)}`}" class="back-link">📂 ${escapeHtml(name)}</a>
        <span class="header-sep">·</span>
        🔀 Flow
      </h1>
      <span class="total-badge">${withContent.length} projections</span>
    </div>
    ${emptyNote}
    <main class="flow-timeline">
      ${projections.length === 0 ? '<p class="empty-msg">No projections for this session. The xtdb-projector extension creates these during agent runs.</p>' : cards}
    </main>
  `;

  return layout(content, { title: `Flow — ${name}`, activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
}
