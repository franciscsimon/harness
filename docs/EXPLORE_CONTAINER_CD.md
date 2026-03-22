# Exploration: Container-Based CD Pipeline

## Vision
Containerize all 5 app services → build OCI images → push to local registry → deploy from images to Docker. JSON-LD definitions describe what to deploy. Security scanning before deploy.

## Current State
```
git push → Soft Serve hook → CI runner → Docker test steps → XTDB record
                                                        ↓ (missing)
                                              build image → push registry → deploy
```

## Target State
```
git push → Soft Serve → CI runner:
  1. Clone + test (existing)
  2. Build Docker image per service
  3. Scan image (Trivy/Grype)
  4. Push to local registry
  5. Deploy: docker compose up with new image tag
  6. Health check
  7. Record deployment to XTDB as JSON-LD
```

---

## Part 1: Local OCI Registry

### Option A: Distribution (registry:2) — Minimal

| Attribute | Value |
|-----------|-------|
| Image size | 36 MB |
| Language | Go |
| OCI spec | v2 (converted) |
| Built-in scanning | ❌ |
| Built-in UI | ❌ |
| Built-in signing | ❌ |
| Config | YAML |
| Auth | htpasswd, token |
| Storage | filesystem, S3, Azure, GCS |
| Stars | 9K+ |
| Maintained | Yes (CNCF) |

**Pros**: Tiny, battle-tested (Docker Hub runs this), zero dependencies.
**Cons**: Just stores blobs. No scanning, no UI, no SBOM. You'd need Trivy + a UI separately.

**docker-compose addition**:
```yaml
registry:
  image: registry:2
  ports: ["5000:5000"]
  volumes: ["registry-data:/var/lib/registry"]
```

### Option B: Zot — All-in-One OCI Registry

| Attribute | Value |
|-----------|-------|
| Image size | 127 MB (minimal) / 299 MB (full) |
| Language | Go |
| OCI spec | Native OCI (not Docker v2 wrapped) |
| Built-in scanning | ✅ Trivy integration |
| Built-in UI | ✅ Web search/browse |
| Built-in signing | ✅ cosign + notation |
| Built-in SBOM | ✅ attach as OCI artifact |
| Sync/mirror | ✅ sync from Docker Hub, GHCR |
| Config | JSON file |
| Auth | htpasswd, LDAP, bearer token |
| Storage | filesystem, S3 |
| API | OCI Distribution + extensions |
| Stars | 1K+ |
| Maintained | Yes (CNCF sandbox) |

**Pros**: Single container gives you registry + scanning + UI + signing + SBOM. No need for separate Trivy install. OCI-native (not legacy Docker v2).
**Cons**: Larger image (127MB minimal vs 36MB registry:2). Newer, less battle-tested.

**docker-compose addition**:
```yaml
zot:
  image: ghcr.io/project-zot/zot-minimal-linux-arm64:latest
  ports: ["5000:5000"]
  volumes:
    - zot-data:/var/lib/zot
    - ./zot-config.json:/etc/zot/config.json
```

### Option C: Harbor — Enterprise Registry

| Attribute | Value |
|-----------|-------|
| Image size | ~2 GB total (5+ containers) |
| Components | core, portal, jobservice, registry, PostgreSQL, Redis, Trivy |
| Built-in scanning | ✅ Trivy |
| Built-in UI | ✅ Full web portal |
| Built-in signing | ✅ Notary |
| Replication | ✅ Multi-registry |
| RBAC | ✅ Projects, users, robots |
| Garbage collection | ✅ |
| Stars | 25K+ |
| Maintained | Yes (CNCF graduated) |

**Pros**: Most feature-complete. Used by huge organizations. Beautiful UI.
**Cons**: MASSIVELY overkill for a single developer. Needs 5+ containers, PostgreSQL, Redis. ~2GB disk. Complex setup. You already have a PostgreSQL-like DB (XTDB) — running another one for Harbor is wasteful.

### Recommendation: **Zot (minimal)**

- Single container, 127MB
- Built-in scanning eliminates separate Trivy install
- Built-in web UI for browsing images
- OCI-native (future-proof)
- Can sync/mirror from Docker Hub (useful for pulling base images through local cache)
- Config is a single JSON file

Harbor is enterprise-grade but absurd overhead for 5 services. Distribution is too bare — you'd end up bolting on Trivy + a UI anyway.

---

## Part 2: Security Scanning

### If using Zot (recommended)
Scanning is built in. Configure in `zot-config.json`:
```json
{
  "extensions": {
    "search": { "enable": true },
    "scrub": { "enable": true, "interval": "24h" },
    "lint": { "enable": true }
  }
}
```

### If using Distribution (registry:2)
Install **Trivy** (Go binary, available via brew):
```bash
brew install trivy
trivy image localhost:5000/harness/event-api:latest
```

Or **Grype** (Go binary):
```bash
brew install grype
grype localhost:5000/harness/event-api:latest
```

Both are single binaries, both can scan OCI images from registries.

---

## Part 3: Containerizing the 5 App Services

Each service becomes a Docker image:

