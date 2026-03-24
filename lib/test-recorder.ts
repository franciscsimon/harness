/**
 * Test Run Recorder — writes test results to the `test_runs` table in XTDB.
 *
 * Used by:
 * 1. Post-run scripts (harness's own tests)
 * 2. quality-hooks extension (agent-run tests on user projects)
 *
 * Usage:
 *   import { recordTestRun, closeRecorder } from "../lib/test-recorder.ts";
 *
 *   await recordTestRun({
 *     suiteName: "contracts/api-event-logger",
 *     runner: "jiti",
 *     passed: 22,
 *     failed: 0,
 *     skipped: 0,
 *     durationMs: 1234,
 *     status: "passed",
 *   });
 */

import { randomUUID } from "node:crypto";
import { connectXtdb } from "./db.ts";
import { JSONLD_CONTEXT, piId } from "./jsonld/context.ts";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

let sql: ReturnType<typeof postgres> | null = null;

function db() {
  if (!sql) {
    sql = connectXtdb({ max: 2 });
  }
  return sql;
}

export interface TestRunInput {
  projectId?: string;
  sessionId?: string;
  releaseId?: string;
  deploymentId?: string;
  suiteName: string;
  runner: string;
  passed: number;
  failed: number;
  skipped?: number;
  coverage?: string;
  durationMs: number;
  status: "passed" | "failed";
  errorSummary?: string;
}

export async function recordTestRun(input: TestRunInput): Promise<string> {
  const conn = db();
  const t = (v: string | null) => conn.typed(v as any, 25);
  const n = (v: number | null) => conn.typed(v as any, 20);

  const id = `trun:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": "schema:AssessAction",
    "schema:name": input.suiteName,
    "schema:agent": { "@type": "schema:SoftwareApplication", "schema:name": input.runner },
    "schema:actionStatus": input.status === "passed" ? "schema:CompletedActionStatus" : "schema:FailedActionStatus",
    "schema:result": {
      "ev:passed": input.passed,
      "ev:failed": input.failed,
      "ev:skipped": input.skipped ?? 0,
    },
    "prov:generatedAtTime": { "@type": "xsd:long", "@value": now },
  });

  await conn`INSERT INTO test_runs (
    _id, project_id, session_id, release_id, deployment_id,
    suite_name, runner, passed, failed, skipped, coverage,
    duration_ms, status, error_summary, ts, jsonld
  ) VALUES (
    ${t(id)}, ${t(input.projectId ?? "")}, ${t(input.sessionId ?? "")},
    ${t(input.releaseId ?? "")}, ${t(input.deploymentId ?? "")},
    ${t(input.suiteName)}, ${t(input.runner)},
    ${n(input.passed)}, ${n(input.failed)}, ${n(input.skipped ?? 0)},
    ${t(input.coverage ?? "")}, ${n(input.durationMs)},
    ${t(input.status)}, ${t(input.errorSummary ?? "")},
    ${n(now)}, ${t(jsonld)}
  )`;

  return id;
}

export async function closeRecorder(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
