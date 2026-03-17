# Quickstart: Build a Hello Service with the Harness

This walks you through building a tiny REST service while the harness captures every event. You'll see your coding session — every tool call, every LLM response, every file write — stored in XTDB and browsable in the UI.

## 1. Start the infrastructure

```bash
# Start XTDB (one-time)
docker run -d --name xtdb-events \
  -p 5433:5432 -p 8081:8080 \
  ghcr.io/xtdb/xtdb:latest

# Start the event stream UI
cd ~/harness/xtdb-event-logger-ui
npm install
npm start    # → http://localhost:3333
```

## 2. Start pi and build the service

Open a new terminal:

```bash
cd ~/harness/examples/hello-service
pi
```

Ask pi to build it:

```
Build a REST service with Hono that has:
- GET / returning { service: "hello-service", version: "1.0.0" }
- GET /hello/:name returning { message: "Hello {name}!" }
- Listen on port 4000
```

Pi will create `server.ts`, install dependencies, and you'll have a running service. Every step — the `write` calls, `bash` calls, LLM responses — flows into XTDB.

> Or skip the build step and use the pre-built example:
> ```bash
> cd ~/harness/examples/hello-service
> npm install && npm start
> ```

## 3. Test it

```bash
curl http://localhost:4000/
# → {"service":"hello-service","version":"1.0.0"}

curl http://localhost:4000/hello/World
# → {"message":"Hello World!"}
```

## 4. See your session in the UI

Open http://localhost:3333. You'll see:

### Live Stream (`/`)
Every event from your pi session scrolling in real-time. Filter by category (tool, message, agent) or search by event name.

### Session Timeline (`/sessions/...`)
Click your session to see the full timeline, grouped into nested layers:

```
▼ Agent Run #1
  ├─ before_agent_start  prompt: "Build a REST service..."
  ├─ context             145 msgs
  ├─ before_provider_request  138KB
  ▼ Turn 0
  │ ├─ message_start     assistant
  │ ├─ message_update    delta: "I'll create a Hono..."
  │ ▼ Tool: write (server.ts)
  │ │ ├─ tool_call       input: {"path":"server.ts","content":"import..."}
  │ │ ├─ tool_result     output: "Successfully wrote 465 bytes"
  │ │ └─ tool_execution_end
  │ ▼ Tool: bash (npm install)
  │ │ ├─ tool_call       input: {"command":"npm install"}
  │ │ ├─ tool_result     output: "added 2 packages..."
  │ │ └─ tool_execution_end
  │ └─ turn_end          2 tools, response: "I've created..."
  └─ agent_end           4 messages
```

### Event Detail (`/event/...`)
Click any event to see its full content. Tool results show the complete output — no truncation. Content fields are expandable JSON blocks with copy buttons.

### Context Sparkline
The session page shows a sparkline of context size over time. Watch it grow as the conversation progresses. Green < 50KB, yellow 50-100KB, red > 100KB.

## 5. Query the data directly

```bash
psql -h localhost -p 5433 -d xtdb -U xtdb
```

```sql
-- What tools did pi use?
SELECT tool_name, COUNT(*) FROM events
WHERE event_name = 'tool_call'
GROUP BY tool_name ORDER BY count DESC;

-- What files were written?
SELECT tool_input FROM events
WHERE event_name = 'tool_call' AND tool_name = 'write';

-- Full tool output for a bash command
SELECT tool_content FROM events
WHERE event_name = 'tool_result' AND tool_name = 'bash';
```

## What's happening under the hood

```
You type a prompt
  │
  ├→ input event (your text, stored in full)
  ├→ before_agent_start (system prompt captured)
  ├→ context (full conversation array)
  ├→ before_provider_request (complete LLM payload)
  │
  │  LLM streams a response
  ├→ message_start → message_update (each token) → message_end
  │
  │  LLM calls tools
  ├→ tool_call (full input JSON: file path, content, command)
  ├→ tool_result (full output: file contents, bash stdout, errors)
  │
  ├→ turn_end (assistant message + all tool results)
  └→ agent_end (complete message array)
```

All 30 event types captured. All content stored in full. Schema v2 — nothing truncated.

## The hello-service source

The complete example is 3 files:

**`server.ts`** — 15 lines
```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/", (c) => c.json({ service: "hello-service", version: "1.0.0" }));

app.get("/hello/:name", (c) => {
  const name = c.req.param("name");
  return c.json({ message: `Hello ${name}!` });
});

serve({ fetch: app.fetch, port: 4000 }, () => {
  console.log("  🎯 hello-service running → http://localhost:4000");
});
```

**`test.ts`** — run with `npm test`

**`package.json`** — hono + @hono/node-server

The point isn't the service. The point is that every step of building it was captured, queryable, and visible in the UI.
