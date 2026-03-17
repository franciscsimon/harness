# hello-service Design

Minimal REST service. Hono + @hono/node-server on port **3111**.

## Endpoints

| Method | Path          | Response                          | Status |
|--------|---------------|-----------------------------------|--------|
| GET    | `/`           | `{ "name": "hello-service", "version": "1.0.0" }` | 200 |
| GET    | `/hello/:name`| `{ "greeting": "Hello, {name}!" }`| 200 |

## File Structure

```
examples/hello-service/
├── package.json
├── tsconfig.json
├── DESIGN.md
└── src/
    ├── index.ts      # Server entry — creates Hono app, mounts routes, starts @hono/node-server on :3111
    └── routes.ts     # Route definitions — exports a function that registers GET / and GET /hello/:name
```

## Component Responsibilities

**index.ts** — Entry point. Owns the Hono app instance and server lifecycle.
- Creates `new Hono()`
- Calls `registerRoutes(app)` from routes.ts
- Starts `serve({ fetch: app.fetch, port: 3111 })`

**routes.ts** — Pure route definitions. No server concerns.
- Exports `registerRoutes(app: Hono): void`
- `GET /` → reads name/version from package.json (or hardcoded constants)
- `GET /hello/:name` → extracts `:name` param, returns greeting object

## Data Flow

```
Client
  │
  │  GET /
  ▼
┌──────────┐     ┌────────────┐
│ index.ts │────▶│ routes.ts  │
│ (server) │     │ (handlers) │
└──────────┘     └────────────┘
  listen :3111
```

No database. No middleware. No external dependencies beyond Hono.

## Dependencies

- `hono`
- `@hono/node-server`
- `typescript` (dev)

## Non-Goals

- No auth, no logging middleware, no error handling beyond Hono defaults.
- No tests in this minimal example.
