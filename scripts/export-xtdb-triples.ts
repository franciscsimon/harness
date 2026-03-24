/**
 * export-xtdb-triples.ts — Export all XTDB JSON-LD + call graph to Turtle
 *
 * 1. Reads jsonld column from all XTDB tables that have it
 * 2. Reads data/call-graph.jsonld (AST call graph)
 * 3. Converts everything to N-Triples/Turtle format
 * 4. Writes data/harness-graph.ttl
 *
 * Run: NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import postgres from "postgres";

const ROOT = path.resolve(__dirname, "..");
const CALL_GRAPH = path.join(ROOT, "data", "call-graph.jsonld");
const OUT = path.join(ROOT, "data", "harness-graph.ttl");

// All tables with jsonld columns
const TABLES = [
  "projects",
  "session_projects",
  "project_dependencies",
  "project_tags",
  "decommission_records",
  "decisions",
  "session_postmortems",
  "delegations",
  "artifacts",
  "artifact_versions",
  "workflow_runs",
  "workflow_step_runs",
  "requirements",
  "releases",
  "deployments",
  "test_runs",
  "environments",
  "backup_records",
  "incidents",
  "errors",
  "ci_runs",
  "docker_events",
];

// Namespace prefixes for Turtle
const PREFIXES: Record<string, string> = {
  schema: "https://schema.org/",
  code: "https://pi.dev/code/",
  ev: "https://pi.dev/events/",
  doap: "http://usefulinc.com/ns/doap#",
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
};

// ---- JSON-LD to N-Triples conversion ----

function expandPrefix(value: string): string {
  if (value.startsWith("urn:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const colon = value.indexOf(":");
  if (colon > 0) {
    const prefix = value.substring(0, colon);
    const local = value.substring(colon + 1);
    if (PREFIXES[prefix]) {
      return PREFIXES[prefix] + local;
    }
  }
  return value;
}

function escTurtle(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function iri(v: string): string {
  return `<${expandPrefix(v)}>`;
}

function literal(v: string, datatype?: string): string {
  if (datatype) {
    return `"${escTurtle(v)}"^^${iri(datatype)}`;
  }
  return `"${escTurtle(v)}"`;
}

/**
 * Convert a single JSON-LD node (from @graph or top-level) to N-Triple lines.
 * Handles simple flat JSON-LD — not a full JSON-LD processor.
 */
function jsonldNodeToTriples(node: any, _context?: Record<string, any>): string[] {
  const triples: string[] = [];
  const id = node["@id"];
  if (!id) return triples;

  const subj = iri(id);

  // @type
  const types = Array.isArray(node["@type"]) ? node["@type"] : node["@type"] ? [node["@type"]] : [];
  for (const t of types) {
    triples.push(`${subj} ${iri("rdf:type")} ${iri(t)} .`);
  }

  for (const [key, val] of Object.entries(node)) {
    if (key === "@id" || key === "@type" || key === "@context") continue;

    const pred = iri(key);

    if (val === null || val === undefined) continue;

    if (Array.isArray(val)) {
      for (const item of val) {
        const t = emitValue(subj, pred, item);
        if (t) triples.push(...t);
      }
    } else {
      const t = emitValue(subj, pred, val);
      if (t) triples.push(...t);
    }
  }

  return triples;
}

