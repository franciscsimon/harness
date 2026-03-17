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
      const turnIndex = p.turn_index ?? p.turnIndex ?? "—";
      const toolCount = p.tool_count ?? p.toolCount ?? 0;
      return `<div class="flow-field">
        <span class="field-k">turn:</span> <span class="flow-field-val">${esc(String(turnIndex))}</span>
      </div>
      <div class="flow-field">
        <span class="field-k">tools:</span> <span class="flow-field-val">${esc(String(toolCount))}</span>
      </div>`;
    }

    case "AgentResultProduced": {
      const totalTurns = p.total_turns ?? p.totalTurns ?? "—";
      const msgCount = p.msg_count ?? p.msgCount ?? p.message_count ?? "—";
      return `<div class="flow-field">
        <span class="field-k">totalTurns:</span> <span class="flow-field-val">${esc(String(totalTurns))}</span>
      </div>
      <div class="flow-field">
        <span class="field-k">msgCount:</span> <span class="flow-field-val">${esc(String(msgCount))}</span>
      </div>`;
    }

    case "ProjectStateChanged": {
      const raw = p.mutations ?? p.mutation ?? "[]";
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
        const op = m.op ?? m.type ?? "?";
        const path = m.path ?? m.key ?? m.file ?? "?";
        return `<li><code>${esc(String(op))}</code> ${esc(String(path))}</li>`;
      }).join("\n");
      return `<div class="flow-field">
        <span class="field-k">mutations:</span>
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

// ─── Page Renderer ─────────────────────────────────────────────

export function renderFlow(sessionId: string, projections: ProjectionRow[]): string {
  const name = sessionId.split("/").pop() ?? sessionId;

  const cards = projections.map((p) => {
    const color = typeColor(p.type);
    const body = renderCardBody(p);

    return `<div class="flow-card" style="--type-color:${color}">
      <div class="flow-card-header">
        <span class="cat-badge" style="background:${color}">${esc(p.type)}</span>
        <span class="tl-time">${relativeTime(p.ts)}</span>
      </div>
      <div class="flow-card-body">${body}</div>
    </div>`;
  }).join("\n    ");

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
    .flow-mutation-list code {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text-bright);
      background: var(--bg-input);
      padding: 1px 5px;
      border-radius: 3px;
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
      <span class="total-badge">${projections.length} projections</span>
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
