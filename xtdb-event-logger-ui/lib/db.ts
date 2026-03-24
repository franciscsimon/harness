import postgres from "postgres";
import { createLogger } from "../../lib/logger.ts";

const log = createLogger("xtdb-event-logger-ui:db");

// ─── Config ────────────────────────────────────────────────────────

const host = process.env.XTDB_EVENT_HOST ?? "localhost";
const port = Number(process.env.XTDB_EVENT_PORT ?? "5433");

const sql = postgres({
  host,
  port,
  database: "xtdb",
  user: process.env.XTDB_USER ?? "xtdb",
  password: process.env.XTDB_PASSWORD ?? "xtdb",
  max: 3,
  idle_timeout: 30,
  connect_timeout: 10,
});

const t = (v: string | null) => sql.typed(v as any, 25);
const n = (v: number | null) => sql.typed(v as any, 20);

// ─── Ensure tables exist (XTDB is schema-on-write) ────────────────
// XTDB requires typed parameters (OID 25=text, 20=bigint, 16=boolean)
// and quoting of reserved words (name, path, version, status, etc.).

const RESERVED = new Set([
  "position",
  "type",
  "name",
  "status",
  "version",
  "source",
  "path",
  "url",
  "description",
  "tag",
]);
function q(col: string): string {
  return RESERVED.has(col) ? `"${col}"` : col;
}

type ColType = "text" | "bigint" | "boolean";
interface SeedDef {
  table: string;
  columns: Record<string, ColType>;
}

const seedDefs: SeedDef[] = [
  {
    table: "decisions",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      ts: "bigint",
      task: "text",
      what: "text",
      outcome: "text",
      why: "text",
      files: "text",
      alternatives: "text",
      agent: "text",
      tags: "text",
      jsonld: "text",
    },
  },
  {
    table: "projects",
    columns: {
      _id: "text",
      canonical_id: "text",
      name: "text",
      identity_type: "text",
      git_remote_url: "text",
      git_root_path: "text",
      first_seen_ts: "bigint",
      last_seen_ts: "bigint",
      session_count: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "session_projects",
    columns: {
      _id: "text",
      session_id: "text",
      project_id: "text",
      canonical_id: "text",
      cwd: "text",
      git_root_path: "text",
      ts: "bigint",
      is_first_session: "boolean",
      jsonld: "text",
    },
  },
  {
    table: "delegations",
    columns: {
      _id: "text",
      parent_session_id: "text",
      child_session_id: "text",
      project_id: "text",
      agent_name: "text",
      task: "text",
      status: "text",
      exit_code: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "file_metrics",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      file_path: "text",
      edit_count: "bigint",
      error_count: "bigint",
      ts: "bigint",
    },
  },
  {
    table: "session_postmortems",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      goal: "text",
      what_worked: "text",
      what_failed: "text",
      files_changed: "text",
      error_count: "bigint",
      turn_count: "bigint",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "artifacts",
    columns: {
      _id: "text",
      project_id: "text",
      session_id: "text",
      path: "text",
      content_hash: "text",
      kind: "text",
      operation: "text",
      tool_call_id: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "artifact_versions",
    columns: {
      _id: "text",
      session_id: "text",
      path: "text",
      relative_path: "text",
      version: "bigint",
      content_hash: "text",
      content: "text",
      size_bytes: "bigint",
      operation: "text",
      tool_call_id: "text",
      ts: "bigint",
      jsonld: "text",
    },
  },
  {
    table: "artifact_reads",
    columns: { _id: "text", session_id: "text", path: "text", tool_call_id: "text", ts: "bigint" },
  },
];

const OID: Record<ColType, number> = { text: 25, bigint: 20, boolean: 16 };
const ZERO: Record<ColType, string | number | boolean> = { text: "", bigint: 0, boolean: false };

async function ensureTables(): Promise<void> {
  const SEED_ID = "__ui_seed__";
  for (const def of seedDefs) {
    const cols = Object.keys(def.columns);
    const types = Object.values(def.columns);
    const colList = cols.map(q).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((col, i) =>
      col === "_id" ? sql.typed(SEED_ID as any, OID[types[i]]) : sql.typed(ZERO[types[i]] as any, OID[types[i]]),
    );
    try {
      await sql.unsafe(`INSERT INTO ${def.table} (${colList}) VALUES (${placeholders})`, values);
      await sql.unsafe(`DELETE FROM ${def.table} WHERE _id = $1`, [sql.typed(SEED_ID as any, 25)]);
    } catch {
      /* table may already exist */
    }
  }
}

const _tablesReady = ensureTables();

// ─── Core columns every row has ────────────────────────────────────

// No hardcoded column list — XTDB is schema-on-write.
// SELECT * picks up any new columns automatically.
// The EventRow interface uses [key: string]: any for dynamic fields.

// ─── Queries ───────────────────────────────────────────────────────

export interface EventRow {
  _id: string;
  environment: string;
  event_name: string;
  category: string;
  can_intercept: boolean;
  schema_version: string;
  ts: string;
  seq: string;
  session_id: string | null;
  cwd: string | null;
  [key: string]: any;
}

export interface StatsResult {
  total: number;
  byCategory: Record<string, number>;
}

export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  firstTs: number;
  lastTs: number;
  lastEventName: string;
  lastSeq: number;
  byCategory: Record<string, number>;
  errorRate: number;
  turnCount: number;
  maxPayloadBytes: number;
  durationMs: number;
}

