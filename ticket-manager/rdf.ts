// ─── Ticket JSON-LD Builder ──────────────────────────────────
// Builds JSON-LD provenance documents for tickets.

import type { TicketRecord } from "./types.ts";

const STATUS_TO_SCHEMA: Record<string, string> = {
  backlog: "schema:PotentialActionStatus",
  todo: "schema:PotentialActionStatus",
  in_progress: "schema:ActiveActionStatus",
  review: "schema:ActiveActionStatus",
  done: "schema:CompletedActionStatus",
  cancelled: "schema:FailedActionStatus",
};

export function buildTicketJsonLd(ticket: TicketRecord): object {
  return {
    "@context": {
      ev: "https://pi.dev/events/",
      prov: "http://www.w3.org/ns/prov#",
      schema: "https://schema.org/",
      code: "https://pi.dev/code/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
    "@id": `urn:pi:${ticket._id}`,
    "@type": ["schema:Action", "code:Ticket"],
    "schema:name": ticket.title,
    "schema:description": ticket.description,
    "schema:actionStatus": STATUS_TO_SCHEMA[ticket.status] ?? "schema:PotentialActionStatus",
    "ev:priority": ticket.priority,
    "ev:kind": ticket.kind,
    "ev:labels": ticket.labels,
    "ev:source": ticket.source,
    "schema:agent": ticket.assignee
      ? { "@type": "prov:SoftwareAgent", "schema:name": ticket.assignee }
      : null,
    "prov:wasAssociatedWith": ticket.session_id
      ? { "@id": `urn:pi:${ticket.session_id}` }
      : null,
    "prov:atLocation": { "@id": `urn:pi:${ticket.project_id}` },
    "prov:generatedAtTime": {
      "@value": new Date(ticket.ts).toISOString(),
      "@type": "xsd:dateTime",
    },
    "code:blockedBy": ticket.blocked_by.map((id) => ({ "@id": `urn:pi:${id}` })),
  };
}
