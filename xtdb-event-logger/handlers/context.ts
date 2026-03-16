import type { EventHandler } from "../types.ts";

// Raw: { messages: unknown[] }
// Count only — do NOT serialize the full conversation array.

export const handler: EventHandler = (event) => {
  const e = event as { messages?: unknown[] } | null;
  return {
    contextMsgCount: e?.messages?.length ?? 0,
  };
};
