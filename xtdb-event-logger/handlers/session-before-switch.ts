import type { EventHandler } from "../types.ts";

// Raw: { reason: string, targetSessionFile?: string }

export const handler: EventHandler = (event) => {
  const e = event as { reason?: string; targetSessionFile?: string } | null;
  return {
    switchReason: e?.reason ?? null,
    switchTarget: e?.targetSessionFile ?? null,
  };
};
