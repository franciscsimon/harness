import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string, isError: boolean, content: unknown, details: unknown }
// Do NOT serialize content or details — can be huge.

export const handler: EventHandler = (event) => {
  const e = event as {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
  } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    isError: e?.isError ?? null,
  };
};
