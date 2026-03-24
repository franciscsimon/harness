export interface Finding {
  file: string;
  message: string;
  severity: "block" | "warn" | "info";
}

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "error" | "skip";
  ms: number;
  findings: Finding[];
  raw?: string;
}

export interface ReviewReport {
  id: string;
  repo: string;
  commitHash: string;
  branch: string;
  timestamp: number;
  checks: CheckResult[];
  passed: boolean;
  blockers: number;
  warnings: number;
}
