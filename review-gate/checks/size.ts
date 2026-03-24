import { readFileSync } from "node:fs";
import type { CheckResult, Finding } from "../types.ts";
import { collectTsFiles } from "./files.ts";

const MAX_FILE_LINES = 500;
const MAX_FUNCTION_LINES = 80;

/** Check file and function sizes. */
export function runSizeCheck(repoDir: string): CheckResult {
  const start = Date.now();
  const findings: Finding[] = [];
  const tsFiles = collectTsFiles(repoDir, 3);

  for (const file of tsFiles) {
    try {
      const src = readFileSync(file, "utf-8");
      const relPath = file.replace(repoDir + "/", "");
      const lines = src.split("\n").length;

      if (lines > MAX_FILE_LINES) {
        findings.push({
          file: relPath,
          message: `${lines} lines (max ${MAX_FILE_LINES})`,
          severity: lines > MAX_FILE_LINES * 2 ? "block" : "warn",
        });
      }

      // Check function sizes
      const fnPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
      let match: RegExpExecArray | null;
      while ((match = fnPattern.exec(src)) !== null) {
        const name = match[1] || match[2];
        const startLine = src.slice(0, match.index).split("\n").length;
        // Find matching closing brace
        const braceIdx = src.indexOf("{", match.index + match[0].length);
        if (braceIdx === -1) continue;
        let depth = 1;
        let i = braceIdx + 1;
        while (i < src.length && depth > 0) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}") depth--;
          i++;
        }
        const endLine = src.slice(0, i).split("\n").length;
        const fnLines = endLine - startLine;
        if (fnLines > MAX_FUNCTION_LINES) {
          findings.push({
            file: relPath,
            message: `${name}(): ${fnLines} lines (max ${MAX_FUNCTION_LINES})`,
            severity: fnLines > MAX_FUNCTION_LINES * 2 ? "block" : "warn",
          });
        }
      }
    } catch {
      /* skip */
    }
  }

  return {
    name: "size",
    status: findings.some((f) => f.severity === "block") ? "fail" : "pass",
    ms: Date.now() - start,
    findings,
  };
}


