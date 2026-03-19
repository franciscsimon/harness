// ─── Session Health Score ───────────────────────────────────────
// Pure functions — no DB dependencies. Easy to test.

export interface HealthInput {
  errorRate: number;       // 0–1
  turnCount: number;       // turns in session
  maxPayloadBytes: number; // peak provider_payload_bytes
  durationMs: number;      // session duration
}

/**
 * Compute a 0–100 health score.
 * Higher = healthier. Weights:
 *   errorRate:  40%  (0% errors = 40 pts, 50%+ = 0 pts)
 *   turns:      25%  (1–3 turns = 25 pts, 10+ = 0 pts)
 *   context:    20%  (< 50KB = 20 pts, 400KB+ = 0 pts)
 *   duration:   15%  (< 2min = 15 pts, 15min+ = 0 pts)
 */
export function computeHealthScore(input: HealthInput): number {
  const errorPts = Math.max(0, 40 - (input.errorRate * 80));
  const turnPts = Math.max(0, 25 - Math.max(0, input.turnCount - 3) * (25 / 7));
  const ctxPts = Math.max(0, 20 - (input.maxPayloadBytes / 400_000) * 20);
  const durPts = Math.max(0, 15 - (input.durationMs / 900_000) * 15);

  return Math.round(Math.min(100, errorPts + turnPts + ctxPts + durPts));
}

/**
 * Map score to color.
 */
export function healthColor(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

/**
 * Human-readable health label.
 */
export function healthLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 40) return "Fair";
  return "Struggling";
}
