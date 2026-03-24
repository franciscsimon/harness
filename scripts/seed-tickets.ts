#!/usr/bin/env npx jiti
// ─── Seed Ticket Tables ─────────────────────────────────────
import { connectXtdb } from "../lib/db.ts";

async function main() {
  const sql = connectXtdb({ max: 1 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS tickets (
      _id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT,
      kind TEXT,
      assignee TEXT,
      labels TEXT,
      source TEXT,
      parent_ticket_id TEXT,
      blocked_by TEXT,
      created_by TEXT,
      session_id TEXT,
      estimate_hours BIGINT,
      actual_hours BIGINT,
      due_ts BIGINT,
      started_ts BIGINT,
      completed_ts BIGINT,
      ts BIGINT,
      jsonld TEXT,
      _valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS ticket_links (
      _id TEXT PRIMARY KEY,
      ticket_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      relation TEXT,
      ts BIGINT,
      _valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE TABLE IF NOT EXISTS ticket_events (
      _id TEXT PRIMARY KEY,
      ticket_id TEXT,
      event_type TEXT,
      old_value TEXT,
      new_value TEXT,
      comment TEXT,
      actor TEXT,
      ts BIGINT,
      _valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`;
    console.log("✅ Ticket tables created (tickets, ticket_links, ticket_events)");
  } finally {
    await sql.end();
  }
}
main();