| Service | Dir | Port | Base Image | Size (est) |
|---------|-----|------|------------|------------|
| event-api | xtdb-event-logger-ui | 3333 | node:22-slim | ~200MB |
| chat-ws | web-chat | 3334 | node:22-slim | ~180MB |
| ops-api | xtdb-ops-api | 3335 | node:22-slim | ~180MB |
| harness-ui | harness-ui | 3336 | node:22-slim | ~210MB |
| ci-runner | ci-runner | 3337 | node:22-slim + docker CLI | ~250MB |

**Shared Dockerfile pattern** (multi-stage build):
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Shared libs
COPY lib/ /app/lib/
EXPOSE ${PORT}
CMD ["npx", "jiti", "server.ts"]
```

**CI runner is special**: needs docker CLI + socket mount to spawn sibling containers.

---

## Part 4: JSON-LD Deployment Definitions

Extend the existing `.cd.jsonld` to describe container deployments:

```jsonld
{
  "@context": {
    "schema": "https://schema.org/",
    "code": "https://pi.dev/code/",
    "oci": "https://opencontainers.org/"
  },
  "@type": "code:DeployPipeline",
  "schema:name": "harness CD",
  "code:registry": "localhost:5000",
  "code:strategy": "rolling",
  "code:services": [
    {
      "@type": "code:ContainerService",
      "schema:name": "event-api",
      "oci:image": "localhost:5000/harness/event-api",
      "code:dockerfile": "xtdb-event-logger-ui/Dockerfile",
      "code:context": ".",
      "code:port": 3333,
      "code:healthPath": "/api/stats",
      "code:env": {
        "UI_PORT": "3333",
        "XTDB_URL": "postgresql://xtdb-primary:5432/xtdb"
      },
      "code:networks": ["harness"],
      "code:dependsOn": ["xtdb-primary", "redpanda"]
    }
  ]
}
```

The deploy script reads this JSON-LD, builds images, pushes to registry, and does rolling restarts of Docker containers.

---

## Part 5: Deployment Flow

```
1. CI passes → trigger deploy
2. For each service in .cd.jsonld:
   a. docker build -t localhost:5000/harness/{name}:{commit} -f {dockerfile} {context}
   b. docker push localhost:5000/harness/{name}:{commit}
   c. (Zot auto-scans on push)
   d. Check scan results via Zot API — fail if critical vulns
   e. docker compose up -d {name}  (with new image tag)
   f. Health check: GET http://localhost:{port}/{healthPath}
   g. If unhealthy → rollback: docker compose up -d {name} with previous tag
3. Tag successful images as :latest
4. Record deployment to XTDB with JSON-LD
```

**Rollback** is trivial with container images: just `docker compose up -d` with the previous image tag. No git checkout needed.

---

## Part 6: Migration from process-compose to Docker Compose

Currently:
- **Docker Compose**: 7 infrastructure containers
- **process-compose**: 5 app services as host processes

After containerization:
- **Docker Compose**: 7 infra + 5 app + 1 registry = **13 containers**
- **process-compose**: not needed (or kept for dev-mode only)

The 5 app services move from `process-compose.yml` to `docker-compose.yml`. They join the same Docker network as the infrastructure containers, so they can reach `xtdb-primary:5432` directly instead of going through `localhost:5433`.

---

## Part 7: Open Questions

1. **Dev mode**: Do you want to keep process-compose for local development (faster iteration, no rebuild) and only use containers for "production" deploys?

2. **Shared lib**: The 5 services share `lib/` (errors.ts, db.ts, jsonld/context.ts). Options:
   - Copy into each image at build time (simple, duplicated)
   - Publish as npm package to registry (clean but overhead)
   - Monorepo Docker context from root (large context but works)

3. **CI runner chicken-and-egg**: The CI runner builds images. If the CI runner itself is containerized, how does it build? Options:
   - Docker socket mount (current approach, works)
   - Buildx with remote builder
   - Keep CI runner as host process (don't containerize it)

4. **Image tagging**: Use git commit SHA? Semantic version? Both?

5. **Garbage collection**: Old images accumulate. Zot has built-in GC. Distribution needs manual `registry garbage-collect`.

---

## Recommendation

| Component | Choice | Why |
|-----------|--------|-----|
| **Registry** | Zot (minimal) | Single container, built-in scanning + UI + signing. 127MB |
| **Scanning** | Zot's built-in Trivy | No separate install. Scans on push |
| **Image build** | Multi-stage Dockerfile per service | Standard, cacheable, reproducible |
| **Deploy config** | Extended `.cd.jsonld` | Already have JSON-LD as source of truth |
| **Deploy tool** | Enhanced `scripts/deploy.ts` | Reads JSON-LD, builds, pushes, rolls out |
| **Runtime** | Docker Compose (unified) | All 13 containers in one place |
| **Dev mode** | Keep process-compose | Fast iteration without rebuilds |

### Implementation Order
1. Add Zot to docker-compose.yml
2. Write Dockerfiles for 5 services
3. Extend `.cd.jsonld` with container definitions
4. Update `scripts/deploy.ts` to build + push + deploy
5. Move app services from process-compose to docker-compose
6. Add deployment history page to harness-ui
