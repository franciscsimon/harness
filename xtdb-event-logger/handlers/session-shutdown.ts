import type { EventHandler } from "../types.ts";

// Raw: {} (no event-specific fields)
// This is where endpoints flush + close (handled in index.ts)

export const handler: EventHandler = () => {
  return {};
};
