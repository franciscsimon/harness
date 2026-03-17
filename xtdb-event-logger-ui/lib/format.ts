import type { EventRow } from "./db.ts";

// ─── Category Colors ───────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  session: "#3b82f6",
  compaction: "#8b5cf6",
  agent: "#22c55e",
  message: "#06b6d4",
  tool: "#f97316",
  input: "#eab308",
  model: "#ec4899",
  resource: "#6b7280",
};

// ─── Relative Time ─────────────────────────────────────────────────

export function relativeTime(tsStr: string): string {
  const ts = Number(tsStr);
  if (!ts || isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Pick Display Fields ───────────────────────────────────────────
// Returns the 1-3 most interesting fields for the card summary line.

const FIELD_PICKERS: Record<string, (r: EventRow) => Record<string, string>> = {
  session_directory: (r) => pick(r, ["event_cwd"]),
  session_start: () => ({}),
  session_before_switch: (r) => pick(r, ["switch_reason", "switch_target"]),
  session_switch: (r) => pick(r, ["switch_reason", "switch_previous"]),
  session_before_fork: (r) => pick(r, ["fork_entry_id"]),
  session_fork: (r) => pick(r, ["fork_previous"]),
  session_before_tree: () => ({}),
  session_tree: (r) => pick(r, ["tree_new_leaf", "tree_old_leaf"]),
  session_shutdown: () => ({}),
  session_before_compact: (r) => pick(r, ["compact_tokens"]),
  session_compact: (r) => pick(r, ["compact_from_ext"]),
  before_agent_start: (r) => {
    const f = pick(r, ["prompt_text"]);
    const sp = preview(r, "system_prompt", 50);
    if (sp) f.system_prompt = sp;
    return f;
  },
  agent_start: () => ({}),
  agent_end: (r) => pick(r, ["agent_end_msg_count"]),
  turn_start: (r) => pick(r, ["turn_index"]),
  turn_end: (r) => {
    const f = pick(r, ["turn_index", "turn_end_tool_count"]);
    const msg = preview(r, "turn_message", 50);
    if (msg) f.response = msg;
    return f;
  },
  message_start: (r) => {
    const f = pick(r, ["message_role"]);
    const p = preview(r, "message_content", 50);
    if (p) f.content = p;
    return f;
  },
  message_update: (r) => {
    const f: Record<string, string> = {};
    const delta = r.stream_delta;
    if (delta) {
      f.delta = String(delta).length > 60 ? String(delta).slice(0, 57) + "..." : String(delta);
    } else {
      Object.assign(f, pick(r, ["stream_delta_type", "stream_delta_len"]));
    }
    return f;
  },
  message_end: (r) => {
    const f = pick(r, ["message_role"]);
    const p = preview(r, "message_content", 50);
    if (p) f.content = p;
    return f;
  },
  tool_call: (r) => {
    const f = pick(r, ["tool_name"]);
    const inp = preview(r, "tool_input", 50);
    if (inp) f.input = inp;
    return f;
  },
  tool_result: (r) => {
    const f = pick(r, ["tool_name", "is_error"]);
    const out = preview(r, "tool_content", 50);
    if (out) f.output = out;
    return f;
  },
  tool_execution_start: (r) => {
    const f = pick(r, ["tool_name"]);
    const args = preview(r, "tool_args", 50);
    if (args) f.args = args;
    return f;
  },
  tool_execution_update: (r) => {
    const f = pick(r, ["tool_name"]);
    const partial = preview(r, "tool_partial_result", 50);
    if (partial) f.partial = partial;
    return f;
  },
  tool_execution_end: (r) => {
    const f = pick(r, ["tool_name", "is_error"]);
    const out = preview(r, "tool_content", 50);
    if (out) f.output = out;
    return f;
  },
  context: (r) => pick(r, ["context_msg_count"]),
  before_provider_request: (r) => pick(r, ["provider_payload_bytes"]),
  input: (r) => pick(r, ["input_text", "input_source"]),
  user_bash: (r) => pick(r, ["bash_command", "bash_exclude"]),
  model_select: (r) => {
    const fields: Record<string, string> = {};
    if (r.model_provider && r.model_id) fields.model = `${r.model_provider}/${r.model_id}`;
    if (r.prev_model_provider && r.prev_model_id) fields.prev = `${r.prev_model_provider}/${r.prev_model_id}`;
    if (r.model_source) fields.source = r.model_source;
    return fields;
  },
  resources_discover: () => ({}),
};

function pick(r: EventRow, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = r[k];
    if (v != null && v !== "") {
      out[k] = String(v).length > 80 ? String(v).slice(0, 77) + "..." : String(v);
    }
  }
  return out;
}

/** Extract a short text preview from a JSON content field. */
function preview(r: EventRow, key: string, max = 60): string | null {
  const v = r[key];
  if (v == null || v === "") return null;
  const s = String(v);
  // Try to extract readable text from JSON
  try {
    const parsed = JSON.parse(s);
    // Common shapes: string, { text }, [{ type: "text", text }], { role, content: [{ type, text }] }
    let text: string | null = null;
    if (typeof parsed === "string") {
      text = parsed;
    } else if (parsed?.text) {
      text = parsed.text;
    } else if (parsed?.role && Array.isArray(parsed?.content)) {
      // Message object — find first text block (skip thinking blocks)
      const textBlock = parsed.content.find((b: any) => b?.type === "text" && b?.text);
      text = textBlock?.text ?? `[${parsed.role}] ${parsed.content.length} blocks`;
    } else if (Array.isArray(parsed)) {
      const first = parsed[0];
      text = first?.text ?? first?.content?.[0]?.text ?? `[${parsed.length} items]`;
    }
    if (!text) text = s;
    const flat = String(text).replace(/\s+/g, " ").trim();
    return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
  } catch {
    const flat = s.replace(/\s+/g, " ").trim();
    return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
  }
}

export function getDisplayFields(row: EventRow): Record<string, string> {
  const picker = FIELD_PICKERS[row.event_name];
  return picker ? picker(row) : {};
}

// ─── Populated Columns ────────────────────────────────────────────
// For the detail view — returns all non-null, non-core columns.

const CORE_KEYS = new Set([
  "_id", "environment", "event_name", "category", "can_intercept",
  "schema_version", "ts", "seq", "session_id", "cwd", "jsonld",
  // XTDB system columns (appear via SELECT *)
  "_system_from", "_system_to", "_valid_from", "_valid_to",
]);

export function getPopulatedFields(row: EventRow): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!CORE_KEYS.has(k) && v != null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

// ─── Compact event for SSE ─────────────────────────────────────────

export function compactEvent(row: EventRow): object {
  return {
    id: row._id,
    eventName: row.event_name,
    category: row.category,
    canIntercept: row.can_intercept,
    seq: Number(row.seq),
    ts: Number(row.ts),
    sessionId: row.session_id,
    cwd: row.cwd,
    fields: getDisplayFields(row),
  };
}