/**
 * Get events with optional filters. Returns newest first by default.
 */
export async function getEvents(
  opts: { category?: string; eventName?: string; sessionId?: string; afterSeq?: number; limit?: number } = {},
): Promise<EventRow[]> {
  const limit = opts.limit ?? 100;

  // Use typed helpers (t/n) with tagged templates for XTDB compatibility.
  // Select only needed columns to avoid OOM on 22K+ rows with large text blobs.
  if (opts.afterSeq != null) {
    const rows = await sql`
      SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
        tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
        turn_index, input_source, compact_tokens, provider_payload_bytes,
        switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
        context_msg_count, stream_delta_type, stream_delta_len
      FROM events WHERE seq > ${n(opts.afterSeq)} ORDER BY seq ASC LIMIT ${n(200)}
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.sessionId) {
    const rows = await sql`
      SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
        tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
        turn_index, input_source, compact_tokens, provider_payload_bytes,
        switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
        context_msg_count, stream_delta_type, stream_delta_len
      FROM events WHERE session_id = ${t(opts.sessionId)} ORDER BY seq DESC LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.eventName) {
    const rows = await sql`
      SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
        tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
        turn_index, input_source, compact_tokens, provider_payload_bytes,
        switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
        context_msg_count, stream_delta_type, stream_delta_len
      FROM events WHERE event_name = ${t(opts.eventName)} ORDER BY seq DESC LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.category) {
    const rows = await sql`
      SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
        tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
        turn_index, input_source, compact_tokens, provider_payload_bytes,
        switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
        context_msg_count, stream_delta_type, stream_delta_len
      FROM events WHERE category = ${t(opts.category)} ORDER BY seq DESC LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  const rows = await sql`
    SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
      tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
      turn_index, input_source, compact_tokens, provider_payload_bytes,
      switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
      context_msg_count, stream_delta_type, stream_delta_len
    FROM events ORDER BY seq DESC LIMIT ${n(limit)}
  `;
  return rows as unknown as EventRow[];
}

/**
 * Get events newer than a given seq (for SSE polling).
 */
export async function getEventsSince(afterSeq: number): Promise<EventRow[]> {
  const rows = await sql`
    SELECT _id, event_name, category, can_intercept, seq, ts, session_id, cwd,
      tool_name, tool_call_id, is_error, message_role, model_provider, model_id,
      turn_index, input_source, compact_tokens, provider_payload_bytes,
      switch_reason, switch_target, agent_end_msg_count, turn_end_tool_count,
      context_msg_count, stream_delta_type, stream_delta_len
    FROM events WHERE seq > ${n(afterSeq)} ORDER BY seq ASC LIMIT ${n(200)}
  `;
  return rows as unknown as EventRow[];
}

/**
 * Get a single event by ID.
 */
export async function getEvent(id: string): Promise<EventRow | null> {
  const rows = await sql`
    SELECT * FROM events
    WHERE _id = ${t(id)}
  `;
  return (rows[0] as unknown as EventRow) ?? null;
}

/**
 * Get distinct session IDs.
 */
export async function getSessions(): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT session_id FROM events
    WHERE session_id IS NOT NULL
    ORDER BY session_id
  `;
  return rows.map((r: any) => r.session_id);
}

/**
 * Get event counts by category + total.
 */
export async function getStats(): Promise<StatsResult> {
  const rows = await sql`
    SELECT category, COUNT(*) AS cnt FROM events
    GROUP BY category ORDER BY category
  `;
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const c = Number(r.cnt);
    byCategory[r.category] = c;
    total += c;
  }
  return { total, byCategory };
}

/**
 * Get all sessions with summary stats (for session list page).
 */
export async function getSessionList(): Promise<SessionSummary[]> {
  // XTDB SQL is limited — no aggregate in ORDER BY, no complex subqueries.
  // Use simple queries and assemble in JS.

  // 1. Aggregates per session
  const agg = await sql`
    SELECT session_id, COUNT(*) AS cnt, MIN(ts) AS first_ts, MAX(ts) AS last_ts, MAX(seq) AS max_seq
    FROM events WHERE session_id IS NOT NULL
    GROUP BY session_id
  `;

  // 2. Category breakdown per session
  const cats = await sql`
    SELECT session_id, category, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL
    GROUP BY session_id, category
  `;
  const catMap: Record<string, Record<string, number>> = {};
  for (const r of cats) {
    if (!catMap[r.session_id]) catMap[r.session_id] = {};
    catMap[r.session_id][r.category] = Number(r.cnt);
  }

  // 3. Get all events to find last event name per session
  //    (XTDB doesn't support correlated subqueries / JOIN with GROUP BY well)
  const allEvts = await sql`
    SELECT session_id, event_name, seq
    FROM events WHERE session_id IS NOT NULL
    ORDER BY seq DESC
  `;
  const lastMap: Record<string, { name: string; seq: number }> = {};
  for (const r of allEvts) {
    if (!lastMap[r.session_id]) {
      lastMap[r.session_id] = { name: r.event_name, seq: Number(r.seq) };
    }
  }

  // 4. Turn counts per session
  const turns = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'turn_start'
    GROUP BY session_id
  `;
  const turnMap: Record<string, number> = {};
  for (const r of turns) turnMap[r.session_id] = Number(r.cnt);

  // 5. Tool error rates per session
  const toolTotals = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'tool_execution_end'
    GROUP BY session_id
  `;
  const toolErrors = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'tool_execution_end' AND is_error = true
    GROUP BY session_id
  `;
  const ttMap: Record<string, number> = {};
  const teMap: Record<string, number> = {};
  for (const r of toolTotals) ttMap[r.session_id] = Number(r.cnt);
  for (const r of toolErrors) teMap[r.session_id] = Number(r.cnt);

  // 6. Max payload per session
  const payloads = await sql`
    SELECT session_id, MAX(provider_payload_bytes) AS max_bytes
    FROM events WHERE session_id IS NOT NULL AND provider_payload_bytes IS NOT NULL
    GROUP BY session_id
  `;
  const plMap: Record<string, number> = {};
  for (const r of payloads) plMap[r.session_id] = Number(r.max_bytes);

  // Sort by last_ts DESC in JS
  const sorted = [...agg].sort((a: any, b: any) => Number(b.last_ts) - Number(a.last_ts));

  return sorted.map((r: any) => {
    const sid = r.session_id;
    const tt = ttMap[sid] ?? 0;
    const te = teMap[sid] ?? 0;
    return {
      sessionId: sid,
      eventCount: Number(r.cnt),
      firstTs: Number(r.first_ts),
      lastTs: Number(r.last_ts),
      lastEventName: lastMap[sid]?.name ?? "—",
      lastSeq: lastMap[sid]?.seq ?? Number(r.max_seq),
      byCategory: catMap[sid] ?? {},
      errorRate: tt > 0 ? te / tt : 0,
      turnCount: turnMap[sid] ?? 0,
      maxPayloadBytes: plMap[sid] ?? 0,
      durationMs: Number(r.last_ts) - Number(r.first_ts),
    };
  });
}

