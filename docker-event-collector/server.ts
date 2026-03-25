// ─── Docker Event Collector Server ────────────────────────────
// Streams Docker events from the socket, transforms to JSON-LD,
// writes to XTDB. Exposes health API on :3338.
// Usage: cd docker-event-collector && npm install && npx jiti server.ts

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createLogger } from "../lib/logger.ts";
import { requestLogger } from "../lib/request-logger.ts";
import { apiMetrics } from "../lib/api-metrics.ts";
import { rateLimiter } from "../lib/rate-limiter.ts";
import { getMetricsSummary } from "../lib/api-metrics.ts";
import { getAlertStats } from "./alerting.ts";
import { getCollectorStats, startCollector, stopCollector } from "./collector.ts";
import { getLatestStats, startStatsPoller } from "./stats-poller.ts";
import { getWriterStats, startWriter, stopWriter } from "./writer.ts";
import { captureError } from "../lib/error-groups.ts";

const PORT = Number(process.env.COLLECTOR_PORT ?? "3338");
const log = createLogger("docker-event-collector");
const started = Date.now();

const app = new Hono();
app.use("*", requestLogger(log));
app.use("*", apiMetrics(log));
app.use("*", rateLimiter());

// ── Health ───────────────────────────────────────────────────────

app.get("/", (c) => c.json({ service: "docker-event-collector", status: "ok" }));

app.get("/api/health", (c) => {
  const collector = getCollectorStats();
  const writer = getWriterStats();
  const alerts = getAlertStats();
  return c.json({
    status: collector.isConnected ? "ok" : "degraded",
    uptime: Date.now() - started,
    collector,
    writer,
    alerts,
  });
});
app.get("/api/stats/containers", (c) => c.json(getLatestStats()));

startWriter();
startCollector();
startStatsPoller();

app.get("/api/metrics", (c) => c.json(getMetricsSummary()));
serve({ fetch: app.fetch, port: PORT }, () => {
  log.info({ port: PORT }, "docker-event-collector listening");
});

// ── Graceful shutdown ────────────────────────────────────────────

process.on("SIGTERM", async () => {
  stopCollector();
  await stopWriter();
  process.exit(0);
});

process.on("SIGINT", async () => {
  stopCollector();
  await stopWriter();
  process.exit(0);
});
