// ─── Error Rate Trending ─────────────────────────────────────
// Queries XTDB for error counts per component, computes rates,
// fires alerts when thresholds are exceeded (Phase 3.5).

import { connectXtdb } from "../lib/db.ts";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("error-trending");

export interface ErrorRateAlert {
  component: string;
  errorCount: number;
  windowMinutes: number;
  severity: "warning" | "critical";
  timestamp: number;
}

const WARNING_THRESHOLD = 10;  // >10 errors in 5 min
const CRITICAL_THRESHOLD = 50; // >50 errors in 5 min
const WINDOW_MINUTES = 5;

/**
 * Query XTDB for error counts per component in the last N minutes.
 * Returns alerts for components exceeding thresholds.
 */
export async function checkErrorRates(): Promise<ErrorRateAlert[]> {
  let sql;
  try {
    sql = connectXtdb({ max: 1 });
  } catch {
    return [];
  }

  const alerts: ErrorRateAlert[] = [];
  const cutoffMs = Date.now() - WINDOW_MINUTES * 60_000;

  try {
    const rows = await sql`
      SELECT component, COUNT(*) as error_count
      FROM error_events
      WHERE ts > ${cutoffMs}
      GROUP BY component
      ORDER BY error_count DESC`;

    for (const row of rows as any[]) {
      const count = Number(row.error_count);
      if (count > CRITICAL_THRESHOLD) {
        alerts.push({
          component: row.component,
          errorCount: count,
          windowMinutes: WINDOW_MINUTES,
          severity: "critical",
          timestamp: Date.now(),
        });
        log.error({ component: row.component, count }, `CRITICAL: ${count} errors in ${WINDOW_MINUTES}min`);
      } else if (count > WARNING_THRESHOLD) {
        alerts.push({
          component: row.component,
          errorCount: count,
          windowMinutes: WINDOW_MINUTES,
          severity: "warning",
          timestamp: Date.now(),
        });
        log.warn({ component: row.component, count }, `WARNING: ${count} errors in ${WINDOW_MINUTES}min`);
      }
    }
  } catch (e: any) {
    log.warn({ err: e.message }, "Failed to query error rates");
  } finally {
    await sql.end();
  }

  return alerts;
}

/**
 * Get error rate history for a component over the last N hours.
 * Returns per-5-minute buckets.
 */
export async function getErrorRateHistory(
  component: string,
  hours = 24,
): Promise<Array<{ bucket: number; count: number }>> {
  let sql;
  try {
    sql = connectXtdb({ max: 1 });
  } catch {
    return [];
  }

  const cutoffMs = Date.now() - hours * 3600_000;
  const bucketMs = WINDOW_MINUTES * 60_000;

  try {
    const rows = await sql`
      SELECT ts FROM error_events
      WHERE component = ${component} AND ts > ${cutoffMs}
      ORDER BY ts ASC`;

    // Bucket into 5-minute windows
    const buckets = new Map<number, number>();
    for (const row of rows as any[]) {
      const bucket = Math.floor(Number(row.ts) / bucketMs) * bucketMs;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    return Array.from(buckets.entries())
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket - b.bucket);
  } finally {
    await sql.end();
  }
}
