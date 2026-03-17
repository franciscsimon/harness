import type { EventHandler } from "../types.ts";

// Raw: { toolName: string, toolCallId: string, isError: boolean, input: unknown, content: unknown, details: unknown }

export const handler: EventHandler = (event) => {
  const e = event as {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    input?: unknown;
    content?: unknown;
    details?: unknown;
  } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    isError: e?.isError ?? null,
    toolInput: e?.input != null ? JSON.stringify(e.input) : null,
    toolContent: e?.content != null ? JSON.stringify(e.content) : null,
    toolDetails: e?.details != null ? JSON.stringify(e.details) : null,
  };
};
