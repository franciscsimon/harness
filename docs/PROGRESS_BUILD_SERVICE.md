# Build Service — Progress

## Status: Not Started

## Decisions
- Auto-trigger from CI on test pass + manual API/UI trigger
- No cache — clean builds every time
- Parallel builds for all services
- Separate `/builds` page with last 100 builds

## Phases

### Phase 1: Core Build Service ⬜
- [ ] `build-service/`: package.json, server.ts, builder.ts
- [ ] Clone from Soft Serve, read .cd.jsonld, parallel `docker build` + `docker push`
- [ ] Tag: git SHA + latest
- [ ] Health API on :3339, POST /api/build, GET /api/builds
- [ ] Dockerfile + docker-compose.yml entry
- [ ] `builds` table in seed-schema.ts

### Phase 2: Integration ⬜
- [ ] CI runner → POST to build-service on test pass
- [ ] Build service → POST to /api/deploy on build success (optional)
- [ ] `/api/builds` endpoint in event-logger-ui
- [ ] `/builds` page in harness-ui with trigger button

### Phase 3: Cleanup ⬜
- [ ] Remove `build:` directives from docker-compose.yml app services
- [ ] Update deploy.ts to only deploy (never build)
- [ ] Add build trigger to ops page
