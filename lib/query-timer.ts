// ─── Query Timer ─────────────────────────────────────────────
// Wraps postgres queries to track execution time.
// Logs slow queries and exposes stats for monitoring.

import type { Logger } from "./logger.ts";

const SLOW_THRESHOLD_MS = Number(process.env.SLOW_QUERY_MS ?? "500");
const BUFFER_SIZE = 200;

export interface QueryMetric {
  query: string;
  ms: number;
  timestamp: number;
}

const slowQueries: QueryMetric[] = [];
let totalQueries = 0;
let totalMs = 0;

export function getQueryStats(): {
  totalQueries: number;
  avgMs: number;
  slowQueries: QueryMetric[];
  p95Ms: number;
} {
  const recent = slowQueries.slice(-50);
  const sorted = recent.map((q) => q.ms).sort((a, b) => a - b);
  return {
    totalQueries,
    avgMs: totalQueries > 0 ? Math.round(totalMs / totalQueries) : 0,
    slowQueries: recent,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}

/** Track a query execution. Call this after executing a query. */
export function trackQuery(query: string, ms: number, log?: Logger): void {
  totalQueries++;
  totalMs += ms;

  if (ms > SLOW_THRESHOLD_MS) {
    if (slowQueries.length >= BUFFER_SIZE) slowQueries.shift();
    slowQueries.push({ query: query.slice(0, 200), ms, timestamp: Date.now() });
    if (log) {
      log.warn({ query: query.slice(0, 100), ms }, `Slow query: ${ms}ms`);
    }
  }
}

// §2 — Persist slow queries to XTDB
let _slowSql: any = null;
// Auto-persist slow queries when threshold exceeded
const SLOW_THRESHOLD_MS = 500;
function _maybeRecordSlow(query: string, durationMs: number, source: string): void {
  if (durationMs >= SLOW_THRESHOLD_MS) recordSlowQuery(query, durationMs, source).catch(() => {});
}

export function initSlowQueryDb(sql: any): void { _slowSql = sql; }

export async function recordSlowQuery(
  query: string, durationMs: number, source: string,
): Promise<void> {
  if (!_slowSql) return;
  try {
    await _slowSql`INSERT INTO slow_queries
      (_id, query_text, duration_ms, source, ts, _valid_from)
      VALUES (${`sq:${source}:${Date.now()}`}, ${query.slice(0, 2000)}, ${durationMs}, ${source}, ${Date.now()}, CURRENT_TIMESTAMP)`;
  } catch {}
}
