import type { EventHandler } from "../types.ts";

// Raw: { previousSessionFile?: string }

export const handler: EventHandler = (event) => {
  const e = event as { previousSessionFile?: string } | null;
  return {
    forkPrevious: e?.previousSessionFile ?? null,
  };
};
