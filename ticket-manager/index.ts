#!/usr/bin/env npx jiti
// ─── Ticket Manager ─────────────────────────────────────────
// Extension entry point. Provides ticket CRUD, status transitions,
// auto-generation, and CLI interface.
//
// Usage as CLI:
//   npx jiti ticket-manager/index.ts list [--status=todo]
//   npx jiti ticket-manager/index.ts create "Title" [--priority=high] [--kind=bug]
//   npx jiti ticket-manager/index.ts show <id>
//   npx jiti ticket-manager/index.ts status <id> <new-status>
//   npx jiti ticket-manager/index.ts stats

import { randomUUID } from "node:crypto";
import { connectXtdb } from "../lib/db.ts";
import { createTicket, getTicket, getTicketStats, listTickets, updateTicket } from "./queries.ts";
import { buildTicketJsonLd } from "./rdf.ts";
import { validateTransition } from "./transitions.ts";
import type { TicketKind, TicketPriority, TicketRecord, TicketStatus } from "./types.ts";

// ─── CLI Handler ─────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    printHelp();
    return;
  }

  const sql = connectXtdb({ max: 2 });

  try {
    switch (command) {
      case "list": {
        const status = parseFlag(args, "status") as TicketStatus | undefined;
        const priority = parseFlag(args, "priority") as TicketPriority | undefined;
        const kind = parseFlag(args, "kind") as TicketKind | undefined;
        const tickets = await listTickets(sql, { status, priority, kind });
        printTicketList(tickets);
        break;
      }

      case "create": {
        const title = args[1];
        if (!title) { console.error("Usage: create <title>"); process.exit(1); }
        const ticket: TicketRecord = {
          _id: `tkt:${randomUUID()}`,
          project_id: parseFlag(args, "project") ?? "proj:harness",
          title,
          description: parseFlag(args, "desc") ?? "",
          status: "backlog",
          priority: (parseFlag(args, "priority") as TicketPriority) ?? "medium",
          kind: (parseFlag(args, "kind") as TicketKind) ?? "task",
          assignee: parseFlag(args, "assignee") ?? null,
          labels: parseFlag(args, "labels")?.split(",") ?? [],
          source: "manual",
          parent_ticket_id: null,
          blocked_by: [],
          created_by: "human",
          session_id: null,
          estimate_hours: null,
          actual_hours: null,
          due_ts: null,
          started_ts: null,
          completed_ts: null,
          ts: Date.now(),
        };
        await createTicket(sql, ticket);
        console.log(`✅ Created: ${ticket._id}`);
        console.log(`   Title: ${ticket.title}`);
        console.log(`   JSON-LD: ${JSON.stringify(buildTicketJsonLd(ticket))}`);
        break;
      }

      case "show": {
        const id = args[1];
        if (!id) { console.error("Usage: show <id>"); process.exit(1); }
        const ticket = await getTicket(sql, id);
        if (!ticket) { console.error(`Ticket not found: ${id}`); process.exit(1); }
        console.log(JSON.stringify(ticket, null, 2));
        break;
      }

      case "status": {
        const id = args[1];
        const newStatus = args[2] as TicketStatus;
        if (!id || !newStatus) { console.error("Usage: status <id> <new-status>"); process.exit(1); }
        const ticket = await getTicket(sql, id);
        if (!ticket) { console.error(`Ticket not found: ${id}`); process.exit(1); }
        const result = validateTransition(ticket, newStatus);
        if (!result.valid) { console.error(`❌ ${result.error}`); process.exit(1); }
        const updates: Partial<TicketRecord> = { status: newStatus, ts: Date.now() };
        for (const se of result.sideEffects) { (updates as any)[se.field] = se.value; }
        await updateTicket(sql, id, updates);
        console.log(`✅ ${id}: ${ticket.status} → ${newStatus}`);
        break;
      }

      case "stats": {
        const projectId = parseFlag(args, "project");
        const stats = await getTicketStats(sql, projectId ?? undefined);
        console.log("\n📊 Ticket Stats");
        console.log(`   Total: ${stats.total}`);
        console.log("   By status:", stats.byStatus);
        console.log("   By priority:", stats.byPriority);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

function parseFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function printTicketList(tickets: TicketRecord[]): void {
  if (tickets.length === 0) { console.log("No tickets found."); return; }

  const ICONS: Record<string, string> = {
    backlog: "📋", todo: "📌", in_progress: "🔨", review: "👀", done: "✅", cancelled: "❌",
  };
  const PRI: Record<string, string> = {
    critical: "🔴", high: "🟠", medium: "🟡", low: "🟢",
  };

  console.log(`\n${tickets.length} ticket(s):\n`);
  for (const t of tickets) {
    const icon = ICONS[t.status] ?? "?";
    const pri = PRI[t.priority] ?? "?";
    console.log(`  ${icon} ${pri} ${t._id.slice(0, 12)}  ${t.title}`);
    console.log(`     ${t.status} | ${t.kind} | ${t.assignee ?? "unassigned"} | ${t.labels.join(", ")}`);
  }
  console.log();
}

function printHelp(): void {
  console.log(`
Ticket Manager — harness work item tracking

Commands:
  list [--status=X] [--priority=X] [--kind=X]   List tickets
  create <title> [--priority=X] [--kind=X]       Create a ticket
  show <id>                                      Show ticket details
  status <id> <new-status>                       Update ticket status
  stats [--project=X]                            Show ticket statistics
  help                                           Show this help
`);
}

main();
