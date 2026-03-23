# Build Service — Exploration

## Problem

CI, Build, and Deploy are tangled. `docker compose build` creates local images that diverge from the registry. Manual steps get forgotten (push to Zot). Pages break because containers run stale code.

## Separation of Concerns

Three independent services, each with its own trigger and output:

```
git push → CI (test) → Build (images) → Deploy (containers)
            ↓              ↓                ↓
         pass/fail      OCI images       running services
         in XTDB        in Zot           with health checks
```

Each can run independently:
- **CI only**: validate code without building images
- **Build only**: create fresh images without deploying (e.g., pre-build for later deploy)
- **Deploy only**: deploy existing registry images (rollback, promote)
- **CI → Build**: test then build on success
- **CI → Build → Deploy**: full pipeline on push
- **Build → Deploy**: skip tests, just ship

## Current State

| Concern | How it works today | Problem |
|---------|-------------------|---------|
| CI | ci-runner (:3337) — runs `.ci.jsonld` test steps in Docker | Works, records to XTDB |
| Build | Manual `docker compose build` + `docker push` | Forgotten push = stale images |
| Deploy | `scripts/deploy.ts` or `POST /api/deploy` | Works but assumes images are current |

## Build Service Design

### What it does
1. Clones source from Soft Serve (or uses mounted volume)
2. Reads `.cd.jsonld` to know which services have Dockerfiles
3. Builds each image with `docker build`
4. Tags with git SHA + `latest`
5. Pushes to Zot registry
6. Records build result to XTDB (`builds` table)
7. Optionally triggers deploy on success

### API (HTTP on :3339)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Status, builds in progress, last build |
| `/api/build` | POST | Trigger build for all or specific services |
| `/api/build/:id` | GET | Build status/result |
| `/api/builds` | GET | Build history |

### POST /api/build body
```json
{
  "repo": "harness",
  "commit": "abc1234",
  "services": ["harness-ui", "event-api"],  // optional, default: all
  "trigger": "ci-success",                   // or "manual", "api"
  "autoDeploy": false                        // trigger deploy after build?
}
```

### XTDB Table: `builds`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `build:<uuid>` |
| `repo` | text | Repository name |
| `commit_hash` | text | Git commit |
| `status` | text | pending/building/pushed/failed |
| `services` | text | JSON array of service build results |
| `duration_ms` | bigint | Total build time |
| `trigger` | text | What triggered the build |
| `ts` | bigint | Timestamp |
| `jsonld` | text | JSON-LD document |

### Pipeline Flow

```
1. CI runner finishes test → POSTs to build-service /api/build
2. Build service clones from Soft Serve
3. For each service in .cd.jsonld:
   a. docker build -t localhost:5050/harness/<svc>:<sha> -t localhost:5050/harness/<svc>:latest
   b. docker push localhost:5050/harness/<svc>:<sha>
   c. docker push localhost:5050/harness/<svc>:latest
4. Records result to XTDB builds table
5. If autoDeploy: POSTs to harness-ui /api/deploy
```

### Container Requirements
- Docker socket mount (for `docker build` + `docker push`)
- Network: harness_default (to reach Soft Serve, Zot, XTDB)
- SSH access to Soft Serve (for clone)
- Port: 3339

### Dockerfile
Same pattern as ci-runner: node:22-slim + docker CLI + git + SSH

## Decisions (Resolved)

1. **Build trigger**: Auto-trigger from CI on test pass + manual API call from UI
2. **Caching**: No cache — clean builds every time
3. **Parallel builds**: Parallel — build all services concurrently
4. **UI**: Separate `/builds` page with last 100 builds + manual trigger button

## Implementation Plan

### Phase 1: Core Build Service
- [ ] `build-service/` directory: package.json, server.ts, builder.ts
- [ ] Clone from Soft Serve, read .cd.jsonld, build + push images
- [ ] Health API on :3339
- [ ] Dockerfile + docker-compose.yml entry
- [ ] `builds` table in seed-schema.ts

### Phase 2: Integration
- [ ] CI runner → build service trigger (on test pass)
- [ ] Build service → deploy trigger (optional auto-deploy)
- [ ] Build history API in event-logger-ui
- [ ] Builds page in harness-ui

### Phase 3: Pipeline Orchestration
- [ ] Update deploy.ts to only deploy (never build)
- [ ] Remove `build:` directive from docker-compose.yml services (build service owns all builds)
- [ ] Add build trigger to ops page UI