/**
 * Get all events for a single session, ordered by seq ASC (for timeline).
 */
export async function getSessionEvents(sessionId: string): Promise<EventRow[]> {
  const rows = await sql`
    SELECT * FROM events
    WHERE session_id = ${t(sessionId)}
    ORDER BY seq ASC
  `;
  return rows as unknown as EventRow[];
}

/**
 * Get the highest seq number currently in the DB.
 */
export async function getMaxSeq(): Promise<number> {
  const rows = await sql`SELECT MAX(seq) AS mx FROM events`;
  return Number(rows[0]?.mx ?? -1);
}

// ─── Dashboard Queries ─────────────────────────────────────────

export interface DashboardSession {
  sessionId: string;
  eventCount: number;
  errorRate: number;
  turnCount: number;
  maxPayloadBytes: number;
  durationMs: number;
  firstTs: number;
  lastTs: number;
}

export interface ToolUsageStat {
  tool: string;
  count: number;
  errors: number;
  errorRate: number;
}

/**
 * Get per-session metrics for the dashboard.
 */
export async function getDashboardSessions(): Promise<DashboardSession[]> {
  // Event counts + timestamps
  const agg = await sql`
    SELECT session_id, COUNT(*) AS cnt, MIN(ts) AS first_ts, MAX(ts) AS last_ts
    FROM events WHERE session_id IS NOT NULL
    GROUP BY session_id
  `;

  // Turn counts per session
  const turns = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'turn_start'
    GROUP BY session_id
  `;
  const turnMap: Record<string, number> = {};
  for (const r of turns) turnMap[r.session_id] = Number(r.cnt);

  // Tool errors per session
  const toolTotals = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'tool_execution_end'
    GROUP BY session_id
  `;
  const toolErrors = await sql`
    SELECT session_id, COUNT(*) AS cnt
    FROM events WHERE session_id IS NOT NULL AND event_name = 'tool_execution_end' AND is_error = true
    GROUP BY session_id
  `;
  const totalMap: Record<string, number> = {};
  const errorMap: Record<string, number> = {};
  for (const r of toolTotals) totalMap[r.session_id] = Number(r.cnt);
  for (const r of toolErrors) errorMap[r.session_id] = Number(r.cnt);

  // Max payload per session
  const payloads = await sql`
    SELECT session_id, MAX(provider_payload_bytes) AS max_bytes
    FROM events WHERE session_id IS NOT NULL AND provider_payload_bytes IS NOT NULL
    GROUP BY session_id
  `;
  const payloadMap: Record<string, number> = {};
  for (const r of payloads) payloadMap[r.session_id] = Number(r.max_bytes);

  return agg.map((r: any) => {
    const sid = r.session_id;
    const total = totalMap[sid] ?? 0;
    const errors = errorMap[sid] ?? 0;
    return {
      sessionId: sid,
      eventCount: Number(r.cnt),
      errorRate: total > 0 ? errors / total : 0,
      turnCount: turnMap[sid] ?? 0,
      maxPayloadBytes: payloadMap[sid] ?? 0,
      durationMs: Number(r.last_ts) - Number(r.first_ts),
      firstTs: Number(r.first_ts),
      lastTs: Number(r.last_ts),
    };
  });
}

