import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string, isError: boolean, result: { content: unknown, details: unknown } }

export const handler: EventHandler = (event) => {
  const e = event as {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    result?: { content?: unknown; details?: unknown };
  } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    isError: e?.isError ?? null,
    toolContent: e?.result?.content != null ? JSON.stringify(e.result.content) : null,
    toolDetails: e?.result?.details != null ? JSON.stringify(e.result.details) : null,
  };
};
