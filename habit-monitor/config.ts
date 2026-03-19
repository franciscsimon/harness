import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface HabitThresholds {
  commitReminderEdits: number;    // default 5
  testReminderEdits: number;      // default 5
  errorStreakCount: number;        // default 3
  freshStartBytes: number;         // default 150_000
  scopeCreepFiles: number;         // default 8
}

const DEFAULTS: HabitThresholds = {
  commitReminderEdits: 5,
  testReminderEdits: 5,
  errorStreakCount: 3,
  freshStartBytes: 800_000,
  scopeCreepFiles: 8,
};

export interface HabitConfig {
  thresholds: HabitThresholds;
  enabled: Record<string, boolean>;
}

export function loadHabitConfig(): HabitConfig {
  const configPath = join(process.env.HOME ?? "~", ".pi", "agent", "habit-monitor.json");
  const defaults: HabitConfig = {
    thresholds: { ...DEFAULTS },
    enabled: {
      "commit-reminder": true,
      "test-reminder": true,
      "error-streak": true,
      "fresh-start": true,
      "scope-creep": true,
    },
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      thresholds: { ...DEFAULTS, ...(raw.thresholds ?? {}) },
      enabled: { ...defaults.enabled, ...(raw.enabled ?? {}) },
    };
  } catch {
    return defaults;
  }
}
