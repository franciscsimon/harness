import type { EventHandler } from "../types.ts";

// Raw: { preparation: { tokensBefore: number }, branchEntries: unknown[], signal: AbortSignal }
// Only extract tokensBefore. branchEntries is too large, signal is an AbortSignal.

export const handler: EventHandler = (event) => {
  const e = event as { preparation?: { tokensBefore?: number } } | null;
  return {
    compactTokens: e?.preparation?.tokensBefore ?? null,
  };
};
