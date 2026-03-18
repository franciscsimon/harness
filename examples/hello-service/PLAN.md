# hello-service — Implementation Plan

Self-contained plan. A worker agent can follow this without reading DESIGN.md or ARCHITECTURE.md.

---

## Goal

Create a minimal Hono REST service with two endpoints, a server entry point, and smoke tests. Four files total, zero build step.

---

## File Creation Order

| Order | File             | Why this order                                        |
|-------|------------------|-------------------------------------------------------|
| 1     | `package.json`   | Defines project metadata and deps — `npm install` needs it first |
| 2     | `app.ts`         | Pure library, zero project-file dependencies — leaf node in the import graph |
| 3     | `index.ts`       | Imports `app.ts` — must exist after it                |
| 4     | `test.ts`        | Imports `app.ts` + `@hono/node-server` — last because it depends on everything |
| 5     | *(run `npm install`)* | Installs hono, @hono/node-server, jiti              |
| 6     | *(run `npm test`)*    | Verify all assertions pass                           |

---

## Step 1 — Create `package.json`

**What:** Project manifest with dependencies and npm scripts.

**Exact content:**

```json
{
  "name": "hello-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx jiti index.ts",
    "test": "npx jiti test.ts"
  },
  "dependencies": {
    "hono": "^4",
    "@hono/node-server": "^1",
    "jiti": "^2"
  }
}
```

**Key decisions:**

- `"type": "module"` — enables ESM imports in `.ts` files via jiti.
- All three packages are runtime `dependencies`, not `devDependencies` — jiti replaces a build toolchain so it's needed at runtime.
- Version ranges use caret (`^`) for latest compatible.
- `"private": true` — prevents accidental publish.

**Exports/imports:** N/A (config file).

---

## Step 2 — Create `app.ts`

**What:** Hono app with two routes. Default export. **Must be side-effect-free** — importing this file must not start a server, print anything, or touch the network.

**Exact content:**

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({ name: 'hello-service', version: '1.0.0' })
})

app.get('/hello/:name', (c) => {
  const name = c.req.param('name')
  return c.json({ greeting: `Hello, ${name}!` })
})

export default app
```

**Key decisions:**

- Default export (not named) — matches Hono convention and what `index.ts` / `test.ts` expect.
- `version: '1.0.0'` is hardcoded in the handler, not read from `package.json`. This is intentional per design (keeps it dead simple; known risk: version drift).
- Route param accessed via `c.req.param('name')` — standard Hono API.
- No middleware, no error handlers, no 404 override — Hono's default 404 behavior is used.

**Import rules:**

- ✅ Imports: `hono`
- ❌ Must NOT import: `@hono/node-server`, `index.ts`, `test.ts`

**Exports:**

| Export    | Kind    | Type   | Description                     |
|-----------|---------|--------|---------------------------------|
| `default` | default | `Hono` | Configured app with routes registered |

---

## Step 3 — Create `index.ts`

**What:** Entry point that starts an HTTP server. Side-effectful — runs on import.

**Exact content:**

```typescript
import { serve } from '@hono/node-server'
import app from './app.js'

