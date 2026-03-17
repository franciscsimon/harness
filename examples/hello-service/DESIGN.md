# hello-service — Design Doc

Minimal REST demo using Hono + @hono/node-server.
Zero external dependencies beyond those two.

## Architecture

```
┌──────────┐   GET /            ┌───────────────┐
│  Client  │───────────────────▶│               │──▶ { name, version }
│          │                    │ hello-service  │
│          │   GET /hello/:name │   (Hono)      │──▶ { greeting }
│          │───────────────────▶│               │
└──────────┘                    └───────┬───────┘
                                        │
                                   port 3111
                                 (env: PORT)
```

No database. No auth. No middleware. Pure request → JSON response.

## Endpoints

### `GET /`

Service info. Health-check target.

**Request:** no params, no body.

**Response** `200 OK`:
```json
{
  "name": "hello-service",
  "version": "1.0.0"
}
```

### `GET /hello/:name`

Returns a greeting for the given name.

**Request:** `:name` path parameter (string, URL-decoded by Hono).

**Response** `200 OK`:
```json
{
  "greeting": "Hello, Alice!"
}
```

No validation beyond what Hono's router gives — if `:name` matches, it responds.
Missing `:name` (i.e. `GET /hello/`) falls through to Hono's default 404.

## File Structure

```
examples/hello-service/
├── DESIGN.md        ← this file
├── package.json     ← deps: hono, @hono/node-server
├── index.ts         ← entry point — app + server startup
└── routes.ts        ← route definitions (GET /, GET /hello/:name)
```

Two source files. `index.ts` owns the Hono app instance and `serve()` call.
`routes.ts` exports a function that registers routes on the app.

### Why split routes from index?

So `index.ts` stays a pure entry point (create app → register routes → listen).
Routes can be tested or composed independently later without importing server bootstrap.

## Port Config

| Source        | Value |
|---------------|-------|
| `PORT` env    | any   |
| Default       | 3111  |

Read via `process.env.PORT` with fallback. No dotenv, no config file.

## Run

```bash
cd examples/hello-service
npm install
npx jiti index.ts
```

Matches the `npx jiti` convention used by `xtdb-event-logger-ui` in this repo.

`package.json` scripts:
- `start` → `npx jiti index.ts`

## Non-Goals

- No tests (demo service — add if it graduates)
- No Docker
- No middleware (cors, logging, etc.)
- No build step — `jiti` handles TypeScript directly
- No input validation beyond path routing
