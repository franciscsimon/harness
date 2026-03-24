import pino from "pino";

export function createLogger(component: string, opts?: { level?: string }) {
  return pino({
    name: component,
    level: opts?.level ?? process.env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
