import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string }

export const handler: EventHandler = (event) => {
  const e = event as { toolName?: string; toolCallId?: string } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
  };
};
