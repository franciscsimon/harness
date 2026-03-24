import { execSync } from "node:child_process";
import type { CheckResult } from "../types.ts";

/** Run Biome CI and capture structured output. */
export function runLintCheck(repoDir: string): CheckResult {
  const start = Date.now();
  try {
    const output = execSync("npx biome ci --reporter=json .", {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      name: "lint",
      status: "pass",
      ms: Date.now() - start,
      findings: [],
      raw: output.slice(-500),
    };
  } catch (e: any) {
    const stderr = e.stderr?.slice(-1000) ?? "";
    const stdout = e.stdout?.slice(-1000) ?? "";
    const findings = parseBiomeFindings(stdout || stderr);
    return {
      name: "lint",
      status: findings.length > 0 ? "fail" : "error",
      ms: Date.now() - start,
      findings,
      raw: (stdout || stderr).slice(-500),
    };
  }
}

function parseBiomeFindings(output: string): Array<{ file: string; message: string; severity: string }> {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed?.diagnostics)) {
      return parsed.diagnostics.map((d: any) => ({
        file: d.file_path ?? d.path ?? "unknown",
        message: d.message ?? d.description ?? "lint issue",
        severity: d.severity === "error" ? "block" : "warn",
      }));
    }
  } catch {
    // Non-JSON output — extract line-based findings
    const lines = output.split("\n").filter((l) => l.includes("error") || l.includes("warning"));
    return lines.slice(0, 20).map((l) => ({ file: "unknown", message: l.trim(), severity: "warn" }));
  }
  return [];
}
