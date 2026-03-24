// ─── Materialized Edges ──────────────────────────────────────
// Build and refresh the graph_edges table from FK columns across all entity tables.

import { randomUUID } from "node:crypto";
import type { Sql } from "../lib/db.ts";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("knowledge-graph:edges");

/** FK column → predicate mappings for each table. */
const TABLE_FK_MAP: Record<string, Array<{ column: string; predicate: string; targetType: string }>> = {
  decisions:            [{ column: "project_id", predicate: "ev:projectId", targetType: "projects" }, { column: "session_id", predicate: "ev:sessionId", targetType: "events" }],
  artifacts:            [{ column: "project_id", predicate: "ev:projectId", targetType: "projects" }, { column: "session_id", predicate: "ev:sessionId", targetType: "events" }],
  artifact_versions:    [{ column: "session_id", predicate: "ev:sessionId", targetType: "events" }],
  requirements:         [{ column: "project_id", predicate: "ev:projectId", targetType: "projects" }],
  requirement_links:    [{ column: "requirement_id", predicate: "requirement_id", targetType: "requirements" }, { column: "entity_id", predicate: "entity_id", targetType: "unknown" }],
  releases:             [{ column: "project_id", predicate: "ev:projectId", targetType: "projects" }, { column: "previous_release_id", predicate: "previous_release_id", targetType: "releases" }],
  deployments:          [{ column: "project_id", predicate: "project_id", targetType: "projects" }, { column: "release_id", predicate: "prov:used", targetType: "releases" }, { column: "environment_id", predicate: "prov:atLocation", targetType: "environments" }],
  test_runs:            [{ column: "project_id", predicate: "project_id", targetType: "projects" }, { column: "release_id", predicate: "release_id", targetType: "releases" }, { column: "deployment_id", predicate: "deployment_id", targetType: "deployments" }],
  incidents:            [{ column: "project_id", predicate: "project_id", targetType: "projects" }],
  workflow_runs:        [{ column: "project_id", predicate: "project_id", targetType: "projects" }, { column: "session_id", predicate: "ev:sessionId", targetType: "events" }],
  workflow_step_runs:   [{ column: "workflow_run_id", predicate: "workflow_run_id", targetType: "workflow_runs" }],
  tickets:              [{ column: "project_id", predicate: "project_id", targetType: "projects" }, { column: "parent_ticket_id", predicate: "parent", targetType: "tickets" }],
  ticket_links:         [{ column: "ticket_id", predicate: "ticket_id", targetType: "tickets" }, { column: "entity_id", predicate: "entity_id", targetType: "unknown" }],
  ticket_events:        [{ column: "ticket_id", predicate: "ticket_id", targetType: "tickets" }],
  session_projects:     [{ column: "project_id", predicate: "project_id", targetType: "projects" }],
  session_postmortems:  [{ column: "project_id", predicate: "project_id", targetType: "projects" }],
  delegations:          [{ column: "project_id", predicate: "project_id", targetType: "projects" }],
  errors:               [{ column: "project_id", predicate: "project_id", targetType: "projects" }],
};

/** Full rebuild of graph_edges table. Scans all FK columns. */
export async function rebuildEdges(sql: Sql): Promise<{ total: number; errors: number }> {
  log.info("Starting full edge rebuild");
  let total = 0;
  let errors = 0;

  // Clear existing edges
  try { await sql`DELETE FROM graph_edges WHERE 1=1`; } catch { /* table may not exist */ }

  for (const [table, fks] of Object.entries(TABLE_FK_MAP)) {
    for (const fk of fks) {
      try {
        const rows = await sql.unsafe(
          `SELECT _id, ${fk.column}, ts FROM ${table} WHERE ${fk.column} IS NOT NULL LIMIT 10000`,
        );
        for (const row of rows as any[]) {
          try {
            await sql`
              INSERT INTO graph_edges (_id, source_id, source_type, target_id, target_type, predicate, ts, _valid_from)
              VALUES (
                ${`gedge:${randomUUID()}`},
                ${row._id}, ${table},
                ${row[fk.column]}, ${fk.targetType},
                ${fk.predicate},
                ${Number(row.ts ?? 0)},
                CURRENT_TIMESTAMP
              )`;
            total++;
          } catch { errors++; }
        }
      } catch (e: any) {
        log.warn({ table, column: fk.column, err: e.message }, "Failed to scan table");
        errors++;
      }
    }
  }

  log.info({ total, errors }, "Edge rebuild complete");
  return { total, errors };
}

/** Get edge count statistics. */
export async function getEdgeStats(sql: Sql): Promise<{
  total: number;
  bySourceType: Record<string, number>;
  byPredicate: Record<string, number>;
}> {
  try {
    const [countRow] = await sql`SELECT COUNT(*) as cnt FROM graph_edges`;
    const bySource = await sql`SELECT source_type, COUNT(*) as cnt FROM graph_edges GROUP BY source_type ORDER BY cnt DESC`;
    const byPred = await sql`SELECT predicate, COUNT(*) as cnt FROM graph_edges GROUP BY predicate ORDER BY cnt DESC`;

    return {
      total: Number(countRow?.cnt ?? 0),
      bySourceType: Object.fromEntries(bySource.map((r: any) => [r.source_type, Number(r.cnt)])),
      byPredicate: Object.fromEntries(byPred.map((r: any) => [r.predicate, Number(r.cnt)])),
    };
  } catch {
    return { total: 0, bySourceType: {}, byPredicate: {} };
  }
}
