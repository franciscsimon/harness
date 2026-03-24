// ─── Complexity Tracker ──────────────────────────────────────
// Stores per-function complexity scores in XTDB on every CI run (Phase 2.2).
// Enables trend analysis: "is complexity increasing over time?"

import { connectXtdb } from "../../lib/db.ts";
import type { CheckResult } from "../types.ts";

export interface ComplexityRecord {
  module: string;
  functionName: string;
  complexity: number;
  commitHash: string;
  repo: string;
  timestamp: number;
}

/**
 * Extract complexity scores from a completed complexity check result
 * and store them in XTDB for trend tracking.
 */
export async function storeComplexityScores(
  check: CheckResult,
  meta: { repo: string; commitHash: string },
): Promise<number> {
  if (check.name !== "complexity" || check.findings.length === 0) return 0;

  let sql;
  try {
    sql = connectXtdb({ max: 1 });
  } catch {
    return 0; // XTDB not available — skip silently
  }

  let stored = 0;
  try {
    for (const f of check.findings) {
      // Parse "functionName: cyclomatic complexity N (max M)" from finding message
      const match = f.message.match(/^(\w+):\s*cyclomatic complexity (\d+)/);
      if (!match) continue;

      const record: ComplexityRecord = {
        module: f.file,
        functionName: match[1],
        complexity: Number(match[2]),
        commitHash: meta.commitHash,
        repo: meta.repo,
        timestamp: Date.now(),
      };

      await sql`
        INSERT INTO complexity_scores (_id, module, function_name, complexity, commit_hash, repo, ts, _valid_from)
        VALUES (
          ${`cx-${record.module}-${record.functionName}-${record.timestamp}`},
          ${record.module},
          ${record.functionName},
          ${record.complexity},
          ${record.commitHash},
          ${record.repo},
          ${record.timestamp},
          CURRENT_TIMESTAMP
        )`;
      stored++;
    }
  } catch {
    /* best effort — don't fail the gate because of storage issues */
  } finally {
    await sql.end();
  }

  return stored;
}

/**
 * Get complexity trend for a module over time.
 * Returns average complexity per commit (most recent first).
 */
export async function getComplexityTrend(
  module: string,
  limit = 20,
): Promise<Array<{ commitHash: string; avgComplexity: number; timestamp: number }>> {
  let sql;
  try {
    sql = connectXtdb({ max: 1 });
  } catch {
    return [];
  }

  try {
    const rows = await sql`
      SELECT commit_hash, AVG(complexity) as avg_complexity, MAX(ts) as ts
      FROM complexity_scores
      WHERE module = ${module}
      GROUP BY commit_hash
      ORDER BY ts DESC
      LIMIT ${limit}`;
    return rows.map((r: any) => ({
      commitHash: r.commit_hash,
      avgComplexity: Math.round(Number(r.avg_complexity) * 10) / 10,
      timestamp: Number(r.ts),
    }));
  } finally {
    await sql.end();
  }
}
