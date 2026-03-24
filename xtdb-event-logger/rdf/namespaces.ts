/**
 * RDF namespace URIs used throughout the event logger.
 * Every triple predicate and type is built from these.
 *
 * Re-exported from shared lib — see lib/jsonld/context.ts
 */
import { JSONLD_CONTEXT, NS } from "../../lib/jsonld/context.ts";

/** Pi.dev events vocabulary */
export const EV = NS.ev;

/** W3C RDF syntax */
export const RDF = NS.rdf;

/** W3C XML Schema datatypes */
export const XSD = NS.xsd;

/** Schema.org vocabulary */
export const SCHEMA = NS.schema;

/** DOAP — Description of a Project */
export const DOAP = NS.doap;

/** PROV-O — W3C Provenance Ontology */
export const PROV = NS.prov;

/** FOAF — Friend of a Friend (agent identity) */
export const FOAF = NS.foaf;

/**
 * JSON-LD @context object for serialization.
 * Used by rdf/serialize.ts when producing JSON-LD output.
 */
export { JSONLD_CONTEXT };
