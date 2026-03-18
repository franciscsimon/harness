# hello-service — Architecture

Derived from [DESIGN.md](./DESIGN.md). This document maps components, data flow,
dependency boundaries, interface contracts, and architectural risks.

---

## 1. Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      hello-service                      │
│                                                         │
│  ┌──────────┐  imports   ┌──────────┐                   │
│  │ index.ts │───────────▶│  app.ts  │                   │
│  │ (entry)  │            │ (routes) │                   │
│  └────┬─────┘            └──────────┘                   │
│       │                       ▲                         │
│       │ starts server         │ imports (test-time)     │
│       ▼                       │                         │
│  ┌──────────────┐        ┌─────────┐                    │
│  │ @hono/       │        │ test.ts │                    │
│  │ node-server  │        │ (smoke) │                    │
│  │ (port 3111)  │        └─────────┘                    │
│  └──────────────┘                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘

External:
  hono           — Router framework (app.ts depends on)
  @hono/node-server — HTTP adapter (index.ts depends on)
  jiti           — TS executor (invoked by npm scripts, not imported)
```

### Component Table

| Component        | Type         | Role                                  |
|------------------|--------------|---------------------------------------|
| `app.ts`         | Library      | Pure Hono app. No side effects on import. Exports the app instance. |
| `index.ts`       | Entry point  | Side-effectful. Imports app, starts HTTP server on port 3111. |
| `test.ts`        | Test harness | Starts a server inline, runs fetch-based assertions, exits. |
| `package.json`   | Config       | Declares deps, defines `start` and `test` scripts. |

---

## 2. Data Flow — Request Lifecycle

```
Client (curl / fetch / browser)
  │
  │  HTTP GET  (port 3111)
  ▼
┌──────────────────────────────┐
│  Node http.createServer      │  ← created by @hono/node-server
│  Listening on 0.0.0.0:3111  │
└──────────┬───────────────────┘
           │
           │  Adapts IncomingMessage → Hono Request
           ▼
┌──────────────────────────────┐
│  Hono Router                 │
│                              │
│  Match path against:         │
│    GET /            ─────────┼──▶ Handler A
│    GET /hello/:name ─────────┼──▶ Handler B
│    (no match)       ─────────┼──▶ Hono 404 default
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Handler A: GET /            │
│  return c.json({             │
│    name: "hello-service",    │
│    version: "1.0.0"          │
│  })                          │
└──────────────────────────────┘

┌──────────────────────────────┐
│  Handler B: GET /hello/:name │
│  const name = c.req.param(   │
│    "name"                    │
│  )                           │
│  return c.json({             │
│    greeting: `Hello, ${name}!`│
│  })                          │
└──────────────────────────────┘
           │
           │  Hono Response → Node ServerResponse
           ▼
Client receives JSON + status 200
Content-Type: application/json
```

### Key properties

- **Stateless.** No in-memory state, no sessions, no database.
- **Pure.** Response is a deterministic function of the URL path.
- **Synchronous.** No async I/O in handlers — all responses are immediate.

---

## 3. Dependency Boundaries

```
                  ┌─────────────┐
                  │   index.ts  │
                  │   (entry)   │
                  └──────┬──────┘
                         │
              imports     │     imports
         ┌───────────────┼──────────────────┐
         ▼               ▼                  │
┌─────────────┐   ┌──────────┐              │
│   app.ts    │   │ @hono/   │              │
│ (pure lib)  │   │ node-srv │              │
└──────┬──────┘   └──────────┘              │
       │                                    │
       │ imports                            │
       ▼                                    │
┌──────────┐                                │
│   hono   │                                │
└──────────┘                                │

                  ┌──────────┐
                  │ test.ts  │  (separate entry)
                  └─────┬────┘
                        │
             imports    │    imports
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  app.ts  │  │ @hono/   │  │  node    │
   │          │  │ node-srv │  │  assert  │
   └──────────┘  └──────────┘  └──────────┘