/**
 * Get tool usage statistics across all sessions.
 */
export async function getToolUsageStats(): Promise<ToolUsageStat[]> {
  const totals = await sql`
    SELECT tool_name, COUNT(*) AS cnt
    FROM events WHERE event_name = 'tool_execution_end' AND tool_name IS NOT NULL
    GROUP BY tool_name ORDER BY cnt DESC
  `;
  const errors = await sql`
    SELECT tool_name, COUNT(*) AS cnt
    FROM events WHERE event_name = 'tool_execution_end' AND tool_name IS NOT NULL AND is_error = true
    GROUP BY tool_name
  `;
  const errMap: Record<string, number> = {};
  for (const r of errors) errMap[r.tool_name] = Number(r.cnt);

  return totals.map((r: any) => {
    const total = Number(r.cnt);
    const errs = errMap[r.tool_name] ?? 0;
    return {
      tool: r.tool_name,
      count: total,
      errors: errs,
      errorRate: total > 0 ? errs / total : 0,
    };
  });
}

/**
 * Get session knowledge data for knowledge extraction.
 */
export interface SessionKnowledge {
  filesModified: string[];
  toolUsage: Record<string, number>;
  errorCount: number;
  turnCount: number;
  bashCommands: string[];
  durationMs: number;
  eventCount: number;
}

export async function getSessionKnowledge(sessionId: string): Promise<SessionKnowledge | null> {
  const events = await getSessionEvents(sessionId);
  if (events.length === 0) return null;

  const toolUsage: Record<string, number> = {};
  const files = new Set<string>();
  const bashCmds: string[] = [];
  let errorCount = 0;
  let turnCount = 0;

  for (const ev of events) {
    if (ev.event_name === "tool_execution_end" && ev.tool_name) {
      toolUsage[ev.tool_name] = (toolUsage[ev.tool_name] ?? 0) + 1;
      if (ev.is_error) errorCount++;
    }
    if (ev.event_name === "turn_start") turnCount++;
    if (ev.bash_command) bashCmds.push(ev.bash_command);
    // Track file modifications from tool args (Write/Edit paths)
    if (ev.event_name === "tool_execution_start" && (ev.tool_name === "write" || ev.tool_name === "edit")) {
      try {
        if (ev.tool_args) {
          const p = typeof ev.tool_args === "string" ? JSON.parse(ev.tool_args) : ev.tool_args;
          if (p?.path) files.add(p.path);
        }
      } catch (e) { log.error({ err: e }, "Query error"); }
    }
  }

  const firstTs = Number(events[0].ts);
  const lastTs = Number(events[events.length - 1].ts);

  return {
    filesModified: [...files],
    toolUsage,
    errorCount,
    turnCount,
    bashCommands: bashCmds,
    durationMs: lastTs - firstTs,
    eventCount: events.length,
  };
}

/**
 * Get most common error patterns across all sessions.
 */
export interface ErrorPattern {
  toolName: string;
  count: number;
  sessionCount: number;
}

