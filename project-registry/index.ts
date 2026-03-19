import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ids } from "../lib/jsonld/ids.ts";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { resolveProject, projectId } from "./identity.ts";
import { buildProjectJsonLd, buildSessionProjectJsonLd } from "./rdf.ts";
import type { ProjectRecord, SessionProjectRecord, CurrentProject, ExecFn } from "./types.ts";

function makeExecFn(pi: ExtensionAPI): ExecFn {
  return async (cmd, args, opts) => {
    const result = await pi.exec(cmd, args, opts ?? {});
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

async function upsertProject(sql: Sql, identity: ReturnType<typeof resolveProject> extends Promise<infer T> ? T : never, now: number): Promise<{ record: ProjectRecord; isFirstSession: boolean }> {
  const projId = projectId(identity.canonicalId);
  const t = (v: string | null) => sql.typed(v as any, 25);
  const n = (v: number | null) => sql.typed(v as any, 20);

  let existing: any = null;
  try {
    const rows = await sql`SELECT * FROM projects WHERE _id = ${t(projId)}`;
    existing = rows[0] ?? null;
  } catch { /* table may not exist yet */ }

  const isFirstSession = existing === null;
  const record: ProjectRecord = {
    _id: projId,
    canonical_id: identity.canonicalId,
    name: identity.name,
    identity_type: identity.identityType,
    git_remote_url: identity.gitRemoteUrl,
    git_root_path: identity.gitRootPath,
    first_seen_ts: isFirstSession ? now : Number(existing.first_seen_ts),
    last_seen_ts: now,
    session_count: isFirstSession ? 1 : (Number(existing.session_count) || 0) + 1,
    lifecycle_phase: isFirstSession ? "active" : (existing.lifecycle_phase ?? "active"),
    config_json: isFirstSession ? "{}" : (existing.config_json ?? "{}"),
    jsonld: "",
  };
  record.jsonld = JSON.stringify(buildProjectJsonLd(record));

  await sql`INSERT INTO projects (
    _id, canonical_id, name, identity_type, git_remote_url, git_root_path,
    first_seen_ts, last_seen_ts, session_count, lifecycle_phase, config_json, jsonld
  ) VALUES (
    ${t(record._id)}, ${t(record.canonical_id)},
    ${t(record.name)}, ${t(record.identity_type)},
    ${t(record.git_remote_url)}, ${t(record.git_root_path)},
    ${n(record.first_seen_ts)}, ${n(record.last_seen_ts)},
    ${n(record.session_count)}, ${t(record.lifecycle_phase)},
    ${t(record.config_json)}, ${t(record.jsonld)}
  )`;

  return { record, isFirstSession };
}

async function insertSessionLink(sql: Sql, sessionId: string, projId: string, identity: ReturnType<typeof resolveProject> extends Promise<infer T> ? T : never, cwd: string, now: number, isFirstSession: boolean): Promise<void> {
  const t = (v: string | null) => sql.typed(v as any, 25);
  const b = (v: boolean | null) => sql.typed(v as any, 16);
  const n = (v: number | null) => sql.typed(v as any, 20);

  const record: SessionProjectRecord = {
    _id: ids.sessionProject(),
    session_id: sessionId,
    project_id: projId,
    canonical_id: identity.canonicalId,
    cwd,
    git_root_path: identity.gitRootPath,
    ts: now,
    is_first_session: isFirstSession,
    jsonld: "",
  };
  record.jsonld = JSON.stringify(buildSessionProjectJsonLd(record));

  await sql`INSERT INTO session_projects (
    _id, session_id, project_id, canonical_id, cwd, git_root_path,
    ts, is_first_session, jsonld
  ) VALUES (
    ${t(record._id)}, ${t(record.session_id)},
    ${t(record.project_id)}, ${t(record.canonical_id)},
    ${t(record.cwd)}, ${t(record.git_root_path)},
    ${n(record.ts)}, ${b(record.is_first_session)},
    ${t(record.jsonld)}
  )`;
}

export default function (pi: ExtensionAPI) {
  let sql: Sql | null = null;

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
    const now = Date.now();

    if (!sql) {
      try {
        sql = connectXtdb();
        const ok = await ensureConnected(sql);
        if (!ok) throw new Error("connection check failed");
      } catch (err) {
        sql = null;
        console.error(`[project-registry] XTDB connection failed: ${err}`);
        return;
      }
    }

    let identity;
    try {
      identity = await resolveProject(cwd, makeExecFn(pi));
    } catch (err) {
      console.error(`[project-registry] Identity resolution failed: ${err}`);
      return;
    }

    try {
      const { record, isFirstSession } = await upsertProject(sql, identity, now);
      await insertSessionLink(sql, sessionId, record._id, identity, cwd, now, isFirstSession);

      const current: CurrentProject = {
        projectId: record._id,
        canonicalId: identity.canonicalId,
        name: identity.name,
        isFirstSession,
        identityType: identity.identityType,
      };
      (globalThis as any).__piCurrentProject = current;
      ctx.ui.setStatus("project", `📁 ${identity.name}`);
    } catch (err) {
      console.error(`[project-registry] XTDB write failed: ${err}`);
    }
  });

  pi.on("session_shutdown", async () => {
    if (sql) {
      try { await sql.end(); } catch {}
      sql = null;
    }
  });
}
