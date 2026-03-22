// ─── XTDB Writer for Docker Events ────────────────────────────
// Batch-writes Docker event records to XTDB via postgres wire protocol.

import postgres from "postgres";
import type { DockerEventRecord } from "./transform.ts";

const XTDB_URL = process.env.XTDB_URL ?? "postgresql://localhost:5433/xtdb";
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;

let sql: ReturnType<typeof postgres>;
let buffer: DockerEventRecord[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let totalWritten = 0;
let writeErrors = 0;

export function getWriterStats() {
  return { totalWritten, writeErrors, buffered: buffer.length };
}

export function startWriter() {
  sql = postgres(XTDB_URL, { max: 2, idle_timeout: 30 });
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  console.log(`[writer] Connected to XTDB at ${XTDB_URL}`);
}

export function enqueueEvent(record: DockerEventRecord) {
  buffer.push(record);
  if (buffer.length >= BATCH_SIZE) {
    flush().catch((e) => console.error("[writer] flush error:", e.message));
  }
}

async function flush() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, BATCH_SIZE);
  try {
    for (const r of batch) {
      const t = (v: string) => sql.typed(v as any, 25);  // OID 25 = text
      const n = (v: number) => sql.typed(v as any, 20);  // OID 20 = int8
      await sql`INSERT INTO docker_events (
        _id, event_type, action, container_id, container_name,
        service_name, compose_project, image, exit_code, severity,
        attributes, ts, ts_nano, jsonld
      ) VALUES (
        ${t(r._id)}, ${t(r.event_type)}, ${t(r.action)}, ${t(r.container_id)}, ${t(r.container_name)},
        ${t(r.service_name)}, ${t(r.compose_project)}, ${t(r.image)}, ${n(r.exit_code ?? 0)}, ${t(r.severity)},
        ${t(r.attributes)}, ${n(r.ts)}, ${n(r.ts_nano)}, ${t(r.jsonld)}
      )`;
    }
    totalWritten += batch.length;
  } catch (e: unknown) {
    writeErrors++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[writer] Failed to write ${batch.length} events: ${msg}`);
    // Don't re-buffer — events are best-effort. Log and move on.
  }
}

export async function stopWriter() {
  if (flushTimer) clearInterval(flushTimer);
  await flush();
  if (sql) await sql.end();
  console.log(`[writer] Stopped. Total written: ${totalWritten}, errors: ${writeErrors}`);
}
