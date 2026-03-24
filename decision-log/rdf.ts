import { JSONLD_CONTEXT, piId, piRef, xsdLong } from "../lib/jsonld/context.ts";
import type { DecisionRecord } from "./types.ts";

/**
 * Build JSON-LD for a decision record.
 *
 * Modeled as prov:Activity (the decision-making act)
 * linked to the project (prov:used) and session (prov:wasAssociatedWith).
 */
export function buildDecisionJsonLd(r: DecisionRecord): object {
  const doc: Record<string, unknown> = {
    "@context": JSONLD_CONTEXT,
    "@id": piId(r._id),
    "@type": "prov:Activity",
    "prov:used": piRef(r.project_id),
    "prov:wasAssociatedWith": {
      "@type": "foaf:Agent",
      "foaf:name": r.agent ?? "pi-agent",
    },
    "ev:sessionId": r.session_id,
    "ev:task": r.task,
    "ev:what": r.what,
    "ev:outcome": r.outcome,
    "ev:why": r.why,
    "ev:ts": xsdLong(typeof r.ts === "string" ? Number(r.ts) : r.ts),
  };
  if (r.files) doc["ev:files"] = JSON.parse(r.files);
  if (r.alternatives) doc["ev:alternatives"] = r.alternatives;
  if (r.tags) doc["ev:tags"] = JSON.parse(r.tags);
  return doc;
}
