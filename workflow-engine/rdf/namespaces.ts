/** Schema.org vocabulary */
export const SCHEMA = "https://schema.org/";

/** PROV-O — W3C Provenance Ontology */
export const PROV = "http://www.w3.org/ns/prov#";

/** Pi.dev events vocabulary (custom predicates) */
export const EV = "https://pi.dev/events/";

/** W3C RDF syntax */
export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/** W3C XML Schema datatypes */
export const XSD = "http://www.w3.org/2001/XMLSchema#";

/** JSON-LD @context for workflow documents */
export const JSONLD_CONTEXT = {
  schema: SCHEMA,
  prov: PROV,
  ev: EV,
  xsd: XSD,
  rdf: RDF,
};
