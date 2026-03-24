import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

export type Sql = ReturnType<typeof postgres>;

let _shared: Sql | null = null;

export function connectXtdb(opts?: { max?: number; shared?: boolean }): Sql {
  if (opts?.shared && _shared) return _shared;

  const sql = postgres({
    host: XTDB_HOST,
    port: XTDB_PORT,
    database: "xtdb",
    user: process.env.XTDB_USER ?? "xtdb",
    password: process.env.XTDB_PASSWORD ?? "xtdb",
    max: opts?.max ?? 1,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  if (opts?.shared) _shared = sql;
  return sql;
}

export async function ensureConnected(sql: Sql): Promise<boolean> {
  try {
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}

export function t(sql: Sql, v: string | null) {
  return sql.typed(v as any, 25);
}

export function n(sql: Sql, v: number | null) {
  return sql.typed(v as any, 20);
}

export function b(sql: Sql, v: boolean | null) {
  return sql.typed(v as any, 16);
}