function emitValue(subj: string, pred: string, val: any): string[] | null {
  if (val === null || val === undefined) return null;

  // Reference: { "@id": "..." }
  if (typeof val === "object" && val["@id"]) {
    // If the object has more than just @id, it's a blank node / nested entity
    const keys = Object.keys(val).filter((k) => k !== "@id");
    if (keys.length === 0) {
      return [`${subj} ${pred} ${iri(val["@id"])} .`];
    }
    // Nested object with @id — emit as separate entity + link
    const triples = [`${subj} ${pred} ${iri(val["@id"])} .`];
    triples.push(...jsonldNodeToTriples(val));
    return triples;
  }

  // Typed literal: { "@value": "...", "@type": "..." }
  if (typeof val === "object" && val["@value"] !== undefined) {
    const dt = val["@type"] ? expandPrefix(val["@type"]) : undefined;
    return [`${subj} ${pred} ${literal(String(val["@value"]), dt)} .`];
  }

  // Plain object without @id — serialize as blank node with properties
  if (typeof val === "object" && !Array.isArray(val)) {
    // If it has @type but no @id, generate a blank node
    if (val["@type"]) {
      const bnode = `_:b${bnodeCounter++}`;
      const triples = [`${subj} ${pred} ${bnode} .`];
      const types = Array.isArray(val["@type"]) ? val["@type"] : [val["@type"]];
      for (const t of types) {
        triples.push(`${bnode} ${iri("rdf:type")} ${iri(t)} .`);
      }
      for (const [k, v] of Object.entries(val)) {
        if (k === "@type") continue;
        const nested = emitValue(bnode, iri(k), v);
        if (nested) triples.push(...nested);
      }
      return triples;
    }
    // Skip untyped nested objects
    return null;
  }

  // Primitive values
  if (typeof val === "string") {
    return [`${subj} ${pred} ${literal(val)} .`];
  }
  if (typeof val === "number") {
    const dt = Number.isInteger(val) ? "xsd:integer" : "xsd:decimal";
    return [`${subj} ${pred} ${literal(String(val), expandPrefix(dt))} .`];
  }
  if (typeof val === "boolean") {
    return [`${subj} ${pred} ${literal(String(val), expandPrefix("xsd:boolean"))} .`];
  }

  return null;
}

let bnodeCounter = 0;

// ---- Main ----

async function main() {
  const sql = postgres({
    host: "localhost",
    port: 5434, // replica (read-only)
    database: "xtdb",
    username: "xtdb",
    password: process.env.XTDB_PASSWORD ?? "xtdb",
    idle_timeout: 5,
    max: 2,
  });

  const allTriples: string[] = [];
  let xtdbDocCount = 0;

  // 1. Export from XTDB tables
  for (const table of TABLES) {
    try {
      const rows = await sql.unsafe(`SELECT _id, jsonld FROM ${table} WHERE jsonld IS NOT NULL AND jsonld != ''`);
      let tableCount = 0;

      for (const row of rows) {
        try {
          const doc = typeof row.jsonld === "string" ? JSON.parse(row.jsonld) : row.jsonld;
          if (doc["@graph"]) {
            // Document with @graph array
            for (const node of doc["@graph"]) {
              allTriples.push(...jsonldNodeToTriples(node, doc["@context"]));
            }
          } else {
            allTriples.push(...jsonldNodeToTriples(doc));
          }
          tableCount++;
        } catch (_e) {
          // Skip malformed JSON-LD rows
        }
      }

      if (tableCount > 0) {
        xtdbDocCount += tableCount;
      }
    } catch (_e) {}
  }

  await sql.end();

  // 2. Load AST call graph
  let callGraphNodes = 0;
  if (fs.existsSync(CALL_GRAPH)) {
    const doc = JSON.parse(fs.readFileSync(CALL_GRAPH, "utf-8"));
    if (doc["@graph"]) {
      for (const node of doc["@graph"]) {
        allTriples.push(...jsonldNodeToTriples(node, doc["@context"]));
      }
      callGraphNodes = doc["@graph"].length;
    }
    // Also emit the graph metadata entity itself
    const meta = { ...doc };
    delete meta["@graph"];
    delete meta["@context"];
    allTriples.push(...jsonldNodeToTriples(meta));
  } else {
  }

  // 3. Deduplicate and write Turtle
  const uniqueTriples = [...new Set(allTriples)];

  // Write with prefix declarations
  const prefixLines = Object.entries(PREFIXES)
    .map(([p, u]) => `@prefix ${p}: <${u}> .`)
    .join("\n");

  const output = `${prefixLines}\n\n# Generated: ${new Date().toISOString()}\n# XTDB documents: ${xtdbDocCount}\n# Call graph nodes: ${callGraphNodes}\n# Total triples: ${uniqueTriples.length}\n\n${uniqueTriples.join("\n")}\n`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, output, "utf-8");
}

main().catch((_e) => {
  process.exit(1);
});
