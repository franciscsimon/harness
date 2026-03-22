// ─── Event Detail Page ─────────────────────────────────────────
import { layout } from "../components/layout.ts";
import { fetchEvent } from "../lib/api.ts";
import { CATEGORY_COLORS, relativeTime, escapeHtml } from "../lib/format.ts";

const CONTENT_KEYS = new Set([
  "message_content", "stream_delta", "tool_input", "tool_content", "tool_details",
  "tool_partial_result", "tool_args", "agent_messages", "system_prompt", "images",
  "context_messages", "provider_payload", "turn_message", "turn_tool_results",
  "compact_branch_entries", "jsonld", "payload",
]);

function prettyPrint(val: string): string {
  try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
}

export async function renderEventDetail(eventId: string, projectId?: string): Promise<string> {
  const row = await fetchEvent(eventId);
  if (!row) {
    return layout(`<div class="page-header"><h1>Event Not Found</h1></div><p class="empty-msg">No event with ID <code>${escapeHtml(eventId)}</code></p>`, { title: "Event Not Found", activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
  }

  const color = CATEGORY_COLORS[row.category] ?? "#999";
  const coreKeys = ["_id", "environment", "event_name", "category", "can_intercept", "schema_version", "ts", "seq", "session_id", "cwd"];
  const coreRows = coreKeys.map((k) => {
    let v = row[k] ?? "—";
    if (k === "ts") v = `${v} (${relativeTime(v)})`;
    return `<tr><td class="field-key">${escapeHtml(k)}</td><td class="field-val">${escapeHtml(String(v))}</td></tr>`;
  }).join("\n");

  const skipKeys = new Set([...coreKeys, "environment"]);
  const scalarRows: string[] = [];
  const contentBlocks: string[] = [];

  for (const [k, v] of Object.entries(row)) {
    if (skipKeys.has(k) || v == null || v === "") continue;
    const val = String(v);
    if (CONTENT_KEYS.has(k) && val.length > 120) {
      const pretty = prettyPrint(val);
      const sizeKb = (val.length / 1024).toFixed(1);
      contentBlocks.push(`<details class="err-details"><summary><span class="err-detail-label" style="display:inline">${escapeHtml(k)}</span> <span style="color:var(--text-dim);font-size:11px">${sizeKb} KB</span></summary><pre class="err-stack">${escapeHtml(pretty)}</pre></details>`);
    } else {
      scalarRows.push(`<tr><td class="field-key">${escapeHtml(k)}</td><td class="field-val">${escapeHtml(val)}</td></tr>`);
    }
  }

  const sessionLink = row.session_id ? `<a href="/sessions/${encodeURIComponent(row.session_id)}" class="back-link">📂 Session</a> <span class="header-sep">·</span>` : "";

  const content = `
    <div class="page-header">
      <h1><a href="${projectId ? `/projects/${projectId}/sessions` : `/sessions`}" class="back-link">← Sessions</a> <span class="header-sep">·</span> ${sessionLink} <span style="color:${color}">●</span> ${escapeHtml(row.event_name ?? "unknown")}</h1>
      <span class="total-badge">#${row.seq ?? "?"}</span>
    </div>
    <div class="card" style="margin-bottom:1rem"><h3 style="margin:0 0 8px">Core</h3><table class="data-table">${coreRows}</table></div>
    ${scalarRows.length > 0 ? `<div class="card" style="margin-bottom:1rem"><h3 style="margin:0 0 8px">Fields</h3><table class="data-table">${scalarRows.join("\n")}</table></div>` : ""}
    ${contentBlocks.length > 0 ? `<div class="card" style="margin-bottom:1rem"><h3 style="margin:0 0 8px">Content</h3>${contentBlocks.join("\n")}</div>` : ""}
  `;
  return layout(content, { title: `${row.event_name} #${row.seq}`, activePath: projectId ? `/projects/${projectId}/sessions` : "/sessions", projectId, activeSection: "sessions" });
}
