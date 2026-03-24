// ─── Ticket Generator ────────────────────────────────────────
// Auto-generates tickets from error groups (Phase 6.4).
// Creates structured tickets for critical/high severity errors.

import type { ErrorGroup } from "../lib/error-groups.ts";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  severity: string;
  kind: "bug" | "security" | "debt";
  source: "auto-error" | "auto-quality" | "auto-ci";
  status: "backlog" | "todo" | "in_progress" | "done" | "cancelled";
  errorFingerprint?: string;
  component: string;
  createdAt: number;
  labels: string[];
}

const generatedTickets = new Map<string, Ticket>();

/** Generate a ticket from an error group (if not already generated). */
export function generateTicketFromError(group: ErrorGroup): Ticket | null {
  // Only generate for critical severities
  if (group.severity !== "data_loss" && group.severity !== "degraded") return null;

  // Don't duplicate
  if (generatedTickets.has(group.fingerprint)) return generatedTickets.get(group.fingerprint)!;

  const ticket: Ticket = {
    id: `tkt-${group.fingerprint}-${Date.now()}`,
    title: `[${group.severity}] ${group.component}: ${group.operation} — ${group.errorType}`,
    description: formatDescription(group),
    severity: group.severity === "data_loss" ? "critical" : "high",
    kind: "bug",
    source: "auto-error",
    status: "backlog",
    errorFingerprint: group.fingerprint,
    component: group.component,
    createdAt: Date.now(),
    labels: [group.component, `severity-${group.severity}`, "auto-generated"],
  };

  generatedTickets.set(group.fingerprint, ticket);
  return ticket;
}

function formatDescription(group: ErrorGroup): string {
  return `## Error Details

**Component:** ${group.component}
**Operation:** ${group.operation}
**Error Type:** ${group.errorType}
**Message:** ${group.message}

## Occurrence Info

- **First seen:** ${new Date(group.firstSeen).toISOString()}
- **Last seen:** ${new Date(group.lastSeen).toISOString()}
- **Count:** ${group.occurrenceCount}

## Stack Trace

\`\`\`
${group.sampleStack ?? "No stack trace available"}
\`\`\`

## Reproduction

Check the ${group.component} service logs for errors matching fingerprint \`${group.fingerprint}\`.

## Impact

Severity: **${group.severity}** — ${group.severity === "data_loss" ? "Data may be lost or corrupted" : "Service is degraded"}
`;
}

/** Get all generated tickets. */
export function getTickets(): Ticket[] {
  return Array.from(generatedTickets.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Get ticket by error fingerprint. */
export function getTicketByFingerprint(fingerprint: string): Ticket | undefined {
  return generatedTickets.get(fingerprint);
}

/** Update ticket status. */
export function updateTicketStatus(id: string, status: Ticket["status"]): boolean {
  for (const ticket of generatedTickets.values()) {
    if (ticket.id === id) {
      ticket.status = status;
      return true;
    }
  }
  return false;
}
