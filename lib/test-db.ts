import { connectXtdb, ensureConnected } from "./db.ts";

const sql = connectXtdb();
ensureConnected(sql).then((_ok) => {
  sql.end();
});
