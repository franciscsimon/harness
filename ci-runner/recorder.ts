// ─── CI Run Recorder ─────────────────────────────────────────────
// Writes CI pipeline results to XTDB `ci_runs` table as JSON-LD.
// Follows the same pattern as lib/test-recorder.ts.
//
// The JSON-LD makes CI runs queryable via SPARQL alongside:
//   - test_runs (test results)
//   - events (agent activity)
//   - decisions (why changes were made)
//   - function lifecycle (what functions changed)
//
// Example SPARQL: "Show me all failed CI runs for commits that
// touched functions with fan-in > 10"

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

let sql: ReturnType<typeof postgres> | null = null;

function db() {
  if (!sql) {
    sql = postgres({
      host: XTDB_HOST, port: XTDB_PORT,
      database: "xtdb", user: "xtdb", password: "xtdb",
      max: 2, idle_timeout: 30, connect_timeout: 5,
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
}

export interface CIStepResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  exitCode: number;
}

// ─── Record a CI run ─────────────────────────────────────────────

export async function recordCIRun(input: CIRunInput): Promise<string> {
  const conn = db();
  const t = (v: string | null) => conn.typed(v as any, 25); // text
  const n = (v: number | null) => conn.typed(v as any, 20); // bigint

  const id = `ci:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": {
      schema: "https://schema.org/",
      prov: "http://www.w3.org/ns/prov#",
      code: "https://pi.dev/code/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
    "@id": `urn:pi:${id}`,
    "@type": "code:CIRun",
    "schema:name": `CI: ${input.repo}@${input.commitHash.slice(0, 8)}`,
    "code:repo": input.repo,
    "code:ref": input.ref,
    "code:commitHash": input.commitHash,
    "code:commitMessage": input.commitMessage ?? "",
    "code:pusher": input.pusher ?? "",
    "schema:actionStatus": input.status === "passed"
      ? "schema:CompletedActionStatus"
      : "schema:FailedActionStatus",
    "code:steps": input.steps.map((s) => ({
      "@type": "code:CIStep",
      "schema:name": s.name,
      "schema:actionStatus": s.status === "passed"
        ? "schema:CompletedActionStatus"
        : "schema:FailedActionStatus",
      "code:exitCode": s.exitCode,
      "code:durationMs": s.durationMs,
    })),
    "code:durationMs": input.durationMs,
    "prov:generatedAtTime": { "@type": "xsd:long", "@value": now },
  });

  await conn`INSERT INTO ci_runs (
    _id, repo, ref, commit_hash, commit_message, pusher,
    status, steps_passed, steps_failed, duration_ms, ts, jsonld
  ) VALUES (
    ${t(id)}, ${t(input.repo)}, ${t(input.ref)},
    ${t(input.commitHash)}, ${t(input.commitMessage ?? "")},
    ${t(input.pusher ?? "")}, ${t(input.status)},
    ${n(input.steps.filter((s) => s.status === "passed").length)},
    ${n(input.steps.filter((s) => s.status === "failed").length)},
    ${n(input.durationMs)}, ${n(now)}, ${t(jsonld)}
  )`;

  return id;
}

export async function closeRecorder(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
