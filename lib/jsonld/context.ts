export const NS = {
  ev: "https://pi.dev/events/",
  prov: "http://www.w3.org/ns/prov#",
  schema: "https://schema.org/",
  doap: "http://usefulinc.com/ns/doap#",
  foaf: "http://xmlns.com/foaf/0.1/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  code: "https://pi.dev/code/",
} as const;

export const JSONLD_CONTEXT: Record<string, string> = { ...NS };

export function piId(dbId: string): string {
  return `urn:pi:${dbId}`;
}

export function piRef(dbId: string): { "@id": string } {
  return { "@id": piId(dbId) };
}

export function xsdLong(v: number): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:long" };
}

export function xsdInt(v: number): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:integer" };
}

export function xsdBool(v: boolean): { "@value": string; "@type": string } {
  return { "@value": String(v), "@type": "xsd:boolean" };
}

export function softwareAgent(name: string): Record<string, unknown> {
  return { "@type": "prov:SoftwareAgent", "schema:name": name };
}

export function personAgent(name: string): Record<string, unknown> {
  return { "@type": "foaf:Person", "foaf:name": name };
}
