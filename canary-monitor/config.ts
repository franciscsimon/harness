import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CanaryThresholds {
  toolFailureRate: number;     // fraction, default 0.3
  maxTurnsPerRun: number;      // default 5
  contextBloatBytes: number;   // default 100_000
  retryStormCount: number;     // default 3
  maxDurationMs: number;       // default 600_000 (10 min)
  maxToolsPerTurn: number;     // default 8
}

const DEFAULTS: CanaryThresholds = {
  toolFailureRate: 0.3,
  maxTurnsPerRun: 5,
  contextBloatBytes: 100_000,
  retryStormCount: 3,
  maxDurationMs: 600_000,
  maxToolsPerTurn: 8,
};

export function loadCanaryConfig(): CanaryThresholds {
  const configPath = join(process.env.HOME ?? "~", ".pi", "agent", "canary-monitor.json");
  if (!existsSync(configPath)) return { ...DEFAULTS };

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return { ...DEFAULTS, ...(raw.thresholds ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
