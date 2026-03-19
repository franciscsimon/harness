import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

export type Sql = ReturnType<typeof postgres>;

let sql: Sql | null = null;

export async function ensureDb(): Promise<Sql | null> {
  if (sql) return sql;
  try {
    sql = postgres({ host: XTDB_HOST, port: XTDB_PORT, database: "xtdb", user: "xtdb", password: "xtdb", max: 1, idle_timeout: 30, connect_timeout: 10 });
    await sql`SELECT 1 AS ok`;
    await bootstrapTable(sql, "artifacts",
      "_id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld");
    await bootstrapTable(sql, "artifact_versions",
      "_id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld");
    await bootstrapTable(sql, "artifact_cleanup",
      "_id, session_id, path, relative_path, created_at");
    await bootstrapTable(sql, "artifact_reads",
      "_id, session_id, path, tool_call_id, ts");
    return sql;
  } catch {
    sql = null;
    return null;
  }
}

async function bootstrapTable(db: Sql, table: string, columns: string) {
  const values = columns.split(",").map(c => c.trim()).map(c =>
    ["ts", "size_bytes", "version", "created_at"].includes(c) ? "0" : "''"
  ).join(", ");
  await db.unsafe(`INSERT INTO ${table} (${columns}) VALUES (${values})`);
  await db.unsafe(`DELETE FROM ${table} WHERE _id = ''`);
}

export function typed(db: Sql, v: string | null) { return db.typed(v as any, 25); }
export function typedNum(db: Sql, v: number | null) { return db.typed(v as any, 20); }

export async function closeDb() {
  if (sql) { try { await sql.end(); } catch {} sql = null; }
}
