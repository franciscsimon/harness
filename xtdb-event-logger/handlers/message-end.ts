import type { EventHandler } from "../types.ts";

// Raw: { message: { role: string, ... } }

export const handler: EventHandler = (event) => {
  const e = event as { message?: { role?: string } } | null;
  return {
    messageRole: e?.message?.role ?? null,
  };
};
