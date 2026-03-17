import type { EventHandler } from "../types.ts";

// Raw: { message: unknown, assistantMessageEvent: { type: string, delta?: string } }

export const handler: EventHandler = (event) => {
  const e = event as {
    message?: unknown;
    assistantMessageEvent?: { type?: string; delta?: string };
  } | null;
  return {
    streamDeltaType: e?.assistantMessageEvent?.type ?? null,
    streamDeltaLen: e?.assistantMessageEvent?.delta?.length ?? 0,
    streamDelta: e?.assistantMessageEvent?.delta ?? null,
    messageContent: e?.message != null ? JSON.stringify(e.message) : null,
  };
};
