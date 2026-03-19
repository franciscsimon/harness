import postgres from "postgres";
import { randomUUID } from "node:crypto";

const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", user: "xtdb", password: "xtdb", max: 2 });
const t = (v: string | null) => sql.typed(v as any, 25);
const n = (v: number | null) => sql.typed(v as any, 20);

export interface IncidentInput {
  project_id?: string;
  severity: string;
  title: string;
  description?: string;
}

export interface IncidentUpdate {
  status?: string;
  resolved_ts?: number;
  notes?: string;
}

export async function createIncident(data: IncidentInput) {
  const id = `inc:${randomUUID()}`;
  const now = Date.now();

  const rows = await sql`
    INSERT INTO incidents (_id, project_id, severity, title, description, status, started_ts, ts, jsonld)
    VALUES (
      ${t(id)},
      ${t(data.project_id ?? null)},
      ${t(data.severity)},
      ${t(data.title)},
      ${t(data.description ?? null)},
      ${t("open")},
      ${n(now)},
      ${n(now)},
      ${t("{}")}
    )
  `;

  return { _id: id, status: "open", started_ts: now, ts: now, ...data };
}

export async function listIncidents(projectId?: string, status?: string) {
  if (projectId && status) {
    return sql`SELECT * FROM incidents WHERE project_id = ${t(projectId)} AND status = ${t(status)} ORDER BY ts DESC`;
  }
  if (projectId) {
    return sql`SELECT * FROM incidents WHERE project_id = ${t(projectId)} ORDER BY ts DESC`;
  }
  if (status) {
    return sql`SELECT * FROM incidents WHERE status = ${t(status)} ORDER BY ts DESC`;
  }
  return sql`SELECT * FROM incidents ORDER BY ts DESC`;
}

export async function getIncident(id: string) {
  const rows = await sql`SELECT * FROM incidents WHERE _id = ${t(id)}`;
  return rows[0] ?? null;
}

export async function updateIncident(id: string, updates: IncidentUpdate) {
  const existing = await getIncident(id);
  if (!existing) return null;

  const merged = {
    ...existing,
    status: updates.status ?? existing.status,
    resolved_ts: updates.resolved_ts ?? existing.resolved_ts,
    notes: updates.notes ?? existing.notes,
    ts: Date.now(),
  };

  // XTDB upsert: re-INSERT with same _id
  await sql`
    INSERT INTO incidents (_id, project_id, severity, title, description, status, started_ts, resolved_ts, notes, ts, jsonld)
    VALUES (
      ${t(merged._id)},
      ${t(merged.project_id ?? null)},
      ${t(merged.severity)},
      ${t(merged.title)},
      ${t(merged.description ?? null)},
      ${t(merged.status)},
      ${n(merged.started_ts)},
      ${n(merged.resolved_ts ?? null)},
      ${t(merged.notes ?? null)},
      ${n(merged.ts)},
      ${t(merged.jsonld ?? "{}")}
    )
  `;

  return merged;
}
