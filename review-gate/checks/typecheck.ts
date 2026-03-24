import { execSync } from "node:child_process";
import type { CheckResult, Finding } from "../types.ts";

/** Run tsc --noEmit and parse diagnostics. */
export function runTypecheckCheck(repoDir: string): CheckResult {
  const start = Date.now();
  try {
    execSync("npx tsc --noEmit 2>&1", {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { name: "typecheck", status: "pass", ms: Date.now() - start, findings: [] };
  } catch (e: any) {
    const output: string = e.stdout ?? e.stderr ?? "";
    const findings = parseTscOutput(output);
    return {
      name: "typecheck",
      status: findings.length > 0 ? "fail" : "error",
      ms: Date.now() - start,
      findings,
      raw: output.slice(-500),
    };
  }
}

function parseTscOutput(output: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
    if (match) {
      findings.push({
        file: match[1],
        message: `${match[5]}: ${match[6]}`,
        severity: match[4] === "error" ? "block" : "warn",
      });
    }
  }
  return findings.slice(0, 50);
}
