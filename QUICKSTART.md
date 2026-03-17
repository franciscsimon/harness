# Quickstart: Build a Hello Service Using the Harness

This walks through building a REST service **using the harness tools and agents** — not by hand. You'll use `plan_chunks` to plan, `delegate` to spawn specialized agents, `quality_check` to verify code, and `check_alignment` to stay on track.

## Prerequisites

```bash
# XTDB (events are captured automatically)
cd ~/harness && docker compose up -d

# Event stream UI (optional, to watch events flow)
cd ~/harness/xtdb-event-logger-ui && npm install && npm start
# → http://localhost:3333
```

## Step 1: Plan the work

Use `plan_chunks` to break the task into steps:

```
Build a REST service called hello-service with GET / and GET /hello/:name
```

The agent uses the `plan_chunks` tool automatically:

```
📦 Created 7 steps:
  1. Wipe hello-service (keep node_modules for speed)
  2. Delegate to architect: design the API contract
  3. Delegate to worker: implement the service
  4. Run quality_check on the implementation
  5. Delegate to tester: write tests
  6. Run tests and check_alignment
  7. Update docs based on actual results
```

Each step is independently completable and testable.

## Step 2: Architect designs the API

The `delegate` tool spawns an **architect agent** in an isolated process:

```
delegate(agent: "architect", task: "Design a minimal REST service called
hello-service. GET / returns service info, GET /hello/:name returns greeting.
Use Hono. Output a DESIGN.md with endpoints, request/response shapes,
file structure, port config.")
```

The architect reads nothing, writes one file — `DESIGN.md`:

```markdown
## Endpoints

| Method | Path           | Response                                      | Status |
|--------|----------------|-----------------------------------------------|--------|
| GET    | `/`            | `{ "name": "hello-service", "version": "1.0.0" }` | 200    |
| GET    | `/hello/:name` | `{ "greeting": "Hello, {name}!" }`            | 200    |

## File Structure
├── app.ts      ← Hono app + routes (importable for tests)
├── index.ts    ← entry point (starts server)
└── test.ts     ← smoke tests
```

The architect chose to separate `app.ts` from `index.ts` so tests can import the app without starting a server — standard Hono pattern.

## Step 3: Worker implements it

The `delegate` tool spawns a **worker agent**:

```
delegate(agent: "worker", task: "Implement hello-service per DESIGN.md.
Create app.ts and index.ts. Do NOT create test.ts.")
```

The worker reads the design doc, creates 2 files:

**`app.ts`** — Hono app with routes, exported for test import:
```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ name: "hello-service", version: "1.0.0" });
});

app.get("/hello/:name", (c) => {
  const name = c.req.param("name");
  return c.json({ greeting: `Hello, ${name}!` });
});

export default app;
```

**`index.ts`** — entry point:
```typescript
import { serve } from "@hono/node-server";
import app from "./app";

serve({ fetch: app.fetch, port: 3111 }, () => {
  console.log("hello-service listening on http://localhost:3111");
});
```

## Step 4: Quality check

The `quality_check` tool runs deterministic checks on each file:

```
quality_check(path: "examples/hello-service/app.ts")      → ✅ No issues
quality_check(path: "examples/hello-service/index.ts")     → ✅ No issues
```

Checks: comment ratio, file size, function size, duplication, dead code.

## Step 5: Tester writes tests

The `delegate` tool spawns a **tester agent**:

```
delegate(agent: "tester", task: "Write tests for hello-service.
Read DESIGN.md and app.ts. Test all endpoints including 404.")
```

The tester reads the design and source, writes `test.ts` with 5 tests:

```
✅ GET / returns 200
✅ GET / returns correct body
✅ GET /hello/World returns 200 with greeting
✅ GET /hello/Pi returns 200 with greeting
✅ GET /nonexistent returns 404

5 tests: 5 passed, 0 failed
```

The tester imported `app` directly and used `@hono/node-server`'s `serve()` — no external test framework needed.

## Step 6: Verify alignment

The `check_alignment` tool compares what was done vs the original request:

```
check_alignment() → Files touched: DESIGN.md, app.ts, index.ts, test.ts — all on target
```

## What just happened

You gave a one-line prompt. The harness:

1. **`plan_chunks`** broke it into 7 ordered steps
2. **`delegate → architect`** designed the API (isolated process, wrote DESIGN.md)
3. **`delegate → worker`** implemented it from the design (read DESIGN.md, wrote app.ts + index.ts)
4. **`quality_check`** verified code quality on each file
5. **`delegate → tester`** wrote and ran tests (read design + source, wrote test.ts, 5/5 pass)
6. **`check_alignment`** confirmed no drift from the goal

Meanwhile, **36 extensions** ran in the background:
- `xtdb-event-logger` captured every event into XTDB (full content, schema v2)
- `project-registry` auto-registered the project from the git repo
- `decision-log` injected prior decisions into context and recorded new ones
- `permission-gate` checked bash commands for dangerous patterns
- `canary-monitor` tracked context health
- `slop-detector` scanned output for anti-patterns
- `habit-monitor` enforced coding habits

All of this is visible in the UI at http://localhost:3333 — every tool call, every LLM response, every file write, every project and decision.

## Tools used in this example

| Tool | Purpose |
|------|---------|
| `plan_chunks` | Break task into ordered steps |
| `delegate` | Spawn architect, worker, tester agents |
| `quality_check` | Verify code quality |
| `check_alignment` | Confirm work matches request |

## Agents used in this example

| Agent | Role |
|-------|------|
| `architect` | Design API contract, write DESIGN.md |
| `worker` | Implement from design doc |
| `tester` | Write and run tests |

## Run it yourself

```bash
cd ~/harness/examples/hello-service
npm install
npm start           # → http://localhost:3111
npx jiti test.ts    # 5 tests pass

curl http://localhost:3111/
# → {"name":"hello-service","version":"1.0.0"}

curl http://localhost:3111/hello/World
# → {"greeting":"Hello, World!"}
```

## See the events

```bash
# Open the UI
open http://localhost:3333

# Or query XTDB directly
psql -h localhost -p 5433 -d xtdb -U xtdb -c "
  SELECT event_name, tool_name, LEFT(tool_input, 60)
  FROM events WHERE event_name = 'tool_call'
  ORDER BY seq DESC LIMIT 10"
```
