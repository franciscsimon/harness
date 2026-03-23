# Build Service — Progress

## Status: Complete ✅

## Decisions
- Auto-trigger from CI on test pass + manual API/UI trigger
- No cache — clean builds every time
- Parallel builds for all services
- Separate `/builds` page with last 100 builds

## Phases

### Phase 1: Core Build Service ✅
- [x] `build-service/`: package.json, server.ts, builder.ts, recorder.ts
- [x] Clone from Soft Serve, read .cd.jsonld, parallel `docker build` + `docker push`
- [x] Tag: git SHA (12 char) + latest
- [x] Health API on :3339, POST /api/build, GET /api/builds, GET /api/builds/:id
- [x] Dockerfile (Docker CE CLI, not docker.io) + docker-compose.yml entry
- [x] `builds` table in seed-schema.ts (30 tables total)

### Phase 2: Integration ✅
- [x] CI runner → POST to build-service on test pass (trigger: ci-success)
- [x] `/builds` page: last 100 builds, per-service badges, trigger button
- [x] `/builds/:id` detail: metadata, per-service status/tags/errors
- [x] "Builds" nav link between CI and Git

### Phase 3: Cleanup ✅
- [x] Removed `build:` directives from 6 app services in docker-compose.yml
- [x] build-service keeps its own `build:` (bootstrap)
- [x] deploy.ts simplified to deploy-only (pull + recreate + health)
- [x] build-service added to ops page service list (8 app services total)

## Verified Pipeline
```
git push → CI (10s) → Build auto-triggered (242s, 7/7) → Images in Zot
```
Each step is independently callable via API.
