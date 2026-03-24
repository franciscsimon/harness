import type { MiddlewareHandler } from "hono";
import type { Logger } from "./logger.ts";

/** Hono middleware: log every request with method, path, status, and duration. */
export function requestLogger(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    log.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms },
      `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`
    );
  };
}
