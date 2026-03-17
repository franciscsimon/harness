import type { EventHandler } from "../types.ts";

// Raw: { messages: unknown[] }

export const handler: EventHandler = (event) => {
  const e = event as { messages?: unknown[] } | null;
  return {
    agentEndMsgCount: e?.messages?.length ?? 0,
    agentMessages: e?.messages != null ? JSON.stringify(e.messages) : null,
  };
};
