import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");
const CI_WEBHOOK_SECRET = process.env.CI_WEBHOOK_SECRET ?? "";

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
      connect_timeout: 10,
    });
  }
  return sql;
}

const t = (v: string | null) => db().typed(v as any, 25);
const n = (v: number | null) => db().typed(v as any, 20);

export interface CIEvent {
  type: "build.finished" | "test.finished" | "artifact.published" | "deployment.finished" | "release.published";
  project: string;
  source?: string;
  subject: {
    id: string;
    version?: string;
    environment?: string;
    git_commit?: string;
    git_tag?: string;
    status: "succeeded" | "failed" | "error";
    passed?: number;
    failed?: number;
    skipped?: number;
    coverage?: string;
    suite_name?: string;
    url?: string;
    artifact_url?: string;
    duration_ms?: number;
    notes?: string;
  };
  timestamp?: string;
  signature?: string;
}

export function verifySignature(body: string, signature: string | undefined): boolean {
  if (!CI_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = createHmac("sha256", CI_WEBHOOK_SECRET).update(body).digest("hex");
  return signature === expected || signature === `sha256=${expected}`;
}

function normalizeGitUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/:/g, "/")
    .replace(/\.git$/, "")
    .replace(/^\/+/, "");
}

async function resolveProjectId(projectRef: string): Promise<string | null> {
  const normalized = normalizeGitUrl(projectRef);
  try {
    const rows = await db()`SELECT _id, canonical_id FROM projects ORDER BY last_seen_ts DESC`;
    for (const row of rows) {
      const cid = String(row.canonical_id ?? "");
      if (cid.includes(normalized) || normalized.includes(cid.replace("git:", ""))) {
        return row._id;
      }
    }
  } catch {
    /* table may not exist */
  }
  return null;
}