```

### Import Rules

| Module     | Can import             | Must NOT import    |
|------------|------------------------|--------------------|
| `app.ts`   | `hono`                 | `index.ts`, `test.ts`, `@hono/node-server` |
| `index.ts` | `app.ts`, `@hono/node-server` | `test.ts`    |
| `test.ts`  | `app.ts`, `@hono/node-server`, `node:assert`, `node:child_process` | `index.ts` |

**Critical boundary:** `app.ts` must remain side-effect-free on import.
It must not call `serve()`, listen on a port, or write to stdout. This is
what makes it testable in isolation.

---

## 4. Interface Contracts

### `app.ts` — Exports

```
export default app: Hono
```

| Export   | Type   | Description                              |
|----------|--------|------------------------------------------|
| `app`    | `Hono` | Default export. Configured Hono instance with routes registered. |

**Registered Routes:**

| Method | Path           | Response Type                                  | Status |
|--------|----------------|------------------------------------------------|--------|
| GET    | `/`            | `{ name: string, version: string }`            | 200    |
| GET    | `/hello/:name` | `{ greeting: string }`                         | 200    |
| *      | `*`            | Hono default 404 (`{ message: "Not Found" }` or plain text) | 404 |

**Response shape contracts:**

```
GET /
→ 200 { "name": "hello-service", "version": "1.0.0" }

GET /hello/world
→ 200 { "greeting": "Hello, world!" }

GET /anything-else
→ 404  (Hono default — shape not guaranteed by this service)
```

### `index.ts` — Exports

```
(none — side-effectful entry point)
```

Behavior on execution:
1. Imports `app` from `./app.ts`
2. Calls `serve({ fetch: app.fetch, port: 3111 })`
3. Server listens on port 3111 until process exits

### `test.ts` — Exports

```
(none — test entry point)
```

Behavior on execution:
1. Starts an HTTP server using `app` on port 3111
2. Runs fetch-based assertions against `http://localhost:3111`
3. Verifies: status codes, response body structure, 404 handling
4. Closes server, exits with code 0 (pass) or 1 (fail)

---

## 5. Architectural Risks & Ambiguities

### ⚠️ Port Collision (Risk: Medium)

Port 3111 is hardcoded in both `index.ts` and `test.ts`. If anything else
occupies port 3111 when tests run, they fail with `EADDRINUSE`. The design
explicitly lists "no configuration / env vars" as a non-goal, so this is
accepted but remains the most likely failure mode.

**Mitigation if needed:** Accept `PORT` env var with 3111 as default.

### ⚠️ Test Architecture — Live Server in Tests (Risk: Low-Medium)

`test.ts` starts a real HTTP server and hits it via `fetch`. This is an
integration test, not a unit test. Consequences:

- Tests depend on port availability (see above)
- Tests are slower than in-process Hono `app.request()` calls
- If the server fails to start, error messages may be confusing

Hono supports `app.request('/path')` for in-process testing without a
server. The design chose live-server tests for realism — a valid tradeoff
for a smoke test, but worth noting.

### ⚠️ No Graceful Shutdown (Risk: Low)

Listed as a non-goal. For this minimal service it's fine. If `test.ts`
starts a server, it must close it explicitly or the process hangs. The
test harness must handle this.

### ⚠️ 404 Response Shape Not Specified (Risk: Low)

The design specifies 404 status for unknown routes but doesn't define the
response body. Hono's default 404 returns `404 Not Found` as plain text.
Tests should assert on status code only, not body content, unless the
design adds an explicit 404 handler.

### ⚠️ Version String Hardcoded (Risk: Low)

`"version": "1.0.0"` appears in route handler code and must stay in sync
with `package.json` version. For this example it's fine; in production
you'd read it from `package.json` at startup.

### ✅ Clean Separation (No Risk)

The app/index split is the standard Hono pattern and is well-suited here.
`app.ts` is a pure library; `index.ts` is the effectful entry point.
This is the most important architectural decision in the design and it's
correct.

---

## Summary

| Aspect                | Assessment |
|-----------------------|------------|
| Complexity            | Minimal — 3 files, 2 routes, 0 state |
| Testability           | Good — app/index split enables isolated import |
| Dependency count      | 3 (hono, @hono/node-server, jiti) — appropriate |
| Operational concerns  | None needed for example scope |
| Biggest risk          | Port collision during test runs |
| Design quality        | Clean, intentionally minimal, well-scoped non-goals |
