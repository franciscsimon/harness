# TypeScript Monorepo Audit: Logging, Configuration, & API Design
**Harness Monorepo Comprehensive Code Audit**
**Research-only audit — no code changes made**

---

## PART 1: LOGGING & OBSERVABILITY

### 1.1 Console Statement Inventory

**Total console statements found: 441**
- `console.log`: 362 (82%)
- `console.error`: 68 (15%)
- `console.warn`: 12 (3%)
- `console.info` / `console.debug` / `console.trace`: 0

**Key Files with High Logging:**
- `/harness-ui/server.ts`: Deploy & operation logs
- `/docker-event-collector/server.ts`: Service lifecycle logs
- `/code-quality/detect.ts`: Stack analysis output
- `/ci-runner/server.ts`: Job queue logging
- Test files: Handler tests, lifecycle tests, integration tests

---

### 1.2 Logging Framework Assessment

**Status: NO STRUCTURED LOGGING FRAMEWORK**

The codebase uses **raw console.* statements exclusively**. No mention of:
- Winston, Pino, Bunyan, or other logging libraries
- Log levels configured at startup
- Centralized logging configuration
- Structured logging (JSON-LD used for data, not for logs)

**Issue I.1: Missing Logging Framework**
- **File**: All .ts files in /harness-ui, /ci-runner, /docker-event-collector, /test
- **Problem**: No structured logging means:
  - No log levels (all console.log treated equally)
  - No log rotation or management
  - No filtering capability
  - Difficult debugging in production
  - No request/response correlation IDs
- **Impact**: High — makes production troubleshooting difficult

---

### 1.3 Log Level Usage Problems

**Issue I.2: Inappropriate Error Logging Levels**
- **File**: `/docker-event-collector/writer.ts` line 24
  ```typescript
  console.log(`[writer] Connected to XTDB at ${XTDB_URL}`);
  ```
  Should be debug or info-level, not always visible.

- **File**: `/harness-ui/server.ts` line 388
  ```typescript
  console.log(`[Deploy] Triggered by ${trigger}...`);
  ```
  Info log, appropriate. But deployment errors at line 409:
  ```typescript
  console.error(`[Deploy] ❌ ${svcName} failed: ${e.stderr?.slice(0, 100)}`);
  ```
  Truncated error message — loses context.

- **File**: `/ci-runner/server.ts` line 82
  ```typescript
  console.log(`🌐 CI Runner API on http://localhost:${CI_PORT}`);
  ```
  Startup info, but hardcoded "localhost" in message.

---

### 1.4 Sensitive Data in Logs

**Issue I.3: Database Credentials Logged at Startup**
- **File**: `/docker-event-collector/writer.ts` line 24
  ```typescript
  console.log(`[writer] Connected to XTDB at ${XTDB_URL}`);
  ```
  `XTDB_URL` is `postgresql://localhost:5433/xtdb` (line 7)
  - Contains database name and port
  - If password is added to connection string, would leak credentials

- **File**: `/xtdb-event-logger-ui/lib/db.ts` line 8
  ```typescript
  const sql = postgres({ host, port, database: "xtdb", user: "xtdb", password: "xtdb", max: 3, idle_timeout: 30, connect_timeout: 10 });
  ```
  - Hardcoded password: "xtdb" (see Section 2 for details)

**Issue I.4: No Error Context Preservation**

Multiple files have catch blocks that silently log:
- **File**: `/harness-ui/server.ts` line 118
  ```typescript
  } catch { /* intentionally silent — best-effort trigger */ }
  ```
  No error logging → can't diagnose why git backup trigger fails

- **File**: `/harness-ui/server.ts` line 317
  ```typescript
  } catch { return c.json([]); }
  ```
  Returns empty array on error — logs nothing

- **File**: `/xtdb-event-logger-ui/lib/db.ts` line 31, 947, etc.
  ```typescript
  } catch { /* table may already exist */ }
  ```
  Swallows errors without logging

**Count**: 40+ silent catch blocks across codebase

---

### 1.5 Request/Response Logging

**Status: MINIMAL**

- **File**: `/xtdb-event-logger-ui/server.ts` lines 76, 94
  ```typescript
  console.error("[api] Initial SSE fetch failed:", err);
  console.error("[api] SSE poll error:", err);
  ```
  Logs errors but not request details, response codes, or payloads

- **File**: `/harness-ui/server.ts` line 388
  ```typescript
  console.log(`[Deploy] Triggered by ${trigger}...`);
  ```
  Logs trigger but not request path, method, or response

