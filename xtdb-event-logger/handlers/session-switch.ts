import type { EventHandler } from "../types.ts";

// Raw: { reason: string, previousSessionFile?: string }

export const handler: EventHandler = (event) => {
  const e = event as { reason?: string; previousSessionFile?: string } | null;
  return {
    switchReason: e?.reason ?? null,
    switchPrevious: e?.previousSessionFile ?? null,
  };
};
