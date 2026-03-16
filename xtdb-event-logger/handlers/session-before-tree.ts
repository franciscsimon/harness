import type { EventHandler } from "../types.ts";

// Raw: { preparation: unknown, signal: AbortSignal }
// No safe-to-extract fields (preparation is opaque, signal is AbortSignal)

export const handler: EventHandler = () => {
  return {};
};
