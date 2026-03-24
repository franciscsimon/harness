// ─── Error Groups ────────────────────────────────────────────
// Deduplicates errors by fingerprint. Groups track first/last seen
// and occurrence count. Feeds into auto-ticket generation (Phase 6.4).

import { createHash } from "node:crypto";
import type { ErrorSeverity } from "./errors.ts";

export interface ErrorGroup {
  fingerprint: string;
  component: string;
  operation: string;
  errorType: string;
  message: string;
  severity: ErrorSeverity;
  status: "new" | "acknowledged" | "resolved" | "ignored";
  firstSeen: number;
  lastSeen: number;
  occurrenceCount: number;
  sampleStack?: string;
  ticketId?: string;
}

const groups = new Map<string, ErrorGroup>();

/** Compute a stable fingerprint from error attributes. */
export function computeFingerprint(component: string, operation: string, error: Error | string): string {
  const errorType = error instanceof Error ? error.constructor.name : "Error";
  const stackFrames = error instanceof Error
    ? (error.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()).join("|")
    : "";
  const input = `${component}:${operation}:${errorType}:${stackFrames}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** Record an error occurrence. Returns the updated error group. */
export function recordError(opts: {
  component: string;
  operation: string;
  error: Error | string;
  severity: ErrorSeverity;
}): ErrorGroup {
  const fingerprint = computeFingerprint(opts.component, opts.operation, opts.error);
  const existing = groups.get(fingerprint);
  const now = Date.now();

  if (existing) {
    existing.lastSeen = now;
    existing.occurrenceCount++;
    if (opts.severity === "data_loss" && existing.severity !== "data_loss") {
      existing.severity = opts.severity; // Escalate
    }
    return existing;
  }

  const errorType = opts.error instanceof Error ? opts.error.constructor.name : "Error";
  const message = opts.error instanceof Error ? opts.error.message : String(opts.error);
  const group: ErrorGroup = {
    fingerprint,
    component: opts.component,
    operation: opts.operation,
    errorType,
    message: message.slice(0, 200),
    severity: opts.severity,
    status: "new",
    firstSeen: now,
    lastSeen: now,
    occurrenceCount: 1,
    sampleStack: opts.error instanceof Error ? opts.error.stack?.slice(0, 500) : undefined,
  };

  groups.set(fingerprint, group);
  return group;
}

/** Get all error groups, sorted by last seen (most recent first). */
export function getErrorGroups(): ErrorGroup[] {
  return Array.from(groups.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Get groups matching a filter. */
export function getGroupsByStatus(status: ErrorGroup["status"]): ErrorGroup[] {
  return getErrorGroups().filter((g) => g.status === status);
}

/** Update a group's status. */
export function updateGroupStatus(fingerprint: string, status: ErrorGroup["status"]): boolean {
  const group = groups.get(fingerprint);
  if (!group) return false;
  group.status = status;
  return true;
}

/** Get error rate for a component over the last N minutes. */
export function getErrorRate(component: string, windowMinutes = 5): number {
  const cutoff = Date.now() - windowMinutes * 60_000;
  return getErrorGroups()
    .filter((g) => g.component === component && g.lastSeen > cutoff)
    .reduce((sum, g) => sum + g.occurrenceCount, 0);
}

/** Flush in-memory error groups to XTDB for persistence. */
export async function flushGroupsToXtdb(sql: ReturnType<typeof import("postgres").default>): Promise<number> {
  const allGroups = getErrorGroups();
  let stored = 0;
  for (const g of allGroups) {
    try {
      await sql`
        INSERT INTO error_groups (_id, component, operation, error_type, message, severity, status,
          first_seen, last_seen, occurrence_count, sample_stack, ticket_id, _valid_from)
        VALUES (
          ${`eg:${g.fingerprint}`}, ${g.component}, ${g.operation}, ${g.errorType},
          ${g.message}, ${g.severity}, ${g.status}, ${g.firstSeen}, ${g.lastSeen},
          ${g.occurrenceCount}, ${g.sampleStack ?? ""}, ${g.ticketId ?? ""},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (_id) DO UPDATE SET
          last_seen = EXCLUDED.last_seen,
          occurrence_count = EXCLUDED.occurrence_count,
          status = EXCLUDED.status,
          severity = EXCLUDED.severity`;
      stored++;
    } catch {
      /* best-effort XTDB persistence */
    }
  }
  return stored;
}
