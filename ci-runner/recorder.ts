// ─── CI Run Recorder ─────────────────────────────────────────────
// Writes CI pipeline results to XTDB `ci_runs` table as JSON-LD.
// Follows the same pattern as lib/test-recorder.ts.
//
// Uses the shared JSONLD_CONTEXT — same namespaces as every other
// entity in the harness. No separate context, no translation.

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { JSONLD_CONTEXT, piId } from "../lib/jsonld/context.ts";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

let sql: ReturnType<typeof postgres> | null = null;

function db() {
  if (!sql) {
    sql = postgres({
      host: XTDB_HOST,
      port: XTDB_PORT,
      database: "xtdb",
      user: "xtdb",
      password: "xtdb",
      max: 2,
      idle_timeout: 30,
      connect_timeout: 5,
    });
  }
  return sql;
}

// ─── Types ───────────────────────────────────────────────────────

export interface CIRunInput {
  repo: string;
  ref: string;
  commitHash: string;
  commitMessage?: string;
  pusher?: string;
  status: "passed" | "failed" | "error";
  steps: CIStepResult[];
  durationMs: number;
  projectId?: string;
  pipelineJsonLd?: object; // the resolved pipeline config (already JSON-LD)
}

export interface CIStepResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  exitCode: number;
  output?: string; // combined stdout+stderr (last 10KB)
}

// ─── Record a CI run ─────────────────────────────────────────────

export async function recordCIRun(input: CIRunInput): Promise<string> {
  const conn = db();
  const t = (v: string | null) => conn.typed(v as any, 25); // text — matches lib/db.ts pattern
  const n = (v: number | null) => conn.typed(v as any, 20); // bigint

  const id = `ci:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": "code:CIRun",
    "schema:name": `CI: ${input.repo}@${input.commitHash.slice(0, 8)}`,
    "code:repo": input.repo,
    "code:ref": input.ref,
    "code:commitHash": input.commitHash,
    "code:commitMessage": input.commitMessage ?? "",
    "code:pusher": input.pusher ?? "",
    "schema:actionStatus": input.status === "passed" ? "schema:CompletedActionStatus" : "schema:FailedActionStatus",
    "code:steps": input.steps.map((s) => ({
      "@type": "code:CIStep",
      "schema:name": s.name,
      "schema:actionStatus": s.status === "passed" ? "schema:CompletedActionStatus" : "schema:FailedActionStatus",
      "code:exitCode": s.exitCode,
      "code:durationMs": s.durationMs,
    })),
    "code:durationMs": input.durationMs,
    "code:pipeline": input.pipelineJsonLd ?? null,
    "prov:generatedAtTime": { "@type": "xsd:long", "@value": now },
  });

  const stepResults = JSON.stringify(input.steps);

  await conn`INSERT INTO ci_runs (
    _id, repo, ref, commit_hash, commit_message, pusher,
    status, steps_passed, steps_failed, duration_ms, ts, jsonld, step_results
  ) VALUES (
    ${t(id)}, ${t(input.repo)}, ${t(input.ref)},
    ${t(input.commitHash)}, ${t(input.commitMessage ?? "")},
    ${t(input.pusher ?? "")}, ${t(input.status)},
    ${n(input.steps.filter((s) => s.status === "passed").length)},
    ${n(input.steps.filter((s) => s.status === "failed").length)},
    ${n(input.durationMs)}, ${n(now)}, ${t(jsonld)}, ${t(stepResults)}
  )`;

  return id;
}

export async function closeRecorder(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
