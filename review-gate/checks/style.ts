// ─── Style Consistency Check ─────────────────────────────────
// Enforces naming conventions and code style patterns (Phase 2.4).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { CheckResult, Finding } from "../types.ts";
import { collectTsFiles } from "./files.ts";

/** Run style consistency checks on a repo. */
export function runStyleCheck(repoDir: string): CheckResult {
  const start = Date.now();
  const findings: Finding[] = [];
  const tsFiles = collectTsFiles(repoDir, 3);

  for (const file of tsFiles) {
    const rel = file.replace(repoDir + "/", "");
    const name = basename(file, ".ts");

    // File naming: should be kebab-case (allow single words, index, types)
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) && name !== "index" && name !== "types") {
      findings.push({ file: rel, message: `Filename '${name}.ts' is not kebab-case`, severity: "warn" });
    }

    try {
      const src = readFileSync(file, "utf-8");
      const lines = src.split("\n");

      // Check for header comment pattern on non-trivial files (>20 lines)
      if (lines.length > 20 && !src.startsWith("//") && !src.startsWith("#!/") && !src.startsWith("/**")) {
        findings.push({ file: rel, message: "Missing header comment (expected // ─── or /** block)", severity: "info" });
      }

      // Check exported names: should be camelCase or PascalCase
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const exportMatch = line.match(/^export\s+(?:const|function|class|type|interface)\s+([a-zA-Z_]\w*)/);
        if (exportMatch) {
          const exportName = exportMatch[1];
          // PascalCase for types/interfaces/classes, camelCase for functions/consts
          if (/^export\s+(?:type|interface|class)/.test(line)) {
            if (!/^[A-Z]/.test(exportName)) {
              findings.push({ file: rel, message: `L${i + 1}: Export '${exportName}' should be PascalCase (type/interface/class)`, severity: "warn" });
            }
          } else {
            if (/^[A-Z]/.test(exportName) && !/^[A-Z_]+$/.test(exportName)) {
              // Allow ALL_CAPS constants
              findings.push({ file: rel, message: `L${i + 1}: Export '${exportName}' should be camelCase (function/const)`, severity: "info" });
            }
          }
        }
      }
    } catch { /* skip unreadable */ }
  }

  return {
    name: "style",
    status: findings.some((f) => f.severity === "block") ? "fail" : "pass",
    ms: Date.now() - start,
    findings,
  };
}
