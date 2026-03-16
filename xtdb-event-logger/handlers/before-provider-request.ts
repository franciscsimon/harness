import type { EventHandler } from "../types.ts";
import { safeJsonSize } from "../util.ts";

// Raw: { payload: unknown }
// Do NOT serialize payload — can be 100KB+. Measure byte size only.

export const handler: EventHandler = (event) => {
  const e = event as { payload?: unknown } | null;
  return {
    providerPayloadBytes: safeJsonSize(e?.payload),
  };
};
