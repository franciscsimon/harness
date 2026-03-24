#!/usr/bin/env npx jiti
/**
 * Run contract tests and record results to XTDB test_runs table.
 * Usage: NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/test-and-record.ts
 */

import { execSync } from "node:child_process";
import { closeRecorder, recordTestRun } from "../lib/test-recorder.ts";

interface Suite {
  name: string;
  file: string;
}

const SUITES: Suite[] = [
  { name: "contracts/infrastructure", file: "test/contracts/infrastructure.ts" },
  { name: "contracts/api-event-logger", file: "test/contracts/api-event-logger.ts" },
  { name: "contracts/api-ops", file: "test/contracts/api-ops.ts" },
  { name: "contracts/api-harness-ui", file: "test/contracts/api-harness-ui.ts" },
];

async function main() {
  let _totalPassed = 0;
  let totalFailed = 0;

  for (const suite of SUITES) {
    const start = Date.now();
    let output = "";
    let exitCode = 0;

    try {
      output = execSync(`npx jiti ${suite.file}`, {
        cwd: process.cwd(),
        env: { ...process.env, NODE_PATH: process.env.NODE_PATH ?? "xtdb-event-logger/node_modules" },
        encoding: "utf-8",
        timeout: 30_000,
      });
    } catch (err: any) {
      output = err.stdout ?? "";
      exitCode = err.status ?? 1;
    }

    const durationMs = Date.now() - start;

    // Parse pass/fail counts from output like "── Results: 22 passed, 0 failed ──"
    const resultsMatch = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
    const passed = resultsMatch ? parseInt(resultsMatch[1], 10) : exitCode === 0 ? 1 : 0;
    const failed = resultsMatch ? parseInt(resultsMatch[2], 10) : exitCode !== 0 ? 1 : 0;
    const status = failed > 0 ? "failed" : "passed";

    // Extract failure messages
    const failureLines = output
      .split("\n")
      .filter((l) => l.includes("❌"))
      .map((l) => l.trim());
    const errorSummary = failureLines.length > 0 ? failureLines.join("; ") : undefined;

    _totalPassed += passed;
    totalFailed += failed;

    // Record to XTDB
    try {
      const _id = await recordTestRun({
        projectId: "proj:harness",
        suiteName: suite.name,
        runner: "jiti",
        passed,
        failed,
        durationMs,
        status,
        errorSummary,
      });
    } catch (_err) {}
  }

  await closeRecorder();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
