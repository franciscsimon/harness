import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

export type Sql = ReturnType<typeof postgres>;

let sql: Sql | null = null;

export async function ensureDb(): Promise<Sql | null> {
  if (sql) return sql;
  try {
    sql = postgres({
      host: XTDB_HOST,
      port: XTDB_PORT,
      database: "xtdb",
      user: "xtdb",
      password: "xtdb",
      max: 1,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    await sql`SELECT 1 AS ok`;
    await bootstrapTable(
      sql,
      "artifacts",
      "_id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld",
    );
    await bootstrapTable(
      sql,
      "artifact_versions",
      "_id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld",
    );
    await bootstrapTable(sql, "artifact_cleanup", "_id, session_id, path, relative_path, created_at");
    await bootstrapTable(sql, "artifact_reads", "_id, session_id, path, tool_call_id, ts");
    return sql;
  } catch {
    sql = null;
    return null;
  }
}

const RESERVED = new Set([
  "position",
  "type",
  "name",
  "status",
  "version",
  "source",
  "path",
  "url",
  "description",
  "tag",
]);
const BIGINT_COLS = new Set(["ts", "size_bytes", "version", "created_at"]);

async function bootstrapTable(db: Sql, table: string, columns: string) {
  const SEED_ID = "__tracker_seed__";
  const cols = columns.split(",").map((c) => c.trim());
  const colList = cols.map((c) => (RESERVED.has(c) ? `"${c}"` : c)).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => {
    if (c === "_id") return db.typed(SEED_ID as any, 25); // text
    if (BIGINT_COLS.has(c)) return db.typed(0 as any, 20); // bigint
    return db.typed("" as any, 25); // text
  });
  await db.unsafe(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
  await db.unsafe(`DELETE FROM ${table} WHERE _id = $1`, [db.typed(SEED_ID as any, 25)]);
}

export function typed(db: Sql, v: string | null) {
  return db.typed(v as any, 25);
}
export function typedNum(db: Sql, v: number | null) {
  return db.typed(v as any, 20);
}

export async function closeDb() {
  if (sql) {
    try {
      await sql.end();
    } catch {
      /* cleanup — safe to ignore */
    }
    sql = null;
  }
}
