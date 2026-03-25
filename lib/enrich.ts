/**
 * Fire-and-forget wrapper for knowledge graph enrichment.
 * Import this from any service to emit enrichment events without
 * coupling to the knowledge-graph module or risking failures.
 */

import { enrichFromEvent, type EnrichmentEvent } from "../knowledge-graph/enrichment.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("enrich");

let _sql: any = null;

/** Set the shared SQL connection for enrichment. Call once at service startup. */
export function initEnrichment(sql: any): void {
  _sql = sql;
}

/** Fire-and-forget: emit an enrichment event. Never throws. */
export function emitEnrichment(
  type: EnrichmentEvent["type"],
  data: Record<string, unknown>,
): void {
  if (!_sql) return;
  enrichFromEvent(_sql, { type, data, ts: Date.now() }).catch((err) => {
    log.warn({ err, type }, "enrichment failed (non-critical)");
  });
}