**Issue I.5: No HTTP Request/Response Logging Middleware**
- No Hono middleware captures request method, path, response status
- No latency tracking
- No per-endpoint metrics
- Proxied requests (SSE, API proxies) don't log upstream responses
- **Impact**: Medium — harder to track API performance and failures

---

## PART 2: CONFIGURATION MANAGEMENT

### 2.1 Hardcoded Values Requiring Environment Variables

**Issue C.1: Hardcoded Port Numbers (9 instances)**

- **File**: `/harness-ui/server.ts` line 34
  ```typescript
  const UI_PORT = Number(process.env.UI_PORT ?? "3336");
  ```
  Default: 3336. Good practice with fallback.

- **File**: `/xtdb-ops-api/server.ts` line 20
  ```typescript
  const OPS_PORT = Number(process.env.OPS_PORT ?? "3335");
  ```
  Default: 3335.

- **File**: `/xtdb-event-logger-ui/server.ts` line 51
  ```typescript
  const UI_PORT = Number(process.env.UI_PORT ?? "3333");
  ```
  Default: 3333. **Conflict: Two "UI_PORT" configs!**
  - harness-ui expects :3336
  - xtdb-event-logger-ui expects :3333
  - **Risk**: Environment variable shadowing, confusion

- **File**: `/ci-runner/server.ts` line 15
  ```typescript
  const CI_PORT = Number(process.env.CI_PORT ?? "3337");
  ```
  Default: 3337.

- **File**: `/docker-event-collector/server.ts` line 12
  ```typescript
  const PORT = Number(process.env.COLLECTOR_PORT ?? "3338");
  ```
  Default: 3338.

- **File**: `/build-service/server.ts` (referenced at `/harness-ui/server.ts` line 110):
  ```typescript
  const buildUrl = process.env.BUILD_SERVICE_URL ?? "http://build-service:3339";
  ```
  Default: build-service:3339

Test files also hardcode ports extensively.

**Issue C.2: Hardcoded Database Hosts & Ports (15+ instances)**

All have fallbacks to localhost:
- **File**: `/sunk-cost-detector/index.ts` lines 5-6
  ```typescript
  const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
  const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");
  ```

- **File**: `/docker-event-collector/writer.ts` line 7
  ```typescript
  const XTDB_URL = process.env.XTDB_URL ?? "postgresql://localhost:5433/xtdb";
  ```

- **File**: `/xtdb-ops-api/server.ts` lines 65-66
  ```typescript
  const primaryDb = postgres({ host: process.env.XTDB_EVENT_HOST ?? "localhost",
    port: Number(process.env.XTDB_EVENT_PORT ?? "5433"), ...
  ```

**All database URLs used in 20+ places throughout the codebase.**

---

### 2.2 Hardcoded Credentials

**CRITICAL ISSUE C.3: Database Passwords Hardcoded**

Password hardcoded as `"xtdb"` in multiple files:

1. **File**: `/sunk-cost-detector/index.ts` line 56
   ```typescript
   sql = postgres({ host: XTDB_HOST, port: XTDB_PORT, database: "xtdb", user: "xtdb", password: "xtdb", ...
   ```

2. **File**: `/ci-runner/recorder.ts`
   ```typescript
   password: "xtdb",
   ```

3. **File**: `/xtdb-event-logger-ui/lib/db.ts` line 8
   ```typescript
   const sql = postgres({ host, port, database: "xtdb", user: "xtdb", password: "xtdb", max: 3, ...
   ```

4. **File**: `/xtdb-ops-api/server.ts` lines 65-66
   ```typescript
   password: "xtdb",
   ```
   Multiple instances in same file.

5. **Files**: `/test/lifecycle.ts`, `/test/integration.ts`, `/test/contracts/infrastructure.ts`
   ```typescript
   password: "xtdb",
   ```

6. **Files**: `/build-service/server.ts`, `/history-retrieval/index.ts`, `/artifact-tracker/db.ts`
   Similar hardcoding.

**Count**: 30+ hardcoded `password: "xtdb"` instances

**Impact**: **CRITICAL SECURITY ISSUE**
- Credentials visible in source control
- Exposed if repo is public
- Cannot rotate password without code change & redeployment
- Should use environment variables: `process.env.XTDB_PASSWORD ?? "xtdb"`

---

### 2.3 Configuration Validation at Startup

**Issue C.4: No Configuration Validation Layer**

- No validation that required environment variables are set
- No error on startup if configuration is missing
- Example: Missing `KEYCLOAK_URL` silently defaults to `http://localhost:8180`

