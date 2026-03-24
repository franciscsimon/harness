// ─── Regression Detector ─────────────────────────────────────
// Compares error rates before/after a deployment to detect regressions (Phase 6.5).
// Triggered by docker-event-collector detecting new container `create` events.

import { connectXtdb } from "./db.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("regression-detector");
const REGRESSION_MULTIPLIER = 3; // 3x increase = regression
const WINDOW_MINUTES = 30;

export interface RegressionAlert {
  component: string;
  beforeRate: number;
  afterRate: number;
  multiplier: number;
  deployTimestamp: number;
  severity: "high";
}

/**
 * Check for error rate regression after a deployment.
 * Compares error count in WINDOW_MINUTES before vs after deployTimestamp.
 */
export async function checkRegression(
  component: string,
  deployTimestamp: number,
): Promise<RegressionAlert | null> {
  let sql;
  try {
    sql = connectXtdb({ max: 1 });
  } catch {
    return null;
  }

  try {
    const windowMs = WINDOW_MINUTES * 60_000;
    const beforeStart = deployTimestamp - windowMs;
    const afterEnd = deployTimestamp + windowMs;

    const [beforeRows] = await sql`
      SELECT COUNT(*) as cnt FROM error_events
      WHERE component = ${component}
        AND ts >= ${beforeStart} AND ts < ${deployTimestamp}`;

    const [afterRows] = await sql`
      SELECT COUNT(*) as cnt FROM error_events
      WHERE component = ${component}
        AND ts >= ${deployTimestamp} AND ts < ${afterEnd}`;

    const beforeRate = Number(beforeRows?.cnt ?? 0);
    const afterRate = Number(afterRows?.cnt ?? 0);

    // Only alert if there are enough errors to be meaningful
    if (afterRate < 3) return null;

    const multiplier = beforeRate > 0 ? afterRate / beforeRate : afterRate;

    if (multiplier >= REGRESSION_MULTIPLIER) {
      const alert: RegressionAlert = {
        component,
        beforeRate,
        afterRate,
        multiplier: Math.round(multiplier * 10) / 10,
        deployTimestamp,
        severity: "high",
      };
      log.error(alert, `REGRESSION: ${component} error rate ${multiplier}x after deploy`);
      return alert;
    }

    return null;
  } catch (e: any) {
    log.warn({ component, err: e.message }, "Failed to check regression");
    return null;
  } finally {
    await sql.end();
  }
}
