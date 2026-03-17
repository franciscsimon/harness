import type { EventHandler } from "../types.ts";

// Raw: { prompt: string, images?: unknown[], systemPrompt: string }

export const handler: EventHandler = (event) => {
  const e = event as {
    prompt?: string;
    systemPrompt?: string;
    images?: unknown[];
  } | null;
  return {
    promptText: e?.prompt ?? null,
    systemPrompt: e?.systemPrompt ?? null,
    inputHasImages: (e?.images?.length ?? 0) > 0,
    images: e?.images != null && e.images.length > 0 ? JSON.stringify(e.images) : null,
  };
};
