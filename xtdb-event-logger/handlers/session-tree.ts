import type { EventHandler } from "../types.ts";

// Raw: { newLeafId: string, oldLeafId: string, fromExtension: boolean }

export const handler: EventHandler = (event) => {
  const e = event as {
    newLeafId?: string;
    oldLeafId?: string;
    fromExtension?: boolean;
  } | null;
  return {
    treeNewLeaf: e?.newLeafId ?? null,
    treeOldLeaf: e?.oldLeafId ?? null,
    treeFromExt: e?.fromExtension ?? null,
  };
};
