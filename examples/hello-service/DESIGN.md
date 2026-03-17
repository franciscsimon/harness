# hello-service — Design

Minimal REST service. Two endpoints, no database, no auth.

## Endpoints

| Method | Path           | Response                                      | Status |
|--------|----------------|-----------------------------------------------|--------|
| GET    | `/`            | `{ "name": "hello-service", "version": "1.0.0" }` | 200    |
| GET    | `/hello/:name` | `{ "greeting": "Hello, {name}!" }`            | 200    |

## File Structure

```
hello-service/
├── package.json        # deps + scripts
├── index.ts            # entry — creates server, binds port
├── app.ts              # Hono app + route definitions
├── test.ts             # smoke tests against live server
└── DESIGN.md           # this file
```

## Component Responsibilities

| File       | Responsibility                              | Owns                  |
|------------|---------------------------------------------|-----------------------|
| `app.ts`   | Define Hono app, register routes, set JSON responses | Route logic, response shapes |
| `index.ts` | Import app, start `@hono/node-server` on port 3111  | Process lifecycle     |
| `test.ts`  | Hit endpoints via fetch, assert status + body        | Correctness checks    |

**Why two files instead of one?**
Separating `app` from `index` lets tests import the app without starting a server. Standard Hono pattern.

## Data Flow

```
         Request                    Response
            │                          ▲
            ▼                          │
┌───────────────────────┐              │
│     Node HTTP Server  │  (port 3111) │
│   (@hono/node-server) │──────────────┘
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│       Hono App        │
│                       │
│  GET /         ───▶ return static JSON { name, version }
│  GET /hello/:name ──▶ read :name param, interpolate, return JSON
└───────────────────────┘
```

No middleware, no external calls, no state. Every request is a pure function of the URL.

## Dependencies

| Package              | Purpose                        |
|----------------------|--------------------------------|
| `hono`               | Router + request/response API  |
| `@hono/node-server`  | Runs Hono on Node `http.createServer` |
| `jiti`               | Executes TypeScript directly (no tsc/build step) |

Runtime: Node.js. No build artifacts.

## Scripts

```
npm start   →  npx jiti index.ts    # run server
npm test    →  npx jiti test.ts     # run smoke tests
```

## Non-Goals

- No middleware (logging, CORS, error handling beyond defaults)
- No configuration / env vars — port is hardcoded 3111
- No Docker / containerization
- No CI pipeline
- No input validation beyond what Hono route params provide
- No graceful shutdown handling
- No OpenAPI spec generation
