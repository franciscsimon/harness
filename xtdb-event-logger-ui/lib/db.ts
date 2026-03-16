import postgres from "postgres";

// ─── Config ────────────────────────────────────────────────────────

const host = process.env.XTDB_EVENT_HOST ?? "localhost";
const port = Number(process.env.XTDB_EVENT_PORT ?? "5433");

const sql = postgres({ host, port, database: "xtdb", user: "xtdb", password: "xtdb" });

const t = (v: string | null) => sql.typed(v as any, 25);
const n = (v: number | null) => sql.typed(v as any, 20);

// ─── Core columns every row has ────────────────────────────────────

const CORE_COLS = `_id, environment, event_name, category, can_intercept,
  schema_version, ts, seq, session_id, cwd`;

const ALL_COLS = `${CORE_COLS},
  switch_reason, switch_target, switch_previous,
  fork_entry_id, fork_previous,
  tree_new_leaf, tree_old_leaf, tree_from_ext,
  event_cwd,
  compact_tokens, compact_from_ext,
  prompt_text, agent_end_msg_count,
  turn_index, turn_timestamp, turn_end_tool_count,
  message_role, stream_delta_type, stream_delta_len,
  tool_name, tool_call_id, is_error,
  context_msg_count, provider_payload_bytes,
  input_text, input_source, input_has_images,
  bash_command, bash_exclude,
  model_provider, model_id, model_source,
  prev_model_provider, prev_model_id,
  payload, handler_error,
  jsonld`;

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
export async function getEvents(opts: {
  category?: string;
  eventName?: string;
  sessionId?: string;
  afterSeq?: number;
  limit?: number;
} = {}): Promise<EventRow[]> {
  const limit = opts.limit ?? 100;
  const conditions: string[] = [];
  const params: any[] = [];

  // Build WHERE dynamically — XTDB doesn't support all PG features,
  // so we use simple parameterized queries
  if (opts.afterSeq != null) {
    const rows = await sql`
      SELECT ${sql.unsafe(ALL_COLS)} FROM events
      WHERE seq > ${n(opts.afterSeq)}
      ORDER BY seq ASC
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.sessionId) {
    const rows = await sql`
      SELECT ${sql.unsafe(ALL_COLS)} FROM events
      WHERE session_id = ${t(opts.sessionId)}
      ORDER BY seq DESC
      LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.eventName) {
    const rows = await sql`
      SELECT ${sql.unsafe(ALL_COLS)} FROM events
      WHERE event_name = ${t(opts.eventName)}
      ORDER BY seq DESC
      LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  if (opts.category) {
    const rows = await sql`
      SELECT ${sql.unsafe(ALL_COLS)} FROM events
      WHERE category = ${t(opts.category)}
      ORDER BY seq DESC
      LIMIT ${n(limit)}
    `;
    return rows as unknown as EventRow[];
  }

  const rows = await sql`
    SELECT ${sql.unsafe(ALL_COLS)} FROM events
    ORDER BY seq DESC
    LIMIT ${n(limit)}
  `;
  return rows as unknown as EventRow[];
}

/**
 * Get events newer than a given seq (for SSE polling).
 */
export async function getEventsSince(afterSeq: number): Promise<EventRow[]> {
  const rows = await sql`
    SELECT ${sql.unsafe(ALL_COLS)} FROM events
    WHERE seq > ${n(afterSeq)}
    ORDER BY seq ASC
  `;
  return rows as unknown as EventRow[];
}

/**
 * Get a single event by ID.
 */
export async function getEvent(id: string): Promise<EventRow | null> {
  const rows = await sql`
    SELECT ${sql.unsafe(ALL_COLS)} FROM events
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
    SELECT ${sql.unsafe(ALL_COLS)} FROM events
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
    // Track file modifications from tool_call payload (Write/Edit paths)
    if (ev.event_name === "tool_execution_start" && (ev.tool_name === "write" || ev.tool_name === "edit")) {
      // payload may contain path info
      try {
        if (ev.payload) {
          const p = typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload;
          if (p?.path) files.add(p.path);
        }
      } catch {}
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

/**
 * Close the connection.
 */
export async function closeDb(): Promise<void> {
  await sql.end();
}
