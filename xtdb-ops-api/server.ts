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
import { getJob, startSnapshotBackup, startCsvBackup, restoreFromArchive, startSnapshotRestore } from "./lib/backup.ts";
import { exec } from "./lib/exec.ts";
import { processCIEvent, verifySignature, type CIEvent } from "./lib/ci-webhook.ts";
import { startScheduler, stopScheduler, schedulerStatus } from "./lib/scheduler.ts";
import { verifyBackup } from "./lib/verify-backup.ts";
import { createIncident, listIncidents, getIncident, updateIncident } from "./lib/incidents.ts";

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

  const isSnapshot = body.archive.startsWith("snapshot-");

  if (isSnapshot) {
    // Snapshot restore is long-running — return a job ID like backup does
    const jobId = startSnapshotRestore(path);
    return c.json({ jobId, type: "snapshot" });
  }

  // CSV restore is synchronous
  try {
    const result = await restoreFromArchive(path);
    return c.json({ ...result, type: "csv" });
  } catch (err: unknown) {
    return c.json({ success: false, message: String(err), type: "csv" }, 500);
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

// ── Backup Scheduler ──────────────────────────────────────────────

app.post("/api/scheduler/start", async (c) => {
  const body = await c.req.json<{ intervalHours?: number }>().catch(() => ({}));
  return c.json(startScheduler(body.intervalHours));
});

app.post("/api/scheduler/stop", (c) => c.json(stopScheduler()));

app.get("/api/scheduler/status", (c) => c.json(schedulerStatus()));

// ── Lifecycle SSE Stream ──────────────────────────────────────────

app.get("/api/lifecycle/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    const { default: postgres } = await import("postgres");
    const db = postgres({ host: process.env.XTDB_EVENT_HOST ?? "localhost", port: Number(process.env.XTDB_EVENT_PORT ?? "5433"), database: "xtdb", user: "xtdb", password: "xtdb", max: 1, idle_timeout: 30 });
    let lastTs = Date.now();
    while (true) {
      try {
        const rows = await db`SELECT * FROM lifecycle_events WHERE ts > ${db.typed(lastTs as any, 20)} ORDER BY ts ASC LIMIT 20`;
        for (const row of rows) {
          await stream.writeSSE({ event: "lifecycle", data: JSON.stringify(row) });
          lastTs = Math.max(lastTs, Number(row.ts));
        }
      } catch {}
      await stream.sleep(2000);
    }
  });
});

// ── CI/CD Webhook ─────────────────────────────────────────────────

app.post("/api/ci/events", async (c) => {
  try {
    const rawBody = await c.req.text();
    const sig = c.req.header("X-Signature") ?? c.req.header("X-Hub-Signature-256");
    if (!verifySignature(rawBody, sig ?? undefined)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const event: CIEvent = JSON.parse(rawBody);
    if (!event.type || !event.project || !event.subject?.status) {
      return c.json({ error: "Missing required fields: type, project, subject.status" }, 400);
    }

    const result = await processCIEvent(event);
    return c.json({ received: true, ...result });
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/lifecycle/events", async (c) => {
  try {
    const limit = Number(c.req.query("limit") ?? "50");
    const { default: postgres } = await import("postgres");
    const db = postgres({
      host: process.env.XTDB_EVENT_HOST ?? "localhost",
      port: Number(process.env.XTDB_EVENT_PORT ?? "5433"),
      database: "xtdb", user: "xtdb", password: "xtdb",
      max: 1, idle_timeout: 10, connect_timeout: 5,
    });
    const rows = await db`SELECT * FROM lifecycle_events ORDER BY ts DESC LIMIT ${limit}`;
    await db.end();
    return c.json(rows);
  } catch (err: unknown) {
    return c.json([], 200);
  }
});

// ── Backup Verification ───────────────────────────────────────────

app.post("/api/backup/verify", async (c) => {
  try {
    const body = await c.req.json<{ archive: string }>();
    if (!body.archive) return c.json({ error: "Missing archive" }, 400);

    const archivePath = getBackupPath(body.archive);
    if (!archivePath) return c.json({ error: "Invalid archive name" }, 400);

    const result = await verifyBackup(archivePath);
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Incidents ─────────────────────────────────────────────────────

app.post("/api/incidents", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.severity || !body.title) {
      return c.json({ error: "Missing required fields: severity, title" }, 400);
    }
    const incident = await createIncident(body);
    return c.json(incident, 201);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/incidents", async (c) => {
  try {
    const projectId = c.req.query("project_id");
    const status = c.req.query("status");
    const incidents = await listIncidents(projectId, status);
    return c.json(incidents);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/api/incidents/:id", async (c) => {
  try {
    const incident = await getIncident(c.req.param("id"));
    if (!incident) return c.json({ error: "Incident not found" }, 404);
    return c.json(incident);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

app.patch("/api/incidents/:id", async (c) => {
  try {
    const body = await c.req.json();
    const updated = await updateIncident(c.req.param("id"), body);
    if (!updated) return c.json({ error: "Incident not found" }, 404);
    return c.json(updated);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Start ─────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: OPS_PORT });
console.log(`XTDB Ops API running at http://localhost:${OPS_PORT}`);
