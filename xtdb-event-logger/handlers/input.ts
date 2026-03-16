import type { EventHandler } from "../types.ts";
import { trunc } from "../util.ts";

// Raw: { text: string, source: string, images?: unknown[] }

export const handler: EventHandler = (event) => {
  const e = event as {
    text?: string;
    source?: string;
    images?: unknown[];
  } | null;
  return {
    inputText: e?.text != null ? trunc(e.text, 2048) : null,
    inputSource: e?.source ?? null,
    inputHasImages: (e?.images?.length ?? 0) > 0,
  };
};
