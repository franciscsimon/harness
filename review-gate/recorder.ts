/**
 * Review Gate — XTDB Recorder
 *
 * Writes review results to XTDB as JSON-LD documents.
 * Phase C.3 + Phase F: Review & Quality Data
 */

import { randomUUID } from "node:crypto";

type Sql = ReturnType<typeof import("postgres").default>;

export interface ReviewResult {
  repo: string;
  commitHash: string;
  securityPassed: boolean;
  stylePassed: boolean;
  complexityPassed: boolean;
  overallPassed: boolean;
  details: Record<string, unknown>;
}

/** Store a review report in XTDB with JSON-LD. */
export async function recordReviewReport(sql: Sql, result: ReviewResult): Promise<string> {
  const id = `review:${result.commitHash.slice(0, 8)}:${Date.now()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": {
      schema: "https://schema.org/",
      harness: "https://harness.local/vocab/",
    },
    "@type": "harness:ReviewReport",
    "@id": id,
    "schema:dateCreated": new Date(now).toISOString(),
    "harness:repo": result.repo,
    "harness:commitHash": result.commitHash,
    "harness:securityPassed": result.securityPassed,
    "harness:stylePassed": result.stylePassed,
    "harness:complexityPassed": result.complexityPassed,
    "harness:overallPassed": result.overallPassed,
  });

  await sql`INSERT INTO review_reports
    (_id, repo, commit_hash, security_passed, style_passed, complexity_passed,
     overall_passed, details_json, ts, jsonld, _valid_from)
    VALUES (${id}, ${result.repo}, ${result.commitHash},
      ${result.securityPassed}, ${result.stylePassed}, ${result.complexityPassed},
      ${result.overallPassed}, ${JSON.stringify(result.details)}, ${now}, ${jsonld},
      CURRENT_TIMESTAMP)`;

  return id;
}

/** Get recent review reports for a repo. */
export async function getReviewHistory(sql: Sql, repo: string, limit = 20): Promise<any[]> {
  return await sql`SELECT * FROM review_reports WHERE repo = ${repo} ORDER BY ts DESC LIMIT ${limit}`;
}
