/**
 * Disk-first error capture library.
 *
 * Every caught error goes to a local JSONL file first (sync, never fails),
 * then a collector flushes to XTDB on an interval.
 *
 * Usage:
 *   import { captureError, startErrorCollector, stopErrorCollector } from "../lib/errors.ts";
 *
 *   // In any catch block:
 *   captureError({
 *     component: "artifact-tracker",
 *     operation: "INSERT artifact_reads",
 *     error: err,
 *     severity: "data_loss",
 *     sessionId: "abc123",
 *     projectId: "proj:harness",
 *     inputSummary: "path=/tmp/foo.ts",
 *   });
 *
 *   // On startup (once):
 *   startErrorCollector(sql);
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSONLD_CONTEXT, piId, softwareAgent, xsdLong } from "./jsonld/context.ts";

// ─── Configuration ─────────────────────────────────────────────

const ERROR_DIR = process.env.ERROR_DIR ?? join(process.env.HOME ?? "/tmp", ".pi", "errors");
const ERROR_FILE = join(ERROR_DIR, "errors.jsonl");
const FLUSH_INTERVAL_MS = Number(process.env.ERROR_FLUSH_INTERVAL_MS ?? 10_000);
const MAX_STACK_LEN = 4096;
const MAX_INPUT_LEN = 1024;

// ─── Types ─────────────────────────────────────────────────────

export type ErrorSeverity = "data_loss" | "degraded" | "transient" | "cosmetic";

export interface CaptureErrorOptions {
  component: string; // e.g. "artifact-tracker", "xtdb-ops-api"
  operation: string; // e.g. "INSERT artifact_reads", "session.steer"
  error: unknown; // the caught error
  severity: ErrorSeverity; // how bad is this
  sessionId?: string | null;
  projectId?: string | null;
  inputSummary?: string; // truncated summary of input data
  context?: Record<string, unknown>; // additional context (table, endpoint, etc.)
}

export interface ErrorRecord {
  _id: string;
  component: string;
  operation: string;
  error_message: string;
  error_stack: string;
  error_type: string;
  severity: ErrorSeverity;
  session_id: string;
  project_id: string;
  input_summary: string;
  context_json: string;
  ts: number;
  flushed: boolean;
  jsonld: string;
}

// ─── Error capture (sync, disk-first) ──────────────────────────

function ensureDir() {
  if (!existsSync(ERROR_DIR)) {
    mkdirSync(ERROR_DIR, { recursive: true });
  }
}

function extractError(err: unknown): { message: string; stack: string; type: string } {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: (err.stack ?? "").slice(0, MAX_STACK_LEN),
      type: err.constructor.name,
    };
  }
  return {
    message: String(err),
    stack: "",
    type: typeof err,
  };
}

function buildJsonLd(record: ErrorRecord): string {
  return JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(record._id),
    "@type": "schema:Action",
    "schema:actionStatus": "schema:FailedActionStatus",
    "schema:name": record.operation,
    "schema:agent": softwareAgent(record.component),
    "schema:error": {
      "@type": "schema:Thing",
      "schema:name": record.error_type,
      "schema:description": record.error_message,
    },
    "ev:severity": record.severity,
    ...(record.session_id ? { "prov:wasAssociatedWith": { "@id": piId(`session:${record.session_id}`) } } : {}),
    ...(record.project_id ? { "prov:atLocation": { "@id": piId(record.project_id) } } : {}),
    "prov:generatedAtTime": xsdLong(record.ts),
  });
}

/**
 * Capture an error. Writes synchronously to disk — this never throws.
 */
export function captureError(opts: CaptureErrorOptions): void {
  try {
    ensureDir();

    const { message, stack, type } = extractError(opts.error);
    const now = Date.now();
    const id = `err:${opts.component}:${now}:${randomUUID().slice(0, 8)}`;

    const record: ErrorRecord = {
      _id: id,
      component: opts.component,
      operation: opts.operation,
      error_message: message,
      error_stack: stack,
      error_type: type,
      severity: opts.severity,
      session_id: opts.sessionId ?? "",
      project_id: opts.projectId ?? "",
      input_summary: (opts.inputSummary ?? "").slice(0, MAX_INPUT_LEN),
      context_json: JSON.stringify(opts.context ?? {}),
      ts: now,
      flushed: false,
      jsonld: "", // built during flush to keep disk write fast
    };

    appendFileSync(ERROR_FILE, `${JSON.stringify(record)}\n`);
  } catch {
    // Last resort: if even disk write fails, at least stderr
    try {
    } catch {}
  }
}

