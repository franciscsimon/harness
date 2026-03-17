/**
 * RDF namespace URIs used throughout the event logger.
 * Every triple predicate and type is built from these.
 */

/** Pi.dev events vocabulary */
export const EV = "https://pi.dev/events/";

/** W3C RDF syntax */
export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/** W3C XML Schema datatypes */
export const XSD = "http://www.w3.org/2001/XMLSchema#";

/** Schema.org vocabulary */
export const SCHEMA = "https://schema.org/";

/** DOAP — Description of a Project */
export const DOAP = "http://usefulinc.com/ns/doap#";

/** PROV-O — W3C Provenance Ontology */
export const PROV = "http://www.w3.org/ns/prov#";

/** FOAF — Friend of a Friend (agent identity) */
export const FOAF = "http://xmlns.com/foaf/0.1/";

/**
 * JSON-LD @context object for serialization.
 * Used by rdf/serialize.ts when producing JSON-LD output.
 */
export const JSONLD_CONTEXT = {
  ev: EV,
  rdf: RDF,
  xsd: XSD,
  schema: SCHEMA,
  doap: DOAP,
  prov: PROV,
  foaf: FOAF,
};
