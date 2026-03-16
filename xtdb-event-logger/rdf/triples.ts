import { DataFactory } from "n3";
import type { NormalizedEvent } from "../types.ts";
import { getEnvironmentMeta } from "../env.ts";
import { EV, RDF, XSD, SCHEMA } from "./namespaces.ts";

const { namedNode, literal, blankNode, triple } = DataFactory;

// ─── Typed literal helpers ─────────────────────────────────────────

const xsdString = (v: string) => literal(v);
const xsdLong = (v: number) => literal(String(v), namedNode(`${XSD}long`));
const xsdInt = (v: number) => literal(String(v), namedNode(`${XSD}integer`));
const xsdBoolean = (v: boolean) => literal(String(v), namedNode(`${XSD}boolean`));

// ─── Event name → PascalCase type name ─────────────────────────────

function pascalType(eventName: string): string {
  return eventName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// ─── Main builder ──────────────────────────────────────────────────

/**
 * Convert a NormalizedEvent into an array of RDF triples.
 * Every field becomes a properly typed triple under the ev: namespace.
 * Environment metadata is attached as a blank node under schema:.
 */
export function eventToTriples(event: NormalizedEvent) {
  const s = namedNode(`urn:uuid:${event.id}`);
  const out = [];

  // ── rdf:type ──
  out.push(triple(s, namedNode(`${RDF}type`), namedNode(`${EV}${pascalType(event.eventName)}`)));

  // ── Core fields (always present) ──
  out.push(triple(s, namedNode(`${EV}eventName`), xsdString(event.eventName)));
  out.push(triple(s, namedNode(`${EV}category`), xsdString(event.category)));
  out.push(triple(s, namedNode(`${EV}canIntercept`), xsdBoolean(event.canIntercept)));
  out.push(triple(s, namedNode(`${EV}schemaVersion`), xsdInt(event.schemaVersion)));
  out.push(triple(s, namedNode(`${EV}timestamp`), xsdLong(event.ts)));
  out.push(triple(s, namedNode(`${EV}seq`), xsdLong(event.seq)));
  out.push(triple(s, namedNode(`${EV}environment`), xsdString("pi.dev")));

  if (event.sessionId != null) {
    out.push(triple(s, namedNode(`${EV}sessionId`), xsdString(event.sessionId)));
  }
  if (event.cwd != null) {
    out.push(triple(s, namedNode(`${EV}cwd`), xsdString(event.cwd)));
  }

  // ── Event-specific fields (skip null/undefined) ──
  const f = event.fields;

  const str = (pred: string, val?: string | null) => {
    if (val != null) out.push(triple(s, namedNode(`${EV}${pred}`), xsdString(val)));
  };
  const num = (pred: string, val?: number | null) => {
    if (val != null) out.push(triple(s, namedNode(`${EV}${pred}`), xsdLong(val)));
  };
  const bool = (pred: string, val?: boolean | null) => {
    if (val != null) out.push(triple(s, namedNode(`${EV}${pred}`), xsdBoolean(val)));
  };

  // Session
  str("switchReason", f.switchReason);
  str("switchTarget", f.switchTarget);
  str("switchPrevious", f.switchPrevious);
  str("forkEntryId", f.forkEntryId);
  str("forkPrevious", f.forkPrevious);
  str("treeNewLeaf", f.treeNewLeaf);
  str("treeOldLeaf", f.treeOldLeaf);
  bool("treeFromExt", f.treeFromExt);
  str("eventCwd", f.eventCwd);

  // Compaction
  num("compactTokens", f.compactTokens);
  bool("compactFromExt", f.compactFromExt);

  // Agent
  str("promptText", f.promptText);
  num("agentEndMsgCount", f.agentEndMsgCount);
  num("turnIndex", f.turnIndex);
  num("turnTimestamp", f.turnTimestamp);
  num("turnEndToolCount", f.turnEndToolCount);

  // Message
  str("messageRole", f.messageRole);
  str("streamDeltaType", f.streamDeltaType);
  num("streamDeltaLen", f.streamDeltaLen);

  // Tool
  str("toolName", f.toolName);
  str("toolCallId", f.toolCallId);
  bool("isError", f.isError);
  num("contextMsgCount", f.contextMsgCount);
  num("providerPayloadBytes", f.providerPayloadBytes);

  // Input
  str("inputText", f.inputText);
  str("inputSource", f.inputSource);
  bool("inputHasImages", f.inputHasImages);
  str("bashCommand", f.bashCommand);
  bool("bashExclude", f.bashExclude);

  // Model
  str("modelProvider", f.modelProvider);
  str("modelId", f.modelId);
  str("modelSource", f.modelSource);
  str("prevModelProvider", f.prevModelProvider);
  str("prevModelId", f.prevModelId);

  // Generic
  str("payload", f.payload);
  str("handlerError", f.handlerError);

  // ── Environment metadata (blank node) ──
  const env = getEnvironmentMeta();
  const envB = blankNode(`env_${event.id}`);
  out.push(triple(s, namedNode(`${EV}environmentMeta`), envB));
  out.push(triple(envB, namedNode(`${RDF}type`), namedNode(`${SCHEMA}SoftwareApplication`)));
  out.push(triple(envB, namedNode(`${SCHEMA}name`), xsdString("pi.dev")));
  out.push(triple(envB, namedNode(`${SCHEMA}version`), xsdString(env.piVersion)));
  out.push(triple(envB, namedNode(`${SCHEMA}operatingSystem`), xsdString(env.os)));
  out.push(triple(envB, namedNode(`${EV}arch`), xsdString(env.arch)));
  out.push(triple(envB, namedNode(`${EV}nodeVersion`), xsdString(env.nodeVersion)));
  out.push(triple(envB, namedNode(`${EV}hostname`), xsdString(env.hostname)));
  out.push(triple(envB, namedNode(`${EV}username`), xsdString(env.username)));

  return out;
}
