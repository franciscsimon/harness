// ─── Ticket Queries ──────────────────────────────────────────
// XTDB query helpers for ticket CRUD operations.

import type { Sql } from "../lib/db.ts";
import type { TicketRecord, TicketStatus, TicketPriority, TicketKind } from "./types.ts";

export interface TicketFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  kind?: TicketKind;
  assignee?: string;
  label?: string;
  projectId?: string;
  limit?: number;
}

export async function listTickets(sql: Sql, filter: TicketFilter = {}): Promise<TicketRecord[]> {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filter.projectId) { conditions.push(`project_id = $${values.push(filter.projectId)}`); }
  if (filter.status) { conditions.push(`status = $${values.push(filter.status)}`); }
  if (filter.priority) { conditions.push(`priority = $${values.push(filter.priority)}`); }
  if (filter.kind) { conditions.push(`kind = $${values.push(filter.kind)}`); }
  if (filter.assignee) { conditions.push(`assignee = $${values.push(filter.assignee)}`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;

  const rows = await sql.unsafe(`SELECT * FROM tickets ${where} ORDER BY ts DESC LIMIT ${limit}`, values);
  return rows as unknown as TicketRecord[];
}

export async function getTicket(sql: Sql, id: string): Promise<TicketRecord | null> {
  const rows = await sql`SELECT * FROM tickets WHERE _id = ${id}`;
  return (rows[0] as unknown as TicketRecord) ?? null;
}

export async function createTicket(sql: Sql, ticket: TicketRecord): Promise<void> {
  await sql`
    INSERT INTO tickets (
      _id, project_id, title, description, status, priority, kind,
      assignee, labels, source, parent_ticket_id, blocked_by,
      created_by, session_id, estimate_hours, actual_hours,
      due_ts, started_ts, completed_ts, ts, _valid_from
    ) VALUES (
      ${ticket._id}, ${ticket.project_id}, ${ticket.title}, ${ticket.description},
      ${ticket.status}, ${ticket.priority}, ${ticket.kind},
      ${ticket.assignee}, ${JSON.stringify(ticket.labels)}, ${ticket.source},
      ${ticket.parent_ticket_id}, ${JSON.stringify(ticket.blocked_by)},
      ${ticket.created_by}, ${ticket.session_id},
      ${ticket.estimate_hours}, ${ticket.actual_hours},
      ${ticket.due_ts}, ${ticket.started_ts}, ${ticket.completed_ts},
      ${ticket.ts}, CURRENT_TIMESTAMP
    )`;
}

export async function updateTicket(sql: Sql, id: string, fields: Partial<TicketRecord>): Promise<void> {
  const sets: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (key === "_id") continue;
    const v = Array.isArray(value) ? JSON.stringify(value) : value;
    sets.push(`${key} = $${values.push(v)}`);
  }

  if (sets.length === 0) return;
  values.push(id);
  await sql.unsafe(`UPDATE tickets SET ${sets.join(", ")} WHERE _id = $${values.length}`, values);
}

export async function getTicketStats(sql: Sql, projectId?: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const where = projectId ? `WHERE project_id = '${projectId}'` : "";
  const rows = await sql.unsafe(`
    SELECT status, priority, COUNT(*) as count
    FROM tickets ${where}
    GROUP BY status, priority
  `);

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let total = 0;

  for (const row of rows as any[]) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + Number(row.count);
    byPriority[row.priority] = (byPriority[row.priority] ?? 0) + Number(row.count);
    total += Number(row.count);
  }

  return { total, byStatus, byPriority };
}

/** Link a ticket to another entity (project, session, error group, etc). */
export async function linkTicket(
  sql: Sql,
  ticketId: string,
  targetId: string,
  targetType: string,
  relation = "relates_to",
): Promise<void> {
  const id = `tl:${ticketId}:${targetId}:${Date.now()}`;
  await sql`INSERT INTO ticket_links (_id, ticket_id, target_id, target_type, relation, ts, _valid_from)
    VALUES (${id}, ${ticketId}, ${targetId}, ${targetType}, ${relation}, ${Date.now()}, CURRENT_TIMESTAMP)`;
}

/** Add an event to a ticket's activity log. */
export async function addTicketEvent(
  sql: Sql,
  ticketId: string,
  eventType: string,
  actor: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const id = `te:${ticketId}:${Date.now()}`;
  await sql`INSERT INTO ticket_events (_id, ticket_id, event_type, actor, details_json, ts, _valid_from)
    VALUES (${id}, ${ticketId}, ${eventType}, ${actor}, ${JSON.stringify(details)}, ${Date.now()}, CURRENT_TIMESTAMP)`;
}

/** Get events for a ticket. */
export async function getTicketEvents(sql: Sql, ticketId: string, limit = 50): Promise<any[]> {
  return await sql`SELECT * FROM ticket_events WHERE ticket_id = ${ticketId} ORDER BY ts DESC LIMIT ${limit}`;
}

/** Get all links for a ticket. */
export async function getTicketLinks(sql: Sql, ticketId: string): Promise<any[]> {
  return await sql`SELECT * FROM ticket_links WHERE ticket_id = ${ticketId} ORDER BY ts DESC`;
}

/** Search tickets by title/description text. */
export async function searchTickets(sql: Sql, query: string, limit = 20): Promise<TicketRecord[]> {
  const pattern = `%${query}%`;
  return await sql<TicketRecord[]>`
    SELECT * FROM tickets
    WHERE title LIKE ${pattern} OR description LIKE ${pattern}
    ORDER BY ts DESC LIMIT ${limit}`;
}

/** Get tickets assigned to a specific user. */
export async function getTicketsByAssignee(sql: Sql, assignee: string, limit = 50): Promise<TicketRecord[]> {
  return await sql<TicketRecord[]>`
    SELECT * FROM tickets WHERE assignee = ${assignee} ORDER BY ts DESC LIMIT ${limit}`;
}

/** Bulk update ticket status (e.g., close all tickets for a resolved error group). */
export async function bulkUpdateStatus(
  sql: Sql,
  ticketIds: string[],
  newStatus: string,
): Promise<number> {
  if (ticketIds.length === 0) return 0;
  let updated = 0;
  for (const id of ticketIds) {
    await sql`UPDATE tickets SET status = ${newStatus}, _valid_from = CURRENT_TIMESTAMP WHERE _id = ${id}`;
    updated++;
  }
  return updated;
}
