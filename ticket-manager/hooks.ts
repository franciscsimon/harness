/**
 * Ticket Manager — pi Extension Hooks
 *
 * Registers tools the pi agent can invoke:
 * - ticket:create — create a new ticket
 * - ticket:list — list tickets with filters
 * - ticket:transition — move ticket to new status
 * - ticket:link — link ticket to entity
 *
 * Phase E: pi Extension Hooks (5 items)
 */

import type { TicketInput, TicketStatus } from "./types.ts";

export interface HookContext {
  sql: ReturnType<typeof import("postgres").default>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

/** Register all ticket manager tools for pi agent integration. */
export function registerTicketTools(ctx: HookContext) {
  return {
    "ticket:create": async (args: { title: string; projectId: string; priority?: string; labels?: string[] }): Promise<ToolResult> => {
      try {
        const { createTicket } = await import("./queries.ts");
        const input: TicketInput = {
          title: args.title,
          project_id: args.projectId,
          priority: (args.priority as any) ?? "medium",
          labels: args.labels ?? [],
          status: "open",
          description: "",
          assignee: "",
        };
        const id = await createTicket(ctx.sql, input);
        return { success: true, data: { id } };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "ticket:list": async (args: { projectId?: string; status?: string; limit?: number }): Promise<ToolResult> => {
      try {
        const { listTickets } = await import("./queries.ts");
        const tickets = await listTickets(ctx.sql, {
          projectId: args.projectId,
          status: args.status as TicketStatus | undefined,
          limit: args.limit ?? 20,
        });
        return { success: true, data: tickets };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "ticket:transition": async (args: { ticketId: string; newStatus: string }): Promise<ToolResult> => {
      try {
        const { transitionTicket } = await import("./transitions.ts");
        const result = await transitionTicket(ctx.sql, args.ticketId, args.newStatus as TicketStatus);
        return { success: true, data: result };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "ticket:link": async (args: { ticketId: string; targetId: string; targetType: string; relation?: string }): Promise<ToolResult> => {
      try {
        const { linkTicket } = await import("./queries.ts");
        await linkTicket(ctx.sql, args.ticketId, args.targetId, args.targetType, args.relation ?? "relates_to");
        return { success: true, data: { linked: true } };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },
  };
}
