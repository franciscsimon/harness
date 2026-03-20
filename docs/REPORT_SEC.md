# Security Audit Report

**Date:** 2026-03-18
**Scope:** Full `/Users/opunix/harness/` codebase — extensions, UI servers, web chat
**Method:** Static analysis, dependency audit, OWASP Top 10 review

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 High | 4 |
| 🟠 Medium | 5 |
| 🟡 Low | 4 |
| ℹ️ Info | 3 |

---

## 🔴 High Severity

### H1. Hardcoded database credentials everywhere

| Detail | Value |
|--------|-------|
| **Files** | `project-registry/index.ts:21`, `decision-log/index.ts:20`, `sunk-cost-detector/index.ts:55`, `agent-spawner/index.ts:44`, `session-postmortem/index.ts:49`, `artifact-tracker/db.ts:13`, `history-retrieval/index.ts:23`, `xtdb-event-logger-ui/lib/db.ts:8`, `xtdb-event-logger/endpoints/xtdb.ts:36`, `data-examples/test-xtdb-insert.ts:13`, `data-examples/extract.ts:20` |
| **Pattern** | `postgres({ host, port, database: "xtdb", user: "xtdb", password: "xtdb" })` |
| **Risk** | If any of these files leak (public repo, logs), the XTDB instance is fully compromised. Currently 11 independent connection blocks with the same hardcoded creds. |
| **Remediation** | Extract to a single shared module (`lib/xtdb-client.ts`) reading from `XTDB_USER` and `XTDB_PASSWORD` env vars with no defaults. All extensions import from there. |

### H2. Unauthenticated data wipe endpoint

| Detail | Value |
|--------|-------|
| **File** | `xtdb-event-logger-ui/server.ts:306` |
| **Pattern** | `app.post("/api/wipe", ...)` — deletes all events, no auth, no confirmation |
| **Risk** | Any process or script on the network can `curl -X POST /api/wipe` and destroy all event history. |
| **Remediation** | Add auth token header check (`X-Wipe-Token` from env var), or require a confirmation body with a known secret. At minimum, restrict to localhost. |

### H3. Web chat `set_cwd` — arbitrary filesystem access with no validation

| Detail | Value |
|--------|-------|
| **File** | `web-chat/server.ts` (set_cwd handler), `web-chat/lib/session-pool.ts:138` |
| **Pattern** | Client sends `{ type: "set_cwd", cwd: "/any/path" }` over WebSocket → passed directly to `DefaultResourceLoader({ cwd })` and `SessionManager.continueRecent(cwd)` |
| **Risk** | An attacker (or compromised browser tab) can set cwd to `/`, `/etc`, or any directory. The pi SDK then has full read/write/bash access scoped to that path. Combined with no WebSocket auth (H4), this is a full system compromise vector. |
| **Remediation** | Validate cwd against an allowlist of project directories, or at minimum verify the path exists and is under `$HOME`. Consider removing `set_cwd` from the WebSocket protocol entirely and only accepting it as a startup env var (`CHAT_CWD`). |

### H4. No authentication on WebSocket or HTTP servers

| Detail | Value |
|--------|-------|
| **Files** | `web-chat/server.ts` (port 3334), `xtdb-event-logger-ui/server.ts` (port 3333) |
| **Pattern** | Both servers bind to `0.0.0.0` (all interfaces) with zero authentication. Any device on the local network can connect. |
| **Risk** | On shared networks (coffee shop, office), anyone can: connect to the chat WebSocket and execute arbitrary commands via the pi agent, read all event/session/decision history from the UI API, wipe all data via `/api/wipe`. |
| **Remediation** | Bind to `127.0.0.1` only (not `0.0.0.0`). Add a session token or API key for WebSocket upgrade. Consider `--host` flag like other dev servers. |

---

## 🟠 Medium Severity

### M1. Agent spawner passes full `process.env` to child processes

| Detail | Value |
|--------|-------|
| **File** | `agent-spawner/index.ts` |
| **Pattern** | `spawn("pi", args, { env: { ...process.env } })` |
| **Risk** | All env vars (API keys, tokens, secrets) are inherited by spawned sub-agents. If a sub-agent is compromised or logs env vars, secrets leak. |
| **Remediation** | Allowlist specific env vars needed by child processes. At minimum strip `AWS_*`, `GITHUB_TOKEN`, etc. |

### M2. Open CORS on all API endpoints

| Detail | Value |
|--------|-------|
| **File** | `xtdb-event-logger-ui/server.ts:62` |
| **Pattern** | `app.use("/api/*", cors())` — allows any origin |
| **Risk** | Any website can make requests to the event logger API from a browser, reading all session data, decisions, artifacts. Combined with the wipe endpoint (H2), a malicious page could destroy data. |
| **Remediation** | Restrict CORS to `http://localhost:3333` and `http://localhost:3334`, or remove CORS entirely since the UI is same-origin. |

### M3. npm dependency vulnerabilities — 19 high severity

