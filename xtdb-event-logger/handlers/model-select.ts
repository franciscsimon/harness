import type { EventHandler } from "../types.ts";

// Raw: { model: { provider, id }, previousModel?: { provider, id }, source: string }

export const handler: EventHandler = (event) => {
  const e = event as {
    model?: { provider?: string; id?: string };
    previousModel?: { provider?: string; id?: string } | null;
    source?: string;
  } | null;
  return {
    modelProvider: e?.model?.provider ?? null,
    modelId: e?.model?.id ?? null,
    modelSource: e?.source ?? null,
    prevModelProvider: e?.previousModel?.provider ?? null,
    prevModelId: e?.previousModel?.id ?? null,
  };
};
