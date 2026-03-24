// ─── Timeline ────────────────────────────────────────────────
// Cross-entity chronological activity stream.

import type { Sql } from "../lib/db.ts";
import type { TimelineEntry } from "./types.ts";

/** Unified timeline across all entity types. */
export async function getTimeline(
  sql: Sql,
  opts: { projectId?: string; entityTypes?: string[]; limit?: number; since?: number } = {},
): Promise<TimelineEntry[]> {
  const limit = opts.limit ?? 50;
  const since = opts.since ?? 0;
  const projectFilter = opts.projectId ? `AND project_id = '${opts.projectId}'` : "";

  const queries: Array<{ type: string; query: string }> = [
    { type: "decision", query: `SELECT _id, 'decision' AS etype, task AS title, what AS summary, ts FROM decisions WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "ticket", query: `SELECT _id, 'ticket' AS etype, title, description AS summary, ts FROM tickets WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "artifact", query: `SELECT _id, 'artifact' AS etype, path AS title, NULL AS summary, ts FROM artifacts WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "release", query: `SELECT _id, 'release' AS etype, version AS title, changelog AS summary, ts FROM releases WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "deployment", query: `SELECT _id, 'deployment' AS etype, status AS title, NULL AS summary, ts FROM deployments WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "test_run", query: `SELECT _id, 'test_run' AS etype, suite_name AS title, status AS summary, ts FROM test_runs WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "error", query: `SELECT _id, 'error' AS etype, error_message AS title, operation AS summary, ts FROM errors WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "incident", query: `SELECT _id, 'incident' AS etype, title, description AS summary, ts FROM incidents WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
    { type: "requirement", query: `SELECT _id, 'requirement' AS etype, title, description AS summary, ts FROM requirements WHERE ts > ${since} ${projectFilter} ORDER BY ts DESC LIMIT ${limit}` },
  ];

  const filtered = opts.entityTypes
    ? queries.filter((q) => opts.entityTypes!.includes(q.type))
    : queries;

  const results: TimelineEntry[] = [];

  for (const q of filtered) {
    try {
      const rows = await sql.unsafe(q.query);
      for (const row of rows as any[]) {
        results.push({
          id: row._id,
          entityType: row.etype,
          title: row.title ?? row._id,
          summary: row.summary ?? undefined,
          ts: Number(row.ts ?? 0),
        });
      }
    } catch { /* table may not exist — skip */ }
  }

  return results.sort((a, b) => b.ts - a.ts).slice(0, limit);
}
