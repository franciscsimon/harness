import type { EventHandler } from "../types.ts";

// Raw: { turnIndex: number, message: unknown, toolResults: unknown[] }

export const handler: EventHandler = (event) => {
  const e = event as {
    turnIndex?: number;
    message?: unknown;
    toolResults?: unknown[];
  } | null;
  return {
    turnIndex: e?.turnIndex ?? null,
    turnEndToolCount: e?.toolResults?.length ?? 0,
    turnMessage: e?.message != null ? JSON.stringify(e.message) : null,
    turnToolResults: e?.toolResults != null ? JSON.stringify(e.toolResults) : null,
  };
};
