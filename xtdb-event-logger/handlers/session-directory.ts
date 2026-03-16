import type { EventHandler } from "../types.ts";

// Raw: { cwd: string }
// No ctx on this event — meta.cwd is process.cwd()
// Stores both: eventCwd (from event) + cwd (from meta) per decision 10.7

export const handler: EventHandler = (event) => {
  const e = event as { cwd?: string } | null;
  return {
    eventCwd: e?.cwd ?? null,
  };
};
