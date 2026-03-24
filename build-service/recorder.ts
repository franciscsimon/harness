// ─── Build Recorder ──────────────────────────────────────────────
// Writes build results to XTDB `builds` table as JSON-LD.
// Same pattern as ci-runner/recorder.ts.

import postgres from "postgres";
import { JSONLD_CONTEXT, piId } from "../lib/jsonld/context.ts";
import type { BuildResult } from "./builder.ts";

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

export async function recordBuild(result: BuildResult): Promise<string> {
  const conn = db();
  const t = (v: string | null) => conn.typed(v as any, 25);
  const n = (v: number | null) => conn.typed(v as any, 20);

  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(result.id),
    "@type": "code:Build",
    "schema:name": `Build: ${result.repo}@${result.commit.slice(0, 8)}`,
    "code:repo": result.repo,
    "code:commitHash": result.commit,
    "code:trigger": result.trigger,
    "schema:actionStatus": result.status === "success" ? "schema:CompletedActionStatus" : "schema:FailedActionStatus",
    "code:services": result.services.map((s) => ({
      "@type": "code:ServiceBuild",
      "schema:name": s.name,
      "oci:image": s.image,
      "oci:tags": s.tags,
      "schema:actionStatus": s.status === "success" ? "schema:CompletedActionStatus" : "schema:FailedActionStatus",
      "code:durationMs": s.durationMs,
    })),
    "code:durationMs": result.durationMs,
    "prov:generatedAtTime": { "@type": "xsd:long", "@value": now },
  });

  const serviceResults = JSON.stringify(result.services);

  await conn`INSERT INTO builds (
    _id, repo, commit_hash, status, trigger, services_total, services_ok,
    services_failed, duration_ms, ts, jsonld, service_results
  ) VALUES (
    ${t(result.id)}, ${t(result.repo)}, ${t(result.commit)},
    ${t(result.status)}, ${t(result.trigger)},
    ${n(result.services.length)},
    ${n(result.services.filter((s) => s.status === "success").length)},
    ${n(result.services.filter((s) => s.status === "failed").length)},
    ${n(result.durationMs)}, ${n(now)}, ${t(jsonld)}, ${t(serviceResults)}
  )`;
  return result.id;
}

export async function closeRecorder(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
