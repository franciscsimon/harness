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
- [ ] `caddy/Caddyfile` with reverse proxy to harness-ui:3336
- [ ] WebSocket upgrade support for chat (`/ws` → chat-ws:3334)
- [ ] Caddy in docker-compose.yml, port 80 exposed
- [ ] Verify harness-ui accessible via `http://localhost` (port 80)

### Phase 2: Route browser APIs through Caddy/harness-ui ⬜
- [ ] harness-ui server-side proxy routes: `/api/stream/events` SSE, chat WS
- [ ] Update `stream.js`, `chat.js`, `ops.js` to use relative URLs (no more `localhost:PORT`)
- [ ] Fix knowledge.ts download link to use relative URL
- [ ] `CHAT_WS_URL` → `ws://localhost/ws` (through Caddy)

### Phase 3: Remove exposed ports ⬜
- [ ] Remove `ports:` from all app services (3333-3339)
- [ ] Remove `ports:` from infrastructure (Redpanda, Garage, XTDB replica, Keycloak, QLever)
- [ ] Keep: Caddy :80, Soft Serve :23231
- [ ] Decide: keep XTDB primary :5433 for debugging? Or use docker exec?
- [ ] Decide: keep Zot :5050? build-service uses Docker DNS, but host `docker push` would break
- [ ] Update build-service REGISTRY env: `localhost:5050` → `zot:5000`

### Phase 4: Verify everything ⬜
- [ ] All UI pages work through `http://localhost`
- [ ] Chat WebSocket connects via Caddy
- [ ] Stream page SSE works
- [ ] CI pipeline: git push → CI → Build → all internal
- [ ] Ops page shows all services healthy
- [ ] No browser console errors

## Open Questions
1. Keep XTDB :5433 exposed for ad-hoc debugging from host?
2. Keep Zot :5050 exposed? (build-service is inside Docker, but host tools might need it)
3. HTTPS with self-signed cert or HTTP only for local dev?
