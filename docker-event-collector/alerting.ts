// ─── Docker Event Alerting ────────────────────────────────────
// Detects patterns: restart loops, OOM, unexpected crashes.
// Posts alerts to harness-ui /api/ci/notify for SSE propagation.

import type { DockerEventRecord } from "./transform.ts";

const HARNESS_UI_URL = process.env.HARNESS_UI_URL ?? "http://harness-ui:3336";
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RESTART_THRESHOLD = 3; // 3+ restarts in window = restart loop

// Track recent die events per container for restart loop detection
const recentDies: Map<string, number[]> = new Map();
let alertsSent = 0;
let alertsFailed = 0;

export function getAlertStats() {
  return { alertsSent, alertsFailed, trackedContainers: recentDies.size };
}

export function checkAlerts(record: DockerEventRecord): void {
  const { action, container_name, severity, exit_code } = record;

  // OOM — always alert immediately
  if (action === "oom") {
    sendAlert({
      type: "oom",
      severity: "critical",
      title: `💥 OOM: ${container_name}`,
      message: `Container ${container_name} was killed by OOM killer`,
      container: container_name,
      service: record.service_name,
      ts: record.ts,
    });
    return;
  }

  // Die with non-zero exit — track for restart loop detection
  if (action === "die" && exit_code != null && exit_code !== 0) {
    trackDie(container_name, record.ts);

    // Check for restart loop
    const count = countRecentDies(container_name, record.ts);
    if (count >= RESTART_THRESHOLD) {
      sendAlert({
        type: "restart_loop",
        severity: "critical",
        title: `🔄 Restart loop: ${container_name}`,
        message: `Container ${container_name} has crashed ${count} times in the last 5 minutes (exit code ${exit_code})`,
        container: container_name,
        service: record.service_name,
        ts: record.ts,
      });
    } else {
      // Single crash — still worth alerting
      sendAlert({
        type: "crash",
        severity: "error",
        title: `💀 Crash: ${container_name}`,
        message: `Container ${container_name} exited with code ${exit_code}`,
        container: container_name,
        service: record.service_name,
        ts: record.ts,
      });
    }
    return;
  }

  // Health status unhealthy
  if (action.includes("health_status") && action.includes("unhealthy")) {
    sendAlert({
      type: "unhealthy",
      severity: "warning",
      title: `❤️‍🩹 Unhealthy: ${container_name}`,
      message: `Container ${container_name} health check is failing`,
      container: container_name,
      service: record.service_name,
      ts: record.ts,
    });
    return;
  }
}

function trackDie(container: string, ts: number) {
  const times = recentDies.get(container) ?? [];
  times.push(ts);
  // Prune old entries
  const cutoff = ts - RESTART_WINDOW_MS;
  const recent = times.filter((t) => t > cutoff);
  recentDies.set(container, recent);
}

function countRecentDies(container: string, ts: number): number {
  const times = recentDies.get(container) ?? [];
  const cutoff = ts - RESTART_WINDOW_MS;
  return times.filter((t) => t > cutoff).length;
}

interface Alert {
  type: string;
  severity: string;
  title: string;
  message: string;
  container: string;
  service: string;
  ts: number;
}

async function sendAlert(alert: Alert): Promise<void> {
  try {
    const res = await fetch(`${HARNESS_UI_URL}/api/ci/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "docker-alert",
        ...alert,
        timestamp: new Date(alert.ts).toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      alertsSent++;
    } else {
      alertsFailed++;
    }
  } catch (e: unknown) {
    alertsFailed++;
    const _msg = e instanceof Error ? e.message : String(e);
  }
}
