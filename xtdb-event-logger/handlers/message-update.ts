import type { EventHandler } from "../types.ts";

// Raw: { assistantMessageEvent: { type: string, delta?: string } }
// HIGH FREQUENCY — sampled at 1 row/2s by index.ts
// Handler just extracts; sampling decision is made by the caller.

export const handler: EventHandler = (event) => {
  const e = event as {
    assistantMessageEvent?: { type?: string; delta?: string };
  } | null;
  return {
    streamDeltaType: e?.assistantMessageEvent?.type ?? null,
    streamDeltaLen: e?.assistantMessageEvent?.delta?.length ?? 0,
  };
};
