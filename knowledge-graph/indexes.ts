/**
 * Knowledge Graph — Index Management & Performance
 *
 * Creates indexes on graph_edges for fast traversal queries.
 * Phase L: Sprint 5 — Performance optimization
 */

type Sql = ReturnType<typeof import("postgres").default>;

/** Create recommended indexes for graph_edges table. */
export async function ensureGraphIndexes(sql: Sql): Promise<string[]> {
  const indexes = [
    { name: "idx_graph_edges_source", sql: `CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges (source_id, source_type)` },
    { name: "idx_graph_edges_target", sql: `CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges (target_id, target_type)` },
    { name: "idx_graph_edges_relation", sql: `CREATE INDEX IF NOT EXISTS idx_graph_edges_relation ON graph_edges (relation)` },
    { name: "idx_graph_edges_ts", sql: `CREATE INDEX IF NOT EXISTS idx_graph_edges_ts ON graph_edges (ts DESC)` },
    { name: "idx_error_groups_component", sql: `CREATE INDEX IF NOT EXISTS idx_error_groups_component ON error_groups (component, status)` },
    { name: "idx_tickets_project", sql: `CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets (project_id, status)` },
    { name: "idx_ticket_events_ticket", sql: `CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events (ticket_id, ts DESC)` },
  ];

  const created: string[] = [];
  for (const idx of indexes) {
    try {
      await sql.unsafe(idx.sql);
      created.push(idx.name);
    } catch {
      // XTDB may not support all index types — skip failures
    }
  }
  return created;
}