**File**: `/xtdb-ops-api/lib/auth.ts` lines 8-10
```typescript
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8180";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "harness";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "harness-api";
```

No validation that these are reachable or valid. If Keycloak is misconfigured, only discovered at runtime when first auth request fails.

---

### 2.4 Magic Numbers & Constants

**Issue C.5: Magic Numbers Scattered Throughout**

Named constants (good):
- `/docker-event-collector/writer.ts` line 8: `const BATCH_SIZE = 50;`
- `/docker-event-collector/writer.ts` line 9: `const FLUSH_INTERVAL_MS = 5000;`
- `/web-chat/lib/session-pool.ts`: `const IDLE_TIMEOUT_MS = 30 * 60 * 1000;`

Hardcoded values without constants (problematic):
- **File**: `/agent-spawner/index.ts` line 23
  ```typescript
  const timeout = setTimeout(() => { ... }, 300_000);
  ```
  Magic number 300_000 ms = 5 minutes. Should be named constant.

- **File**: `/ci-runner/runner.ts`
  ```typescript
  output: (r.stdout + "\n" + r.stderr).trim().slice(-10000),
  ```
  Magic number 10000 bytes — no explanation

---

### 2.5 Sensible Defaults Assessment

**Status: MOSTLY GOOD**

Port defaults are reasonable:
- Event API: :3333
- Harness UI: :3336
- Ops API: :3335
- CI Runner: :3337
- Docker Collector: :3338

Database defaults all point to localhost:5433 (primary) and localhost:5434 (replica).

**However**: No .env.example or documentation of all required environment variables.

---

## PART 3: API DESIGN CONSISTENCY

### 3.1 HTTP Endpoints Inventory

**Total endpoints found: 101**

**Breakdown by server:**

#### Harness UI Server (`:3336`) — 30+ endpoints
- `GET /` — home page
- `GET /projects/:projectId/:section` — project pages
- `POST /api/sparql` — SPARQL proxy
- `GET /api/events/stream` — SSE stream proxy
- `POST /api/ci/enqueue` — CI job enqueue
- `POST /api/git/backup` — Git backup
- `POST /api/deploy` — Docker deploy trigger
- Plus 20+ others

#### XTDB Ops API Server (`:3335`) — 26 endpoints
- `GET /api/health*` — health checks
- `POST /api/backup*` — backup operations
- `DELETE /api/backups/:filename` — delete backup
- `POST /api/replica/*` — replica management
- `POST /api/incidents*` — incident management
- Plus others

#### XTDB Event Logger UI (`:3333`) — 20+ endpoints
- `GET /api/events/stream` — SSE stream
- `GET /api/sessions*` — session queries
- `GET /api/decisions` — decisions
- `GET /api/docker-events` — docker events

#### CI Runner Server (`:3337`) — 3 endpoints

#### Docker Event Collector (`:3338`) — 2 endpoints

---

### 3.2 REST Convention Compliance

**Issue A.1: Inconsistent HTTP Method Usage**

**Good practices:**
- `GET /api/events` — retrieve events ✓
- `POST /api/backup` — create backup ✓
- `DELETE /api/backups/:filename` — delete backup ✓
- `PATCH /api/incidents/:id` — update incident ✓

**Problematic patterns:**

1. **File**: `/harness-ui/server.ts` line 361
   ```typescript
   app.post("/api/pc/stop/:name", async (c) => {
     const r = await fetch(`${PC_API}/process/stop/${name}`, { method: "PATCH", ...
   ```
   Route says POST but upstream is PATCH — confusing to clients

2. **File**: `/xtdb-ops-api/server.ts`
   - `POST /api/replica/stop` — arguably should be DELETE

**Verdict**: Generally follows REST but some inconsistencies

---

### 3.3 Response Shape Consistency

**Issue A.2: Inconsistent Error Response Format**

Multiple response formats for errors:

**Format 1:**
```typescript
return c.json({ error: "Missing repo or commitHash" }, 400);
```

**Format 2:**
```typescript
return c.json({ error: (e as Error).message, details: String(err) }, 500);
```

**Format 3:**
```typescript
return c.text("Not found", 404);
```

**Issue A.3: Inconsistent Success Response Shapes**

Some endpoints return `{ success: true, ... }`:
```typescript
return c.json({ success: true, restored: filename });
```

Others return raw data:
```typescript
return c.json(backups);
```

Others return `{ queued: true, id, ... }`:
```typescript
return c.json({ queued: true, id: job.id, file: jobFile });
```

