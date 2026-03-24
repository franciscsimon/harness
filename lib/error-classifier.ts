// ─── Error Classifier ────────────────────────────────────────
// Automatic severity classification based on error context (Phase 6.3).

import type { ErrorSeverity } from "./errors.ts";

interface ClassificationInput {
  component: string;
  operation: string;
  error: Error | string;
  stackTrace?: string;
}

const RULES: Array<{
  name: string;
  severity: ErrorSeverity;
  test: (input: ClassificationInput) => boolean;
}> = [
  // Data loss — DB write failures
  {
    name: "db-write-failure",
    severity: "data_loss",
    test: (i) => /INSERT|UPDATE|DELETE|write|flush/i.test(i.operation) && /recorder|writer|db/i.test(i.component),
  },
  {
    name: "data-corruption",
    severity: "data_loss",
    test: (i) => /corrupt|integrity|constraint/i.test(String(i.error)),
  },

  // Degraded — service failures
  {
    name: "connection-refused",
    severity: "degraded",
    test: (i) => /ECONNREFUSED/i.test(String(i.error)),
  },
  {
    name: "oom",
    severity: "degraded",
    test: (i) => /OOM|ENOMEM|heap|out of memory/i.test(String(i.error)),
  },
  {
    name: "health-check-fail",
    severity: "degraded",
    test: (i) => /health/i.test(i.operation),
  },
  {
    name: "timeout",
    severity: "degraded",
    test: (i) => /timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(String(i.error)),
  },

  // Transient — recoverable
  {
    name: "network-transient",
    severity: "transient",
    test: (i) => /ECONNRESET|EPIPE|ENOTFOUND|fetch failed/i.test(String(i.error)),
  },
  {
    name: "rate-limited",
    severity: "transient",
    test: (i) => /429|rate.?limit|too many/i.test(String(i.error)),
  },

  // Cosmetic — non-critical
  {
    name: "parse-error",
    severity: "cosmetic",
    test: (i) => /JSON\.parse|SyntaxError|unexpected token/i.test(String(i.error)) && !/db|write|insert/i.test(i.operation),
  },
];

/** Classify an error's severity based on context patterns. */
export function classifyError(input: ClassificationInput): { severity: ErrorSeverity; rule: string } {
  for (const rule of RULES) {
    if (rule.test(input)) {
      return { severity: rule.severity, rule: rule.name };
    }
  }
  return { severity: "transient", rule: "default" };
}