const JSONLD_CONTEXT = {
  ev: "https://pi.dev/events/",
  prov: "http://www.w3.org/ns/prov#",
  schema: "https://schema.org/",
  doap: "http://usefulinc.com/ns/doap#",
  foaf: "http://xmlns.com/foaf/0.1/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

export async function processCIEvent(event: CIEvent): Promise<{ entity_id: string; entity_type: string }> {
  const projectId = await resolveProjectId(event.project);
  const now = Date.now();
  const s = event.subject;
  const source = event.source ?? "unknown";

  switch (event.type) {
    case "test.finished": {
      const id = `trun:${randomUUID()}`;
      const jsonld = JSON.stringify({
        "@context": JSONLD_CONTEXT,
        "@id": `urn:pi:${id}`,
        "@type": ["schema:CheckAction", "prov:Activity"],
        "schema:object": projectId ? { "@id": `urn:pi:${projectId}` } : null,
        "prov:wasAssociatedWith": { "@type": "prov:SoftwareAgent", "schema:name": source },
        "ev:suiteName": s.suite_name ?? "unknown",
        "ev:passed": s.passed != null ? { "@value": String(s.passed), "@type": "xsd:integer" } : null,
        "ev:failed": s.failed != null ? { "@value": String(s.failed), "@type": "xsd:integer" } : null,
        "ev:skipped": s.skipped != null ? { "@value": String(s.skipped), "@type": "xsd:integer" } : null,
        "ev:coverage": s.coverage ?? null,
        "ev:durationMs": s.duration_ms != null ? { "@value": String(s.duration_ms), "@type": "xsd:long" } : null,
        "schema:actionStatus": s.status === "succeeded" ? "CompletedActionStatus" : "FailedActionStatus",
        "schema:version": s.git_commit ?? null,
        "prov:generatedAtTime": { "@value": String(now), "@type": "xsd:long" },
      });

      await db()`INSERT INTO test_runs (
        _id, project_id, session_id, release_id, deployment_id,
        suite_name, runner, passed, failed, skipped, coverage,
        duration_ms, status, error_summary, git_commit, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(null)}, ${t(null)}, ${t(null)},
        ${t(s.suite_name ?? "unknown")}, ${t(source)},
        ${n(s.passed ?? null)}, ${n(s.failed ?? null)}, ${n(s.skipped ?? null)},
        ${t(s.coverage ?? null)}, ${n(s.duration_ms ?? null)},
        ${t(s.status)}, ${t(null)}, ${t(s.git_commit ?? null)},
        ${n(now)}, ${t(jsonld)}
      )`;
      await emitLifecycleEvent(
        "test_run_completed",
        id,
        "test_runs",
        projectId,
        `${s.suite_name ?? "test"}: ${s.status} (${s.passed ?? 0} passed, ${s.failed ?? 0} failed)`,
        now,
      );
      return { entity_id: id, entity_type: "test_runs" };
    }

    case "deployment.finished": {
      const id = `depl:${randomUUID()}`;
      const jsonld = JSON.stringify({
        "@context": JSONLD_CONTEXT,
        "@id": `urn:pi:${id}`,
        "@type": ["schema:DeployAction", "prov:Activity"],
        "schema:targetCollection": s.environment ?? null,
        "prov:wasAssociatedWith": { "@type": "prov:SoftwareAgent", "schema:name": source },
        "schema:actionStatus": s.status === "succeeded" ? "CompletedActionStatus" : "FailedActionStatus",
        "schema:text": s.notes ?? null,
        "schema:version": s.git_commit ?? null,
        "prov:generatedAtTime": { "@value": String(now), "@type": "xsd:long" },
      });

      await db()`INSERT INTO deployments (
        _id, project_id, environment_id, release_id, session_id,
        deployed_by, status, rollback_of_id, notes,
        started_ts, completed_ts, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(null)}, ${t(null)}, ${t(null)},
        ${t(source)}, ${t(s.status)}, ${t(null)}, ${t(s.notes ?? null)},
        ${n(now)}, ${n(now)}, ${n(now)}, ${t(jsonld)}
      )`;
      await emitLifecycleEvent(
        `deployment_${s.status}`,
        id,
        "deployments",
        projectId,
        `Deploy to ${s.environment ?? "unknown"}: ${s.status}`,
        now,
      );
      return { entity_id: id, entity_type: "deployments" };
    }

    case "release.published": {
      const id = `rel:${randomUUID()}`;
      const jsonld = JSON.stringify({
        "@context": JSONLD_CONTEXT,
        "@id": `urn:pi:${id}`,
        "@type": ["doap:Version", "prov:Entity"],
        "doap:revision": s.version ?? s.git_tag ?? "unknown",
        "doap:name": s.notes ?? `Release ${s.version ?? s.git_tag}`,
        "schema:isPartOf": projectId ? { "@id": `urn:pi:${projectId}` } : null,
        "schema:version": s.git_commit ?? null,
        "schema:creativeWorkStatus": "published",
        "prov:generatedAtTime": { "@value": String(now), "@type": "xsd:long" },
      });

      await db()`INSERT INTO releases (
        _id, project_id, session_id, version, name, changelog,
        git_tag, git_commit, previous_release_id, status, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(null)},
        ${t(s.version ?? s.git_tag ?? "unknown")},
        ${t(s.notes ?? `Release ${s.version ?? s.git_tag}`)},
        ${t(null)}, ${t(s.git_tag ?? null)}, ${t(s.git_commit ?? null)},
        ${t(null)}, ${t("published")}, ${n(now)}, ${t(jsonld)}
      )`;
      await emitLifecycleEvent(
        "release_created",
        id,
        "releases",
        projectId,
        `Release ${s.version ?? s.git_tag ?? "unknown"} published`,
        now,
      );
      return { entity_id: id, entity_type: "releases" };
    }
    default: {
      const id = `lev:${randomUUID()}`;
      await emitLifecycleEvent(
        event.type.replace(".", "_"),
        id,
        "ci_event",
        projectId,
        `${event.type} from ${source}: ${s.status}`,
        now,
      );
      return { entity_id: id, entity_type: "lifecycle_events" };
    }
  }
}

async function emitLifecycleEvent(
  eventType: string,
  entityId: string,
  entityType: string,
  projectId: string | null,
  summary: string,
  ts: number,
) {
  const id = `lev:${randomUUID()}`;
  try {
    await db()`INSERT INTO lifecycle_events (
      _id, event_type, entity_id, entity_type, project_id, summary, ts
    ) VALUES (
      ${t(id)}, ${t(eventType)}, ${t(entityId)}, ${t(entityType)},
      ${t(projectId)}, ${t(summary)}, ${n(ts)}
    )`;
  } catch (_err) {}
}
