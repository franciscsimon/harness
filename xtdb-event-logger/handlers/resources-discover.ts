import type { EventHandler } from "../types.ts";

// Raw: {} (no event-specific fields)
// No ctx on this event — fires on startup + /reload

export const handler: EventHandler = () => {
  return {};
};
