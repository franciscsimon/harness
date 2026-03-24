/**
 * RDF-based workflow loader.
 *
 * Loads .jsonld workflow definitions via proper JSON-LD expansion,
 * converts to N-Quads, and parses into an N3 Store for graph queries.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as jsonld from "jsonld";
import { DataFactory, Parser, Store } from "n3";
import { EV, RDF, SCHEMA } from "./namespaces.ts";

const { namedNode } = DataFactory;

// ─── Types ────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string; // URN e.g. urn:pi:workflow:feature-build/step/explore
  name: string; // Human label
  description: string;
  position: number; // 1-based order
  actionType: string; // Full IRI e.g. https://schema.org/SearchAction
  agentRole: string; // Agent role name e.g. "explorer"
  skill?: string; // Optional skill name
  promptTemplate: string; // Prompt with {task}, {cwd}, {context} placeholders
  transitionMode: string; // "user" or "auto"
  nextStepId?: string; // @id of next step via schema:potentialAction
}

export interface WorkflowDef {
  id: string; // URN e.g. urn:pi:workflow:feature-build
  name: string;
  description: string;
  steps: WorkflowStep[];
  rawJsonLd: string; // Original JSON-LD string for XTDB storage
}

// ─── Loading ──────────────────────────────────────────────────────

/**
 * Load a single .jsonld workflow file into a WorkflowDef.
 * Uses jsonld library for proper @context expansion → N-Quads → N3 Store.
 */
export async function loadWorkflowFile(filePath: string): Promise<WorkflowDef> {
  const rawText = readFileSync(filePath, "utf-8");
  const doc = JSON.parse(rawText);

  // Proper JSON-LD → RDF conversion
  const nquads = (await jsonld.toRDF(doc, { format: "application/n-quads" })) as string;

  const store = new Store();
  const parser = new Parser({ format: "N-Quads" });
  store.addQuads(parser.parse(nquads));

  // Find the workflow subject (rdf:type schema:HowTo)
  const howToType = namedNode(`${SCHEMA}HowTo`);
  const rdfType = namedNode(`${RDF}type`);
  const workflows = store.getSubjects(rdfType, howToType, null);

  if (workflows.length === 0) {
    throw new Error(`No schema:HowTo found in ${filePath}`);
  }

  const wfSubject = workflows[0];
  const wfId = wfSubject.value;

  const name = getStringValue(store, wfSubject, `${SCHEMA}name`) ?? "";
  const description = getStringValue(store, wfSubject, `${SCHEMA}description`) ?? "";

  // Extract steps
  const stepNodes = store.getObjects(wfSubject, namedNode(`${SCHEMA}step`), null);
  const steps: WorkflowStep[] = [];

  for (const stepNode of stepNodes) {
    const stepId = stepNode.value;

    // Get action type (most specific rdf:type that isn't just schema:Action)
    const types = store.getObjects(stepNode, rdfType, null).map((t) => t.value);
    const actionType = types.find((t) => t !== `${SCHEMA}Action` && t.startsWith(SCHEMA)) ?? `${SCHEMA}Action`;

    // Get agent role: schema:agent → extract role name from URN
    const agentObj = store.getObjects(stepNode, namedNode(`${SCHEMA}agent`), null)[0];
    const agentRole = agentObj ? agentObj.value.replace("urn:pi:agent:", "") : "";

    // Get instrument (skill): schema:instrument → extract skill name from URN
    const instrObj = store.getObjects(stepNode, namedNode(`${SCHEMA}instrument`), null)[0];
    const skill = instrObj ? instrObj.value.replace("urn:pi:skill:", "") : undefined;

    // Get potentialAction (next step)
    const nextObj = store.getObjects(stepNode, namedNode(`${SCHEMA}potentialAction`), null)[0];
    const nextStepId = nextObj?.value;

    steps.push({
      id: stepId,
      name: getStringValue(store, stepNode, `${SCHEMA}name`) ?? "",
      description: getStringValue(store, stepNode, `${SCHEMA}description`) ?? "",
      position: getIntValue(store, stepNode, `${SCHEMA}position`) ?? 0,
      actionType,
      agentRole,
      skill,
      promptTemplate: getStringValue(store, stepNode, `${EV}promptTemplate`) ?? "",
      transitionMode: getStringValue(store, stepNode, `${EV}transitionMode`) ?? "user",
      nextStepId,
    });
  }

  // Sort by position
  steps.sort((a, b) => a.position - b.position);

  return { id: wfId, name, description, steps, rawJsonLd: rawText };
}

/**
 * Load all .jsonld workflows from a directory.
 */
export async function loadWorkflowDir(dirPath: string): Promise<Map<string, WorkflowDef>> {
  const workflows = new Map<string, WorkflowDef>();
  let files: string[];
  try {
    files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonld"));
  } catch {
    return workflows; // Directory doesn't exist yet — not an error
  }

  for (const file of files) {
    try {
      const def = await loadWorkflowFile(join(dirPath, file));
      workflows.set(def.name, def);
    } catch (_err: any) {}
  }
  return workflows;
}

// ─── RDF helpers ──────────────────────────────────────────────────

function getStringValue(store: Store, subject: any, predicate: string): string | undefined {
  const objs = store.getObjects(subject, namedNode(predicate), null);
  return objs.length > 0 ? objs[0].value : undefined;
}

function getIntValue(store: Store, subject: any, predicate: string): number | undefined {
  const v = getStringValue(store, subject, predicate);
  return v != null ? parseInt(v, 10) : undefined;
}
