import type { EventHandler } from "../types.ts";

// Raw: { preparation: { tokensBefore: number }, branchEntries: unknown[], signal: AbortSignal }

export const handler: EventHandler = (event) => {
  const e = event as {
    preparation?: { tokensBefore?: number };
    branchEntries?: unknown[];
  } | null;
  return {
    compactTokens: e?.preparation?.tokensBefore ?? null,
    compactBranchEntries: e?.branchEntries != null ? JSON.stringify(e.branchEntries) : null,
  };
};
