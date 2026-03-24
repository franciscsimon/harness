// ─── Provenance Chain ────────────────────────────────────────
// Backward traversal: "how did this entity come to be?"

import type { Sql } from "../lib/db.ts";
import { resolveEntity } from "./entity-resolver.ts";
import type { GraphEdge, GraphNode } from "./types.ts";

const PROVENANCE_PREDICATES = new Set([
  "prov:wasGeneratedBy", "prov:used", "prov:wasAssociatedWith",
  "caused_by", "implements", "parent", "ev:projectId", "ev:sessionId",
  "project_id", "release_id", "deployment_id", "requirement_id",
  "workflow_run_id", "ticket_id",
]);

/** Trace the provenance chain backward from an entity. */
export async function traceProvenance(
  sql: Sql,
  startId: string,
  maxDepth = 4,
): Promise<Array<{ node: GraphNode; edge: GraphEdge; depth: number }>> {
  const chain: Array<{ node: GraphNode; edge: GraphEdge; depth: number }> = [];
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      try {
        const rows = await sql`
          SELECT _id, source_id, source_type, target_id, target_type, predicate, ts
          FROM graph_edges WHERE source_id = ${nodeId} LIMIT 50`;

        for (const row of rows as any[]) {
          if (!PROVENANCE_PREDICATES.has(row.predicate as string)) continue;
          const targetId = row.target_id as string;
          if (visited.has(targetId)) continue;
          visited.add(targetId);

          const node = await resolveEntity(sql, targetId);
          if (node) {
            chain.push({
              node,
              edge: { id: row._id, sourceId: row.source_id, sourceType: row.source_type, targetId: row.target_id, targetType: row.target_type, predicate: row.predicate, ts: Number(row.ts ?? 0) },
              depth,
            });
            nextFrontier.push(targetId);
          }
        }
      } catch { /* skip */ }
    }

    frontier = nextFrontier;
  }

  return chain;
}
