import { readFileSync } from "node:fs";
import type { CheckResult, Finding } from "../types.ts";
import { collectTsFiles } from "./files.ts";

const MAX_CYCLOMATIC = 10;

/** Estimate cyclomatic complexity per function using branch-counting heuristic. */
export function runComplexityCheck(repoDir: string): CheckResult {
  const start = Date.now();
  const findings: Finding[] = [];
  const tsFiles = collectTsFiles(repoDir, 3);

  for (const file of tsFiles) {
    try {
      const src = readFileSync(file, "utf-8");
      const relPath = file.replace(repoDir + "/", "");
      const functions = extractFunctions(src);
      for (const fn of functions) {
        const complexity = estimateComplexity(fn.body);
        if (complexity > MAX_CYCLOMATIC) {
          findings.push({
            file: relPath,
            message: `${fn.name}: cyclomatic complexity ${complexity} (max ${MAX_CYCLOMATIC})`,
            severity: complexity > MAX_CYCLOMATIC * 2 ? "block" : "warn",
          });
        }
      }
    } catch {
      /* skip unreadable files */
    }
  }

  return {
    name: "complexity",
    status: findings.some((f) => f.severity === "block") ? "fail" : "pass",
    ms: Date.now() - start,
    findings,
  };
}

interface FnBlock {
  name: string;
  body: string;
}

function extractFunctions(src: string): FnBlock[] {
  const fns: FnBlock[] = [];
  // Match function declarations and arrow functions assigned to const
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=>{]+)?\s*=>\s*\{/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src)) !== null) {
      const startIdx = match.index + match[0].length - 1;
      const body = extractBraceBlock(src, startIdx);
      if (body) fns.push({ name: match[1], body });
    }
  }
  return fns;
}

function extractBraceBlock(src: string, openIdx: number): string | null {
  if (src[openIdx] !== "{") return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return depth === 0 ? src.slice(openIdx, i) : null;
}

function estimateComplexity(body: string): number {
  let complexity = 1; // base path
  const branches = [/\bif\s*\(/g, /\belse\s+if\b/g, /\bcase\s+/g, /\b\?\?/g, /\?\./g, /&&/g, /\|\|/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bcatch\s*\(/g, /\?\s*[^:]+:/g];
  for (const pattern of branches) {
    const matches = body.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}


