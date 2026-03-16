import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string }
// HIGH FREQUENCY — sampled at 1 row/2s by index.ts
// Handler just extracts; sampling decision is made by the caller.

export const handler: EventHandler = (event) => {
  const e = event as { toolName?: string; toolCallId?: string } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
  };
};
