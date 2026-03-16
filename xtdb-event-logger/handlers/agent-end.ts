import type { EventHandler } from "../types.ts";

// Raw: { messages: unknown[] }
// Count only — do NOT serialize the full message array.

export const handler: EventHandler = (event) => {
  const e = event as { messages?: unknown[] } | null;
  return {
    agentEndMsgCount: e?.messages?.length ?? 0,
  };
};
