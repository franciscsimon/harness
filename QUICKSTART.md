# Quickstart: Build a Hello Service Using the Harness

This walks through building a REST service **using the harness tools and agents** — not by hand. You'll use `plan_chunks` to plan, `delegate` to spawn specialized agents, `quality_check` to verify code, and `check_alignment` to stay on track.

## Prerequisites

```bash
# XTDB (events are captured automatically)
docker run -d --name xtdb-events -p 5433:5432 -p 8081:8080 ghcr.io/xtdb/xtdb:latest

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
📦 Created 6 steps:
  1. Delegate to architect: design the API contract
  2. Delegate to worker: implement the service
  3. Run quality_check on the implementation
  4. Delegate to tester: write tests
  5. Run tests and check_alignment
  6. diff_check and commit
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

### GET /
Response: { "name": "hello-service", "version": "1.0.0" }

### GET /hello/:name
Response: { "greeting": "Hello, Alice!" }

## File Structure
├── index.ts    ← entry point
└── routes.ts   ← route definitions
```

The architect is a **read-only agent** — `setActiveTools` restricts it to `read`, `bash`, `grep`, `find`, `ls`, `write`. It designs but doesn't run anything.

## Step 3: Worker implements it

The `delegate` tool spawns a **worker agent**:

```
delegate(agent: "worker", task: "Implement hello-service per DESIGN.md.
Create package.json, routes.ts, index.ts. Run npm install.")
```

The worker reads the design doc, creates 3 files, runs `npm install`. Two source files:

**`routes.ts`** — route definitions, composable independently:
```typescript
export function registerRoutes(app: Hono) {
  app.get("/", (c) => c.json({ name: "hello-service", version: "1.0.0" }));
  app.get("/hello/:name", (c) => c.json({ greeting: `Hello, ${c.req.param("name")}!` }));
}
```

**`index.ts`** — entry point:
```typescript
const app = new Hono();
registerRoutes(app);
serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3111 });
```

## Step 4: Quality check

The `quality_check` tool runs deterministic checks on each file:

```
quality_check(path: "examples/hello-service/index.ts")   → ✅ No issues
quality_check(path: "examples/hello-service/routes.ts")   → ✅ No issues
```

Checks: comment ratio, file size, function size, duplication, dead code.

## Step 5: Tester writes tests

The `delegate` tool spawns a **tester agent**:

```
delegate(agent: "tester", task: "Write tests for hello-service.
Read DESIGN.md and routes.ts. Test all endpoints including 404.")
```

The tester reads the design and source, writes `test.ts` with 4 assertions:

```
hello-service tests

  ✓ GET / returns 200 with { name, version }
  ✓ GET /hello/World returns greeting
  ✓ GET /hello/Pi returns greeting
  ✓ GET /nonexistent returns 404

4 passed, 0 failed
```

## Step 6: Verify alignment

The `check_alignment` tool compares what was done vs the original request:

```
check_alignment() → Files touched: DESIGN.md, index.ts, routes.ts,
                     package.json, test.ts — all on target
```

## Step 7: Commit

The `diff_check` tool verifies the change is appropriately sized for a single commit:

```
diff_check() → 7 files, 196 insertions — ok to commit
```

## What just happened

You gave a one-line prompt. The harness:

1. **`plan_chunks`** broke it into 6 ordered steps
2. **`delegate → architect`** designed the API (isolated process, read-only tools)
3. **`delegate → worker`** implemented it from the design (read the DESIGN.md, wrote code)
4. **`quality_check`** verified code quality on each file
5. **`delegate → tester`** wrote and ran tests (read the design + source, wrote test.ts)
6. **`check_alignment`** confirmed no drift from the goal
7. **`diff_check`** validated commit size

Meanwhile, **34 extensions** ran in the background:
- `xtdb-event-logger` captured every event into XTDB (full content, schema v2)
- `permission-gate` checked bash commands for dangerous patterns
- `canary-monitor` tracked context health
- `slop-detector` scanned output for anti-patterns
- `habit-monitor` enforced coding habits

All of this is visible in the UI at http://localhost:3333 — every tool call, every LLM response, every file write.

## Tools used in this example

| Tool | Purpose |
|------|---------|
| `plan_chunks` | Break task into ordered steps |
| `delegate` | Spawn architect, worker, tester agents |
| `quality_check` | Verify code quality |
| `check_alignment` | Confirm work matches request |
| `diff_check` | Validate commit size |

## Agents used in this example

| Agent | Role | Constraints |
|-------|------|-------------|
| `architect` | Design API contract | Read-only tools |
| `worker` | Implement from design | Full tool access |
| `tester` | Write and run tests | Full tool access |

## Run it yourself

```bash
cd ~/harness/examples/hello-service
npm install
npm start           # → http://localhost:3111
npx jiti test.ts    # 4 tests pass

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
