#!/usr/bin/env npx jiti
// ─── Review Gate ─────────────────────────────────────────────────
// Runs all quality checks on a repo and outputs a structured report.
// Usage: npx jiti review-gate/index.ts [repo-dir] [commit-hash] [branch]

import { runComplexityCheck } from "./checks/complexity.ts";
import { runDepsCheck } from "./checks/deps.ts";
import { runLintCheck } from "./checks/lint.ts";
import { runSecurityCheck } from "./checks/security.ts";
import { runSizeCheck } from "./checks/size.ts";
import { runTypecheckCheck } from "./checks/typecheck.ts";
import { evaluateGate, printReport } from "./gate.ts";
import type { CheckResult } from "./types.ts";

const repoDir = process.argv[2] ?? process.cwd();
const commitHash = process.argv[3] ?? "unknown";
const branch = process.argv[4] ?? "main";
const repo = repoDir.split("/").pop() ?? "unknown";

async function main(): Promise<void> {
  const checks: CheckResult[] = [];

  checks.push(runLintCheck(repoDir));
  checks.push(runTypecheckCheck(repoDir));
  checks.push(runComplexityCheck(repoDir));
  checks.push(runSizeCheck(repoDir));
  checks.push(runDepsCheck(repoDir, branch));
  checks.push(runSecurityCheck(repoDir));

  const report = evaluateGate(checks, { repo, commitHash, branch });
  printReport(report);

  // Output JSON for CI integration
  console.log(JSON.stringify(report));

  process.exit(report.passed ? 0 : 1);
}

main();
