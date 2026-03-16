import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string, isError: boolean }

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
