// ─── Impact Analysis ─────────────────────────────────────────
// Forward traversal: "what depends on this entity?"

import type { Sql } from "../lib/db.ts";
import { resolveEntity } from "./entity-resolver.ts";
import type { GraphEdge, GraphNode, ImpactResult } from "./types.ts";

/** Find all entities that depend on the given entity (forward BFS). */
export async function analyzeImpact(
  sql: Sql,
  startId: string,
  maxDepth = 4,
): Promise<ImpactResult | null> {
  const root = await resolveEntity(sql, startId);
  if (!root) return null;

  const affected: Array<{ node: GraphNode; edge: GraphEdge; depth: number }> = [];
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      try {
        // Find entities that reference this entity (inbound = "depends on")
        const rows = await sql`
          SELECT _id, source_id, source_type, target_id, target_type, predicate, ts
          FROM graph_edges WHERE target_id = ${nodeId} LIMIT 50`;

        for (const row of rows as any[]) {
          const neighborId = row.source_id as string;
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);

          const node = await resolveEntity(sql, neighborId);
          if (node) {
            affected.push({
              node,
              edge: { id: row._id, sourceId: row.source_id, sourceType: row.source_type, targetId: row.target_id, targetType: row.target_type, predicate: row.predicate, ts: Number(row.ts ?? 0) },
              depth,
            });
            nextFrontier.push(neighborId);
          }
        }
      } catch { /* skip */ }
    }

    frontier = nextFrontier;
  }

  return { root, affected };
}
