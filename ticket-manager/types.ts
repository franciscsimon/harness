// ─── Ticket Manager Types ────────────────────────────────────

export type TicketStatus = "backlog" | "todo" | "in_progress" | "review" | "done" | "cancelled";
export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketKind = "bug" | "feature" | "task" | "chore" | "security" | "debt";
export type TicketSource = "manual" | "auto-error" | "auto-quality" | "auto-ci" | "import";

export interface TicketRecord {
  _id: string;
  project_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  kind: TicketKind;
  assignee: string | null;
  labels: string[];
  source: TicketSource;
  parent_ticket_id: string | null;
  blocked_by: string[];
  created_by: string;
  session_id: string | null;
  estimate_hours: number | null;
  actual_hours: number | null;
  due_ts: number | null;
  started_ts: number | null;
  completed_ts: number | null;
  ts: number;
}

export interface TicketLinkRecord {
  _id: string;
  ticket_id: string;
  entity_type: "decision" | "artifact" | "requirement" | "test_run" | "incident" | "commit" | "error_group" | "ci_run" | "ticket";
  entity_id: string;
  relation: "implements" | "fixes" | "blocks" | "relates_to" | "caused_by" | "verified_by" | "parent" | "child";
  ts: number;
}

export interface TicketEventRecord {
  _id: string;
  ticket_id: string;
  event_type: "created" | "status_changed" | "assigned" | "commented" | "linked" | "priority_changed" | "label_added" | "label_removed" | "estimate_updated";
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  actor: string;
  ts: number;
}

/** Valid status transitions. */
export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "cancelled"],
  in_progress: ["review", "done", "cancelled"],
  review: ["done", "in_progress", "cancelled"],
  done: ["in_progress"], // reopen
  cancelled: ["backlog"], // un-cancel
};
