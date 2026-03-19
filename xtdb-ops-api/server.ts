import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { checkAll, checkPrimary, checkReplica, checkRedpanda } from "./lib/health.ts";
import { stopReplica, startReplica, replicaStatus } from "./lib/replica.ts";
import { listTopics, describeTopic } from "./lib/redpanda.ts";
import { listBackups, getBackupPath, deleteBackup, createDownloadStream } from "./lib/files.ts";
import { getJob, startSnapshotBackup, startCsvBackup, restoreFromArchive } from "./lib/backup.ts";
import { exec } from "./lib/exec.ts";

const OPS_PORT = Number(process.env.OPS_PORT ?? "3335");
const app = new Hono();

app.use("/*", cors({ origin: "*" }));

// ── Health ────────────────────────────────────────────────────────

app.get("/api/health", async (c) => {
  try {
    return c.json(await checkAll());
  } catch (err: unknown) {
    return c.json({ error: "Health check failed", details: String(err) }, 500);
  }
});

app.get("/api/health/primary", async (c) => {
  try {
    return c.json(await checkPrimary());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/health/replica", async (c) => {
  try {
    return c.json(await checkReplica());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/health/redpanda", async (c) => {
  try {
    return c.json(await checkRedpanda());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Replication ───────────────────────────────────────────────────

app.get("/api/replication", async (c) => {
  try {
    const [primaryResult, replicaResult] = await Promise.all([
      exec("docker", [
        "run", "--rm", "--network", "host", "postgres:16-alpine",
        "psql", "-h", "localhost", "-p", "5433", "-U", "xtdb", "-d", "xtdb",
        "-Atqc", "SELECT COUNT(*) FROM events",
      ], { timeout: 10_000 }),
      exec("docker", [
        "run", "--rm", "--network", "host", "postgres:16-alpine",
        "psql", "-h", "localhost", "-p", "5434", "-U", "xtdb", "-d", "xtdb",
        "-Atqc", "SELECT COUNT(*) FROM events",
      ], { timeout: 10_000 }),
    ]);
    const primary = parseInt(primaryResult.stdout.trim(), 10) || 0;
    const replica = parseInt(replicaResult.stdout.trim(), 10) || 0;
    return c.json({ primary, replica, lag: primary - replica, synced: primary === replica });
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Backup ────────────────────────────────────────────────────────

app.post("/api/backup", (c) => {
  const jobId = startSnapshotBackup();
  return c.json({ jobId });
});

app.post("/api/backup/csv", (c) => {
  const jobId = startCsvBackup();
  return c.json({ jobId });
});

app.get("/api/backup/status/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = getJob(jobId);
  if (!job) return c.json({ error: "Job not found" }, 404);

  return streamSSE(c, async (stream) => {
    let lastIdx = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = getJob(jobId);
      if (!current) break;

      while (lastIdx < current.progress.length) {
        await stream.writeSSE({
          event: "progress",
          data: JSON.stringify({
            status: current.status,
            message: current.progress[lastIdx],
            step: lastIdx + 1,
          }),
        });
        lastIdx++;
      }

      if (current.status !== "running") {
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({
            status: current.status,
            result: current.result,
            completedAt: current.completedAt,
          }),
        });
        break;
      }
      await stream.sleep(500);
    }
  });
});

// ── Backup files ──────────────────────────────────────────────────

app.get("/api/backups", async (c) => {
  try {
    return c.json(await listBackups());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/backups/:filename", async (c) => {
  const filename = c.req.param("filename");
  const result = createDownloadStream(filename);
  if (!result) return c.json({ error: "Invalid filename" }, 400);

  try {
    const info = await stat(result.path);
    const webStream = Readable.toWeb(result.stream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

app.delete("/api/backups/:filename", async (c) => {
  const filename = c.req.param("filename");
  const deleted = await deleteBackup(filename);
  return c.json({ deleted });
});

// ── Restore ───────────────────────────────────────────────────────

app.post("/api/restore", async (c) => {
  const body = await c.req.json<{ archive: string }>();
  if (!body.archive) return c.json({ error: "Missing archive" }, 400);

  const path = getBackupPath(body.archive);
  if (!path) return c.json({ error: "Invalid archive name" }, 400);

  try {
    const result = await restoreFromArchive(path);
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ success: false, message: String(err) }, 500);
  }
});

// ── Replica management ────────────────────────────────────────────

app.post("/api/replica/stop", async (c) => {
  try {
    return c.json(await stopReplica());
  } catch (err: unknown) {
    return c.json({ success: false, message: String(err) }, 500);
  }
});

app.post("/api/replica/start", async (c) => {
  try {
    return c.json(await startReplica());
  } catch (err: unknown) {
    return c.json({ success: false, message: String(err) }, 500);
  }
});

app.get("/api/replica/status", async (c) => {
  try {
    return c.json(await replicaStatus());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Redpanda ──────────────────────────────────────────────────────

app.get("/api/topics", async (c) => {
  try {
    return c.json(await listTopics());
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/topics/:name", async (c) => {
  try {
    return c.json(await describeTopic(c.req.param("name")));
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Start ─────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: OPS_PORT });
console.log(`XTDB Ops API running at http://localhost:${OPS_PORT}`);