| Detail | Value |
|--------|-------|
| **Packages** | `web-chat/`, `xtdb-event-logger-ui/` |
| **Pattern** | `fast-xml-parser` 4.0.0-beta.3 – 5.5.5: numeric entity expansion bypass (CVE-2026-26278). Transitive via `@aws-sdk/xml-builder` → `@aws-sdk/client-bedrock-runtime` → `@mariozechner/pi-ai`. |
| **Risk** | If Bedrock XML responses are processed, entity expansion could cause DoS. Unlikely in current usage but present in dependency tree. |
| **Remediation** | Monitor for `pi-coding-agent` update that bumps `@aws-sdk`. Cannot fix directly (transitive dep). |

### M4. `JSON.parse` on untrusted data without try/catch in some paths

| Detail | Value |
|--------|-------|
| **Files** | `xtdb-event-logger-ui/pages/flow.ts:26`, `lib/format.ts:143` |
| **Pattern** | `JSON.parse(val)` on XTDB data that could be malformed |
| **Risk** | Unhandled exception crashes the request handler. Not exploitable for injection but causes DoS on the UI server. |
| **Remediation** | Wrap all `JSON.parse` calls on DB data in try/catch (many already do, but a few miss it). |

### M5. WebSocket message parsing accepts any JSON shape

| Detail | Value |
|--------|-------|
| **File** | `web-chat/lib/ws-protocol.ts:65` |
| **Pattern** | `parseClientMessage` does `JSON.parse(raw)` with no schema validation |
| **Risk** | Malformed messages could trigger unexpected behavior in switch handlers. Type assertions are trusted without validation. |
| **Remediation** | Add runtime type checking (e.g., check `msg.type` is in known set, validate required fields exist before accessing). |

---

## 🟡 Low Severity

### L1. Static file serving uses allowlist (good) but web-chat has a path traversal edge case

| Detail | Value |
|--------|-------|
| **File** | `web-chat/server.ts:37` |
| **Pattern** | `if (file === "style.css") path = join(__dirname, "..", "xtdb-event-logger-ui", "static", "style.css")` |
| **Risk** | The allowlist prevents traversal, but the `..` path join is fragile. If the allowlist is ever expanded carelessly, traversal becomes possible. |
| **Remediation** | Use `path.resolve()` and verify the resolved path starts with the expected directory. |

### L2. Extension `ctx.ui` monkey-patching in uiBridge

| Detail | Value |
|--------|-------|
| **File** | `web-chat/lib/session-pool.ts` (uiBridge factory) |
| **Pattern** | Replaces `ctx.ui.notify` and `ctx.ui.setStatus` at runtime |
| **Risk** | If another extension checks `ctx.ui.notify === originalFn`, it will fail. Fragile but not a security risk per se — more of a reliability concern. |
| **Remediation** | Use the `eventBus` pattern from the SDK docs instead of monkey-patching. |

### L3. No rate limiting on any endpoint

| Detail | Value |
|--------|-------|
| **Files** | Both servers |
| **Risk** | Rapid API calls or WebSocket messages could exhaust server resources. Low risk since these are local dev tools. |
| **Remediation** | Add basic rate limiting if these servers are ever exposed beyond localhost. |

### L4. Session pool has no per-IP connection limit

| Detail | Value |
|--------|-------|
| **File** | `web-chat/lib/session-pool.ts` |
| **Pattern** | `MAX_SESSIONS = 5` is global, not per-connection |
| **Risk** | A single client opening multiple WebSocket connections could exhaust the pool, denying service to others. |
| **Remediation** | Track connections per IP/origin and limit to 2 per source. |

---

## ℹ️ Informational

### I1. All XTDB connections use plaintext (no TLS)

PostgreSQL wire protocol on port 5433 with no SSL. Acceptable for localhost Docker container but would need TLS if XTDB is ever remote.

### I2. No `.gitignore` for sensitive files beyond basics

Current `.gitignore` covers `node_modules/`, `.DS_Store`, `.claude/`, `.pi/`. No explicit exclusion of `.env`, `auth.json`, `*.pem`, or `*.key` files. None currently exist in the repo, but adding them to `.gitignore` would prevent accidental commits.

### I3. `agent-spawner` inherits parent session's full tool access

Delegated sub-agents get the same tools (bash, write, edit, read) as the parent. There's no tool restriction or sandboxing for delegated tasks. This is by design but worth noting for future multi-tenant scenarios.

---

## Remediation Priority

| Priority | Item | Effort |
|----------|------|--------|
| 1 | H4: Bind servers to 127.0.0.1 | 5 min |
| 2 | H2: Auth on wipe endpoint | 15 min |
| 3 | H3: Validate/remove set_cwd | 15 min |
| 4 | H1: Centralize DB credentials | 30 min |
| 5 | M2: Restrict CORS origins | 5 min |
| 6 | M5: Validate WS message schema | 20 min |
| 7 | I2: Expand .gitignore | 2 min |