serve({ fetch: app.fetch, port: 3111 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
```

**Key decisions:**

- Import path is `'./app.js'` (with `.js` extension) — required for ESM resolution. jiti resolves this to `app.ts` at runtime.
- Port `3111` is hardcoded (no env var). Design explicitly lists env-var config as a non-goal.
- The optional callback logs the URL — useful for manual `npm start` but not required by the contract.
- `serve()` takes `{ fetch, port }` — the `fetch` property receives `app.fetch` (Hono's standard fetch handler).

**Import rules:**

- ✅ Imports: `@hono/node-server`, `./app.js`
- ❌ Must NOT import: `test.ts`

**Exports:** None. This is a side-effectful entry point.

---

## Step 4 — Create `test.ts`

**What:** Smoke tests. Starts a server on port 3111 inline, runs fetch assertions, tears down, exits with 0 (pass) or 1 (fail).

**Exact content:**

```typescript
import { serve } from '@hono/node-server'
import assert from 'node:assert/strict'
import app from './app.js'

const server = serve({ fetch: app.fetch, port: 3111 })

async function run() {
  // --- GET / ---
  const root = await fetch('http://localhost:3111/')
  assert.equal(root.status, 200, 'GET / should return 200')
  const rootBody = await root.json()
  assert.equal(rootBody.name, 'hello-service', 'name should be hello-service')
  assert.equal(rootBody.version, '1.0.0', 'version should be 1.0.0')

  // --- GET /hello/:name ---
  const hello = await fetch('http://localhost:3111/hello/world')
  assert.equal(hello.status, 200, 'GET /hello/world should return 200')
  const helloBody = await hello.json()
  assert.equal(helloBody.greeting, 'Hello, world!', 'greeting should interpolate name')

  // --- 404 ---
  const notFound = await fetch('http://localhost:3111/nonexistent')
  assert.equal(notFound.status, 404, 'Unknown route should return 404')

  console.log('All tests passed')
}

run()
  .catch((err) => {
    console.error('Test failed:', err.message)
    process.exit(1)
  })
  .finally(() => {
    server.close()
  })
```

**Key decisions:**

- Uses `node:assert/strict` — no test framework needed for 6 assertions.
- Starts its own server via `serve()` — does NOT import `index.ts` (that would create a duplicate listener).
- `server.close()` in `.finally()` ensures cleanup even on failure — prevents process hang.
- Tests use real HTTP `fetch` against a live server (integration-style), not Hono's `app.request()` — design chose realism over speed.
- Exit code 1 on any assertion failure — standard for `npm test`.

**Import rules:**

- ✅ Imports: `@hono/node-server`, `node:assert/strict`, `./app.js`
- ❌ Must NOT import: `index.ts`

**Exports:** None. Test entry point.

**6 assertions total:**

| # | Target                        | Assert                              |
|---|-------------------------------|-------------------------------------|
| 1 | `GET /` status                | `=== 200`                           |
| 2 | `GET /` body `.name`          | `=== 'hello-service'`              |
| 3 | `GET /` body `.version`       | `=== '1.0.0'`                      |
| 4 | `GET /hello/world` status     | `=== 200`                           |
| 5 | `GET /hello/world` body `.greeting` | `=== 'Hello, world!'`        |
| 6 | `GET /nonexistent` status     | `=== 404`                           |

---

## Step 5 — Install Dependencies

```bash
cd /home/opunix/harness/examples/hello-service
npm install
```

**Expected result:**

- `node_modules/` created with `hono`, `@hono/node-server`, `jiti` and their transitive deps.
- `package-lock.json` created.
- Zero warnings about peer deps or deprecated packages (all three packages are current).

---

## Step 6 — Run Tests

```bash
cd /home/opunix/harness/examples/hello-service
npm test
```

**Expected output:**

```
All tests passed
```

**Expected exit code:** `0`

**If port 3111 is busy:** Kill whatever is on it first — `lsof -ti:3111 | xargs kill -9` — then retry.

---

## Validation Criteria — "Done" Checklist

| #  | Criterion                                                   | How to verify              |
|----|-------------------------------------------------------------|----------------------------|
| 1  | `package.json` exists with correct deps and scripts         | `cat package.json`         |
| 2  | `app.ts` exports a Hono app with 2 routes, no side effects | Read file; confirm no `serve()` call |
| 3  | `index.ts` imports app and starts server on port 3111       | Read file                  |
| 4  | `test.ts` runs 6 assertions and calls `server.close()`     | Read file                  |
| 5  | `npm install` succeeds — `node_modules/` exists             | `ls node_modules/`         |
| 6  | `npm test` exits 0 with "All tests passed"                  | `npm test`                 |
| 7  | `npm start` starts server; `curl localhost:3111/` returns `{"name":"hello-service","version":"1.0.0"}` | Manual check |
| 8  | `curl localhost:3111/hello/alice` returns `{"greeting":"Hello, alice!"}` | Manual check |
| 9  | `app.ts` does NOT import `@hono/node-server` or `index.ts` | `grep` imports             |
| 10 | `test.ts` does NOT import `index.ts`                        | `grep` imports             |

---

## Risks & Mitigations

| Risk                      | Likelihood | Mitigation                                                    |
|---------------------------|------------|---------------------------------------------------------------|
| Port 3111 already in use  | Medium     | Kill existing process before test: `lsof -ti:3111 \| xargs kill` |
| jiti version incompatibility | Low     | Pin `^2`; jiti v2 supports ESM + TS natively                  |
| `.js` import extension confuses jiti | Low | jiti handles `.js` → `.ts` resolution in ESM mode           |
| test hangs if server.close() fails | Low | `.finally()` block ensures cleanup runs                     |

---

## What NOT To Do

- Do NOT add a `tsconfig.json` — jiti doesn't need one.
- Do NOT add middleware, CORS, logging, or error handlers — explicitly out of scope.
- Do NOT read version from `package.json` at runtime — hardcode `"1.0.0"`.
- Do NOT use `PORT` env var — hardcode `3111`.
- Do NOT add a build step or `tsc` — jiti executes TS directly.
- Do NOT use a test framework (vitest, jest, etc.) — `node:assert/strict` is sufficient.
