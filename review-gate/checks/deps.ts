import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, Finding } from "../types.ts";

/** Diff package.json against the base branch to flag new dependencies. */
export function runDepsCheck(repoDir: string, baseBranch = "main"): CheckResult {
  const start = Date.now();
  const findings: Finding[] = [];

  try {
    const currentPkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8"));
    let basePkg: any = {};
    try {
      const raw = execSync(`git show ${baseBranch}:package.json`, {
        cwd: repoDir, encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"],
      });
      basePkg = JSON.parse(raw);
    } catch { /* no base — treat everything as new */ }

    const baseDeps = { ...basePkg.dependencies, ...basePkg.devDependencies };
    const currentDeps = { ...currentPkg.dependencies, ...currentPkg.devDependencies };

    for (const [name, version] of Object.entries(currentDeps)) {
      if (!(name in baseDeps)) {
        findings.push({ file: "package.json", message: `New dependency: ${name}@${version}`, severity: "info" });
      }
    }
  } catch (e: any) {
    return { name: "deps", status: "error", ms: Date.now() - start, findings: [], raw: e.message };
  }

  return { name: "deps", status: "pass", ms: Date.now() - start, findings };
}
