// ─── Auto-Generators ─────────────────────────────────────────
// Logic for auto-creating tickets from errors, quality issues, CI failures.

import { randomUUID } from "node:crypto";
import type { ErrorGroup } from "../lib/error-groups.ts";
import type { TicketRecord } from "./types.ts";

/** Generate a ticket from a critical/high error group. */
export function ticketFromError(group: ErrorGroup, projectId: string, actor: string): TicketRecord | null {
  if (group.severity !== "data_loss" && group.severity !== "degraded") return null;

  return {
    _id: `tkt:${randomUUID()}`,
    project_id: projectId,
    title: `[${group.severity}] ${group.component}: ${group.operation} — ${group.errorType}`,
    description: `## Auto-generated from error group\n\n**Fingerprint:** \`${group.fingerprint}\`\n**Message:** ${group.message}\n**Occurrences:** ${group.occurrenceCount}\n**First seen:** ${new Date(group.firstSeen).toISOString()}\n**Last seen:** ${new Date(group.lastSeen).toISOString()}\n\n\`\`\`\n${group.sampleStack ?? "No stack"}\n\`\`\``,
    status: "backlog",
    priority: group.severity === "data_loss" ? "critical" : "high",
    kind: "bug",
    assignee: null,
    labels: [group.component, `severity-${group.severity}`, "auto-generated"],
    source: "auto-error",
    parent_ticket_id: null,
    blocked_by: [],
    created_by: actor,
    session_id: null,
    estimate_hours: null,
    actual_hours: null,
    due_ts: null,
    started_ts: null,
    completed_ts: null,
    ts: Date.now(),
  };
}

/** Generate a ticket from a CI failure. */
export function ticketFromCIFailure(opts: {
  repo: string;
  commitHash: string;
  stepName: string;
  errorOutput: string;
  projectId: string;
  actor: string;
}): TicketRecord {
  return {
    _id: `tkt:${randomUUID()}`,
    project_id: opts.projectId,
    title: `CI failure: ${opts.repo} — ${opts.stepName} at ${opts.commitHash.slice(0, 8)}`,
    description: `## CI Build Failure\n\n**Repo:** ${opts.repo}\n**Commit:** ${opts.commitHash}\n**Step:** ${opts.stepName}\n\n\`\`\`\n${opts.errorOutput.slice(0, 2000)}\n\`\`\``,
    status: "backlog",
    priority: "high",
    kind: "bug",
    assignee: null,
    labels: [opts.repo, "ci-failure", "auto-generated"],
    source: "auto-ci",
    parent_ticket_id: null,
    blocked_by: [],
    created_by: opts.actor,
    session_id: null,
    estimate_hours: null,
    actual_hours: null,
    due_ts: null,
    started_ts: null,
    completed_ts: null,
    ts: Date.now(),
  };
}

/** Generate a ticket from a quality gate failure. */
export function ticketFromQualityIssue(opts: {
  file: string;
  checkName: string;
  message: string;
  projectId: string;
  actor: string;
}): TicketRecord {
  return {
    _id: `tkt:${randomUUID()}`,
    project_id: opts.projectId,
    title: `Quality: ${opts.checkName} — ${opts.file}`,
    description: `## Quality Issue\n\n**File:** ${opts.file}\n**Check:** ${opts.checkName}\n**Details:** ${opts.message}`,
    status: "backlog",
    priority: "medium",
    kind: "debt",
    assignee: null,
    labels: ["quality", opts.checkName, "auto-generated"],
    source: "auto-quality",
    parent_ticket_id: null,
    blocked_by: [],
    created_by: opts.actor,
    session_id: null,
    estimate_hours: null,
    actual_hours: null,
    due_ts: null,
    started_ts: null,
    completed_ts: null,
    ts: Date.now(),
  };
}
