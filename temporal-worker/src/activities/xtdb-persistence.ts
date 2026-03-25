/**
 * Activity: Write records to XTDB with retry.
 * Wraps postgres INSERT with Temporal's retry policy.
 */
import postgres from "postgres";
import { config } from "../shared/config.js";
import type { XtdbRecord } from "../shared/types.js";

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
  const sql = getSql();
  const { table, data } = record;

  // Build column list and values
  const columns = Object.keys(data);
  const values = Object.values(data);

  // Ensure _id and _valid_from exist
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
    values,
  );

  return { inserted: true };
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
  const sql = getSql();
  const runId = `ci-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  await sql`INSERT INTO ci_runs (
    _id, repo, commit_hash, ref, status,
    steps_json, duration_ms, pipeline_jsonld, temporal_workflow_id,
    ts, _valid_from
  ) VALUES (
    ${runId}, ${input.repo}, ${input.commitSha}, ${input.branch}, ${input.status},
    ${JSON.stringify(input.steps)}, ${input.totalDurationMs},
    ${input.pipelineJsonLd ? JSON.stringify(input.pipelineJsonLd) : null},
    ${input.temporalWorkflowId ?? null},
    ${now}, ${new Date().toISOString()}
  )`;

  return { runId };
}
