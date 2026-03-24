#!/usr/bin/env npx jiti
/**
 * Backfill existing projects with lifecycle_phase='active' and config_json='{}'
 * Safe to run multiple times — only updates rows missing the fields.
 */
import { connectXtdb } from "../lib/db.ts";

const sql = connectXtdb();

const t = (v: string | null) => sql.typed(v as any, 25);

async function main() {
  // Get all projects
  const rows = await sql`SELECT _id, lifecycle_phase, config_json FROM projects`;

  let _updated = 0;
  for (const row of rows) {
    if (row.lifecycle_phase && row.config_json) continue;

    // XTDB uses INSERT for upsert (bitemporal)
    const all = await sql`SELECT * FROM projects WHERE _id = ${t(row._id)}`;
    const existing = all[0];
    if (!existing) continue;

    await sql`INSERT INTO projects (
      _id, canonical_id, name, identity_type, git_remote_url, git_root_path,
      first_seen_ts, last_seen_ts, session_count, lifecycle_phase, config_json, jsonld
    ) VALUES (
      ${t(existing._id)}, ${t(existing.canonical_id)},
      ${t(existing.name)}, ${t(existing.identity_type)},
      ${t(existing.git_remote_url)}, ${t(existing.git_root_path)},
      ${sql.typed(existing.first_seen_ts as any, 20)}, ${sql.typed(existing.last_seen_ts as any, 20)},
      ${sql.typed(existing.session_count as any, 20)}, ${t("active")},
      ${t("{}")}, ${t(existing.jsonld)}
    )`;
    _updated++;
  }
  await sql.end();
}

main().catch((_err) => {
  process.exit(1);
});
