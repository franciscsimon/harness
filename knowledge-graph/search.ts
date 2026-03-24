// ─── Cross-Entity Search ─────────────────────────────────────
// Full-text search across all entity types.

import type { Sql } from "../lib/db.ts";
import type { SearchResult } from "./types.ts";

const SEARCHABLE_TABLES: Array<{
  table: string;
  type: string;
  titleCol: string;
  excerptCol: string;
  searchCols: string[];
}> = [
  { table: "tickets", type: "ticket", titleCol: "title", excerptCol: "description", searchCols: ["title", "description"] },
  { table: "incidents", type: "incident", titleCol: "title", excerptCol: "description", searchCols: ["title", "description"] },
  { table: "decisions", type: "decision", titleCol: "task", excerptCol: "what", searchCols: ["task", "what", "why"] },
  { table: "requirements", type: "requirement", titleCol: "title", excerptCol: "description", searchCols: ["title", "description"] },
  { table: "errors", type: "error", titleCol: "error_message", excerptCol: "operation", searchCols: ["error_message", "operation", "component"] },
  { table: "artifacts", type: "artifact", titleCol: "path", excerptCol: "path", searchCols: ["path"] },
  { table: "releases", type: "release", titleCol: "version", excerptCol: "changelog", searchCols: ["version", "changelog"] },
  { table: "deployments", type: "deployment", titleCol: "status", excerptCol: "commit_hash", searchCols: ["status", "commit_hash"] },
];

/** Search across all entity types. Returns results ranked by recency. */
export async function searchEntities(
  sql: Sql,
  query: string,
  opts: { limit?: number; types?: string[] } = {},
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 30;
  const pattern = `%${query}%`;
  const results: SearchResult[] = [];

  const tables = opts.types
    ? SEARCHABLE_TABLES.filter((t) => opts.types!.includes(t.type))
    : SEARCHABLE_TABLES;

  for (const t of tables) {
    try {
      const whereClauses = t.searchCols.map((col) => `${col} LIKE '${pattern.replace(/'/g, "''")}'`).join(" OR ");
      const rows = await sql.unsafe(
        `SELECT _id, ${t.titleCol} AS title, ${t.excerptCol} AS excerpt, ts
         FROM ${t.table}
         WHERE ${whereClauses}
         ORDER BY ts DESC LIMIT ${limit}`,
      );

      for (const row of rows as any[]) {
        results.push({
          id: row._id,
          entityType: t.type,
          title: row.title ?? row._id,
          excerpt: (row.excerpt ?? "").slice(0, 200),
          ts: Number(row.ts ?? 0),
          relevance: 1, // Simple: all matches equal, sorted by recency
        });
      }
    } catch { /* table may not exist */ }
  }

  // Sort by type priority, then recency
  const typePriority: Record<string, number> = {
    ticket: 1, incident: 2, decision: 3, requirement: 4,
    error: 5, artifact: 6, release: 7, deployment: 8,
  };

  return results
    .sort((a, b) => {
      const pa = typePriority[a.entityType] ?? 99;
      const pb = typePriority[b.entityType] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.ts - a.ts;
    })
    .slice(0, limit);
}
