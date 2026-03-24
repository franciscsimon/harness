import type { CheckResult, ReviewReport } from "./types.ts";

/** Compute pass/fail from check results. Fails if any finding has severity "block". */
export function evaluateGate(
  checks: CheckResult[],
  meta: { repo: string; commitHash: string; branch: string },
): ReviewReport {
  const blockers = checks.reduce((n, c) => n + c.findings.filter((f) => f.severity === "block").length, 0);
  const warnings = checks.reduce((n, c) => n + c.findings.filter((f) => f.severity === "warn").length, 0);
  const passed = blockers === 0 && !checks.some((c) => c.status === "error");

  return {
    id: `review-${Date.now()}-${meta.commitHash.slice(0, 8)}`,
    repo: meta.repo,
    commitHash: meta.commitHash,
    branch: meta.branch,
    timestamp: Date.now(),
    checks,
    passed,
    blockers,
    warnings,
  };
}

/** Print a human-readable summary to stdout. */
export function printReport(report: ReviewReport): void {
  const icon = report.passed ? "✅" : "❌";
  console.log(`\n${icon} Review Gate: ${report.passed ? "PASSED" : "FAILED"}`);
  console.log(`   Repo: ${report.repo} @ ${report.commitHash.slice(0, 8)}`);
  console.log(`   Blockers: ${report.blockers}  Warnings: ${report.warnings}\n`);

  for (const check of report.checks) {
    const statusIcon = check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "⚠";
    console.log(`  ${statusIcon} ${check.name} (${check.ms}ms) — ${check.findings.length} findings`);
    for (const f of check.findings.slice(0, 5)) {
      console.log(`      ${f.severity === "block" ? "🚫" : "⚠️"} ${f.file}: ${f.message}`);
    }
    if (check.findings.length > 5) {
      console.log(`      ... and ${check.findings.length - 5} more`);
    }
  }
  console.log();
}
