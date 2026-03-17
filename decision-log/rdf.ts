import type { DecisionRecord } from "./types.ts";

const CONTEXT = {
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

/**
 * Build JSON-LD for a decision record.
 *
 * Modeled as prov:Activity (the decision-making act)
 * linked to the project (prov:used) and session (prov:wasAssociatedWith).
 */
export function buildDecisionJsonLd(r: DecisionRecord): object {
  const doc: Record<string, unknown> = {
    "@context": CONTEXT,
    "@id": `urn:pi:${r._id}`,
    "@type": "prov:Activity",
    "prov:used": { "@id": `urn:pi:${r.project_id}` },
    "prov:wasAssociatedWith": {
      "@type": "foaf:Agent",
      "foaf:name": r.agent ?? "pi-agent",
    },
    "ev:sessionId": r.session_id,
    "ev:task": r.task,
    "ev:what": r.what,
    "ev:outcome": r.outcome,
    "ev:why": r.why,
    "ev:ts": { "@value": String(r.ts), "@type": "xsd:long" },
  };
  if (r.files) doc["ev:files"] = JSON.parse(r.files);
  if (r.alternatives) doc["ev:alternatives"] = r.alternatives;
  if (r.tags) doc["ev:tags"] = JSON.parse(r.tags);
  return doc;
}