export async function getErrorPatterns(): Promise<ErrorPattern[]> {
  const rows = await sql`
    SELECT tool_name, COUNT(*) AS cnt
    FROM events
    WHERE event_name = 'tool_execution_end' AND is_error = true AND tool_name IS NOT NULL
    GROUP BY tool_name
    ORDER BY cnt DESC
  `;
  // Count distinct sessions per erroring tool
  const sesRows = await sql`
    SELECT tool_name, COUNT(DISTINCT session_id) AS ses_cnt
    FROM events
    WHERE event_name = 'tool_execution_end' AND is_error = true AND tool_name IS NOT NULL
    GROUP BY tool_name
  `;
  const sesMap: Record<string, number> = {};
  for (const r of sesRows) sesMap[r.tool_name] = Number(r.ses_cnt);

  return rows.map((r: any) => ({
    toolName: r.tool_name,
    count: Number(r.cnt),
    sessionCount: sesMap[r.tool_name] ?? 0,
  }));
}

/**
 * Delete all events from the database.
 * Uses ERASE (hard delete) so rows don't linger in XTDB's temporal history.
 */
export async function wipeAllEvents(): Promise<number> {
  const before = await sql`SELECT COUNT(*) AS cnt FROM events`;
  const count = Number(before[0].cnt);
  if (count > 0) {
    await sql`ERASE FROM events WHERE _id IS NOT NULL`;
  }
  return count;
}

// ─── Projections ───────────────────────────────────────────────

export interface ProjectionRow {
  _id: string;
  session_id: string;
  type: string;
  ts: string;
  [key: string]: any;
}

/**
 * Get all projections for a session, ordered chronologically.
 */
export async function getProjections(sessionId: string): Promise<ProjectionRow[]> {
  const rows = await sql`
    SELECT * FROM projections
    WHERE session_id = ${t(sessionId)}
    ORDER BY ts ASC
  `;
  return rows as unknown as ProjectionRow[];
}

// ─── Projects ──────────────────────────────────────────────────

export interface ProjectRow {
  _id: string;
  canonical_id: string;
  name: string;
  identity_type: string;
  git_remote_url: string | null;
  git_root_path: string | null;
  first_seen_ts: string;
  last_seen_ts: string;
  session_count: string;
  lifecycle_phase: string | null;
  jsonld: string;
}

export interface SessionProjectRow {
  _id: string;
  session_id: string;
  project_id: string;
  canonical_id: string;
  cwd: string;
  git_root_path: string | null;
  ts: string;
  is_first_session: boolean;
}

/**
 * Get all registered projects, most recently seen first.
 */
export async function getProjects(): Promise<ProjectRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM projects ORDER BY last_seen_ts DESC
  `;
  return rows as unknown as ProjectRow[];
}

/**
 * Get a single project by ID.
 */
export async function getProject(id: string): Promise<ProjectRow | null> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM projects WHERE _id = ${t(id)}
  `;
  return (rows[0] as unknown as ProjectRow) ?? null;
}

/**
 * Resolve a project name (e.g. "harness") to its XTDB _id (e.g. "proj:ac75514059c1").
 * Returns the name unchanged if no matching project is found.
 */
export async function resolveProjectId(nameOrId: string): Promise<string> {
  if (nameOrId.startsWith("proj:")) return nameOrId;
  await _tablesReady;
  const rows = await sql`
    SELECT _id FROM projects WHERE name = ${t(nameOrId)}
  `;
  return (rows[0] as any)?._id ?? nameOrId;
}

/**
 * Get all session links for a project, most recent first.
 */
export async function getProjectSessions(projectId: string): Promise<SessionProjectRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM session_projects
    WHERE project_id = ${t(projectId)}
    ORDER BY ts DESC
  `;
  return rows as unknown as SessionProjectRow[];
}

// ─── Decisions ─────────────────────────────────────────────────

export interface DecisionRow {
  _id: string;
  project_id: string;
  session_id: string;
  ts: string;
  task: string;
  what: string;
  outcome: string;
  why: string;
  jsonld: string;
}

/**
 * Get all decisions, newest first.
 */
export async function getDecisions(): Promise<DecisionRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM decisions ORDER BY ts DESC
  `;
  return rows as unknown as DecisionRow[];
}

/**
 * Get decisions for a specific project, newest first.
 */
export async function getProjectDecisions(projectId: string): Promise<DecisionRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM decisions
    WHERE project_id = ${t(projectId)}
    ORDER BY ts DESC
  `;
  return rows as unknown as DecisionRow[];
}

// ─── Delegations ───────────────────────────────────────────────

export interface DelegationRow {
  _id: string;
  parent_session_id: string;
  child_session_id: string | null;
  project_id: string | null;
  agent_name: string;
  task: string;
  status: string;
  exit_code: string;
  ts: string;
  jsonld: string;
}

/**
 * Get all delegations, newest first.
 */
export async function getDelegations(): Promise<DelegationRow[]> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM delegations ORDER BY ts DESC`;
  return rows as unknown as DelegationRow[];
}

/**
 * Get delegations for a specific session (as parent).
 */