**No consistent pattern.**

---

### 3.4 HTTP Status Code Usage

**Issue A.4: Status Code Misuse**

1. **File**: `/harness-ui/server.ts` line 414
   ```typescript
   return c.json({ success: allOk, ... }, allOk ? 200 : 207);
   ```
   Uses 207 (Multi-Status) for partial failure. Better: 400 or 500.

2. **File**: `/docker-event-collector/server.ts` line 31
   ```typescript
   status: collector.isConnected ? "ok" : "degraded",
   ```
   Returns 200 with "degraded" status. Should be 503 (Service Unavailable).

3. **Generic 500 for all errors** — Should differentiate: 400 for client errors, 500 for server errors.

---

### 3.5 API Versioning

**Status: NO VERSIONING**

All endpoints are unversioned:
- `/api/events` (not `/api/v1/events`)
- `/api/backup` (not `/api/v2/backup`)

**Risk**: Breaking changes require all clients to update simultaneously.

---

### 3.6 Middleware & Global Patterns

**Issue A.5: Inconsistent Middleware Application**

1. **CORS Middleware:**
   - Applied globally with wildcard: `cors({ origin: "*" })`
   - **Risk**: Allows requests from any origin

2. **Auth Middleware:**
   - Applied only on `/xtdb-ops-api`
   - Public paths hardcoded (15 exceptions)
   - **Issue A.6: Public paths not centralized** — Must be manually updated for new endpoints

3. **Harness UI Server:**
   - NO auth middleware (intentional for web UI)
   - But POST endpoints like `/api/deploy` have **no CSRF protection**

4. **Input Validation:**
   - **None found** — No schema validation library
   - Manual validation only: `if (!repo || !commitHash) return c.json(...)`

---

### 3.7 Error Handling Patterns

**Issue A.7: Inconsistent Error Responses**

1. **SSE Endpoint Errors:**
   ```typescript
   catch (err) {
     console.error("[api] Initial SSE fetch failed:", err);
   }
   ```
   Logs error but doesn't notify client.

2. **Proxy Endpoint Errors:**
   ```typescript
   } catch (e) {
     return c.text(`SSE proxy error: ${(e as Error).message}`, 502);
   }
   ```
   **Exposes error message to client (could leak internal details)**

3. **Silent Error Handling:**
   ```typescript
   } catch { /* intentionally silent */ }
   ```
   **No error response to client**

---

## SUMMARY TABLE

| Category | Issue | Severity | Count |
|----------|-------|----------|-------|
| **Logging** | No structured logging framework | High | 1 |
| **Logging** | Missing error context in catch blocks | High | 40+ |
| **Logging** | No request/response middleware | Medium | 5+ |
| **Config** | Hardcoded ports (with env var fallback) | Low | 9 |
| **Config** | Hardcoded database credentials | **CRITICAL** | 30+ |
| **Config** | No config validation at startup | Medium | Multiple |
| **Config** | Magic numbers without constants | Low | 10+ |
| **API Design** | Inconsistent error response format | Medium | 101 endpoints |
| **API Design** | Inconsistent success response shape | Medium | 101 endpoints |
| **API Design** | Misused HTTP status codes | Medium | 5+ |
| **API Design** | No API versioning | Low | All |
| **API Design** | Missing input validation | High | All endpoints |
| **API Design** | No CSRF protection on state-changing endpoints | Medium | 10+ |
| **Auth** | Wildcard CORS ("*") | Medium | 2 servers |
| **Auth** | Public path whitelist not centralized | Low | 1 server |

---

## KEY RECOMMENDATIONS

1. **Implement structured logging** — Add Pino/Winston, log levels, request correlation IDs
2. **Remove hardcoded credentials** — All passwords must be environment variables
3. **Add request/response middleware** — Log method, path, status, latency for all endpoints
4. **Validate configuration at startup** — Fail fast if required vars missing
5. **Standardize API responses** — Single error/success format across all endpoints
6. **Add input validation** — Use a schema library (Zod, Joi) for all endpoints
7. **Implement API versioning** — Prepare for breaking changes
8. **Fix CORS policy** — Restrict to specific origins, not wildcard
9. **Add CSRF protection** — Token-based protection for state-changing endpoints
10. **Centralize public path configuration** — Single source of truth for auth exemptions

---

**Report Generated**: Research-only audit with no code modifications
**Files Analyzed**: 50+ TypeScript files across 10+ modules
**Lines of Code Scanned**: ~50,000+ lines
