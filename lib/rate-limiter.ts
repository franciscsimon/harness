// ─── Rate Limiter ────────────────────────────────────────────
// In-memory sliding window rate limiter for Hono.
// Configurable per-endpoint or global limits.

import type { MiddlewareHandler } from "hono";

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (entry.resetAt < now) windows.delete(key);
  }
}, 300_000);

export interface RateLimitConfig {
  /** Max requests per window. Default: 100 */
  max?: number;
  /** Window size in ms. Default: 60000 (1 minute) */
  windowMs?: number;
  /** Key function to identify clients. Default: IP-based */
  keyFn?: (c: any) => string;
}

/**
 * Hono rate limiting middleware.
 * Returns 429 when limit is exceeded.
 */
export function rateLimiter(config: RateLimitConfig = {}): MiddlewareHandler {
  const max = config.max ?? 100;
  const windowMs = config.windowMs ?? 60_000;
  const keyFn = config.keyFn ?? ((c: any) => c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown");

  return async (c, next) => {
    const key = keyFn(c);
    const now = Date.now();
    let entry = windows.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }

    entry.count++;

    c.res.headers.set("X-RateLimit-Limit", String(max));
    c.res.headers.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    c.res.headers.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return c.json(
        { error: "Too many requests", retryAfter: Math.ceil((entry.resetAt - now) / 1000) },
        429,
      );
    }

    await next();
  };
}

// §2 — Persist rate_limit_events to XTDB
let _rlSql: any = null;
export function initRateLimitDb(sql: any): void { _rlSql = sql; }

export async function recordRateLimitEvent(
  ip: string, path: string, service: string,
): Promise<void> {
  if (!_rlSql) return;
  try {
    await _rlSql`INSERT INTO rate_limit_events
      (_id, ip, path, service, ts, _valid_from)
      VALUES (${`rl:${ip}:${Date.now()}`}, ${ip}, ${path}, ${service}, ${Date.now()}, CURRENT_TIMESTAMP)`;
  } catch {}
}