export async function getSessionDelegations(sessionId: string): Promise<DelegationRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM delegations
    WHERE parent_session_id = ${t(sessionId)}
    ORDER BY ts DESC
  `;
  return rows as unknown as DelegationRow[];
}

// ─── Session Post-mortems ──────────────────────────────────────

export interface PostmortemRow {
  _id: string;
  project_id: string | null;
  session_id: string;
  goal: string | null;
  what_worked: string;
  what_failed: string;
  files_changed: string;
  error_count: string;
  turn_count: string;
  ts: string;
  jsonld: string;
}

/**
 * Get all post-mortems, newest first.
 */
export async function getPostmortems(): Promise<PostmortemRow[]> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM session_postmortems ORDER BY ts DESC`;
  return rows as unknown as PostmortemRow[];
}

/**
 * Get post-mortems for a specific project.
 */
export async function getProjectPostmortems(projectId: string): Promise<PostmortemRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM session_postmortems
    WHERE project_id = ${t(projectId)}
    ORDER BY ts DESC
  `;
  return rows as unknown as PostmortemRow[];
}

// ─── Artifacts ─────────────────────────────────────────────────

export interface ArtifactRow {
  _id: string;
  project_id: string | null;
  session_id: string;
  path: string;
  content_hash: string | null;
  kind: string;
  operation: string;
  tool_call_id: string;
  ts: string;
  jsonld: string;
}

/**
 * Get all artifacts, newest first.
 */
export async function getArtifacts(): Promise<ArtifactRow[]> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM artifacts ORDER BY ts DESC`;
  return rows as unknown as ArtifactRow[];
}

/**
 * Get artifacts for a project, newest first.
 */
export async function getProjectArtifacts(projectId: string): Promise<ArtifactRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM artifacts WHERE project_id = ${t(projectId)} ORDER BY ts DESC
  `;
  return rows as unknown as ArtifactRow[];
}

/**
 * Get version history for a specific file path within a project.
 */
export async function getArtifactHistory(projectId: string, path: string): Promise<ArtifactRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM artifacts
    WHERE project_id = ${t(projectId)} AND path = ${t(path)}
    ORDER BY ts DESC
  `;
  return rows as unknown as ArtifactRow[];
}

/**
 * Get artifacts for a session.
 */
export async function getSessionArtifacts(sessionId: string): Promise<ArtifactRow[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT * FROM artifacts WHERE session_id = ${t(sessionId)} ORDER BY ts DESC
  `;
  return rows as unknown as ArtifactRow[];
}

// ─── Artifact Versions ─────────────────────────────────────────

export interface ArtifactVersionRow {
  _id: string;
  session_id: string;
  path: string;
  relative_path: string;
  version: number;
  content_hash: string;
  content: string;
  size_bytes: number;
  operation: string;
  tool_call_id: string;
  ts: string;
  jsonld: string;
}

export interface ArtifactVersionSummary {
  _id: string;
  session_id: string;
  path: string;
  relative_path: string;
  version: number;
  content_hash: string;
  size_bytes: number;
  operation: string;
  tool_call_id: string;
  ts: string;
}

export interface ArtifactReadRow {
  _id: string;
  session_id: string;
  path: string;
  tool_call_id: string;
  ts: string;
}

export async function getArtifactVersionSummaries(): Promise<ArtifactVersionSummary[]> {
  await _tablesReady;
  const rows = await sql`
    SELECT _id, session_id, path, relative_path, version, content_hash,
           size_bytes, operation, tool_call_id, ts
    FROM artifact_versions ORDER BY ts DESC
  `;
  return rows as unknown as ArtifactVersionSummary[];
}

export async function getArtifactReadCounts(): Promise<Record<string, number>> {
  await _tablesReady;
  const rows = await sql`SELECT path, COUNT(*)::int AS cnt FROM artifact_reads GROUP BY path`;
  const result: Record<string, number> = {};
  for (const r of rows as any[]) result[r.path] = r.cnt;
  return result;
}

export async function getArtifactVersionsByPath(path: string): Promise<ArtifactVersionRow[]> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM artifact_versions WHERE path = ${t(path)} ORDER BY ts DESC`;
  return rows as unknown as ArtifactVersionRow[];
}

