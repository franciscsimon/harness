// ─── Alerting Rules ──────────────────────────────────────────
// Centralized alerting configuration (Phase 6.6).
// Defines conditions, actions, and channels for all alert types.

import { createLogger } from "./logger.ts";

const log = createLogger("alerting");

export type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AlertChannel = "sse" | "webhook" | "log";

export interface Alert {
  id: string;
  rule: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  component?: string;
  channels: AlertChannel[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AlertRule {
  name: string;
  condition: string;
  severity: AlertSeverity;
  channels: AlertChannel[];
  /** Cooldown in ms — don't re-fire the same rule within this window */
  cooldownMs: number;
}

export const ALERT_RULES: AlertRule[] = [
  // Error monitoring
  { name: "data-loss-error", condition: "New error with severity data_loss", severity: "critical", channels: ["sse", "webhook", "log"], cooldownMs: 0 },
  { name: "degraded-error-burst", condition: "degraded error ≥3 occurrences in 5min", severity: "high", channels: ["sse", "log"], cooldownMs: 300_000 },
  { name: "error-rate-regression", condition: "Error rate ≥3x after deployment", severity: "high", channels: ["sse", "webhook", "log"], cooldownMs: 600_000 },
  { name: "transient-error-escalation", condition: "transient error ≥10 occurrences in 5min", severity: "medium", channels: ["sse", "log"], cooldownMs: 300_000 },

  // Service health
  { name: "service-down", condition: "Health check failure ≥3 consecutive", severity: "critical", channels: ["sse", "webhook", "log"], cooldownMs: 0 },
  { name: "container-oom", condition: "Container OOM killed", severity: "critical", channels: ["sse", "log"], cooldownMs: 0 },
  { name: "container-restart-loop", condition: "Container ≥3 restarts in 5min", severity: "high", channels: ["sse", "log"], cooldownMs: 300_000 },

  // Resource
  { name: "memory-high", condition: "Container memory >80% of limit", severity: "medium", channels: ["sse", "log"], cooldownMs: 600_000 },
  { name: "cpu-sustained", condition: "Container CPU >90% for 5min", severity: "medium", channels: ["sse", "log"], cooldownMs: 600_000 },

  // Security
  { name: "security-scan-critical", condition: "Trivy/gitleaks critical finding", severity: "critical", channels: ["sse", "webhook", "log"], cooldownMs: 0 },
  { name: "secret-in-commit", condition: "Secret detected in commit", severity: "critical", channels: ["sse", "webhook", "log"], cooldownMs: 0 },
  { name: "rate-limit-triggered", condition: "Rate limit hit", severity: "low", channels: ["log"], cooldownMs: 60_000 },

  // CI
  { name: "ci-failure", condition: "CI run failed", severity: "medium", channels: ["sse", "log"], cooldownMs: 0 },
  { name: "review-gate-block", condition: "Review gate blocked a build", severity: "medium", channels: ["sse", "log"], cooldownMs: 0 },
];

// Cooldown tracking
const lastFired = new Map<string, number>();

/**
 * Fire an alert if not in cooldown.
 * Returns the alert if fired, null if suppressed by cooldown.
 */
export function fireAlert(
  ruleName: string,
  opts: { title: string; message: string; component?: string; metadata?: Record<string, unknown> },
): Alert | null {
  const rule = ALERT_RULES.find((r) => r.name === ruleName);
  if (!rule) {
    log.warn({ ruleName }, "Unknown alert rule");
    return null;
  }

  const now = Date.now();
  const last = lastFired.get(ruleName) ?? 0;
  if (rule.cooldownMs > 0 && now - last < rule.cooldownMs) {
    return null; // Suppressed by cooldown
  }

  lastFired.set(ruleName, now);

  const alert: Alert = {
    id: `alert-${ruleName}-${now}`,
    rule: ruleName,
    severity: rule.severity,
    title: opts.title,
    message: opts.message,
    component: opts.component,
    channels: rule.channels,
    timestamp: now,
    metadata: opts.metadata,
  };

  // Dispatch to channels
  for (const channel of rule.channels) {
    switch (channel) {
      case "log":
        if (rule.severity === "critical") log.error(alert, alert.title);
        else if (rule.severity === "high") log.warn(alert, alert.title);
        else log.info(alert, alert.title);
        break;
      case "sse":
        // SSE dispatch handled by the caller (server-sent events endpoint)
        break;
      case "webhook":
        dispatchWebhook(alert).catch(() => {});
        break;
    }
  }

  return alert;
}

async function dispatchWebhook(alert: Alert): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
  } catch (e: any) {
    log.warn({ url, err: e.message }, "Failed to dispatch webhook alert");
  }
}

/** Get all configured rules. */
export function getRules(): AlertRule[] {
  return ALERT_RULES;
}
