// ─── Path Finding ────────────────────────────────────────────
// Bidirectional BFS to find shortest path between two entities.

import type { Sql } from "../lib/db.ts";
import { resolveEntity } from "./entity-resolver.ts";
import type { GraphEdge, GraphNode, TraversalResult } from "./types.ts";

/** Find shortest path between two entities via graph_edges. */
export async function findPath(
  sql: Sql,
  startId: string,
  endId: string,
  maxDepth = 6,
): Promise<TraversalResult | null> {
  // BFS from start
  const visited = new Map<string, { parent: string | null; edge: GraphEdge | null }>();
  visited.set(startId, { parent: null, edge: null });
  let frontier = [startId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      try {
        const edges = await sql`
          SELECT _id, source_id, source_type, target_id, target_type, predicate, ts
          FROM graph_edges
          WHERE source_id = ${nodeId} OR target_id = ${nodeId}
          LIMIT 50`;

        for (const row of edges as any[]) {
          const edge: GraphEdge = {
            id: row._id, sourceId: row.source_id, sourceType: row.source_type,
            targetId: row.target_id, targetType: row.target_type,
            predicate: row.predicate, ts: Number(row.ts ?? 0),
          };
          const neighbor = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;

          if (!visited.has(neighbor)) {
            visited.set(neighbor, { parent: nodeId, edge });
            nextFrontier.push(neighbor);

            if (neighbor === endId) {
              return await reconstructPath(sql, startId, endId, visited);
            }
          }
        }
      } catch { /* skip unreachable */ }
    }

    frontier = nextFrontier;
  }

  return null; // No path found
}

async function reconstructPath(
  sql: Sql,
  startId: string,
  endId: string,
  visited: Map<string, { parent: string | null; edge: GraphEdge | null }>,
): Promise<TraversalResult> {
  const path: Array<{ node: GraphNode; edge?: GraphEdge }> = [];
  let current: string | null = endId;

  while (current !== null) {
    const entry = visited.get(current);
    const node = await resolveEntity(sql, current);
    if (node) {
      path.unshift({ node, edge: entry?.edge ?? undefined });
    }
    current = entry?.parent ?? null;
  }

  return { path, depth: path.length - 1, complete: true };
}
