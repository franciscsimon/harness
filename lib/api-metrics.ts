import type { MiddlewareHandler } from "hono";
import type { Logger } from "./logger.ts";

export interface ApiMetric {
  method: string;
  path: string;
  status: number;
  ms: number;
  reqSize: number;
  resSize: number;
  timestamp: number;
}

/** In-memory ring buffer of recent API metrics. */
const BUFFER_SIZE = 1000;
const metrics: ApiMetric[] = [];
let writeIdx = 0;

/** Get all buffered metrics (most recent first). */
export function getMetrics(): ApiMetric[] {
  return metrics.slice().reverse();
}

/** Get summary stats for the last N minutes. */
export function getMetricsSummary(windowMinutes = 5): {
  total: number;
  avgMs: number;
  p95Ms: number;
  errorRate: number;
  byEndpoint: Record<string, { count: number; avgMs: number; errors: number }>;
} {
  const cutoff = Date.now() - windowMinutes * 60_000;
  const recent = metrics.filter((m) => m.timestamp > cutoff);
  if (recent.length === 0) return { total: 0, avgMs: 0, p95Ms: 0, errorRate: 0, byEndpoint: {} };

  const sorted = recent.map((m) => m.ms).sort((a, b) => a - b);
  const errors = recent.filter((m) => m.status >= 500).length;
  const byEndpoint: Record<string, { count: number; totalMs: number; errors: number }> = {};

  for (const m of recent) {
    const key = `${m.method} ${m.path}`;
    if (!byEndpoint[key]) byEndpoint[key] = { count: 0, totalMs: 0, errors: 0 };
    byEndpoint[key].count++;
    byEndpoint[key].totalMs += m.ms;
    if (m.status >= 500) byEndpoint[key].errors++;
  }

  const summary: Record<string, { count: number; avgMs: number; errors: number }> = {};
  for (const [k, v] of Object.entries(byEndpoint)) {
    summary[k] = { count: v.count, avgMs: Math.round(v.totalMs / v.count), errors: v.errors };
  }

  return {
    total: recent.length,
    avgMs: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    errorRate: errors / recent.length,
    byEndpoint: summary,
  };
}

/**
 * Hono middleware: track API response times and sizes.
 * Adds metrics to an in-memory ring buffer + logs slow requests.
 */
export function apiMetrics(log: Logger, slowThresholdMs = 1000): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    const reqSize = Number(c.req.header("content-length") ?? "0");

    await next();

    const ms = Date.now() - start;
    const resSize = Number(c.res.headers.get("content-length") ?? "0");

    const metric: ApiMetric = {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
      reqSize,
      resSize,
      timestamp: Date.now(),
    };

    // Ring buffer insert
    if (metrics.length < BUFFER_SIZE) metrics.push(metric);
    else metrics[writeIdx % BUFFER_SIZE] = metric;
    writeIdx++;

    if (ms > slowThresholdMs) {
      log.warn({ ...metric }, `Slow request: ${c.req.method} ${c.req.path} ${ms}ms`);
    }
  };
}

// §2 — Persist api_metrics to XTDB (sampled)
let _apiSql: any = null;
const SAMPLE_RATE = 0.1; // persist 10% of requests
export function initApiMetricsDb(sql: any): void { _apiSql = sql; }

export async function persistApiMetric(
  method: string, path: string, statusCode: number, durationMs: number, service: string,
): Promise<void> {
  if (!_apiSql || Math.random() > SAMPLE_RATE) return;
  try {
    await _apiSql`INSERT INTO api_metrics
      (_id, method, path, status_code, duration_ms, service, ts, _valid_from)
      VALUES (${`am:${service}:${Date.now()}`}, ${method}, ${path}, ${statusCode}, ${durationMs}, ${service}, ${Date.now()}, CURRENT_TIMESTAMP)`;
  } catch {}
}
