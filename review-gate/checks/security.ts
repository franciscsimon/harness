// ─── OWASP Security Checks ───────────────────────────────────
// Static analysis checks for common security issues (Phase 4.5).

import { readFileSync } from "node:fs";
import type { CheckResult, Finding } from "../types.ts";
import { collectTsFiles } from "./files.ts";

export function runSecurityCheck(repoDir: string): CheckResult {
  const start = Date.now();
  const findings: Finding[] = [];
  const tsFiles = collectTsFiles(repoDir, 3);

  for (const file of tsFiles) {
    try {
      const src = readFileSync(file, "utf-8");
      const rel = file.replace(repoDir + "/", "");
      const lines = src.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const ln = i + 1;

        // Command injection: execSync/spawn with template literals containing variables
        if (/exec(?:Sync)?\s*\(\s*`[^`]*\$\{/.test(line) || /spawn\s*\(\s*`[^`]*\$\{/.test(line)) {
          findings.push({ file: rel, message: `L${ln}: Potential command injection — template literal in exec/spawn`, severity: "block" });
        }

        // SQL injection: string concatenation in SQL (not tagged template)
        if (/sql\s*\(\s*["'`].*\+/.test(line) || /query\s*\(\s*["'].*\+/.test(line)) {
          findings.push({ file: rel, message: `L${ln}: Potential SQL injection — string concatenation in query`, severity: "block" });
        }

        // Hardcoded secrets (beyond what gitleaks catches)
        if (/password\s*[:=]\s*["'][^"']{4,}["']/.test(line) && !/process\.env/.test(line) && !/example|placeholder|test/i.test(line)) {
          findings.push({ file: rel, message: `L${ln}: Hardcoded password detected`, severity: "block" });
        }

        // Missing auth: Hono route without auth middleware reference in file
        // (heuristic — just flags for review)
        if (/app\.(post|put|patch|delete)\s*\(/.test(line) && !src.includes("authMiddleware") && !src.includes("auth") && !rel.includes("health")) {
          findings.push({ file: rel, message: `L${ln}: Mutating endpoint without apparent auth middleware`, severity: "warn" });
          break; // One warning per file is enough
        }

        // Sensitive data in logs
        if (/console\.log\s*\(.*password|console\.log\s*\(.*secret|console\.log\s*\(.*token/i.test(line)) {
          findings.push({ file: rel, message: `L${ln}: Potential sensitive data in console.log`, severity: "warn" });
        }
      }
    } catch { /* skip */ }
  }

  return {
    name: "security",
    status: findings.some((f) => f.severity === "block") ? "fail" : "pass",
    ms: Date.now() - start,
    findings,
  };
}
