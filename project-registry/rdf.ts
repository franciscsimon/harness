import type { ProjectRecord, SessionProjectRecord } from "./types.ts";

const CONTEXT = {
  doap: "http://usefulinc.com/ns/doap#",
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

/**
 * Build JSON-LD document for a project record (doap:Project).
 */
export function buildProjectJsonLd(r: ProjectRecord): object {
  const doc: Record<string, unknown> = {
    "@context": CONTEXT,
    "@id": `urn:pi:${r._id}`,
    "@type": "doap:Project",
    "doap:name": r.name,
    "ev:identityType": r.identity_type,
    "ev:canonicalId": r.canonical_id,
    "ev:firstSeenTs": { "@value": String(r.first_seen_ts), "@type": "xsd:long" },
    "ev:lastSeenTs": { "@value": String(r.last_seen_ts), "@type": "xsd:long" },
    "ev:sessionCount": { "@value": String(r.session_count), "@type": "xsd:integer" },
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
    "@context": CONTEXT,
    "@id": `urn:pi:${r._id}`,
    "@type": "prov:Activity",
    "prov:used": { "@id": `urn:pi:${r.project_id}` },
    "prov:wasAssociatedWith": {
      "@type": "foaf:Agent",
      "foaf:name": "pi-agent",
    },
    "ev:sessionId": r.session_id,
    "ev:cwd": r.cwd,
    "ev:ts": { "@value": String(r.ts), "@type": "xsd:long" },
    "ev:isFirstSession": { "@value": String(r.is_first_session), "@type": "xsd:boolean" },
  };
}
