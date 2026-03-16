import type { EventHandler } from "../types.ts";

// Raw: { turnIndex: number, message: unknown, toolResults: unknown[] }
// Count toolResults only — do NOT serialize message or toolResults content.

export const handler: EventHandler = (event) => {
  const e = event as { turnIndex?: number; toolResults?: unknown[] } | null;
  return {
    turnIndex: e?.turnIndex ?? null,
    turnEndToolCount: e?.toolResults?.length ?? 0,
  };
};
