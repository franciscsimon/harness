// ─── Edge Resolver ───────────────────────────────────────────
// Query graph_edges for all connections to/from a given entity.

import type { Sql } from "../lib/db.ts";
import type { GraphEdge } from "./types.ts";

/** Get all outbound edges from an entity. */
export async function getOutboundEdges(sql: Sql, entityId: string): Promise<GraphEdge[]> {
  try {
    const rows = await sql`
      SELECT _id, source_id, source_type, target_id, target_type, predicate, ts
      FROM graph_edges WHERE source_id = ${entityId}
      ORDER BY ts DESC LIMIT 100`;
    return rows.map(toEdge);
  } catch { return []; }
}

/** Get all inbound edges to an entity. */
export async function getInboundEdges(sql: Sql, entityId: string): Promise<GraphEdge[]> {
  try {
    const rows = await sql`
      SELECT _id, source_id, source_type, target_id, target_type, predicate, ts
      FROM graph_edges WHERE target_id = ${entityId}
      ORDER BY ts DESC LIMIT 100`;
    return rows.map(toEdge);
  } catch { return []; }
}

/** Get all edges (both directions) for an entity. */
export async function getAllEdges(sql: Sql, entityId: string): Promise<{ inbound: GraphEdge[]; outbound: GraphEdge[] }> {
  const [inbound, outbound] = await Promise.all([
    getInboundEdges(sql, entityId),
    getOutboundEdges(sql, entityId),
  ]);
  return { inbound, outbound };
}

function toEdge(row: any): GraphEdge {
  return {
    id: row._id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    targetId: row.target_id,
    targetType: row.target_type,
    predicate: row.predicate,
    ts: Number(row.ts ?? 0),
  };
}
