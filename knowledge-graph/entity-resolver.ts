// ─── Entity Resolver ─────────────────────────────────────────
// Given any ID, find its type, table, and full record.

import type { Sql } from "../lib/db.ts";
import { type GraphNode, PREFIX_TABLE_MAP } from "./types.ts";

/** Resolve an entity ID to its table and type. */
export function resolvePrefix(id: string): { table: string; type: string; prefix: string } | null {
  for (const [prefix, meta] of Object.entries(PREFIX_TABLE_MAP)) {
    if (id.startsWith(prefix)) return { ...meta, prefix };
  }
  // Try UUID format (events table)
  if (/^[0-9a-f]{8}-/.test(id)) return { table: "events", type: "ev:Event", prefix: "urn:uuid:" };
  return null;
}

/** Fetch a full entity record by ID. */
export async function resolveEntity(sql: Sql, id: string): Promise<GraphNode | null> {
  const meta = resolvePrefix(id);
  if (!meta) return null;

  try {
    const rows = await sql.unsafe(`SELECT * FROM ${meta.table} WHERE _id = $1 LIMIT 1`, [id]);
    if (rows.length === 0) return null;

    const row = rows[0] as any;
    return {
      id,
      type: meta.type,
      table: meta.table,
      title: row.title ?? row.task ?? row.what ?? row.path ?? row.name ?? row.status ?? id,
      summary: row.description ?? row.why ?? row.summary ?? row.error_message ?? undefined,
      ts: Number(row.ts ?? row.created_at ?? 0),
      data: row,
    };
  } catch {
    return null;
  }
}

/** Resolve multiple entities in parallel. */
export async function resolveEntities(sql: Sql, ids: string[]): Promise<Map<string, GraphNode>> {
  const results = new Map<string, GraphNode>();
  const promises = ids.map(async (id) => {
    const node = await resolveEntity(sql, id);
    if (node) results.set(id, node);
  });
  await Promise.all(promises);
  return results;
}
