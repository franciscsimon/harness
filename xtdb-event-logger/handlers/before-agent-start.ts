import type { EventHandler } from "../types.ts";
import { trunc } from "../util.ts";

// Raw: { prompt: string, images?: unknown[], systemPrompt: string }
// Capture prompt (truncated). Do NOT capture systemPrompt (multi-KB).

export const handler: EventHandler = (event) => {
  const e = event as { prompt?: string; images?: unknown[] } | null;
  return {
    promptText: e?.prompt != null ? trunc(e.prompt, 2048) : null,
    inputHasImages: (e?.images?.length ?? 0) > 0,
  };
};
