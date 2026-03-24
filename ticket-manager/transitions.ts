// ─── Status Transitions ──────────────────────────────────────
// Validates and applies ticket status changes with side effects.

import type { TicketRecord, TicketStatus, VALID_TRANSITIONS } from "./types.ts";

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "cancelled"],
  in_progress: ["review", "done", "cancelled"],
  review: ["done", "in_progress", "cancelled"],
  done: ["in_progress"],
  cancelled: ["backlog"],
};

export interface TransitionResult {
  valid: boolean;
  error?: string;
  sideEffects: Array<{ field: string; value: any }>;
}

/** Validate and compute side effects for a status transition. */
export function validateTransition(ticket: TicketRecord, newStatus: TicketStatus): TransitionResult {
  const allowed = TRANSITIONS[ticket.status];
  if (!allowed?.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from '${ticket.status}' to '${newStatus}'. Allowed: ${allowed?.join(", ") ?? "none"}`,
      sideEffects: [],
    };
  }

  const sideEffects: Array<{ field: string; value: any }> = [];
  const now = Date.now();

  // Set started_ts when moving to in_progress for the first time
  if (newStatus === "in_progress" && !ticket.started_ts) {
    sideEffects.push({ field: "started_ts", value: now });
  }

  // Set completed_ts when done or cancelled
  if (newStatus === "done" || newStatus === "cancelled") {
    sideEffects.push({ field: "completed_ts", value: now });
  }

  // Clear completed_ts when reopening
  if (newStatus === "in_progress" && (ticket.status === "done" || ticket.status === "cancelled")) {
    sideEffects.push({ field: "completed_ts", value: null });
  }

  return { valid: true, sideEffects };
}
