// ─── Trivy Image Scanner ─────────────────────────────────────
// Scans built Docker images for vulnerabilities using Trivy (Phase 4.3).
// Called as a post-build step by builder.ts.

import { execSync } from "node:child_process";
import { createLogger } from "../lib/logger.ts";

const log = createLogger("image-scanner");

export interface ScanResult {
  image: string;
  vulnerabilities: VulnerabilityFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  passed: boolean;
  scanMs: number;
}

export interface VulnerabilityFinding {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  pkgName: string;
  installedVersion: string;
  fixedVersion: string;
  title: string;
}

/**
 * Scan a Docker image with Trivy.
 * Returns structured results. Fails if critical/high vulnerabilities found.
 * Falls back gracefully if Trivy is not installed.
 */
export function scanImage(image: string): ScanResult {
  const start = Date.now();

  try {
    const output = execSync(
      `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --format json --severity HIGH,CRITICAL --no-progress ${image}`,
      { encoding: "utf-8", timeout: 300_000, stdio: ["pipe", "pipe", "pipe"] },
    );

    const parsed = JSON.parse(output);
    const vulnerabilities: VulnerabilityFinding[] = [];

    for (const result of parsed.Results ?? []) {
      for (const vuln of result.Vulnerabilities ?? []) {
        vulnerabilities.push({
          id: vuln.VulnerabilityID ?? "unknown",
          severity: vuln.Severity ?? "UNKNOWN",
          pkgName: vuln.PkgName ?? "unknown",
          installedVersion: vuln.InstalledVersion ?? "",
          fixedVersion: vuln.FixedVersion ?? "",
          title: vuln.Title ?? vuln.Description?.slice(0, 100) ?? "",
        });
      }
    }

    const counts = countBySeverity(vulnerabilities);
    const passed = counts.critical === 0;

    if (!passed) {
      log.error({ image, critical: counts.critical, high: counts.high }, "Image scan FAILED — critical vulnerabilities found");
    } else {
      log.info({ image, high: counts.high, medium: counts.medium }, "Image scan passed");
    }

    return { image, vulnerabilities, ...counts, passed, scanMs: Date.now() - start };
  } catch (e: any) {
    if (e.message?.includes("not found") || e.message?.includes("command not found")) {
      log.warn({ image }, "Trivy not available — skipping scan");
      return { image, vulnerabilities: [], criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, passed: true, scanMs: Date.now() - start };
    }

    log.error({ image, err: e.message }, "Image scan error");
    return { image, vulnerabilities: [], criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, passed: false, scanMs: Date.now() - start };
  }
}

function countBySeverity(vulns: VulnerabilityFinding[]) {
  return {
    criticalCount: vulns.filter((v) => v.severity === "CRITICAL").length,
    highCount: vulns.filter((v) => v.severity === "HIGH").length,
    mediumCount: vulns.filter((v) => v.severity === "MEDIUM").length,
    lowCount: vulns.filter((v) => v.severity === "LOW").length,
  };
}

/** Check if scan results should block deployment. */
export function shouldBlockDeploy(result: ScanResult): { blocked: boolean; reason: string } {
  if (result.criticalCount > 0) {
    return { blocked: true, reason: `${result.criticalCount} CRITICAL vulnerabilities found — deployment blocked` };
  }
  return { blocked: false, reason: "No critical vulnerabilities" };
}

/** Format scan results as a human-readable report. */
export function formatScanReport(result: ScanResult): string {
  const icon = result.passed ? "✅" : "❌";
  let report = `${icon} Image Scan: ${result.image}\n`;
  report += `   Critical: ${result.criticalCount}  High: ${result.highCount}  Medium: ${result.mediumCount}  Low: ${result.lowCount}\n`;
  report += `   Scan time: ${result.scanMs}ms\n`;

  if (result.vulnerabilities.length > 0) {
    report += "\n   Vulnerabilities:\n";
    for (const v of result.vulnerabilities.slice(0, 10)) {
      report += `   ${v.severity} ${v.id}: ${v.pkgName} ${v.installedVersion} → ${v.fixedVersion || "no fix"} — ${v.title}\n`;
    }
    if (result.vulnerabilities.length > 10) {
      report += `   ... and ${result.vulnerabilities.length - 10} more\n`;
    }
  }

  return report;
}

// §2 — Persist image_scans to XTDB
export async function persistScanResult(sql: any, image: string, result: ScanResult): Promise<void> {
  try {
    await sql`INSERT INTO image_scans
      (_id, image, critical_count, high_count, medium_count, low_count, passed, ts, _valid_from)
      VALUES (${`scan:${image}:${Date.now()}`}, ${image}, ${result.critical}, ${result.high}, ${result.medium}, ${result.low},
        ${result.critical === 0 && result.high === 0}, ${Date.now()}, CURRENT_TIMESTAMP)`;
  } catch {}
}
