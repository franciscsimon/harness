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

  // Sort by last_ts DESC in JS
  const sorted = [...agg].sort((a: any, b: any) => Number(b.last_ts) - Number(a.last_ts));

  return sorted.map((r: any) => ({
    sessionId: r.session_id,
    eventCount: Number(r.cnt),
    firstTs: Number(r.first_ts),
    lastTs: Number(r.last_ts),
    lastEventName: lastMap[r.session_id]?.name ?? "—",
    lastSeq: lastMap[r.session_id]?.seq ?? Number(r.max_seq),
    byCategory: catMap[r.session_id] ?? {},
  }));
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

/**
 * Close the connection.
 */
export async function closeDb(): Promise<void> {
  await sql.end();
}
