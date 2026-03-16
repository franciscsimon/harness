# IMPLEMENTATION.md — Event Handler Architecture & Code Plan (v2 — FINAL)

> Status: **APPROVED — ready to build**
> All discussion points resolved. Decisions locked.

---

## Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 10.1 | Handler file granularity | **30 individual files**, one per event |
| 10.2 | Endpoint configuration | **Config file + env vars** (env overrides file) |
| 10.3 | Fallback if endpoint down | **No fallback** — require at least one endpoint or refuse to start |
| 10.4 | JSON-LD | **Always** — every event is transformed eagerly |
| 10.5 | Handler merging | **No shortcuts** — every event gets its own handler, its own write |
| 10.6 | Handler error | **Write error row** to DB for debuggability |
| 10.7 | session_directory cwd | **Store both** `event.cwd` and `process.cwd()` |
| 10.8 | Schema versioning | **Yes** — `schema_version` column on every row |
| 10.9 | JSON-LD storage | **Always store** full JSON-LD document in a `jsonld` column |
| 10.10 | JSON-LD library | **N3.js (triples)** + **jsonld-streaming-serializer** — proper RDF/JS, no JSON shortcuts |

---

## Table of Contents

- [1. Design Principles](#1-design-principles)
- [2. RDF/JS Stack](#2-rdfjs-stack)
- [3. File Layout](#3-file-layout)
- [4. Core Types](#4-core-types)
- [5. Router](#5-router)
- [6. Per-Event Handler Functions (all 30)](#6-per-event-handler-functions-all-30)
- [7. Triple Builder (RDF)](#7-triple-builder-rdf)
- [8. JSON-LD Serialization](#8-json-ld-serialization)
- [9. Endpoint Abstraction](#9-endpoint-abstraction)
- [10. Configuration](#10-configuration)
- [11. Extension Entry Point](#11-extension-entry-point)
- [12. Module Dependency Graph](#12-module-dependency-graph)
- [13. Implementation Sequence](#13-implementation-sequence)

---

## 1. Design Principles

| Principle | How |
|-----------|-----|
| **One file per event** | 30 handler files. Small, focused, independently editable. |
| **Router dispatches, never extracts** | Static table maps name → handler. Zero field knowledge. |
| **Handlers return `EventFields`** | Pure, sync, no I/O. The handler IS the validation layer. |
| **Triples, not quads** | RDF triples via N3.js `DataFactory.triple()`. No named graphs. |
| **JSON-LD via RDF/JS, not JSON hacks** | Build triples → serialize with `jsonld-streaming-serializer`. No `JSON.stringify` for JSON-LD. |
| **JSON-LD on every event** | `toJsonLd()` runs eagerly. Endpoints receive both `NormalizedEvent` and `jsonld` string. |
| **Endpoints are pluggable** | `Endpoint` interface. XTDB, JSONL, webhook, etc. At least one must succeed `init()` or extension refuses to start. |
| **No fallback** | If no endpoint initializes, handlers are never registered. Fail loud. |
| **Config file + env vars** | `~/.pi/agent/xtdb-event-logger.json` + `XTDB_HOST`, `XTDB_PORT`, etc. |
| **Schema versioned** | Every row has `schema_version`. Handlers change → bump version. |

---

## 2. RDF/JS Stack

### Verified working on this system

```
✅ n3@2.0.3              — DataFactory.triple(), namedNode(), literal(), blankNode()
✅ jsonld-streaming-serializer@4.0.0 — Transform stream: triples in → JSON-LD string out
✅ @rdfjs/types@2.0.1    — TypeScript type definitions for RDF/JS
```

### Why this stack

| Library | Role | Why |
|---------|------|-----|
| `n3` | Build triples | Battle-tested (2M+ weekly downloads), `DataFactory.triple()` is native |
| `jsonld-streaming-serializer` | Serialize triples → JSON-LD | Proper RDF/JS Sink interface, streaming, lightweight (80KB) |
| `@rdfjs/types` | TypeScript types | Authoritative RDF/JS type definitions |

**Not using:** `jsonld` (2.1MB, heavyweight), `rdf-ext` (19 deps, overkill), hand-rolled JSON (not semantic).

### package.json dependencies

```json
{
  "dependencies": {
    "postgres": "^3.4.8",
    "n3": "^2.0.3",
    "jsonld-streaming-serializer": "^4.0.0",
    "@rdfjs/types": "^2.0.1"
  }
}
```

---

## 3. File Layout

```
~/.pi/agent/extensions/xtdb-event-logger/
├── index.ts                          # Extension entry point
├── package.json
├── node_modules/
│
├── types.ts                          # NormalizedEvent, EventFields, Endpoint, etc.
├── router.ts                         # routeEvent() — dispatch table
├── util.ts                           # trunc(), uuid(), safeJsonSize()
├── config.ts                         # Load config file + env vars
├── env.ts                            # OS/runtime metadata (cached)
├── sampling.ts                       # Debounce for high-frequency events
│
├── rdf/
│   ├── namespaces.ts                 # EV, RDF, XSD, SCHEMA namespace URIs
│   ├── triples.ts                    # eventToTriples(NormalizedEvent) → Triple[]
│   └── serialize.ts                  # triplesToJsonLd(Triple[]) → Promise<string>
│
├── handlers/                         # 30 files, one per event
│   ├── session-directory.ts          # #1
│   ├── session-start.ts              # #2
│   ├── session-before-switch.ts      # #3
│   ├── session-switch.ts             # #4
│   ├── session-before-fork.ts        # #5
│   ├── session-fork.ts               # #6
│   ├── session-before-tree.ts        # #7
│   ├── session-tree.ts               # #8
│   ├── session-shutdown.ts           # #9
│   ├── session-before-compact.ts     # #10
│   ├── session-compact.ts            # #11
│   ├── before-agent-start.ts         # #12
│   ├── agent-start.ts                # #13
│   ├── agent-end.ts                  # #14
│   ├── turn-start.ts                 # #15
│   ├── turn-end.ts                   # #16
│   ├── message-start.ts              # #17
│   ├── message-update.ts             # #18
│   ├── message-end.ts                # #19
│   ├── tool-call.ts                  # #20
│   ├── tool-result.ts                # #21
│   ├── tool-execution-start.ts       # #22
│   ├── tool-execution-update.ts      # #23
│   ├── tool-execution-end.ts         # #24
│   ├── context.ts                    # #25
│   ├── before-provider-request.ts    # #26
│   ├── input.ts                      # #27
│   ├── user-bash.ts                  # #28
│   ├── model-select.ts               # #29
│   └── resources-discover.ts         # #30
│
└── endpoints/
    ├── xtdb.ts                       # XtdbEndpoint — postgres INSERT + jsonld column
    ├── jsonl.ts                       # JsonlEndpoint — append-only file
    └── console.ts                    # ConsoleEndpoint — debug logging
```

**52 source files total.** Each handler file is 15–35 lines.

---

## 4. Core Types

### `types.ts`

```typescript
import type { Triple } from 'n3';

export const SCHEMA_VERSION = 1;

// ─── Normalized Event Record ───────────────────────────────────────

export interface NormalizedEvent {
  id: string;                          // UUIDv4
  eventName: string;                   // verbatim pi event name
  category: EventCategory;
  canIntercept: boolean;
  schemaVersion: number;               // always SCHEMA_VERSION
  ts: number;                          // Date.now()
  seq: number;                         // monotonic counter
  sessionId: string | null;
  cwd: string | null;
  fields: EventFields;
}

export type EventCategory =
  | "session" | "compaction" | "agent" | "message"
  | "tool"   | "input"      | "model" | "resource";

export interface EventFields {
  // Session
  switchReason?:           string | null;
  switchTarget?:           string | null;
  switchPrevious?:         string | null;
  forkEntryId?:            string | null;
  forkPrevious?:           string | null;
  treeNewLeaf?:            string | null;
  treeOldLeaf?:            string | null;
  treeFromExt?:            boolean | null;
  eventCwd?:               string | null;  // session_directory's own cwd (10.7)

  // Compaction
  compactTokens?:          number | null;
  compactFromExt?:         boolean | null;

  // Agent
  promptText?:             string | null;
  agentEndMsgCount?:       number | null;
  turnIndex?:              number | null;
  turnTimestamp?:          number | null;
  turnEndToolCount?:       number | null;

  // Message
  messageRole?:            string | null;
  streamDeltaType?:        string | null;
  streamDeltaLen?:         number | null;

  // Tool
  toolName?:               string | null;
  toolCallId?:             string | null;
  isError?:                boolean | null;
  contextMsgCount?:        number | null;
  providerPayloadBytes?:   number | null;

  // Input
  inputText?:              string | null;
  inputSource?:            string | null;
  inputHasImages?:         boolean | null;
  bashCommand?:            string | null;
  bashExclude?:            boolean | null;

  // Model
  modelProvider?:          string | null;
  modelId?:                string | null;
  modelSource?:            string | null;
  prevModelProvider?:      string | null;
  prevModelId?:            string | null;

  // Generic
  payload?:                string | null;

  // Error (10.6)
  handlerError?:           string | null;
}


// ─── Handler Function Signature ────────────────────────────────────

export type EventHandler = (event: unknown, meta: EventMeta) => EventFields;

export interface EventMeta {
  sessionId: string | null;
  cwd: string | null;
  seq: number;
}


// ─── Endpoint Interface ────────────────────────────────────────────

export interface Endpoint {
  readonly name: string;
  init(config: EndpointConfig): Promise<void>;
  emit(event: NormalizedEvent, jsonld: string): void;  // both always provided
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface EndpointConfig {
  xtdb?: { host: string; port: number };
  jsonl?: { path: string };
  console?: { enabled: boolean };
}
```

---

## 5. Router

### `router.ts`

Static dispatch table. 30 entries. One import per handler file.

```typescript
import type { EventHandler, EventMeta, NormalizedEvent, EventCategory, EventFields } from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";
import { uuid } from "./util.ts";

// ── 30 handler imports (one per file) ──
import { handler as handleSessionDirectory }    from "./handlers/session-directory.ts";
import { handler as handleSessionStart }        from "./handlers/session-start.ts";
import { handler as handleSessionBeforeSwitch } from "./handlers/session-before-switch.ts";
import { handler as handleSessionSwitch }       from "./handlers/session-switch.ts";
import { handler as handleSessionBeforeFork }   from "./handlers/session-before-fork.ts";
import { handler as handleSessionFork }         from "./handlers/session-fork.ts";
import { handler as handleSessionBeforeTree }   from "./handlers/session-before-tree.ts";
import { handler as handleSessionTree }         from "./handlers/session-tree.ts";
import { handler as handleSessionShutdown }     from "./handlers/session-shutdown.ts";
import { handler as handleSessionBeforeCompact }from "./handlers/session-before-compact.ts";
import { handler as handleSessionCompact }      from "./handlers/session-compact.ts";
import { handler as handleBeforeAgentStart }    from "./handlers/before-agent-start.ts";
import { handler as handleAgentStart }          from "./handlers/agent-start.ts";
import { handler as handleAgentEnd }            from "./handlers/agent-end.ts";
import { handler as handleTurnStart }           from "./handlers/turn-start.ts";
import { handler as handleTurnEnd }             from "./handlers/turn-end.ts";
import { handler as handleMessageStart }        from "./handlers/message-start.ts";
import { handler as handleMessageUpdate }       from "./handlers/message-update.ts";
import { handler as handleMessageEnd }          from "./handlers/message-end.ts";
import { handler as handleToolCall }            from "./handlers/tool-call.ts";
import { handler as handleToolResult }          from "./handlers/tool-result.ts";
import { handler as handleToolExecutionStart }  from "./handlers/tool-execution-start.ts";
import { handler as handleToolExecutionUpdate } from "./handlers/tool-execution-update.ts";
import { handler as handleToolExecutionEnd }    from "./handlers/tool-execution-end.ts";
import { handler as handleContext }             from "./handlers/context.ts";
import { handler as handleBeforeProviderRequest}from "./handlers/before-provider-request.ts";
import { handler as handleInput }               from "./handlers/input.ts";
import { handler as handleUserBash }            from "./handlers/user-bash.ts";
import { handler as handleModelSelect }         from "./handlers/model-select.ts";
import { handler as handleResourcesDiscover }   from "./handlers/resources-discover.ts";

// ── Dispatch table ──

interface RouteEntry {
  handler: EventHandler;
  category: EventCategory;
  canIntercept: boolean;
}

const ROUTES: Record<string, RouteEntry> = {
  "session_directory":      { handler: handleSessionDirectory,     category: "session",    canIntercept: true  },
  "session_start":          { handler: handleSessionStart,         category: "session",    canIntercept: false },
  "session_before_switch":  { handler: handleSessionBeforeSwitch,  category: "session",    canIntercept: true  },
  "session_switch":         { handler: handleSessionSwitch,        category: "session",    canIntercept: false },
  "session_before_fork":    { handler: handleSessionBeforeFork,    category: "session",    canIntercept: true  },
  "session_fork":           { handler: handleSessionFork,          category: "session",    canIntercept: false },
  "session_before_tree":    { handler: handleSessionBeforeTree,    category: "session",    canIntercept: true  },
  "session_tree":           { handler: handleSessionTree,          category: "session",    canIntercept: false },
  "session_shutdown":       { handler: handleSessionShutdown,      category: "session",    canIntercept: false },
  "session_before_compact": { handler: handleSessionBeforeCompact, category: "compaction", canIntercept: true  },
  "session_compact":        { handler: handleSessionCompact,       category: "compaction", canIntercept: false },
  "before_agent_start":     { handler: handleBeforeAgentStart,     category: "agent",      canIntercept: true  },
  "agent_start":            { handler: handleAgentStart,           category: "agent",      canIntercept: false },
  "agent_end":              { handler: handleAgentEnd,             category: "agent",      canIntercept: false },
  "turn_start":             { handler: handleTurnStart,            category: "agent",      canIntercept: false },
  "turn_end":               { handler: handleTurnEnd,              category: "agent",      canIntercept: false },
  "message_start":          { handler: handleMessageStart,         category: "message",    canIntercept: false },
  "message_update":         { handler: handleMessageUpdate,        category: "message",    canIntercept: false },
  "message_end":            { handler: handleMessageEnd,           category: "message",    canIntercept: false },
  "tool_call":              { handler: handleToolCall,             category: "tool",       canIntercept: true  },
  "tool_result":            { handler: handleToolResult,           category: "tool",       canIntercept: true  },
  "tool_execution_start":   { handler: handleToolExecutionStart,   category: "tool",       canIntercept: false },
  "tool_execution_update":  { handler: handleToolExecutionUpdate,  category: "tool",       canIntercept: false },
  "tool_execution_end":     { handler: handleToolExecutionEnd,     category: "tool",       canIntercept: false },
  "context":                { handler: handleContext,              category: "tool",       canIntercept: true  },
  "before_provider_request":{ handler: handleBeforeProviderRequest,category: "tool",       canIntercept: true  },
  "input":                  { handler: handleInput,                category: "input",      canIntercept: true  },
  "user_bash":              { handler: handleUserBash,             category: "input",      canIntercept: true  },
  "model_select":           { handler: handleModelSelect,          category: "model",      canIntercept: false },
  "resources_discover":     { handler: handleResourcesDiscover,    category: "resource",   canIntercept: true  },
};

export function routeEvent(eventName: string, rawEvent: unknown, meta: EventMeta): NormalizedEvent | null {
  const route = ROUTES[eventName];
  if (!route) return null;

  let fields: EventFields;
  try {
    fields = route.handler(rawEvent, meta);
  } catch (err) {
    fields = { handlerError: String(err) };
  }

  return {
    id: uuid(),
    eventName,
    category: route.category,
    canIntercept: route.canIntercept,
    schemaVersion: SCHEMA_VERSION,
    ts: Date.now(),
    seq: meta.seq,
    sessionId: meta.sessionId,
    cwd: meta.cwd,
    fields,
  };
}

export const ALL_EVENT_NAMES = Object.keys(ROUTES);
```

---

## 6. Per-Event Handler Functions (all 30)

Every file exports one `handler` function. Same shape. Example structure:

### `handlers/tool-call.ts` — #20

```typescript
import type { EventHandler } from "../types.ts";
import { trunc } from "../util.ts";

// Raw pi event shape: { toolName: string, toolCallId: string, input: Record<string, any> }

export const handler: EventHandler = (event) => {
  const e = event as { toolName?: string; toolCallId?: string; input?: unknown } | null;
  return {
    toolName: e?.toolName ?? null,
    toolCallId: e?.toolCallId ?? null,
    payload: trunc(JSON.stringify(e?.input ?? {}), 4096),
  };
};
```

### `handlers/session-directory.ts` — #1 (stores both cwds per 10.7)

```typescript
import type { EventHandler } from "../types.ts";

// Raw pi event shape: { cwd: string }
// No ctx on this event — meta.cwd comes from process.cwd()

export const handler: EventHandler = (event) => {
  const e = event as { cwd?: string } | null;
  return {
    eventCwd: e?.cwd ?? null,  // the event's own cwd
    // meta.cwd (= process.cwd()) stored separately in NormalizedEvent.cwd
  };
};
```

### `handlers/model-select.ts` — #29

```typescript
import type { EventHandler } from "../types.ts";

// Raw: { model: { provider, id }, previousModel?: { provider, id }, source: "set"|"cycle"|"restore" }

export const handler: EventHandler = (event) => {
  const e = event as {
    model?: { provider?: string; id?: string };
    previousModel?: { provider?: string; id?: string } | null;
    source?: string;
  } | null;
  return {
    modelProvider: e?.model?.provider ?? null,
    modelId: e?.model?.id ?? null,
    modelSource: e?.source ?? null,
    prevModelProvider: e?.previousModel?.provider ?? null,
    prevModelId: e?.previousModel?.id ?? null,
  };
};
```

**All other 27 handlers follow the exact same pattern.** See PROGRESS.md §5 for each event's raw shape and extraction logic. Every handler is a direct translation of that spec into a standalone file.

---

## 7. Triple Builder (RDF)

### `rdf/namespaces.ts`

```typescript
export const EV     = "https://pi.dev/events/";
export const RDF    = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const XSD    = "http://www.w3.org/2001/XMLSchema#";
export const SCHEMA = "https://schema.org/";
```

### `rdf/triples.ts`

Converts a `NormalizedEvent` into an array of N3 `Triple` objects.
This is the semantic core — every field becomes a properly typed triple.

```typescript
import { DataFactory } from "n3";
import type { NormalizedEvent } from "../types.ts";
import { getEnvironmentMeta } from "../env.ts";
import { EV, RDF, XSD, SCHEMA } from "./namespaces.ts";

const { namedNode, literal, blankNode, triple } = DataFactory;

// Typed literal helpers
const xsdString  = (v: string)  => literal(v);
const xsdLong    = (v: number)  => literal(String(v), namedNode(`${XSD}long`));
const xsdBoolean = (v: boolean) => literal(String(v), namedNode(`${XSD}boolean`));
const xsdInt     = (v: number)  => literal(String(v), namedNode(`${XSD}integer`));

/**
 * Build RDF triples for a NormalizedEvent.
 * Every field becomes a triple with proper XSD typing.
 */
export function eventToTriples(event: NormalizedEvent) {
  const subject = namedNode(`urn:uuid:${event.id}`);
  const envBNode = blankNode(`env_${event.id}`);
  const env = getEnvironmentMeta();
  const result = [];

  // ── Type ──
  // Map event name to a PascalCase type: tool_call → ToolCall
  const typeName = event.eventName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  result.push(triple(subject, namedNode(`${RDF}type`), namedNode(`${EV}${typeName}`)));

  // ── Core fields (always present) ──
  result.push(triple(subject, namedNode(`${EV}eventName`),     xsdString(event.eventName)));
  result.push(triple(subject, namedNode(`${EV}category`),      xsdString(event.category)));
  result.push(triple(subject, namedNode(`${EV}canIntercept`),  xsdBoolean(event.canIntercept)));
  result.push(triple(subject, namedNode(`${EV}schemaVersion`), xsdInt(event.schemaVersion)));
  result.push(triple(subject, namedNode(`${EV}timestamp`),     xsdLong(event.ts)));
  result.push(triple(subject, namedNode(`${EV}seq`),           xsdLong(event.seq)));
  result.push(triple(subject, namedNode(`${EV}environment`),   xsdString("pi.dev")));

  if (event.sessionId) {
    result.push(triple(subject, namedNode(`${EV}sessionId`), xsdString(event.sessionId)));
  }
  if (event.cwd) {
    result.push(triple(subject, namedNode(`${EV}cwd`), xsdString(event.cwd)));
  }

  // ── Event-specific fields (skip nulls/undefined) ──
  const f = event.fields;
  const str = (pred: string, val?: string | null) => {
    if (val != null) result.push(triple(subject, namedNode(`${EV}${pred}`), xsdString(val)));
  };
  const num = (pred: string, val?: number | null) => {
    if (val != null) result.push(triple(subject, namedNode(`${EV}${pred}`), xsdLong(val)));
  };
  const bool = (pred: string, val?: boolean | null) => {
    if (val != null) result.push(triple(subject, namedNode(`${EV}${pred}`), xsdBoolean(val)));
  };

  // Session
  str("switchReason", f.switchReason);    str("switchTarget", f.switchTarget);
  str("switchPrevious", f.switchPrevious);str("forkEntryId", f.forkEntryId);
  str("forkPrevious", f.forkPrevious);    str("treeNewLeaf", f.treeNewLeaf);
  str("treeOldLeaf", f.treeOldLeaf);     bool("treeFromExt", f.treeFromExt);
  str("eventCwd", f.eventCwd);
  // Compaction
  num("compactTokens", f.compactTokens); bool("compactFromExt", f.compactFromExt);
  // Agent
  str("promptText", f.promptText);       num("agentEndMsgCount", f.agentEndMsgCount);
  num("turnIndex", f.turnIndex);         num("turnTimestamp", f.turnTimestamp);
  num("turnEndToolCount", f.turnEndToolCount);
  // Message
  str("messageRole", f.messageRole);     str("streamDeltaType", f.streamDeltaType);
  num("streamDeltaLen", f.streamDeltaLen);
  // Tool
  str("toolName", f.toolName);           str("toolCallId", f.toolCallId);
  bool("isError", f.isError);            num("contextMsgCount", f.contextMsgCount);
  num("providerPayloadBytes", f.providerPayloadBytes);
  // Input
  str("inputText", f.inputText);         str("inputSource", f.inputSource);
  bool("inputHasImages", f.inputHasImages);str("bashCommand", f.bashCommand);
  bool("bashExclude", f.bashExclude);
  // Model
  str("modelProvider", f.modelProvider); str("modelId", f.modelId);
  str("modelSource", f.modelSource);     str("prevModelProvider", f.prevModelProvider);
  str("prevModelId", f.prevModelId);
  // Generic
  str("payload", f.payload);             str("handlerError", f.handlerError);

  // ── Environment metadata (blank node) ──
  result.push(triple(subject, namedNode(`${EV}environmentMeta`), envBNode));
  result.push(triple(envBNode, namedNode(`${RDF}type`), namedNode(`${SCHEMA}SoftwareApplication`)));
  result.push(triple(envBNode, namedNode(`${SCHEMA}name`),              xsdString("pi.dev")));
  result.push(triple(envBNode, namedNode(`${SCHEMA}operatingSystem`),   xsdString(env.os)));
  result.push(triple(envBNode, namedNode(`${EV}arch`),                  xsdString(env.arch)));
  result.push(triple(envBNode, namedNode(`${EV}nodeVersion`),           xsdString(env.nodeVersion)));
  result.push(triple(envBNode, namedNode(`${EV}hostname`),              xsdString(env.hostname)));

  return result;
}
```

---

## 8. JSON-LD Serialization

### `rdf/serialize.ts`

```typescript
import { JsonLdSerializer } from "jsonld-streaming-serializer";
import type { Triple } from "n3";
import { EV, RDF, XSD, SCHEMA } from "./namespaces.ts";

const CONTEXT = {
  ev: EV,
  rdf: RDF,
  xsd: XSD,
  schema: SCHEMA,
};

/**
 * Serialize an array of N3 triples into a JSON-LD string.
 * Uses jsonld-streaming-serializer (proper RDF/JS pipeline).
 */
export function triplesToJsonLd(triples: Triple[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const serializer = new JsonLdSerializer({ space: "  ", context: CONTEXT });
    let output = "";
    serializer.on("data", (chunk: string) => { output += chunk; });
    serializer.on("end", () => resolve(output));
    serializer.on("error", reject);
    for (const t of triples) serializer.write(t);
    serializer.end();
  });
}
```

### Full pipeline (called per event)

```typescript
import { routeEvent } from "./router.ts";
import { eventToTriples } from "./rdf/triples.ts";
import { triplesToJsonLd } from "./rdf/serialize.ts";

// In the capture flow:
const normalized = routeEvent(eventName, rawEvent, meta);
const triples = eventToTriples(normalized);
const jsonld = await triplesToJsonLd(triples);
// → emit(normalized, jsonld) to all endpoints
```

---

## 9. Endpoint Abstraction

### Updated `Endpoint` interface

```typescript
export interface Endpoint {
  readonly name: string;
  init(config: EndpointConfig): Promise<void>;
  emit(event: NormalizedEvent, jsonld: string): void;   // both always provided
  flush(): Promise<void>;
  close(): Promise<void>;
}
```

### `endpoints/xtdb.ts`

Stores **flat columns** from `NormalizedEvent` AND the **full JSON-LD string** in a `jsonld` column.

```typescript
// INSERT has all flat columns + jsonld text column
// XTDB creates the jsonld column on first INSERT automatically.
await sql`
  INSERT INTO events (
    _id, environment, event_name, category, can_intercept,
    schema_version, ts, seq, session_id, cwd,
    /* ... all event-specific columns ... */
    jsonld
  ) VALUES (
    ${t(event.id)}, ${t("pi.dev")}, ${t(event.eventName)}, ...
    ${t(jsonldString)}
  )
`;
```

### No-fallback enforcement (in index.ts)

```typescript
let anyEndpointReady = false;
for (const ep of endpoints) {
  try {
    await ep.init(config);
    anyEndpointReady = true;
  } catch (err) {
    ctx.ui.notify(`[xtdb-logger] ${ep.name} failed: ${err}`, "error");
  }
}

if (!anyEndpointReady) {
  ctx.ui.notify("[xtdb-logger] No endpoints available. Event logging DISABLED.", "error");
  return;  // Do NOT register any event handlers
}
```

---

## 10. Configuration

### Config file: `~/.pi/agent/xtdb-event-logger.json`

```json
{
  "endpoints": {
    "xtdb": {
      "enabled": true,
      "host": "localhost",
      "port": 5433
    },
    "jsonl": {
      "enabled": false,
      "path": "~/.pi/agent/event-log.jsonl"
    },
    "console": {
      "enabled": false
    }
  },
  "sampling": {
    "intervalMs": 2000
  },
  "flush": {
    "intervalMs": 500,
    "batchSize": 20
  }
}
```

### Env var overrides (higher priority)

| Env Var | Overrides |
|---------|-----------|
| `XTDB_EVENT_HOST` | `endpoints.xtdb.host` |
| `XTDB_EVENT_PORT` | `endpoints.xtdb.port` |
| `XTDB_EVENT_JSONL_PATH` | `endpoints.jsonl.path` |
| `XTDB_EVENT_SAMPLING_MS` | `sampling.intervalMs` |

### `config.ts`

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Config { /* mirrors JSON structure */ }

export function loadConfig(): Config {
  const defaults = { /* ... */ };
  // 1. Read config file
  try {
    const raw = readFileSync(join(homedir(), ".pi", "agent", "xtdb-event-logger.json"), "utf-8");
    Object.assign(defaults, JSON.parse(raw));
  } catch { /* file missing is fine */ }
  // 2. Env overrides
  if (process.env.XTDB_EVENT_HOST) defaults.endpoints.xtdb.host = process.env.XTDB_EVENT_HOST;
  if (process.env.XTDB_EVENT_PORT) defaults.endpoints.xtdb.port = Number(process.env.XTDB_EVENT_PORT);
  // ... etc
  return defaults;
}
```

---

## 11. Extension Entry Point

### `index.ts` — Wiring overview

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { routeEvent, ALL_EVENT_NAMES } from "./router.ts";
import { eventToTriples } from "./rdf/triples.ts";
import { triplesToJsonLd } from "./rdf/serialize.ts";
import { shouldCapture, flushSampler } from "./sampling.ts";
import { loadConfig } from "./config.ts";
// ... endpoint imports ...

export default function (pi: ExtensionAPI) {
  let seq = 0;
  let ready = false;
  const buffer: Array<{ normalized: NormalizedEvent; jsonld: string }> = [];
  const config = loadConfig();
  const endpoints = buildEndpoints(config);

  // ── Shared capture pipeline (async, but handlers don't await it) ──
  async function capture(eventName: string, rawEvent: unknown, meta: EventMeta) {
    const normalized = routeEvent(eventName, rawEvent, meta);
    if (!normalized) return;
    const triples = eventToTriples(normalized);
    const jsonld = await triplesToJsonLd(triples);
    if (!ready) {
      buffer.push({ normalized, jsonld });
    } else {
      for (const ep of endpoints) {
        try { ep.emit(normalized, jsonld); } catch { /* never crash */ }
      }
    }
  }

  // ── Events with no ctx (buffered before session_start) ──
  const NO_CTX = new Set(["session_directory", "resources_discover"]);

  // ── Sampled events ──
  const SAMPLED = new Set(["message_update", "tool_execution_update"]);

  // ── Register all 30 ──
  for (const eventName of ALL_EVENT_NAMES) {
    if (eventName === "session_start") {
      pi.on("session_start", async (_event, ctx) => {
        // Init endpoints
        let anyReady = false;
        for (const ep of endpoints) {
          try { await ep.init(config); anyReady = true; } catch { /* logged */ }
        }
        if (!anyReady) {
          ctx.ui.notify("[xtdb-logger] No endpoints. Logging DISABLED.", "error");
          return;
        }
        ready = true;
        // Flush buffer
        for (const b of buffer) {
          for (const ep of endpoints) { try { ep.emit(b.normalized, b.jsonld); } catch {} }
        }
        buffer.length = 0;
        // Capture session_start itself
        capture("session_start", _event, metaFromCtx(ctx));
        ctx.ui.setStatus("xtdb-logger", "📊");
      });

    } else if (eventName === "session_shutdown") {
      pi.on("session_shutdown", async (_event, ctx) => {
        await capture("session_shutdown", _event, metaFromCtx(ctx));
        for (const ep of endpoints) { try { await ep.close(); } catch {} }
      });

    } else if (NO_CTX.has(eventName)) {
      pi.on(eventName as any, async (event: unknown) => {
        capture(eventName, event, metaNoCtx());
        return undefined;
      });

    } else if (SAMPLED.has(eventName)) {
      pi.on(eventName as any, async (event: unknown, ctx: any) => {
        const e = event as any;
        const key = eventName === "message_update"
          ? "msg_update"
          : `tool_update_${e?.toolCallId ?? "?"}`;
        const deltaLen = e?.assistantMessageEvent?.delta?.length ?? 0;
        const { capture: shouldWrite } = shouldCapture(key, deltaLen);
        if (shouldWrite) capture(eventName, event, metaFromCtx(ctx));
        return undefined;
      });

    } else {
      // Standard event — every one gets its own write
      pi.on(eventName as any, async (event: unknown, ctx: any) => {
        capture(eventName, event, metaFromCtx(ctx));
        return undefined;
      });
    }
  }
}
```

---

## 12. Module Dependency Graph

```
index.ts
  ├── config.ts                              (standalone: fs, os)
  ├── router.ts
  │     └── handlers/[30 files]              (each imports types.ts + util.ts)
  ├── rdf/triples.ts                         (imports types.ts, env.ts, n3, namespaces.ts)
  ├── rdf/serialize.ts                       (imports jsonld-streaming-serializer, namespaces.ts)
  ├── rdf/namespaces.ts                      (standalone: constants)
  ├── sampling.ts                            (standalone: no deps)
  ├── types.ts                               (standalone: pure types)
  ├── util.ts                                (standalone: pure functions)
  ├── env.ts                                 (standalone: os, process)
  └── endpoints/
        ├── xtdb.ts                          (imports types.ts, postgres)
        ├── jsonl.ts                         (imports types.ts, node:fs)
        └── console.ts                       (imports types.ts)
```

**No circular deps. Single direction of flow. 52 files total.**

---

## 13. Implementation Sequence

```
Phase 1: Foundation
  [ ] 1.  types.ts
  [ ] 2.  util.ts
  [ ] 3.  env.ts
  [ ] 4.  config.ts
  [ ] 5.  rdf/namespaces.ts
  [ ] 6.  sampling.ts

Phase 2: RDF Pipeline
  [ ] 7.  rdf/triples.ts
  [ ] 8.  rdf/serialize.ts

Phase 3: All 30 Handlers (one per file)
  [ ] 9.  handlers/session-directory.ts
  [ ] 10. handlers/session-start.ts
  [ ] 11. handlers/session-before-switch.ts
  [ ] 12. handlers/session-switch.ts
  [ ] 13. handlers/session-before-fork.ts
  [ ] 14. handlers/session-fork.ts
  [ ] 15. handlers/session-before-tree.ts
  [ ] 16. handlers/session-tree.ts
  [ ] 17. handlers/session-shutdown.ts
  [ ] 18. handlers/session-before-compact.ts
  [ ] 19. handlers/session-compact.ts
  [ ] 20. handlers/before-agent-start.ts
  [ ] 21. handlers/agent-start.ts
  [ ] 22. handlers/agent-end.ts
  [ ] 23. handlers/turn-start.ts
  [ ] 24. handlers/turn-end.ts
  [ ] 25. handlers/message-start.ts
  [ ] 26. handlers/message-update.ts
  [ ] 27. handlers/message-end.ts
  [ ] 28. handlers/tool-call.ts
  [ ] 29. handlers/tool-result.ts
  [ ] 30. handlers/tool-execution-start.ts
  [ ] 31. handlers/tool-execution-update.ts
  [ ] 32. handlers/tool-execution-end.ts
  [ ] 33. handlers/context.ts
  [ ] 34. handlers/before-provider-request.ts
  [ ] 35. handlers/input.ts
  [ ] 36. handlers/user-bash.ts
  [ ] 37. handlers/model-select.ts
  [ ] 38. handlers/resources-discover.ts

Phase 4: Router
  [ ] 39. router.ts

Phase 5: Endpoints
  [ ] 40. endpoints/console.ts
  [ ] 41. endpoints/jsonl.ts
  [ ] 42. endpoints/xtdb.ts

Phase 6: Entry Point
  [ ] 43. index.ts
  [ ] 44. package.json

Phase 7: Test
  [ ] 45. Start XTDB, load extension, run TEST.md
```
