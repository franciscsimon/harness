import type { ProjectionRow } from "../lib/db.ts";
import { relativeTime } from "../lib/format.ts";

// ─── Type Colors ───────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  AgentTaskRequested: "#3b82f6",
  AgentReasoningTrace: "#22c55e",
  AgentResultProduced: "#8b5cf6",
  ProjectStateChanged: "#f97316",
};

const DEFAULT_TYPE_COLOR = "#6b7280";

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR;
}

function eventLink(id: string, label: string): string {
  return `<a href="/event/${encodeURIComponent(id)}" class="flow-event-link" title="${esc(id)}">${label}</a>`;
}

function parseJsonArray(val: unknown): string[] {
  if (!val) return [];
  try {
    const arr = typeof val === "string" ? JSON.parse(val) : val;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ─── Card Body Renderers ───────────────────────────────────────

function renderCardBody(p: ProjectionRow): string {
  switch (p.type) {
    case "AgentTaskRequested": {
      const prompt = p.prompt ?? p.prompt_text ?? "";
      return `<div class="flow-field">
        <span class="field-k">prompt:</span>
        <span class="flow-field-val">${esc(truncate(String(prompt), 300))}</span>
      </div>`;
    }

    case "AgentReasoningTrace": {
      const turnIndex = p.turn_index ?? "—";
      const toolCount = p.tool_count ?? 0;
      const thinkingIds = parseJsonArray(p.thinking_event_ids);
      const toolCallIds = parseJsonArray(p.tool_call_event_ids);
      const toolResultIds = parseJsonArray(p.tool_result_event_ids);
      const turnStartLink = p.turn_start_event_id ? eventLink(p.turn_start_event_id, "turn_start") : "";
      const turnEndLink = p.turn_end_event_id ? eventLink(p.turn_end_event_id, "turn_end") : "";

      let html = `<div class="flow-field"><span class="field-k">turn:</span> <span class="flow-field-val">${esc(String(turnIndex))}</span> ${turnStartLink} ${turnEndLink}</div>`;

      if (thinkingIds.length > 0) {
        html += `<div class="flow-field"><span class="field-k">thinking:</span> <span class="flow-field-val">${thinkingIds.length} events ${thinkingIds.slice(0, 3).map(id => eventLink(id, "💭")).join(" ")}</span></div>`;
      }

      if (toolCount > 0) {
        const toolLinks = toolCallIds.map((id, i) => {
          const resultLink = toolResultIds[i] ? ` → ${eventLink(toolResultIds[i], "result")}` : "";
          return `<li>${eventLink(id, "call")}${resultLink}</li>`;
        }).join("");
        html += `<div class="flow-field"><span class="field-k">tools (${toolCount}):</span><ul class="flow-mutation-list">${toolLinks}</ul></div>`;
      }

      return html;
    }

    case "AgentResultProduced": {
      const totalTurns = p.total_turns ?? "—";
      const msgCount = p.total_msg_count ?? "—";
      const summary = p.output_summary ?? null;
      const agentEndLink = p.agent_end_event_id ? eventLink(p.agent_end_event_id, "agent_end") : "";

      let html = `<div class="flow-field"><span class="field-k">turns:</span> <span class="flow-field-val">${esc(String(totalTurns))}</span></div>`;
      html += `<div class="flow-field"><span class="field-k">messages:</span> <span class="flow-field-val">${esc(String(msgCount))}</span> ${agentEndLink}</div>`;
      if (summary) {
        html += `<div class="flow-field"><span class="field-k">output:</span> <span class="flow-field-val">${esc(truncate(summary, 300))}</span></div>`;
      }
      return html;
    }

    case "ProjectStateChanged": {
      const raw = p.mutations ?? "[]";
      let mutations: any[];
      try {
        mutations = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        mutations = [];
      }
      if (!Array.isArray(mutations) || mutations.length === 0) {
        return `<div class="flow-field"><span class="field-k">mutations:</span> <span class="flow-field-val">—</span></div>`;
      }
      const items = mutations.map((m: any) => {
        const summary = m.inputSummary ?? "?";
        const callLink = m.toolCallEventId ? eventLink(m.toolCallEventId, "call") : "";
        const resultLink = m.toolResultEventId ? eventLink(m.toolResultEventId, "result") : "";
        return `<li><code>${esc(String(summary))}</code> ${callLink} ${resultLink}</li>`;
      }).join("\n");
      return `<div class="flow-field">
        <span class="field-k">mutations (${mutations.length}):</span>
        <ul class="flow-mutation-list">${items}</ul>
      </div>`;
    }

    default: {
      // Generic: show all non-core fields
      const skip = new Set(["_id", "session_id", "type", "ts", "_system_from", "_system_to", "_valid_from", "_valid_to"]);
      const entries = Object.entries(p).filter(([k, v]) => !skip.has(k) && v != null && v !== "");
      if (entries.length === 0) return "";
      return entries.map(([k, v]) =>
        `<div class="flow-field"><span class="field-k">${esc(k)}:</span> <span class="flow-field-val">${esc(truncate(String(v), 120))}</span></div>`
      ).join("\n");
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function isEmptyTrace(p: ProjectionRow): boolean {
  if (p.type !== "AgentReasoningTrace") return false;
  const toolCount = Number(p.tool_count ?? 0);
  const thinkingIds = parseJsonArray(p.thinking_event_ids);
  return toolCount === 0 && thinkingIds.length === 0;
}

function renderFullCard(p: ProjectionRow): string {
  const color = typeColor(p.type);
  return `<div class="flow-card" style="--type-color:${color}">
    <div class="flow-card-header">
      <span class="cat-badge" style="background:${color}">${esc(p.type)}</span>
      <span class="tl-time">${relativeTime(p.ts)}</span>
    </div>
    <div class="flow-card-body">${renderCardBody(p)}</div>
  </div>`;
}

function renderCollapsedGroup(traces: ProjectionRow[]): string {
  const color = typeColor("AgentReasoningTrace");
  const turns = traces.map(t => t.turn_index ?? "?");
  const first = turns[0], last = turns[turns.length - 1];
  const label = traces.length === 1
    ? `Turn ${first} — empty`
    : `Turns ${first}–${last} — ${traces.length} empty turns`;
  const gid = `g${traces[0]._id}`;

  const expandedCards = traces.map(t => {
    const turnIdx = t.turn_index ?? "—";
    const startLink = t.turn_start_event_id ? eventLink(t.turn_start_event_id, "turn_start") : "";
    const endLink = t.turn_end_event_id ? eventLink(t.turn_end_event_id, "turn_end") : "";
    return `<div class="flow-collapsed-detail"><span class="field-k">turn ${esc(String(turnIdx))}</span> ${startLink} ${endLink}</div>`;
  }).join("\n");

  return `<div class="flow-collapsed-group" style="--type-color:${color}">
    <div class="flow-collapsed-bar" onclick="var el=document.getElementById('${gid}');el.style.display=el.style.display==='none'?'block':'none'">
      <span class="flow-collapsed-dot" style="background:${color}"></span>
      <span class="flow-collapsed-label">${label}</span>
      <span class="flow-collapsed-toggle">▸</span>
    </div>
    <div id="${gid}" class="flow-collapsed-body" style="display:none">${expandedCards}</div>
  </div>`;
}

// ─── Page Renderer ─────────────────────────────────────────────

export function renderFlow(sessionId: string, projections: ProjectionRow[]): string {
  const name = sessionId.split("/").pop() ?? sessionId;
  const contentCount = projections.filter(p => !isEmptyTrace(p)).length;
  const emptyCount = projections.length - contentCount;

  // Group projections: consecutive empty traces merge into one collapsed row
  const chunks: string[] = [];
  let emptyBuf: ProjectionRow[] = [];

  function flushEmpty() {
    if (emptyBuf.length > 0) {
      chunks.push(renderCollapsedGroup(emptyBuf));
      emptyBuf = [];
    }
  }

  for (const p of projections) {
    if (isEmptyTrace(p)) {
      emptyBuf.push(p);
    } else {
      flushEmpty();
      chunks.push(renderFullCard(p));
    }
  }
  flushEmpty();

  const cards = chunks.join("\n    ");

  const empty = projections.length === 0
    ? `<p class="empty-msg">No projections found for this session.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flow — ${esc(name)}</title>
  <link rel="stylesheet" href="/static/style.css">
  <style>
    .flow-timeline {
      padding: 20px;
      max-width: 720px;
      position: relative;
    }
    .flow-timeline::before {
      content: "";
      position: absolute;
      left: 18px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--border);
    }
    .flow-card {
      position: relative;
      margin-left: 36px;
      margin-bottom: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--type-color, var(--border));
      border-radius: var(--radius);
      padding: 12px 16px;
    }
    .flow-card::before {
      content: "";
      position: absolute;
      left: -27px;
      top: 16px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--type-color, var(--border));
      border: 2px solid var(--bg);
    }
    .flow-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .flow-card-body {
      font-size: 13px;
    }
    .flow-field {
      margin-bottom: 4px;
      color: var(--text-dim);
    }
    .flow-field-val {
      color: var(--text);
    }
    .flow-mutation-list {
      list-style: none;
      margin: 4px 0 0 8px;
    }
    .flow-mutation-list li {
      font-size: 12px;
      color: var(--text-dim);
      margin-bottom: 2px;
    }
    .flow-event-link {
      font-size: 10px; padding: 1px 5px; border-radius: 3px;
      background: #3b82f620; color: #3b82f6; text-decoration: none;
      border: 1px solid #3b82f630;
    }
    .flow-event-link:hover { background: #3b82f640; }
    .flow-mutation-list code {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text-bright);
      background: var(--bg-input);
      padding: 1px 5px;
      border-radius: 3px;
    }
    /* Collapsed empty trace groups */
    .flow-collapsed-group {
      position: relative;
      margin-left: 36px;
      margin-bottom: 8px;
    }
    .flow-collapsed-group::before {
      content: "";
      position: absolute;
      left: -27px;
      top: 10px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-dim);
      border: 2px solid var(--bg);
      opacity: 0.5;
    }
    .flow-collapsed-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 12px;
      border-radius: var(--radius);
      background: var(--bg-card);
      border: 1px dashed var(--border);
      font-size: 12px;
      color: var(--text-dim);
      user-select: none;
    }
    .flow-collapsed-bar:hover {
      background: var(--bg-input);
      color: var(--text);
    }
    .flow-collapsed-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      opacity: 0.5;
      flex-shrink: 0;
    }
    .flow-collapsed-toggle {
      margin-left: auto;
      font-size: 10px;
    }
    .flow-collapsed-body {
      margin: 4px 0 0 20px;
      font-size: 12px;
    }
    .flow-collapsed-detail {
      padding: 2px 0;
      color: var(--text-dim);
    }
  </style>
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
        🔀 Flow
      </h1>
      <span class="total-badge">${contentCount} projections${emptyCount > 0 ? ` · ${emptyCount} empty collapsed` : ""}</span>
    </div>
  </header>
  <main class="flow-timeline">
    ${empty}
    ${cards}
  </main>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
