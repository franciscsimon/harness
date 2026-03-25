#!/usr/bin/env npx jiti
// ─── Review Gate ─────────────────────────────────────────────────
// Runs all quality checks on a repo and outputs a structured report.
// Usage: npx jiti review-gate/index.ts [repo-dir] [commit-hash] [branch]

import { runComplexityCheck } from "./checks/complexity.ts";
import { storeComplexityScores } from "./checks/complexity-tracker.ts";
import { runDepsCheck } from "./checks/deps.ts";
import { runLintCheck } from "./checks/lint.ts";
import { runSecurityCheck } from "./checks/security.ts";
import { runSizeCheck } from "./checks/size.ts";
import { runStyleCheck } from "./checks/style.ts";
import { runTypecheckCheck } from "./checks/typecheck.ts";
import { evaluateGate, printReport } from "./gate.ts";
import type { CheckResult } from "./types.ts";
import { emitEnrichment } from "../lib/enrich.ts";
import { recordReviewReport } from "./recorder.ts";

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
  checks.push(runStyleCheck(repoDir));

  const report = evaluateGate(checks, { repo, commitHash, branch });
  printReport(report);

  // Store complexity scores for trend tracking (Phase 2.2)
  const complexityCheck = checks.find((c) => c.name === "complexity");
  if (complexityCheck) {
    await storeComplexityScores(complexityCheck, { repo, commitHash });
  }

  // Output JSON for CI integration
  console.log(JSON.stringify(report));

  // §1.1+§1.2 — enrich graph + record review report
  const reviewSql = (await import("../lib/db.ts")).connectXtdb();
  try {
    await recordReviewReport(reviewSql, {
      repo: targetDir,
      commitHash: process.env.COMMIT_HASH ?? "unknown",
      securityPassed: results.every(r => r.name !== "security" || r.passed),
      stylePassed: results.every(r => r.name !== "style" || r.passed),
      complexityPassed: results.every(r => r.name !== "complexity" || r.passed),
      overallPassed: allPassed,
      details: Object.fromEntries(results.map(r => [r.name, { passed: r.passed, issues: r.issues?.length ?? 0 }])),
    });
  } catch {}
  emitEnrichment("review_complete", { reviewId: `review-${Date.now()}`, commitHash: process.env.COMMIT_HASH ?? "unknown", repo: targetDir, passed: allPassed });
  process.exit(report.passed ? 0 : 1);
}

main();