// ─── Collector (async, flushes to XTDB) ────────────────────────

let flushTimer: ReturnType<typeof setInterval> | null = null;
let dbRef: any = null;

/**
 * Read unflushed errors from disk, write to XTDB, rewrite file without flushed entries.
 */
async function flushErrors(): Promise<number> {
  if (!(dbRef && existsSync(ERROR_FILE))) return 0;

  let lines: string[];
  try {
    lines = readFileSync(ERROR_FILE, "utf-8").split("\n").filter(Boolean);
  } catch {
    return 0;
  }

  if (lines.length === 0) return 0;

  const unflushed: ErrorRecord[] = [];
  const remaining: string[] = [];

  for (const line of lines) {
    try {
      const record: ErrorRecord = JSON.parse(line);
      if (!record.flushed) {
        unflushed.push(record);
      }
      // Keep all lines for now; we'll rewrite after flush
    } catch {
      remaining.push(line); // keep unparseable lines
    }
  }

  if (unflushed.length === 0) return 0;

  let flushedCount = 0;
  const t = (v: string | null) => dbRef.typed(v as any, 25);
  const n = (v: number | null) => dbRef.typed(v as any, 20);
  const b = (v: boolean | null) => dbRef.typed(v as any, 16);

  for (const record of unflushed) {
    try {
      record.jsonld = buildJsonLd(record);
      await dbRef`INSERT INTO errors (
        _id, component, operation, error_message, error_stack, error_type,
        severity, session_id, project_id, input_summary, context_json,
        ts, flushed, jsonld
      ) VALUES (
        ${t(record._id)}, ${t(record.component)}, ${t(record.operation)},
        ${t(record.error_message)}, ${t(record.error_stack)}, ${t(record.error_type)},
        ${t(record.severity)}, ${t(record.session_id)}, ${t(record.project_id)},
        ${t(record.input_summary)}, ${t(record.context_json)},
        ${n(record.ts)}, ${b(true)}, ${t(record.jsonld)}
      )`;
      record.flushed = true;
      flushedCount++;
    } catch {
      // DB still down — leave unflushed for next cycle
    }
  }

  // Rewrite file: only keep unflushed records
  if (flushedCount > 0) {
    try {
      const kept = lines
        .map((line) => {
          try {
            const r = JSON.parse(line);
            return r.flushed ? null : line;
          } catch {
            return line;
          }
        })
        .filter(Boolean);

      // Re-check unflushed records we just processed
      const stillUnflushed = unflushed.filter((r) => !r.flushed).map((r) => JSON.stringify(r));
      const newContent = [
        ...kept.filter((l) => {
          try {
            const r = JSON.parse(l!);
            return !unflushed.some((u) => u._id === r._id);
          } catch {
            return true;
          }
        }),
        ...stillUnflushed,
      ]
        .filter(Boolean)
        .join("\n");

      writeFileSync(ERROR_FILE, newContent ? `${newContent}\n` : "");
    } catch {
      // Don't lose data — if rewrite fails, originals stay on disk
    }
  }

  return flushedCount;
}

/**
 * Start the collector that periodically flushes errors to XTDB.
 * Pass the postgres sql instance.
 */
export function startErrorCollector(sql: any): void {
  dbRef = sql;
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushErrors().catch(() => {});
  }, FLUSH_INTERVAL_MS);
}

/**
 * Stop the collector and do a final flush.
 */
export async function stopErrorCollector(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushErrors();
}

/**
 * Get unflushed error count (for health checks).
 */
export function unflushedErrorCount(): number {
  try {
    if (!existsSync(ERROR_FILE)) return 0;
    const lines = readFileSync(ERROR_FILE, "utf-8").split("\n").filter(Boolean);
    return lines.filter((l) => {
      try {
        return !JSON.parse(l).flushed;
      } catch {
        return true;
      }
    }).length;
  } catch {
    return -1;
  }
}
