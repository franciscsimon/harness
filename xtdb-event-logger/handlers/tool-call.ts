import type { EventHandler } from "../types.ts";
import { trunc } from "../util.ts";

// Raw: { toolName: string, toolCallId: string, input: Record<string, any> }

export const handler: EventHandler = (event) => {
  const e = event as {
    toolName?: string;
    toolCallId?: string;
    input?: unknown;
  } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    payload: trunc(JSON.stringify(e?.input ?? {}), 4096),
  };
};
