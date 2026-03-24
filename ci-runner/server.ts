// ─── CI Runner Server ────────────────────────────────────────────
// HTTP API + queue watcher. Runs on :3337.
// Usage: cd ci-runner && npm install && npx jiti server.ts

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createLogger } from "../lib/logger.ts";
import { requestLogger } from "../lib/request-logger.ts";
import { validateBody } from "../lib/validate.ts";
import * as v from "valibot";

// Import and start the queue watcher
import { runnerState } from "./runner.ts";
import "./runner.ts"; // starts the main loop

const CI_PORT = Number(process.env.CI_PORT ?? "3337");
const QUEUE_DIR = process.env.CI_QUEUE_DIR ?? join(process.env.HOME ?? "/tmp", ".ci-runner", "queue");
const log = createLogger("ci-runner");

const app = new Hono();
app.use("*", requestLogger(log));

// ── Health / Status ──────────────────────────────────────────────

app.get("/", (c) => c.json({ service: "ci-runner", status: "ok" }));

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    uptime: Date.now() - runnerState.started,
    jobsProcessed: runnerState.jobsProcessed,
    jobsFailed: runnerState.jobsFailed,
    currentJob: runnerState.currentJob,
    lastJobAt: runnerState.lastJobAt || null,
    queueDir: runnerState.queueDir,
  });
});

app.get("/api/queue", (c) => {
  try {
    mkdirSync(QUEUE_DIR, { recursive: true });
    const files = readdirSync(QUEUE_DIR);
    const pending = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(QUEUE_DIR, f), "utf-8"));
        } catch {
          return { file: f, error: "parse failed" };
        }
      });
    const running = files
      .filter((f) => f.endsWith(".running"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(QUEUE_DIR, f), "utf-8"));
        } catch {
          return { file: f };
        }
      });
    const failed = files.filter((f) => f.endsWith(".failed")).length;
    return c.json({ pending, running, failedCount: failed });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Enqueue (alternative to harness-ui proxy) ────────────────────

const EnqueueSchema = v.object({
  repo: v.string(),
  ref: v.optional(v.string(), "refs/heads/main"),
  commitHash: v.string(),
  commitMessage: v.optional(v.string(), ""),
  pusher: v.optional(v.string(), "unknown"),
});

app.post("/api/enqueue", async (c) => {
  const parsed = await validateBody(c, EnqueueSchema);
  if (parsed.error) return parsed.response;
  const { repo, ref, commitHash, commitMessage, pusher } = parsed.data;

  try {
    mkdirSync(QUEUE_DIR, { recursive: true });
    const job = {
      id: `ci-${Date.now()}-${randomUUID().slice(0, 8)}`,
      repo,
      ref,
      commitHash,
      commitMessage,
      pusher,
      timestamp: Date.now(),
    };
    const jobFile = join(QUEUE_DIR, `${job.id}.json`);
    writeFileSync(jobFile, JSON.stringify(job, null, 2));
    return c.json({ queued: true, id: job.id });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Start HTTP server ────────────────────────────────────────────

serve({ fetch: app.fetch, port: CI_PORT }, () => {
  log.info({ port: CI_PORT }, "ci-runner listening");
});
