import type { EventHandler } from "../types.ts";

// Raw: { toolCallId: string, toolName: string, args: unknown }

export const handler: EventHandler = (event) => {
  const e = event as {
    toolName?: string;
    toolCallId?: string;
    args?: unknown;
  } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    toolArgs: e?.args != null ? JSON.stringify(e.args) : null,
  };
};
