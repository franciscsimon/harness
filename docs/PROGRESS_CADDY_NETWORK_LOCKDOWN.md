# Caddy Proxy + Network Lockdown — Progress

## Status: Not Started

## Goal
Secure all services behind Docker's internal DNS. Only Caddy exposes a port to the host, reverse-proxying to harness-ui. No other service has a `ports:` mapping — they communicate exclusively via Docker service names on the internal network.

## Current State: 15 exposed ports

### Infrastructure (7 ports exposed)
| Service | Host Port | Internal | Needs External? |
|---------|-----------|----------|-----------------|
| Redpanda | 19092 | 19092 | ❌ No — only services use Kafka |
| Garage S3 | 3900 | 3900 | ❌ No — only XTDB uses S3 |
| XTDB Primary | 5433 | 5432 | ❌ No — only event-api/recorders connect (maybe keep for debugging?) |
| XTDB Replica | 5434 | 5432 | ❌ No |
| Keycloak | 8180 | 8080 | ❌ No — ops-api checks health internally |
| QLever | 7001 | 7001 | ❌ No — harness-ui proxies via /api/sparql |
| Soft Serve SSH | 23231 | 23231 | ⚠️ Yes — `git push soft-serve main` from host |
| Zot Registry | 5050 | 5000 | ⚠️ Yes — build-service pushes (but it's inside Docker, so maybe not) |

### App services (8 ports exposed)
| Service | Host Port | Internal | Needs External? |
|---------|-----------|----------|-----------------|
| event-api | 3333 | 3333 | ❌ No — harness-ui calls via Docker DNS |
| chat-ws | 3334 | 3334 | ⚠️ Special — browser WebSocket connects directly |
| ops-api | 3335 | 3335 | ❌ No — harness-ui calls via Docker DNS |
| harness-ui | 3336 | 3336 | ❌ No — Caddy will proxy to it |
| ci-runner | 3337 | 3337 | ❌ No — internal only |
| docker-event-collector | 3338 | 3338 | ❌ No — internal only |
| build-service | 3339 | 3339 | ❌ No — internal only |

## Target State: 2-3 exposed ports

| Port | Service | Purpose |
|------|---------|---------|
| 80/443 | Caddy | Reverse proxy → harness-ui (+ WebSocket upgrade for chat) |
| 23231 | Soft Serve | Git SSH from host (`git push soft-serve main`) |
| 5050 (maybe) | Zot | Only if host tools need direct registry access |

## Challenges

### 1. Browser-facing URLs
These currently point to `localhost:<port>` and will break:
- `CHAT_WS_URL=ws://localhost:3334/ws` — browser WebSocket to chat-ws
- `stream.js` — `window.EVENT_API = "http://localhost:3333"` for SSE
- `chat.js` — `DASHBOARD_API = "http://localhost:3333/api"`
- `ops.js` — `API = "http://localhost:3335"`
- `knowledge.ts` — download link to `http://localhost:3333/api/...`

**Fix**: All browser-facing traffic must go through Caddy → harness-ui. harness-ui must proxy these APIs:
- `/api/events/*` → event-api:3333
- `/api/sessions/*` → event-api:3333
- `/ws` → chat-ws:3334 (WebSocket upgrade)
- `/api/ops/*` → ops-api:3335

Or simpler: Caddy routes paths to different backends.

### 2. Soft Serve SSH
Users push via `git push soft-serve main` which uses SSH on port 23231. This **must** stay exposed on the host — SSH can't go through an HTTP proxy.

### 3. Zot Registry
build-service (inside Docker) pushes to `localhost:5050`. Since both are on the Docker network, build-service can use `zot:5000` instead. The host only needs direct Zot access if we want to `docker push` from outside Docker — which we don't anymore (build-service handles all builds).

### 4. XTDB Debugging
Currently we run ad-hoc queries via `psql` or Node scripts from the host against `localhost:5433`. We could keep this port exposed for debugging or use `docker exec` instead.

## Phases

### Phase 1: Add Caddy reverse proxy ⬜
- [ ] `caddy/Caddyfile` — HTTP :80 reverse proxy to harness-ui:3336
- [ ] TCP passthrough :23231 → soft-serve:23231 for git SSH (Caddy layer4 or separate listener)
- [ ] WebSocket upgrade for chat (`/ws` → chat-ws:3334)
- [ ] Caddy in docker-compose.yml — the ONLY service with `ports:`
- [ ] Verify harness-ui accessible via `http://localhost`

### Phase 2: Route browser APIs through Caddy/harness-ui ⬜
- [ ] Update `stream.js`, `chat.js`, `ops.js` to use relative URLs (no `localhost:PORT`)
- [ ] Fix knowledge.ts download link to relative URL
- [ ] `CHAT_WS_URL` → `ws://localhost/ws` (through Caddy)
- [ ] harness-ui proxy routes for any remaining browser-direct APIs

### Phase 3: Remove ALL exposed ports ⬜
- [ ] Remove `ports:` from every app service (3333-3339)
- [ ] Remove `ports:` from every infra service (Redpanda, Garage, XTDB ×2, Keycloak, QLever, Soft Serve, Zot)
- [ ] Only Caddy has `ports:` — `:80` and `:23231`
- [ ] Update build-service REGISTRY env: `localhost:5050` → `zot:5000`
- [ ] Update any remaining `localhost:PORT` refs in env vars

### Phase 4: Verify everything ⬜
- [ ] All UI pages work through `http://localhost`
- [ ] Chat WebSocket connects via Caddy
- [ ] Stream page SSE works
- [ ] `git push soft-serve main` works through Caddy TCP passthrough on :23231
- [ ] CI pipeline: git push → CI → Build → all internal
- [ ] Ops page shows all services healthy
- [ ] No browser console errors

## Decisions (Resolved)
1. **No port expose for anything except Caddy** — not DB, not Zot, not Soft Serve, nothing
2. **HTTP for dev, HTTPS later for prod**

## Target: 1 exposed service only
- Caddy `:80` (+ `:23231` TCP passthrough for git SSH) — the ONLY container with `ports:`
- Everything else: zero exposed ports, Docker DNS only
