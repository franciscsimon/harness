import type { EventHandler } from "../types.ts";

// Raw: { fromExtension: boolean }

export const handler: EventHandler = (event) => {
  const e = event as { fromExtension?: boolean } | null;
  return {
    compactFromExt: e?.fromExtension ?? null,
  };
};
