# Caddy Proxy + Network Lockdown — Progress

## Status: Phases 1-3 Complete, Phase 4 pending verification

## Decisions (Resolved)
1. **ONLY Caddy gets exposed ports** — nothing else. Not DB, not Zot, not Soft Serve, nothing.
2. **HTTP for dev, HTTPS later for prod**

## Target: 1 exposed service, 1 exposed port
- Caddy `:80` → reverse proxy to harness-ui
- That's it. Every other service: zero exposed ports, Docker DNS only.
- Git push happens from inside Docker (ci-runner, build-service), not from host.

## Changes Made

### Phase 1: Add Caddy reverse proxy ✅
- [x] `caddy/Caddyfile` — HTTP :80 reverse proxy to harness-ui:3336
- [x] WebSocket upgrade for chat (`/ws` → chat-ws:3334)
- [x] Caddy in docker-compose.yml — the ONLY service with `ports:`

### Phase 2: Route browser APIs through Caddy/harness-ui ✅
- [x] `stream.js`, `chat.js`, `ops.js` — all relative URLs now (no `localhost:PORT`)
- [x] knowledge.ts download link — relative URL
- [x] `CHAT_WS_URL` → `ws://localhost/ws` (port 80 through Caddy)
- [x] harness-ui proxy routes: `/api/events/stream` (SSE), `/api/events`, `/api/sessions/:path`
- [x] git page URLs show Docker-internal addresses

### Phase 3: Remove ALL exposed ports ✅
- [x] Removed `ports:` from all 7 app services (3333-3339)
- [x] Removed `ports:` from all 7 infra services (Redpanda, Garage, XTDB x2, Keycloak, QLever, Soft Serve, Zot)
- [x] Only Caddy has `ports: ["80:80"]`
- [x] build-service REGISTRY env: `localhost:5050` → `zot:5000`
- [x] docker-compose.yml `image:` refs: `localhost:5050/harness/*` → `harness/*:latest`
- [x] build-service tags images with local name (`harness/<svc>:latest`) for docker compose
- [x] Redpanda: removed external listener config (no external ports)
- [x] deploy.ts: health checks use Docker service names instead of `localhost:PORT`

### Phase 4: Verify everything ⬜ (Docker Desktop crashed — verify on restart)
- [ ] All UI pages work through `http://localhost`
- [ ] Chat WebSocket connects via Caddy
- [ ] Stream page SSE works
- [ ] CI pipeline works fully internal
- [ ] Ops page shows all services healthy
- [ ] No browser console errors

## Files Changed
- `caddy/Caddyfile` — new
- `docker-compose.yml` — Caddy added, all other ports removed, image refs changed
- `harness-ui/server.ts` — event-api proxy routes (SSE, REST, sessions)
- `harness-ui/pages/stream.ts` — removed hardcoded EVENT_API window var
- `harness-ui/pages/knowledge.ts` — relative download URL
- `harness-ui/pages/chat.ts` — updated comment
- `harness-ui/pages/ops.ts` — removed localhost ref
- `harness-ui/pages/git.ts` — Docker-internal SSH URL
- `harness-ui/pages/git-detail.ts` — Docker-internal SSH URL
- `harness-ui/static/chat.js` — relative URLs
- `harness-ui/static/ops.js` — relative URLs
- `build-service/builder.ts` — local image tag + zot:5000 push
- `scripts/deploy.ts` — Docker DNS health checks
