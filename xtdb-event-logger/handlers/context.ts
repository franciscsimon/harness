import type { EventHandler } from "../types.ts";

// Raw: { messages: unknown[] }

export const handler: EventHandler = (event) => {
  const e = event as { messages?: unknown[] } | null;
  return {
    contextMsgCount: e?.messages?.length ?? 0,
    contextMessages: e?.messages != null ? JSON.stringify(e.messages) : null,
  };
};
