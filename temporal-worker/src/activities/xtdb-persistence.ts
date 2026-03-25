/**
 * Activity: Write records to XTDB with retry.
 * Wraps postgres INSERT with Temporal's retry policy.
 */
import postgres from "postgres";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { config } from "../shared/config.js";
import type { XtdbRecord } from "../shared/types.js";

const tracer = trace.getTracer("harness-xtdb");

let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres({
      host: config.xtdb.host,
      port: config.xtdb.port,
      username: config.xtdb.user,
      password: config.xtdb.password,
      database: config.xtdb.database,
      max: 3,
      idle_timeout: 30,
    });
  }
  return _sql;
}

export async function recordToXtdb(record: XtdbRecord): Promise<{ inserted: boolean }> {
  return tracer.startActiveSpan(`xtdb.insert.${record.table}`, async (span) => {
    const sql = getSql();
    const { table, data } = record;
    span.setAttributes({ "xtdb.table": table, "xtdb.columns": Object.keys(data).length });

    try {
      const columns = Object.keys(data);
      const values = Object.values(data);

      if (!data._id) {
        columns.push("_id");
        values.push(`${table}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      }
      if (!data._valid_from) {
        columns.push("_valid_from");
        values.push(new Date().toISOString());
      }
      if (!data.ts) {
        columns.push("ts");
        values.push(Date.now());
      }

      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const colList = columns.map((c) => `"${c}"`).join(", ");

      await sql.unsafe(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
        values as any[],
      );

      return { inserted: true };
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Record a CI run with all step results. */
export async function recordCIRunToXtdb(input: {
  repo: string;
  commitSha: string;
  branch: string;
  status: string;
  steps: Array<{ name: string; status: string; exitCode: number; output: string; durationMs: number }>;
  totalDurationMs: number;
  pipelineJsonLd?: Record<string, unknown>;
  temporalWorkflowId?: string;
}): Promise<{ runId: string }> {
  return tracer.startActiveSpan("xtdb.insert.ci_runs", async (span) => {
    const sql = getSql();
    const runId = `ci-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    span.setAttributes({
      "ci.repo": input.repo,
      "ci.commit": input.commitSha,
      "ci.status": input.status,
      "ci.steps": input.steps.length,
      "ci.duration_ms": input.totalDurationMs,
    });

    try {
      // XTDB pgwire requires explicit types — use sql.typed() helpers
      const t = (v: string | null) => sql.typed(v as any, 25);  // text OID
      const n = (v: number | null) => sql.typed(v as any, 20);  // bigint OID
      await sql`INSERT INTO ci_runs (
        _id, repo, commit_hash, ref, status,
        steps_json, duration_ms, temporal_workflow_id, ts, _valid_from
      ) VALUES (
        ${t(runId)}, ${t(input.repo)}, ${t(input.commitSha)}, ${t(input.branch)}, ${t(input.status)},
        ${t(JSON.stringify(input.steps))}, ${n(input.totalDurationMs)},
        ${t(input.temporalWorkflowId ?? null)},
        ${n(now)}, ${t(new Date().toISOString())}
      )`;

      span.setAttribute("ci.run_id", runId);
      return { runId };
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
