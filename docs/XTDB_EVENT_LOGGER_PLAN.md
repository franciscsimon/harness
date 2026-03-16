# XTDB Event Logger for pi.dev — Architecture Plan

> Goal: Subscribe to ALL 30 pi.dev extension events and persist them into XTDB v2,
> a bitemporal immutable SQL database with full time-travel query support.

---

## Table of Contents

- [1. Why XTDB over Datahike](#1-why-xtdb-over-datahike)
- [2. XTDB v2 Overview](#2-xtdb-v2-overview)
- [3. Running XTDB](#3-running-xtdb)
- [4. Node.js / TypeScript Client](#4-nodejs--typescript-client)
- [5. Environment Detection (pi.dev)](#5-environment-detection-pidev)
- [6. All 30 pi.dev Events to Capture](#6-all-30-pidev-events-to-capture)
- [7. Table Schema Design](#7-table-schema-design)
- [8. pi.dev Extension Architecture](#8-pidev-extension-architecture)
- [9. Querying Events (SQL + Time Travel)](#9-querying-events-sql--time-travel)
- [10. Implementation Steps](#10-implementation-steps)

---

## 1. Why XTDB over Datahike

| Factor | Datahike | XTDB v2 |
|--------|----------|---------|
| **Client language** | npm package (beta ClojureScript compiled to JS, 18.5MB) | Standard Postgres driver (`postgres` npm, 300KB) |
| **Connection model** | In-process (must load full DB engine into pi extension) | Client-server (connect over Postgres wire protocol) |
| **Query language** | Datalog (EDN strings in JS — awkward) | **SQL** (standard, tooling everywhere) |
| **Time travel** | Manual `(d/history)` / `(d/as-of)` | **Built-in bitemporal** — `FOR SYSTEM_TIME`, `FOR VALID_TIME` in SQL |
| **Schema** | Must define upfront or use `:read` mode | **Dynamic** — columns inferred on INSERT, evolve at will |
| **Cold start** | ~1-2s (loads ClojureScript runtime) | Zero (just a TCP connection to running server) |
| **Maturity of JS API** | Beta — EDN string queries, keyword colon syntax | Postgres wire protocol — battle-tested drivers |
| **Data inspection** | Custom tooling needed | `psql`, any SQL GUI, Metabase, DBeaver, etc. |
| **Storage** | In-process file/memory | Server-managed, survives extension restarts |
| **Audit trail** | Manual with `keep-history?` | **Automatic** — every INSERT/UPDATE creates immutable system-time version |
| **Nested data** | Native (Clojure maps) | Native — XTDB supports arbitrary nested records/arrays in SQL |
| **Operational** | Nothing to run (embedded) | Docker container (one command) |

**Verdict:** XTDB wins on developer experience (standard SQL, standard Postgres tooling,
built-in bitemporality, zero cold start, tiny client). The only tradeoff is running a
Docker container, but you get a real queryable database with proper tooling in return.

### Verified on This System

```
✅ Docker v29.2.1 available
✅ Java 21 available (for Clojure CLI if needed)
✅ XTDB v2 Docker image pulled and tested (ghcr.io/xtdb/xtdb:latest, 846MB)
✅ postgres npm driver works against XTDB
✅ INSERTs, SELECTs, FOR ALL SYSTEM_TIME, xt.txs all confirmed working
```

---

## 2. XTDB v2 Overview

XTDB v2 is an open-source immutable SQL database with built-in bitemporality:

- **System time** (`_system_from`, `_system_to`) — when the DB recorded the fact (automatic, immutable)
- **Valid time** (`_valid_from`, `_valid_to`) — when the fact is/was/will-be true in your domain (optional)
- **Postgres wire protocol** — use any Postgres client/driver/tool
- **Dynamic schema** — no DDL needed, columns inferred from INSERTs
- **Immutable** — every version of every row is kept forever
- **Apache Arrow** columnar storage — efficient compression and vectorized queries
- **Standalone mode** — single Docker container, local file storage, no Kafka/S3 needed

---

## 3. Running XTDB

### One-Command Docker (Standalone)

```bash
# Start XTDB (standalone, local storage)
docker run -d \
  --name xtdb-events \
  --restart unless-stopped \
  -p 5433:5432 \
  -p 8081:8080 \
  -v ~/.pi/agent/xtdb-data:/var/lib/xtdb \
  ghcr.io/xtdb/xtdb:latest

# Port 5433 = Postgres wire protocol (avoid conflict with local Postgres on 5432)
# Port 8081 = Health check endpoint
# Volume   = Persistent storage across restarts
```

**Note:** XTDB container runs as UID 20000. Prepare the volume:

```bash
mkdir -p ~/.pi/agent/xtdb-data
# On macOS Docker Desktop, permissions are handled automatically.
# On Linux:
# sudo chown -R 20000:20000 ~/.pi/agent/xtdb-data
```

### Health Check

```bash
curl http://localhost:8081/healthz/alive
# => Alive.
```

### Connect with psql (if available)

```bash
psql -h localhost -p 5433 -U xtdb xtdb
```

### Auto-Start on Boot (macOS launchd)

```xml
<!-- ~/Library/LaunchAgents/com.xtdb.events.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.xtdb.events</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/docker</string>
    <string>start</string>
    <string>xtdb-events</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
```

---

## 4. Node.js / TypeScript Client

### Dependency

```json
{
  "dependencies": {
    "postgres": "^3.4.8"
  }
}
```

That's it. 300KB. Zero native dependencies. No ClojureScript runtime.

### Connection Setup

```typescript
import postgres from "postgres";

// OIDs for explicit typing (XTDB requires typed params in DML)
const OID = {
  boolean: 16,
  int64: 20,
  int32: 23,
  text: 25,
  float64: 701,
} as const;

const sql = postgres({
  host: "localhost",
  port: 5433,
  database: "xtdb",
  username: "xtdb",
});

// Typed helper
function t(value: string) { return sql.typed(value, OID.text); }
function tLong(value: number) { return sql.typed(value, OID.int64); }
function tBool(value: boolean) { return sql.typed(value, OID.boolean); }
```

### Insert Example

```typescript
await sql`
  INSERT INTO events (_id, environment, event_name, category, ts, payload)
  VALUES (
    ${t(crypto.randomUUID())},
    ${t("pi.dev")},
    ${t("tool_call")},
    ${t("tool")},
    ${tLong(Date.now())},
    ${t(JSON.stringify({ toolName: "bash", command: "ls" }))}
  )
`;
```

### Query Example

```typescript
const rows = await sql`SELECT * FROM events WHERE category = 'tool'`;
```

### Graceful Disconnect

```typescript
await sql.end();
```

---

## 5. Environment Detection (pi.dev)

Since we're focusing exclusively on pi.dev, detection is trivial:

**The extension entry point IS the detection.** If your `export default function(pi: ExtensionAPI)` is called, you're in pi.dev. Period.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // We are in pi.dev. This function is only ever called by pi.
  const ENVIRONMENT = "pi.dev" as const;
  // ... set up event listeners
}
```

No env var checks, no process sniffing, no heuristics needed.

---

## 6. All 30 pi.dev Events to Capture

### Events by Category

| Category | Event | Interceptable | High-Frequency | Capture |
|----------|-------|---------------|----------------|---------|
| **session** | `session_directory` | ✅ | No | ✅ Full |
| **session** | `session_start` | — | No | ✅ Full |
| **session** | `session_before_switch` | ✅ | No | ✅ Full |
| **session** | `session_switch` | — | No | ✅ Full |
| **session** | `session_before_fork` | ✅ | No | ✅ Full |
| **session** | `session_fork` | — | No | ✅ Full |
| **session** | `session_before_tree` | ✅ | No | ✅ Full |
| **session** | `session_tree` | — | No | ✅ Full |
| **session** | `session_shutdown` | — | No | ✅ Full |
| **compaction** | `session_before_compact` | ✅ | No | ✅ Full |
| **compaction** | `session_compact` | — | No | ✅ Full |
| **agent** | `before_agent_start` | ✅ | No | ✅ Full (exclude systemPrompt body) |
| **agent** | `agent_start` | — | No | ✅ Full |
| **agent** | `agent_end` | — | No | ✅ Full (message count, not messages) |
| **agent** | `turn_start` | — | No | ✅ Full |
| **agent** | `turn_end` | — | No | ✅ Full |
| **message** | `message_start` | — | No | ✅ Full (role + type, not content) |
| **message** | `message_update` | — | **YES (per token)** | ⚠️ **Skip** |
| **message** | `message_end` | — | No | ✅ Full (role + type, not content) |
| **tool** | `tool_call` | ✅ | No | ✅ Full (tool name + input summary) |
| **tool** | `tool_result` | ✅ | No | ✅ Full (tool name + isError) |
| **tool** | `tool_execution_start` | — | No | ✅ Full |
| **tool** | `tool_execution_update` | — | **YES (streaming)** | ⚠️ **Skip** |
| **tool** | `tool_execution_end` | — | No | ✅ Full |
| **tool** | `context` | ✅ | No | ✅ Metadata only (message count) |
| **tool** | `before_provider_request` | ✅ | No | ✅ Metadata only (payload size) |
| **input** | `input` | ✅ | No | ✅ Full (text + source) |
| **input** | `user_bash` | ✅ | No | ✅ Full (command) |
| **model** | `model_select` | — | No | ✅ Full |
| **resource** | `resources_discover` | ✅ | No | ✅ Full |

**Skipped (too noisy):** `message_update` (fires per token), `tool_execution_update` (fires per streaming chunk)

**Captured: 28 of 30 events.**

---

## 7. Table Schema Design

XTDB is schemaless — columns are created dynamically on first INSERT. But here's the
logical schema we'll use:

### `events` Table

| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | UUID — unique event ID (required by XTDB) |
| `environment` | text | Always `"pi.dev"` |
| `event_name` | text | e.g. `"tool_call"`, `"session_start"` |
| `category` | text | `session`, `compaction`, `agent`, `message`, `tool`, `input`, `model`, `resource` |
| `can_intercept` | boolean | Whether this event can block/modify |
| `ts` | bigint | Unix timestamp in milliseconds |
| `session_id` | text | Session file path or `null` |
| `cwd` | text | Working directory |
| `seq` | bigint | Monotonic counter for ordering within a session |
| `turn_index` | bigint | Turn index (for turn/agent events) |
| `tool_name` | text | Tool name (for tool events) |
| `tool_call_id` | text | Tool call ID (for tool events) |
| `is_error` | boolean | Whether tool errored |
| `model_provider` | text | e.g. `"anthropic"` |
| `model_id` | text | e.g. `"claude-sonnet-4-5"` |
| `message_role` | text | `"user"`, `"assistant"`, `"toolResult"` |
| `input_source` | text | `"interactive"`, `"rpc"`, `"extension"` |
| `payload` | text | JSON-stringified event data (truncated for large events) |

### Automatic XTDB Columns (free)

| Column | Description |
|--------|-------------|
| `_system_from` | When this row was inserted (automatic, immutable) |
| `_system_to` | When this row was superseded (null = current) |
| `_valid_from` | Business-valid start time (we won't use this) |
| `_valid_to` | Business-valid end time (we won't use this) |

**No CREATE TABLE needed.** First INSERT creates the table with inferred columns.

---

## 8. pi.dev Extension Architecture

### File Structure

```
~/.pi/agent/extensions/xtdb-event-logger/
├── index.ts          # Extension entry point
├── package.json      # depends on "postgres"
├── node_modules/
└── lib/
    ├── db.ts         # XTDB connection + typed insert helpers
    ├── events.ts     # Event subscription + serialization
    └── schema.ts     # Category/field mapping constants
```

### Extension Entry Point (`index.ts`)

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { connectDb, insertEvent, disconnectDb } from "./lib/db.ts";
import { EVENTS_TO_CAPTURE, serializeEvent } from "./lib/events.ts";

export default function (pi: ExtensionAPI) {
  let seq = 0;
  let dbReady = false;

  // Connect to XTDB on session start
  pi.on("session_start", async (_event, ctx) => {
    try {
      await connectDb();
      dbReady = true;
      ctx.ui.setStatus("xtdb-logger", "📊 XTDB logging active");
    } catch (err) {
      ctx.ui.notify(`XTDB connection failed: ${err}`, "warning");
    }
  });

  // Subscribe to ALL events (except message_update and tool_execution_update)
  for (const eventName of EVENTS_TO_CAPTURE) {
    if (eventName === "session_directory") {
      // Special: no ctx
      pi.on("session_directory", async (event) => {
        if (!dbReady) return undefined;
        await insertEvent(serializeEvent("session_directory", event, null, seq++));
        return undefined;  // NEVER interfere
      });
    } else {
      pi.on(eventName, async (event, ctx) => {
        if (!dbReady) return undefined;
        const sessionId = ctx?.sessionManager?.getSessionFile?.() ?? null;
        const cwd = ctx?.cwd ?? process.cwd();
        await insertEvent(serializeEvent(eventName, event, { sessionId, cwd }, seq++));
        return undefined;  // NEVER interfere
      });
    }
  }

  // Disconnect on shutdown
  pi.on("session_shutdown", async () => {
    await disconnectDb();
  });
}
```

### Database Module (`lib/db.ts`)

```typescript
import postgres from "postgres";
import crypto from "node:crypto";

const OID = { text: 25, int64: 20, boolean: 16 } as const;

let sql: ReturnType<typeof postgres> | null = null;

export async function connectDb() {
  sql = postgres({
    host: "localhost",
    port: 5433,
    database: "xtdb",
    username: "xtdb",
  });
  // Verify connection
  await sql`SELECT 1 AS ok`;
}

export async function disconnectDb() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

export interface EventRow {
  id: string;
  environment: string;
  event_name: string;
  category: string;
  can_intercept: boolean;
  ts: number;
  seq: number;
  session_id?: string;
  cwd?: string;
  turn_index?: number;
  tool_name?: string;
  tool_call_id?: string;
  is_error?: boolean;
  model_provider?: string;
  model_id?: string;
  message_role?: string;
  input_source?: string;
  payload?: string;
}

export async function insertEvent(row: EventRow) {
  if (!sql) return;
  try {
    await sql`
      INSERT INTO events (
        _id, environment, event_name, category, can_intercept,
        ts, seq, session_id, cwd,
        turn_index, tool_name, tool_call_id, is_error,
        model_provider, model_id, message_role, input_source, payload
      ) VALUES (
        ${sql.typed(row.id, OID.text)},
        ${sql.typed(row.environment, OID.text)},
        ${sql.typed(row.event_name, OID.text)},
        ${sql.typed(row.category, OID.text)},
        ${sql.typed(row.can_intercept, OID.boolean)},
        ${sql.typed(row.ts, OID.int64)},
        ${sql.typed(row.seq, OID.int64)},
        ${row.session_id ? sql.typed(row.session_id, OID.text) : null},
        ${row.cwd ? sql.typed(row.cwd, OID.text) : null},
        ${row.turn_index != null ? sql.typed(row.turn_index, OID.int64) : null},
        ${row.tool_name ? sql.typed(row.tool_name, OID.text) : null},
        ${row.tool_call_id ? sql.typed(row.tool_call_id, OID.text) : null},
        ${row.is_error != null ? sql.typed(row.is_error, OID.boolean) : null},
        ${row.model_provider ? sql.typed(row.model_provider, OID.text) : null},
        ${row.model_id ? sql.typed(row.model_id, OID.text) : null},
        ${row.message_role ? sql.typed(row.message_role, OID.text) : null},
        ${row.input_source ? sql.typed(row.input_source, OID.text) : null},
        ${row.payload ? sql.typed(row.payload, OID.text) : null}
      )
    `;
  } catch (err) {
    // Log but don't crash the extension
    console.error(`[xtdb-logger] Insert failed: ${err}`);
  }
}
```

### Event Serialization (`lib/events.ts`)

```typescript
import crypto from "node:crypto";
import type { EventRow } from "./db.ts";

// All events to capture (28 of 30 — skip message_update, tool_execution_update)
export const EVENTS_TO_CAPTURE = [
  "session_directory",
  "session_start",
  "session_before_switch",
  "session_switch",
  "session_before_fork",
  "session_fork",
  "session_before_tree",
  "session_tree",
  "session_shutdown",
  "session_before_compact",
  "session_compact",
  "before_agent_start",
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  // "message_update",        — skipped (per-token, too noisy)
  "message_end",
  "tool_call",
  "tool_result",
  "tool_execution_start",
  // "tool_execution_update", — skipped (streaming chunks, too noisy)
  "tool_execution_end",
  "context",
  "before_provider_request",
  "input",
  "user_bash",
  "model_select",
  "resources_discover",
] as const;

// Category mapping
const CATEGORY: Record<string, string> = {
  session_directory: "session", session_start: "session",
  session_before_switch: "session", session_switch: "session",
  session_before_fork: "session", session_fork: "session",
  session_before_tree: "session", session_tree: "session",
  session_shutdown: "session",
  session_before_compact: "compaction", session_compact: "compaction",
  before_agent_start: "agent", agent_start: "agent", agent_end: "agent",
  turn_start: "agent", turn_end: "agent",
  message_start: "message", message_end: "message",
  tool_call: "tool", tool_result: "tool",
  tool_execution_start: "tool", tool_execution_end: "tool",
  context: "tool", before_provider_request: "tool",
  input: "input", user_bash: "input",
  model_select: "model",
  resources_discover: "resource",
};

// Events that can block/modify
const INTERCEPTABLE = new Set([
  "session_directory", "session_before_switch", "session_before_fork",
  "session_before_tree", "session_before_compact", "before_agent_start",
  "tool_call", "tool_result", "context", "before_provider_request",
  "input", "user_bash", "resources_discover",
]);

interface CtxInfo {
  sessionId: string | null;
  cwd: string;
}

// Truncate payload to avoid blowing up the DB
const MAX_PAYLOAD = 4096;
function truncPayload(obj: any): string {
  const s = JSON.stringify(obj, null, 0);
  return s.length > MAX_PAYLOAD ? s.slice(0, MAX_PAYLOAD) + "…[truncated]" : s;
}

export function serializeEvent(
  eventName: string,
  event: any,
  ctxInfo: CtxInfo | null,
  seq: number
): EventRow {
  const base: EventRow = {
    id: crypto.randomUUID(),
    environment: "pi.dev",
    event_name: eventName,
    category: CATEGORY[eventName] ?? "unknown",
    can_intercept: INTERCEPTABLE.has(eventName),
    ts: Date.now(),
    seq,
    session_id: ctxInfo?.sessionId ?? undefined,
    cwd: ctxInfo?.cwd ?? undefined,
  };

  // Extract event-specific fields
  switch (eventName) {
    case "turn_start":
    case "turn_end":
      base.turn_index = event.turnIndex;
      break;

    case "tool_call":
      base.tool_name = event.toolName;
      base.tool_call_id = event.toolCallId;
      base.payload = truncPayload(event.input);
      break;

    case "tool_result":
      base.tool_name = event.toolName;
      base.tool_call_id = event.toolCallId;
      base.is_error = event.isError;
      break;

    case "tool_execution_start":
      base.tool_name = event.toolName;
      base.tool_call_id = event.toolCallId;
      break;

    case "tool_execution_end":
      base.tool_name = event.toolName;
      base.tool_call_id = event.toolCallId;
      base.is_error = event.isError;
      break;

    case "model_select":
      base.model_provider = event.model?.provider;
      base.model_id = event.model?.id;
      break;

    case "message_start":
    case "message_end":
      base.message_role = event.message?.role;
      break;

    case "input":
      base.input_source = event.source;
      base.payload = truncPayload({ text: event.text });
      break;

    case "user_bash":
      base.payload = truncPayload({ command: event.command });
      break;

    case "before_agent_start":
      // Don't log full system prompt
      base.payload = truncPayload({ prompt: event.prompt });
      break;

    case "agent_end":
      base.payload = truncPayload({ messageCount: event.messages?.length ?? 0 });
      break;

    case "context":
      base.payload = truncPayload({ messageCount: event.messages?.length ?? 0 });
      break;

    case "before_provider_request":
      // Don't log full LLM payload — just size
      const payloadStr = JSON.stringify(event.payload ?? {});
      base.payload = truncPayload({ payloadBytes: payloadStr.length });
      break;

    default:
      // Generic: store whatever fields the event has (truncated)
      base.payload = truncPayload(event);
      break;
  }

  return base;
}
```

### package.json

```json
{
  "name": "xtdb-event-logger",
  "private": true,
  "dependencies": {
    "postgres": "^3.4.8"
  }
}
```

---

## 9. Querying Events (SQL + Time Travel)

### Basic Queries

```sql
-- All events from today
SELECT event_name, ts, tool_name, category
FROM events
ORDER BY seq;

-- Count events by category
SELECT category, COUNT(*) AS cnt
FROM events
GROUP BY category
ORDER BY cnt DESC;

-- All tool calls with their names
SELECT tool_name, COUNT(*) AS calls, SUM(CASE WHEN is_error THEN 1 ELSE 0 END) AS errors
FROM events
WHERE event_name = 'tool_call'
GROUP BY tool_name;

-- Events in a specific session
SELECT event_name, ts, payload
FROM events
WHERE session_id = '/path/to/session.jsonl'
ORDER BY seq;

-- Model switches
SELECT model_provider, model_id, ts
FROM events
WHERE event_name = 'model_select'
ORDER BY ts;

-- User input history
SELECT ts, payload
FROM events
WHERE event_name = 'input'
ORDER BY seq;

-- Average turns per agent run
SELECT AVG(max_turn) FROM (
  SELECT MAX(turn_index) AS max_turn
  FROM events
  WHERE event_name = 'turn_end'
  GROUP BY session_id
);
```

### Time-Travel Queries (XTDB Built-in)

```sql
-- Full history of ALL events ever recorded (including any corrections)
SELECT *, _system_from
FROM events
FOR ALL SYSTEM_TIME
ORDER BY _system_from;

-- Events as they existed at a specific point in time
SELECT *
FROM events
FOR SYSTEM_TIME AS OF TIMESTAMP '2026-03-16T10:00:00Z'
ORDER BY seq;

-- Events recorded between two points in time
SELECT *
FROM events
FOR SYSTEM_TIME FROM TIMESTAMP '2026-03-16T09:00:00Z'
                 TO   TIMESTAMP '2026-03-16T17:00:00Z'
ORDER BY _system_from;

-- Transaction log (built-in xt.txs table)
SELECT * FROM xt.txs ORDER BY _id DESC LIMIT 20;
```

### Analytical Queries

```sql
-- Events per hour (activity pattern)
SELECT
  ts / 3600000 * 3600000 AS hour_bucket,
  category,
  COUNT(*) AS cnt
FROM events
GROUP BY hour_bucket, category
ORDER BY hour_bucket;

-- Tool call latency (pair start+end by tool_call_id)
SELECT
  s.tool_name,
  s.tool_call_id,
  e.ts - s.ts AS duration_ms
FROM events s
JOIN events e ON s.tool_call_id = e.tool_call_id
WHERE s.event_name = 'tool_execution_start'
  AND e.event_name = 'tool_execution_end';

-- Sessions with errors
SELECT DISTINCT session_id, tool_name
FROM events
WHERE is_error = true;

-- Interceptable events that actually fired
SELECT event_name, COUNT(*)
FROM events
WHERE can_intercept = true
GROUP BY event_name
ORDER BY COUNT(*) DESC;
```

---

## 10. Implementation Steps

### Step 1: Start XTDB (one time)

```bash
mkdir -p ~/.pi/agent/xtdb-data
docker run -d \
  --name xtdb-events \
  --restart unless-stopped \
  -p 5433:5432 \
  -p 8081:8080 \
  -v ~/.pi/agent/xtdb-data:/var/lib/xtdb \
  ghcr.io/xtdb/xtdb:latest
```

### Step 2: Create extension directory

```bash
mkdir -p ~/.pi/agent/extensions/xtdb-event-logger/lib
cd ~/.pi/agent/extensions/xtdb-event-logger
npm init -y
npm install postgres
```

### Step 3: Write the extension files

- `index.ts` — entry point (subscribes to all events)
- `lib/db.ts` — XTDB connection and insert helper
- `lib/events.ts` — event list, categories, serialization

### Step 4: Test

```bash
# In pi, the extension auto-loads from ~/.pi/agent/extensions/
pi
# Or test explicitly:
pi -e ~/.pi/agent/extensions/xtdb-event-logger/index.ts
```

### Step 5: Query your events

```bash
# Connect with any Postgres client
psql -h localhost -p 5433 -U xtdb xtdb
# OR from Node.js, Python, DBeaver, Metabase, etc.
```

---

## Appendix: XTDB vs Datahike Decision Summary

```
┌──────────────────────┬──────────────────────┬─────────────────────────────┐
│                      │  Datahike            │  XTDB v2                    │
├──────────────────────┼──────────────────────┼─────────────────────────────┤
│ Query language       │  Datalog (EDN)       │  SQL (standard)             │
│ Client weight        │  18.5MB npm (beta)   │  300KB npm (postgres)       │
│ Connection           │  In-process          │  TCP (Postgres wire)        │
│ Time travel          │  Manual API          │  SQL: FOR SYSTEM_TIME       │
│ Schema               │  Define upfront      │  Dynamic (inferred)         │
│ Tooling              │  Custom only         │  psql, DBeaver, Metabase    │
│ Running              │  Nothing (embedded)  │  Docker container           │
│ Data survives crash  │  If :file backend    │  Always (server-managed)    │
│ Concurrent access    │  Tricky (file locks) │  Native (multi-client)      │
│ Nested data          │  Native              │  Native (RECORDS syntax)    │
│ License              │  EPL-1.0             │  MPL-2.0                    │
└──────────────────────┴──────────────────────┴─────────────────────────────┘

Winner for this use case: XTDB v2
Reason: Standard SQL, standard tooling, built-in bitemporality,
        tiny client, proper server, zero impedance mismatch.
```
