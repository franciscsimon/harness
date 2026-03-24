import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Collect .ts files (non-declaration, non-node_modules) up to maxDepth. */
export function collectTsFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) files.push(...collectTsFiles(full, maxDepth, depth + 1));
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) files.push(full);
    }
  } catch { /* skip */ }
  return files;
}
