import type { EventHandler } from "../types.ts";
import { safeJsonSize } from "../util.ts";

// Raw: { payload: unknown }

export const handler: EventHandler = (event) => {
  const e = event as { payload?: unknown } | null;
  return {
    providerPayloadBytes: safeJsonSize(e?.payload),
    providerPayload: e?.payload != null ? JSON.stringify(e.payload) : null,
  };
};