export async function getArtifactReadsByPath(path: string): Promise<ArtifactReadRow[]> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM artifact_reads WHERE path = ${t(path)} ORDER BY ts DESC`;
  return rows as unknown as ArtifactReadRow[];
}

export async function getArtifactVersion(id: string): Promise<ArtifactVersionRow | null> {
  await _tablesReady;
  const rows = await sql`SELECT * FROM artifact_versions WHERE _id = ${t(id)}`;
  return (rows[0] as unknown as ArtifactVersionRow) ?? null;
}

export async function getAdjacentVersions(
  path: string,
  ts: number,
): Promise<{
  prev: ArtifactVersionSummary | null;
  next: ArtifactVersionSummary | null;
}> {
  await _tablesReady;
  const prevRows = await sql`
    SELECT _id, session_id, path, relative_path, version, content_hash,
           size_bytes, operation, tool_call_id, ts
    FROM artifact_versions WHERE path = ${t(path)} AND ts < ${n(ts)}
    ORDER BY ts DESC LIMIT 1
  `;
  const nextRows = await sql`
    SELECT _id, session_id, path, relative_path, version, content_hash,
           size_bytes, operation, tool_call_id, ts
    FROM artifact_versions WHERE path = ${t(path)} AND ts > ${n(ts)}
    ORDER BY ts ASC LIMIT 1
  `;
  return {
    prev: (prevRows[0] as unknown as ArtifactVersionSummary) ?? null,
    next: (nextRows[0] as unknown as ArtifactVersionSummary) ?? null,
  };
}

// ─── Project Lifecycle ─────────────────────────────────────────────

export interface LifecycleEventRow {
  _id: string;
  event_type: string;
  entity_id: string;
  entity_type: string;
  project_id: string;
  summary: string;
  ts: string;
}

export interface ProjectDependencyRow {
  _id: string;
  project_id: string;
  name: string;
  version: string;
  dep_type: string;
  ts: string;
}

export interface ProjectTagRow {
  _id: string;
  project_id: string;
  tag: string;
  ts: string;
}

export interface DecommissionRow {
  _id: string;
  project_id: string;
  reason: string;
  decommissioned_by: string;
  ts: string;
}

export async function getProjectLifecycleEvents(projectId: string): Promise<LifecycleEventRow[]> {
  try {
    const rows = await sql`
      SELECT * FROM lifecycle_events
      WHERE project_id = ${projectId}
      ORDER BY ts DESC
    `;
    return rows as unknown as LifecycleEventRow[];
  } catch {
    return [];
  }
}

export async function getProjectDependencies(projectId: string): Promise<ProjectDependencyRow[]> {
  try {
    const rows = await sql`
      SELECT * FROM project_dependencies
      WHERE project_id = ${projectId}
      ORDER BY name
    `;
    return rows as unknown as ProjectDependencyRow[];
  } catch {
    return [];
  }
}

export async function getProjectTags(projectId: string): Promise<ProjectTagRow[]> {
  try {
    const rows = await sql`
      SELECT * FROM project_tags
      WHERE project_id = ${projectId}
      ORDER BY tag
    `;
    return rows as unknown as ProjectTagRow[];
  } catch {
    return [];
  }
}

export async function getProjectDecommissions(projectId: string): Promise<DecommissionRow[]> {
  try {
    const rows = await sql`
      SELECT * FROM decommission_records
      WHERE project_id = ${projectId}
      ORDER BY ts DESC
    `;
    return rows as unknown as DecommissionRow[];
  } catch {
    return [];
  }
}

// ─── Errors ────────────────────────────────────────────────────────

export interface ErrorRow {
  _id: string;
  component: string;
  operation: string;
  error_message: string;
  error_stack: string;
  error_type: string;
  severity: string;
  session_id: string;
  project_id: string;
  input_summary: string;
  context_json: string;
  ts: string;
  flushed: boolean;
  jsonld: string;
}

export interface ErrorSummary {
  total: number;
  bySeverity: Record<string, number>;
  byComponent: Record<string, number>;
}

export async function getErrors(
  opts: { severity?: string; component?: string; limit?: number; projectId?: string } = {},
): Promise<ErrorRow[]> {
  const limit = opts.limit ?? 100;
  try {
    let rows: ErrorRow[];
    if (opts.severity && opts.component) {
      rows = (await sql`
        SELECT * FROM errors
        WHERE severity = ${t(opts.severity)} AND component = ${t(opts.component)}
        ORDER BY ts DESC LIMIT ${n(limit)}
      `) as unknown as ErrorRow[];
    } else if (opts.severity) {
      rows = (await sql`
        SELECT * FROM errors
        WHERE severity = ${t(opts.severity)}
        ORDER BY ts DESC LIMIT ${n(limit)}
      `) as unknown as ErrorRow[];
    } else if (opts.component) {
      rows = (await sql`
        SELECT * FROM errors
        WHERE component = ${t(opts.component)}
        ORDER BY ts DESC LIMIT ${n(limit)}
      `) as unknown as ErrorRow[];
    } else {
      rows = (await sql`
        SELECT * FROM errors
        ORDER BY ts DESC LIMIT ${n(limit)}
      `) as unknown as ErrorRow[];
    }
    // Project filtering applied in JS (XTDB tagged templates make dynamic WHERE complex)
    if (opts.projectId) {
      rows = rows.filter((r) => (r as any).project_id === opts.projectId);
    }
    return rows;
  } catch {
    return [];
  }
}

export async function getErrorSummary(): Promise<ErrorSummary> {
  try {
    const bySev = await sql`SELECT severity, COUNT(*) AS cnt FROM errors GROUP BY severity`;
    const byComp = await sql`SELECT component, COUNT(*) AS cnt FROM errors GROUP BY component`;
    const bySeverity: Record<string, number> = {};
    const byComponent: Record<string, number> = {};
    let total = 0;
    for (const r of bySev) {
      bySeverity[r.severity] = Number(r.cnt);
      total += Number(r.cnt);
    }
    for (const r of byComp) {
      byComponent[r.component] = Number(r.cnt);
    }
    return { total, bySeverity, byComponent };
  } catch {
    return { total: 0, bySeverity: {}, byComponent: {} };
  }
}

// ─── Test Runs ─────────────────────────────────────────────────────

export async function getTestRuns(projectId?: string, limit = 50): Promise<any[]> {
  try {
    if (projectId) {
      return (await sql`SELECT * FROM test_runs WHERE project_id = ${t(projectId)} ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    }
    return (await sql`SELECT * FROM test_runs ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
  } catch {
    return [];
  }
}

// ─── CI Runs ───────────────────────────────────────────────────────

export async function getCIRuns(limit = 50): Promise<any[]> {
  try {
    return (await sql`SELECT _id, repo, ref, commit_hash, commit_message, pusher, status, steps_passed, steps_failed, duration_ms, ts, step_results FROM ci_runs ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
  } catch {
    return [];
  }
}

