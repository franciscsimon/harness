import type { EventHandler } from "../types.ts";

// Raw: {} (no event-specific fields)
// This is where endpoints connect + buffer flushes (handled in index.ts)

export const handler: EventHandler = () => {
  return {};
};
