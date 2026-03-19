import { connectXtdb, ensureConnected } from "./db.ts";

const sql = connectXtdb();
ensureConnected(sql).then(ok => {
  console.log("DB connected:", ok);
  sql.end();
});