export async function getCIRun(id: string): Promise<any | null> {
  try {
    const rows =
      (await sql`SELECT _id, repo, ref, commit_hash, commit_message, pusher, status, steps_passed, steps_failed, duration_ms, ts, step_results, jsonld FROM ci_runs WHERE _id = ${t(id)}`) as any[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Docker Events ─────────────────────────────────────────────

export async function getDockerEvents(
  opts: { severity?: string; action?: string; service?: string; limit?: number } = {},
): Promise<any[]> {
  const limit = opts.limit ?? 100;
  try {
    let rows: any[];
    if (opts.severity && opts.service) {
      rows =
        (await sql`SELECT _id, event_type, action, container_id, container_name, service_name, compose_project, image, exit_code, severity, ts, ts_nano FROM docker_events WHERE severity = ${t(opts.severity)} AND service_name = ${t(opts.service)} ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    } else if (opts.severity) {
      rows =
        (await sql`SELECT _id, event_type, action, container_id, container_name, service_name, compose_project, image, exit_code, severity, ts, ts_nano FROM docker_events WHERE severity = ${t(opts.severity)} ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    } else if (opts.service) {
      rows =
        (await sql`SELECT _id, event_type, action, container_id, container_name, service_name, compose_project, image, exit_code, severity, ts, ts_nano FROM docker_events WHERE service_name = ${t(opts.service)} ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    } else if (opts.action) {
      rows =
        (await sql`SELECT _id, event_type, action, container_id, container_name, service_name, compose_project, image, exit_code, severity, ts, ts_nano FROM docker_events WHERE action = ${t(opts.action)} ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    } else {
      rows =
        (await sql`SELECT _id, event_type, action, container_id, container_name, service_name, compose_project, image, exit_code, severity, ts, ts_nano FROM docker_events ORDER BY ts DESC LIMIT ${n(limit)}`) as any[];
    }
    return rows;
  } catch {
    return [];
  }
}

export async function getDockerEventsSummary(): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  topServices: { name: string; count: number }[];
  recentCritical: any[];
}> {
  try {
    const totalRows = (await sql`SELECT COUNT(*) as cnt FROM docker_events`) as any[];
    const total = Number(totalRows[0]?.cnt ?? 0);

    const sevRows = (await sql`SELECT severity, COUNT(*) as cnt FROM docker_events GROUP BY severity`) as any[];
    const bySeverity: Record<string, number> = {};
    for (const r of sevRows) bySeverity[r.severity] = Number(r.cnt);

    const svcRows =
      (await sql`SELECT service_name, COUNT(*) as cnt FROM docker_events WHERE service_name != '' GROUP BY service_name ORDER BY cnt DESC LIMIT ${n(10)}`) as any[];
    const topServices = svcRows.map((r: any) => ({ name: r.service_name, count: Number(r.cnt) }));

    const critRows =
      (await sql`SELECT _id, action, container_name, service_name, exit_code, severity, ts FROM docker_events WHERE severity IN ('critical', 'error') ORDER BY ts DESC LIMIT ${n(10)}`) as any[];

    return { total, bySeverity, topServices, recentCritical: critRows };
  } catch {
    return { total: 0, bySeverity: {}, topServices: [], recentCritical: [] };
  }
}

/**
 * Close the connection.
 */
export async function closeDb(): Promise<void> {
  await sql.end();
}
