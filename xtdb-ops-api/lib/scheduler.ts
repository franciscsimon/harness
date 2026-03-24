/**
 * Simple backup scheduler — runs periodic CSV backups based on interval config.
 * Controlled via API: POST /api/scheduler/start, POST /api/scheduler/stop, GET /api/scheduler/status
 */
import { getJob, startCsvBackup } from "./backup.ts";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUPS = Number(process.env.BACKUP_RETENTION_COUNT ?? "7");

let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = DEFAULT_INTERVAL_MS;
let lastRunAt: string | null = null;
let lastJobId: string | null = null;

export function startScheduler(intervalHours?: number): { started: boolean; intervalHours: number } {
  if (timer) return { started: false, intervalHours: intervalMs / 3600000 };

  if (intervalHours && intervalHours > 0) {
    intervalMs = intervalHours * 3600000;
  }

  timer = setInterval(async () => {
    lastRunAt = new Date().toISOString();
    lastJobId = startCsvBackup();
  }, intervalMs);
  return { started: true, intervalHours: intervalMs / 3600000 };
}

export function stopScheduler(): { stopped: boolean } {
  if (!timer) return { stopped: false };
  clearInterval(timer);
  timer = null;
  return { stopped: true };
}

export function schedulerStatus(): {
  running: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  lastJobId: string | null;
  lastJobStatus: string | null;
  maxBackups: number;
} {
  return {
    running: timer !== null,
    intervalHours: intervalMs / 3600000,
    lastRunAt,
    lastJobId,
    lastJobStatus: lastJobId ? (getJob(lastJobId)?.status ?? null) : null,
    maxBackups: MAX_BACKUPS,
  };
}
