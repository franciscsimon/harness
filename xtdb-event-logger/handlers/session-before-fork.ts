import type { EventHandler } from "../types.ts";

// Raw: { entryId: string }

export const handler: EventHandler = (event) => {
  const e = event as { entryId?: string } | null;
  return {
    forkEntryId: e?.entryId ?? null,
  };
};
