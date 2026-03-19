import type { ProjectRecord, SessionProjectRecord } from "./types.ts";
import { JSONLD_CONTEXT, piId, piRef, xsdLong, xsdInt, xsdBool } from "../lib/jsonld/context.ts";

/**
 * Build JSON-LD document for a project record (doap:Project).
 */
export function buildProjectJsonLd(r: ProjectRecord): object {
  const doc: Record<string, unknown> = {
    "@context": JSONLD_CONTEXT,
    "@id": piId(r._id),
    "@type": "doap:Project",
    "doap:name": r.name,
    "ev:identityType": r.identity_type,
    "ev:canonicalId": r.canonical_id,
    "prov:generatedAtTime": xsdLong(r.first_seen_ts),
    "schema:dateModified": xsdLong(r.last_seen_ts),
    "ev:sessionCount": xsdInt(r.session_count),
    "schema:creativeWorkStatus": r.lifecycle_phase,
  };

  if (r.git_remote_url) {
    doc["doap:repository"] = {
      "@type": "doap:GitRepository",
      "doap:location": r.git_remote_url,
    };
  }

  return doc;
}

/**
 * Build JSON-LD document for a session-project link (prov:Activity).
 */
export function buildSessionProjectJsonLd(r: SessionProjectRecord): object {
  return {
    "@context": JSONLD_CONTEXT,
    "@id": piId(r._id),
    "@type": "prov:Activity",
    "prov:used": piRef(r.project_id),
    "prov:wasAssociatedWith": {
      "@type": "foaf:Agent",
      "foaf:name": "pi-agent",
    },
    "ev:sessionId": r.session_id,
    "ev:cwd": r.cwd,
    "ev:ts": xsdLong(r.ts),
    "ev:isFirstSession": xsdBool(r.is_first_session),
  };
}
