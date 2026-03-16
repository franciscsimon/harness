import type { EventHandler } from "../types.ts";
import { trunc } from "../util.ts";

// Raw: { command: string, excludeFromContext: boolean }

export const handler: EventHandler = (event) => {
  const e = event as { command?: string; excludeFromContext?: boolean } | null;
  return {
    bashCommand: e?.command != null ? trunc(e.command, 2048) : null,
    bashExclude: e?.excludeFromContext ?? null,
  };
};
