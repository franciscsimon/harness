// ─── Docker Event Collector Server ────────────────────────────
// Streams Docker events from the socket, transforms to JSON-LD,
// writes to XTDB. Exposes health API on :3338.
// Usage: cd docker-event-collector && npm install && npx jiti server.ts

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { startWriter, stopWriter, getWriterStats } from "./writer.ts";
import { startCollector, stopCollector, getCollectorStats } from "./collector.ts";
import { getAlertStats } from "./alerting.ts";

const PORT = Number(process.env.COLLECTOR_PORT ?? "3338");
const started = Date.now();

const app = new Hono();

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

// ── Startup ──────────────────────────────────────────────────────

console.log(`[docker-event-collector] Starting on :${PORT}`);
startWriter();
startCollector();

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[docker-event-collector] Health API on http://localhost:${PORT}`);
});

// ── Graceful shutdown ────────────────────────────────────────────

process.on("SIGTERM", async () => {
  console.log("[docker-event-collector] SIGTERM received, shutting down");
  stopCollector();
  await stopWriter();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[docker-event-collector] SIGINT received, shutting down");
  stopCollector();
  await stopWriter();
  process.exit(0);
});
