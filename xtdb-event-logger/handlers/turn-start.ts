import type { EventHandler } from "../types.ts";

// Raw: { turnIndex: number, timestamp: number }

export const handler: EventHandler = (event) => {
  const e = event as { turnIndex?: number; timestamp?: number } | null;
  return {
    turnIndex: e?.turnIndex ?? null,
    turnTimestamp: e?.timestamp ?? null,
  };
};
