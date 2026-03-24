# Harness Quality & Continuous Improvement — Progress Tracker

**Last updated:** March 24, 2026 (cross-validated against Gemini/GPT reviews; corrected factual errors; added new findings)
**Scope:** Quality audits, prevention plan, and continuous process design for the harness monorepo (pi.dev environment)

---

## Cross-Validation Report (March 24, 2026)

Independent reviews by Gemini (`PROGRESS.GEMINI.md`) and GPT (`PROGRESS.GPT.md`) were compared against the actual codebase. Below is what holds up, what doesn't, and what both missed.

### Corrections Applied to This Document

| # | Issue | Source | Fix |
|---|-------|--------|-----|
| 1 | **Table count was 27, actual is 30** | GPT | Schema baseline updated throughout. `seed-schema.ts` defines 30 tables: the original 27 + `ci_runs`, `builds`, `docker_events`. Phase 7 grows 30→33, Phase 8 grows 33→34. |
| 2 | **Section 1.4 says "5 services" but lists 6** | GPT | The parenthetical listed event-api, ops-api, harness-ui, ci-runner, docker-event-collector, build-service — that's 6, not 5. Corrected to "6 services". |
| 3 | **Section 1.5 says "5 API services" — actual Hono servers: 7** | GPT | There are 7 Hono server entrypoints: `harness-ui`, `web-chat`, `xtdb-event-logger-ui`, `build-service`, `docker-event-collector`, `xtdb-ops-api`, `ci-runner`. Corrected scope. |
| 4 | **Phase 1 "NOT STARTED" is too absolute** | GPT | Existing groundwork acknowledged: `lib/errors.ts`, `ci-runner/pipeline.ts` auto-detects biome/tsc, `harness-ui` already has monitoring pages, 17 test files exist, `scripts/parse-call-graph.ts` + `data/call-graph.jsonld` + `/graph` UI page exist. Status changed to "NOT STARTED (groundwork exists)". |

### What Both Reviews Confirmed (Verified Against Codebase)

All of the following were independently confirmed by reading actual files:

- ✅ `.githooks/pre-commit` ends with `exit 0` — non-blocking
- ✅ `biome.json` has `noExplicitAny`, `noConsole`, `noEmptyBlockStatements`, `noFloatingPromises`, `noMisusedPromises`, `noAccumulatingSpread` at `warn` not `error`
- ✅ `.ci.jsonld` has one step: runs only `test/pure-functions.ts`
- ✅ 23 occurrences of `password: "xtdb"` across 20 files — exact inventory matches
- ✅ 440 `console.*` calls across the codebase
- ✅ No `pino`, no `valibot`/`zod`, no root `tsconfig.json`
- ✅ `hooks:install` not wired into `setup` or `setup:all`
- ✅ All planned extension directories absent: `review-gate/`, `health-prober/`, `log-scanner/`, `secrets-manager/`, `ticket-manager/`, `progress-sync/`, `knowledge-graph/`
- ✅ Phase 0 deliverables all exist on disk

### Where GPT Was More Accurate Than Gemini

GPT caught several things Gemini missed:

1. **Table count mismatch** — Gemini said "matches" without checking; GPT found the 27→30 discrepancy
2. **Existing groundwork understatement** — GPT identified that `ci-runner/pipeline.ts` already auto-detects `npx biome ci .` and `npx tsc --noEmit`, `lib/errors.ts` already exists, `harness-ui` already has ops/docker-events/errors/ci-runs/builds/deploys/graph pages, and 17 test files exist
3. **Service count inconsistencies** — GPT caught both the 5-vs-6 and 5-vs-7 mismatches
4. **Duplicate file pairs** — GPT noted existing groundwork more precisely

### Where Gemini Was Fine But Shallow

Gemini's report is factually correct at the phase-completion level — it confirmed Phase 0 done, Phase 1+ not started, and all planned directories absent. But it didn't dig into numeric claims or existing partial work, so it missed corrections 1–4 above.

### Issues Both Gemini and GPT Missed

These were found by deeper codebase inspection:

#### 1. Empty Catch Blocks in Production Code (34 instances)

Neither report flagged the scale of empty catches outside test files. Found **34 empty catch blocks** in production code:

| File | Count | Risk |
|------|-------|------|
| `harness-ui/lib/api.ts` | 6 | All API calls silently swallow errors — UI shows nothing on failure |
| `harness-ui/pages/ops.ts` | 4 | Ops page actions fail silently |
| `harness-ui/server.ts` | 5 | Server-side route handlers swallow errors |
| `xtdb-event-logger-ui/lib/db.ts` | 11 | DB query failures invisible — data just disappears |
| `web-chat/lib/session-pool.ts` | 1 | Session cleanup errors lost |
| `web-chat/lib/ws-protocol.ts` | 1 | WebSocket message parse errors lost |
| `harness-ui/pages/flow.ts` | 1 | Flow page errors swallowed |
| `harness-ui/pages/event-detail.ts` | 1 | Event detail errors swallowed |
| `xtdb-event-logger-ui/server.ts` | 1 | Server route error swallowed |
| `artifact-tracker/db.ts` | 1 | Artifact query errors lost |
| `scripts/deploy.ts` | 1 | Deploy errors swallowed |

This is a data-loss risk: queries fail, errors vanish, UI shows stale/empty data with no indication of failure. Should be a **Phase 1 priority**.

#### 2. Missing Graceful Shutdown (5 of 8 services)

Only 3 services handle `SIGTERM`/`SIGINT`: `ci-runner`, `docker-event-collector`, `build-service`.

These 5 services have **no graceful shutdown** — DB connections, open sockets, and in-flight requests are abandoned on container stop:

- `xtdb-event-logger/index.ts`
- `xtdb-ops-api/server.ts`
- `harness-ui/server.ts`
- `web-chat/server.ts`
- `xtdb-event-logger-ui/server.ts`

Risk: data corruption on deploys, connection pool exhaustion after restarts, lost WebSocket sessions.

#### 3. DB Connection Sprawl (22 separate `postgres()` calls)

There are **22 separate `postgres({...})` instantiations** across the codebase (excluding tests). While `lib/db.ts` exports a shared `connectXtdb()`, most services create their own connections with duplicated config. This is:
- A duplication problem (each copies host/port/password)
- A secrets problem (password hardcoded 23 times instead of 1)
- A connection pool problem (no coordination of `max` settings across services)

#### 4. Docker Healthchecks Missing on Most Services

Only **6 of ~15 services** have Docker healthchecks: `caddy`, `redpanda`, `xtdb-primary`, `xtdb-replica`, `keycloak`, `qlever`.

Missing healthchecks: `garage`, `soft-serve`, `zot`, `event-api`, `chat-ws`, `ops-api`, `harness-ui`, `ci-runner`, `docker-event-collector`, `build-service`.

Without healthchecks, `depends_on` with `condition: service_healthy` can't work, and Docker can't auto-restart truly-broken services.

#### 5. Byte-for-Byte Duplicate Files Still Present

Confirmed two pairs of identical files (md5 verified):

| Pair | Files | MD5 |
|------|-------|-----|
| 1 | `test/mock-pi.ts` ↔ `quality-hooks/mock-pi.ts` | `5cfa2e924f379cdd0bd9cf892474739d` |
| 2 | `harness-ui/lib/health.ts` ↔ `xtdb-event-logger-ui/lib/health.ts` | `ce6c3d1a92fdd87a35ba02e573d14c70` |

`xtdb-ops-api/lib/health.ts` is a different variant (`bc94871cf7284669f10241e115dcd79f`).

#### 6. `as any` Casts: 219 in Production Code

The audit reports cited "235+ `as any` casts" — the actual count in non-test code is **219**. Still severe for type safety but the number was slightly overstated.

---

## Phase 0: Quality Audits & Analysis (COMPLETED)

Everything in this phase is done. These deliverables informed the prevention plan and continuous process designs below.

- [x] **Comprehensive Code Quality Audit** — `harness-comprehensive-quality-report.md` / `.docx`
  - 77 issues across 15 quality dimensions (5 critical, 18 high, 43 medium, 11 low)
  - 218 TypeScript files, ~30,000 lines of code analyzed
  - Key critical findings: 5 command injection vulnerabilities in CI runner/build service, hardcoded credentials in 18+ files, zero input validation across all API surfaces
- [x] **Code Quality Report v1** — `harness-code-quality-report.md` / `.docx`
  - Detailed logging/observability audit (441 raw console statements, no structured logging)
  - Configuration management review (hardcoded values, no env validation)
  - API design patterns audit
- [x] **Code Quality Report v2** — `harness-code-quality-report-v2.md` / `.docx`
  - Follow-up deep dive into type safety (235+ `as any` casts), error handling (40+ empty catches), concurrency issues
- [x] **Duplication Analysis** — `harness-duplication-report.md` / `.docx`
  - 11 duplication groups identified, ~491 duplicated lines across 68 files
  - Top issue: XTDB typed parameter helpers copy-pasted across 31 files (already exported from lib/db.ts)
  - 2 pairs of byte-for-byte identical files (mock-pi.ts, health.ts)
- [x] **TypeScript Audit** — `AUDIT_REPORT.md`
  - Deep dive into logging, configuration, and API design patterns
- [x] **Quality Prevention Plan** — `harness-quality-prevention-plan.md` / `.docx`
  - Full inventory of existing tooling (18 items catalogued)
  - Gap analysis mapping each audit finding to what should have caught it
  - Phased remediation plan with specific tool/config changes

---

## Phase 1: Foundation Hardening (NOT STARTED — groundwork exists)

These are prerequisite changes that make the continuous processes possible. Without them, the processes would be monitoring broken baselines.

### 1.1 Make Pre-Commit Hook Blocking

- [ ] Change `.githooks/pre-commit` to exit with the actual `$exitcode` instead of always exiting 0
- [ ] Add `hooks:install` to the `setup` and `setup:all` Taskfile targets so it's automatic
- [ ] Document in QUICKSTART.md that hooks are mandatory

**Why first:** Every continuous process depends on the gate actually stopping bad code. Currently it warns but never blocks.

### 1.2 Harden Biome Configuration

- [ ] Promote `noExplicitAny` from `warn` to `error`
- [ ] Promote `noEmptyBlockStatements` from `warn` to `error`
- [ ] Promote `noConsole` from `warn` to `error` (with an allowlist for test files)
- [ ] Promote `noFloatingPromises` from `warn` to `error`
- [ ] Promote `noMisusedPromises` from `warn` to `error`
- [ ] Add `noAccumulatingSpread` as `error`

**Why:** The prevention plan identified that many issues were caught at `warn` level but never acted on. Promotion to `error` + blocking pre-commit hook closes the loop.

### 1.3 Expand CI Pipeline (.ci.jsonld)

- [ ] Add a `lint` step running `npx biome ci .` in CI
- [ ] Add a `typecheck` step running `npx tsc --noEmit` (requires adding a root tsconfig.json)
- [ ] Expand the `test` step to run all test files, not just `pure-functions.ts`
- [ ] Add the contract test suite (`scripts/test-contracts.sh`) as a CI step (requires running services)

**Current state:** `.ci.jsonld` only runs `pure-functions.ts`. No lint, typecheck, or integration tests in CI.

### 1.4 Adopt Structured Logging

- [ ] Add Pino as a dependency
- [ ] Create `lib/logger.ts` — a shared logger factory that outputs JSON with component, level, timestamp, and request context
- [ ] Migrate the 6 services (event-api, ops-api, harness-ui, ci-runner, docker-event-collector, build-service) from `console.*` to the structured logger
- [ ] Configure log aggregation (services write to stdout, Docker captures via `json-file` driver, a new `log-aggregator` service tails all containers)

**Why:** Every continuous monitoring process needs parseable logs. Raw `console.log` is invisible to automated analysis.

### 1.5 Add Input Validation

- [ ] Add Valibot (or Zod) as a dependency
- [ ] Create validation schemas for all Hono route handlers across the 7 API services (harness-ui, web-chat, xtdb-event-logger-ui, build-service, docker-event-collector, xtdb-ops-api, ci-runner)
- [ ] Add a quality-hooks check that flags Hono route handlers without schema validation

### 1.6 Secrets Management with Infisical (NEW)

Migrate all hardcoded credentials to a centralized secrets manager. This is a critical security prerequisite — the audit found **23 files** with hardcoded database passwords, **6 files** with hardcoded S3 keys, and additional admin tokens baked into config files.

#### Background: Why Infisical

[Infisical](https://infisical.com/) is an open-source (MIT-licensed) secrets management platform purpose-built for developer workflows. It self-hosts via Docker Compose with PostgreSQL + Redis, provides SDKs for Node.js/Go/Python, a CLI for env injection, and a Kubernetes operator. For harness's Docker Compose environment it's the best fit because:

- **Self-hosted, MIT core** — no vendor dependency, full control over data
- **Docker Compose native** — runs as an additional service in the existing stack
- **Machine Identity auth** — services authenticate via Client ID/Client Secret (Universal Auth), getting short-lived access tokens
- **SDK + CLI injection** — two consumption models: SDK for runtime fetching, CLI wrapper (`infisical run --`) for env injection at startup
- **Audit logging** — every secret access is logged (feeds into the harness event pipeline)
- **Secret versioning & rotation** — built-in support for rotating DB passwords, S3 keys, etc.
- **Role-based access control** — different services get different secret scopes

Alternatives considered: HashiCorp Vault (heavier, HCL-licensed since 2023), Doppler (SaaS-only), AWS Secrets Manager (cloud-locked). Infisical is the lightest-weight self-hosted option that still provides audit trails and rotation.

#### Hardcoded Secrets Inventory (Complete Catalog)

Every hardcoded secret found in the codebase, organized by category:

**1. XTDB Database Password (`password: "xtdb"`) — 20 files, 23 occurrences:**

| # | File | How Used |
|---|------|----------|
| 1 | `lib/db.ts` | Shared DB connector (all services import this) |
| 2 | `lib/test-recorder.ts` | Test result recording |
| 3 | `xtdb-event-logger/endpoints/xtdb.ts` | Event logger DB writes |
| 4 | `xtdb-event-logger-ui/lib/db.ts` | Event logger UI reads |
| 5 | `xtdb-ops-api/server.ts` (×4 occurrences) | Ops API — primary, replica, backup, compaction connections |
| 6 | `xtdb-ops-api/lib/ci-webhook.ts` | CI webhook handler |
| 7 | `xtdb-ops-api/lib/incidents.ts` | Incident recording |
| 8 | `xtdb-ops-api/lib/backup.ts` | Backup operations |
| 9 | `ci-runner/recorder.ts` | CI run recording |
| 10 | `build-service/recorder.ts` | Build recording |
| 11 | `build-service/server.ts` | Build service DB connection |
| 12 | `xtdb-projector/index.ts` | Projection engine |
| 13 | `artifact-tracker/db.ts` | Artifact tracking |
| 14 | `sunk-cost-detector/index.ts` | Sunk cost analysis |
| 15 | `history-retrieval/index.ts` | History queries |
| 16 | `data-examples/extract.ts` | Data extraction scripts |
| 17 | `data-examples/test-xtdb-insert.ts` | Test data insertion |
| 18 | `scripts/export-xtdb-triples.ts` | Triple export |
| 19 | `test/lifecycle.ts` | Integration tests |
| 20 | `test/integration.ts` | Integration tests |

**2. XTDB Connection String (no password but no auth) — 1 file:**

| # | File | Value |
|---|------|-------|
| 1 | `docker-event-collector/writer.ts` | `postgresql://localhost:5433/xtdb` (no user/pass) |

**3. Garage S3 Credentials — 4 files, 6 occurrences:**

| # | File | Secret |
|---|------|--------|
| 1 | `garage-init.sh` | `ACCESS_KEY="GK02e8e11dbf9b0325065707e5"` |
| 2 | `garage-init.sh` | `SECRET_KEY="9834ce4f..."` (64-char hex) |
| 3 | `garage-init.sh` | `Authorization: Bearer admin-secret` |
| 4 | `xtdb-primary.yaml` | `accessKey` + `secretKey` inline |
| 5 | `xtdb-replica.yaml` | `accessKey` + `secretKey` inline (identical) |
| 6 | `garage.toml` | `admin_token = "admin-secret"` |

**4. Garage RPC Secret — 1 file:**

| # | File | Value |
|---|------|-------|
| 1 | `garage.toml` | `rpc_secret = "0123456789abcdef..."` (64-char placeholder) |

**5. Keycloak Admin Credentials — 1 file:**

| # | File | Value |
|---|------|-------|
| 1 | `docker-compose.yml` | `KEYCLOAK_ADMIN: admin` / `KEYCLOAK_ADMIN_PASSWORD: admin` |

**6. Soft Serve SSH Public Key — 1 file:**

| # | File | Value |
|---|------|-------|
| 1 | `docker-compose.yml` | `SOFT_SERVE_INITIAL_ADMIN_KEYS: "ssh-ed25519 AAAA..."` |

**Total: 28 files, ~33 hardcoded secret instances across 6 categories.**

#### Infrastructure: Add Infisical to Docker Compose

Infisical requires PostgreSQL (separate from XTDB) and Redis. Add these services:

- [ ] Add `infisical-db` service (PostgreSQL 16 Alpine) — dedicated Postgres for Infisical metadata
- [ ] Add `infisical-redis` service (Redis 7 Alpine) — session cache and queue
- [ ] Add `infisical` service (Infisical server image) — the secrets management UI/API
- [ ] Generate `ENCRYPTION_KEY`, `AUTH_SECRET`, `SITE_URL` for Infisical's own config
- [ ] Add `infisical-data`, `infisical-redis-data` Docker volumes
- [ ] Add Infisical to the Caddy reverse proxy at `/infisical` path
- [ ] Add healthcheck for Infisical service

**Docker Compose additions (skeleton):**

```yaml
# ── Infisical Secrets Manager ────────────────────────────────────
infisical-db:
  image: postgres:16-alpine
  container_name: infisical-db
  restart: unless-stopped
  environment:
    POSTGRES_USER: infisical
    POSTGRES_PASSWORD: ${INFISICAL_DB_PASSWORD}  # bootstrapped from .env.infisical
    POSTGRES_DB: infisical
  volumes:
    - infisical-db-data:/var/lib/postgresql/data

infisical-redis:
  image: redis:7-alpine
  container_name: infisical-redis
  restart: unless-stopped
  volumes:
    - infisical-redis-data:/data

infisical:
  image: infisical/infisical:latest
  container_name: infisical
  restart: unless-stopped
  depends_on: [infisical-db, infisical-redis]
  environment:
    ENCRYPTION_KEY: ${INFISICAL_ENCRYPTION_KEY}
    AUTH_SECRET: ${INFISICAL_AUTH_SECRET}
    DB_CONNECTION_URI: postgres://infisical:${INFISICAL_DB_PASSWORD}@infisical-db:5432/infisical
    REDIS_URL: redis://infisical-redis:6379
    SITE_URL: http://localhost/infisical
  healthcheck:
    test: ["CMD-SHELL", "wget -q -O /dev/null http://localhost:8080/api/status || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s
```

#### Secret Organization in Infisical

Create one Infisical **project** (`harness`) with three **environments**: `dev`, `staging`, `prod`. Organize secrets into **folders** by service:

```
harness/
├── xtdb/
│   ├── XTDB_USER          = "xtdb"
│   ├── XTDB_PASSWORD       = <generated strong password>
│   ├── XTDB_DATABASE       = "xtdb"
│   ├── XTDB_PRIMARY_HOST   = "xtdb-primary"
│   ├── XTDB_PRIMARY_PORT   = "5432"
│   ├── XTDB_REPLICA_HOST   = "xtdb-replica"
│   └── XTDB_REPLICA_PORT   = "5432"
├── garage/
│   ├── GARAGE_ACCESS_KEY   = <generated>
│   ├── GARAGE_SECRET_KEY   = <generated>
│   ├── GARAGE_ADMIN_TOKEN  = <generated>
│   ├── GARAGE_RPC_SECRET   = <generated 64-char hex>
│   ├── GARAGE_ENDPOINT     = "http://garage:3900"
│   └── GARAGE_BUCKET       = "xtdb"
├── keycloak/
│   ├── KEYCLOAK_ADMIN      = "admin"
│   ├── KEYCLOAK_ADMIN_PASSWORD = <generated strong password>
│   ├── KEYCLOAK_REALM      = "harness"
│   └── KEYCLOAK_CLIENT_ID  = "harness-api"
├── soft-serve/
│   └── SOFT_SERVE_ADMIN_KEY = "ssh-ed25519 AAAA..."
└── infisical/
    ├── INFISICAL_DB_PASSWORD     = <generated>
    ├── INFISICAL_ENCRYPTION_KEY  = <generated>
    └── INFISICAL_AUTH_SECRET     = <generated>
```

#### Machine Identities (Service Auth)

Each harness service gets its own **Machine Identity** in Infisical with **Universal Auth** (Client ID + Client Secret). This provides least-privilege access — each service only reads the secret folders it needs:

| Machine Identity | Secret Folders | Services Using It |
|-----------------|----------------|-------------------|
| `harness-db-reader` | `xtdb/*` | event-api, ops-api, ci-runner, build-service, docker-event-collector, harness-ui |
| `harness-garage` | `garage/*` | garage-init (bootstrap only) |
| `harness-xtdb-storage` | `garage/GARAGE_ACCESS_KEY`, `garage/GARAGE_SECRET_KEY`, `garage/GARAGE_ENDPOINT`, `garage/GARAGE_BUCKET` | xtdb-primary, xtdb-replica |
| `harness-keycloak` | `keycloak/*` | keycloak |
| `harness-infra` | `soft-serve/*`, `infisical/*` | soft-serve, infisical |

#### Integration Strategy: Two-Phase Approach

**Phase A — CLI Injection (Quick Win):**

Use the Infisical CLI as an entrypoint wrapper in Docker containers. No code changes needed for most services.

- [ ] Install `infisical` CLI in each service's Dockerfile (or use a shared base image)
- [ ] Modify each service's Docker Compose `command` to: `infisical run --projectId=<id> --env=dev -- node server.js`
- [ ] Each service gets `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` as env vars (the only secrets remaining in Docker Compose / .env)
- [ ] Secrets are injected as environment variables at container startup
- [ ] Create `scripts/infisical-bootstrap.sh` — initial setup script that creates the project, environments, folders, machine identities, and seeds all secrets

**Phase B — Centralized `lib/db.ts` Refactor (Code Cleanup):**

After CLI injection is working, refactor the code to eliminate the 20+ duplicated DB connection patterns:

- [ ] Update `lib/db.ts` `connectXtdb()` to read `XTDB_PASSWORD` from environment (set by Infisical CLI) instead of hardcoded `"xtdb"`
- [ ] Migrate all 20 files with hardcoded `password: "xtdb"` to use the shared `connectXtdb()` from `lib/db.ts` (this also fixes the duplication issue from the audit)
- [ ] Update `docker-event-collector/writer.ts` to use `lib/db.ts` instead of raw connection string
- [ ] Template `xtdb-primary.yaml` and `xtdb-replica.yaml` to read S3 credentials from environment variables
- [ ] Template `garage.toml` to read `admin_token` and `rpc_secret` from environment variables
- [ ] Update `garage-init.sh` to read credentials from environment variables instead of hardcoded values
- [ ] Remove all hardcoded credential values from source-controlled files

#### XTDB YAML Templating

XTDB config files (`xtdb-primary.yaml`, `xtdb-replica.yaml`) need environment variable substitution since XTDB doesn't natively support env vars in YAML. Options:

- [ ] **Option 1 (Recommended):** Use an entrypoint script that runs `envsubst` on the YAML template before starting XTDB
- [ ] Create `scripts/xtdb-entrypoint.sh` that substitutes `${GARAGE_ACCESS_KEY}`, `${GARAGE_SECRET_KEY}` in the YAML
- [ ] Update docker-compose.yml to use the custom entrypoint for xtdb-primary and xtdb-replica

```yaml
# Template: xtdb-primary.yaml.tmpl
storage: !Remote
  objectStore: !S3
    bucket: "${GARAGE_BUCKET}"
    endpoint: "${GARAGE_ENDPOINT}"
    pathStyleAccessEnabled: true
    region: "garage"
    credentials:
      accessKey: "${GARAGE_ACCESS_KEY}"
      secretKey: "${GARAGE_SECRET_KEY}"
```

#### Garage Config Templating

- [ ] Rename `garage.toml` → `garage.toml.tmpl`
- [ ] Replace hardcoded `admin_token` and `rpc_secret` with `${GARAGE_ADMIN_TOKEN}` and `${GARAGE_RPC_SECRET}`
- [ ] Add `envsubst` entrypoint wrapper for the garage container
- [ ] Update `garage-init.sh` to read `$GARAGE_ACCESS_KEY`, `$GARAGE_SECRET_KEY`, `$GARAGE_ADMIN_TOKEN` from environment

#### CI Pipeline Integration

- [ ] Create a Machine Identity `harness-ci` with read access to all secret folders
- [ ] `ci-runner/runner.ts` — inject Infisical CLI before running pipeline steps so CI jobs get secrets
- [ ] Store `INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET` for CI as Docker secrets or in the CI runner's environment
- [ ] Pipeline steps that need DB access automatically get credentials via Infisical

#### Local Development Workflow

- [ ] Developers install Infisical CLI locally (`brew install infisical/get-cli/infisical`)
- [ ] `infisical login` authenticates against the self-hosted instance
- [ ] `infisical run --env=dev -- npm run dev` injects dev secrets
- [ ] Add `Taskfile.yml` target: `dev:secrets` that wraps commands with Infisical CLI
- [ ] Document the workflow in QUICKSTART.md

#### Secret Rotation Strategy

- [ ] Configure automatic rotation for XTDB password (rotate every 90 days)
- [ ] Configure automatic rotation for Garage S3 keys (rotate every 90 days)
- [ ] Configure automatic rotation for Keycloak admin password (rotate every 90 days)
- [ ] Garage RPC secret requires coordinated restart — document as manual rotation with runbook
- [ ] Infisical's own credentials (encryption key, auth secret) are immutable after first boot — document backup procedure

#### NEW EXTENSION: `secrets-manager/`

A harness extension that validates and integrates secrets management with the harness ecosystem:

- [ ] `secrets-manager/validate.ts` — Pre-commit hook scanner: greps staged files for patterns matching hardcoded secrets (passwords, AWS keys, tokens). Uses regex patterns similar to gitleaks. Blocks commit if found. Integrates with existing `quality-hooks/` system.
- [ ] `secrets-manager/inject.ts` — Secret injection helper: wraps `connectXtdb()` and other credential-consuming functions with Infisical SDK fallback (try env var → try Infisical SDK → fail with clear error message).
- [ ] `secrets-manager/audit.ts` — Audit logger: records every secret access event to XTDB `secret_access_events` table as JSON-LD (`sec:SecretAccess` entity type). Tracks which service accessed which secret, when, and from which IP.
- [ ] `secrets-manager/health.ts` — Health checker: verifies Infisical connectivity, validates all required secrets are present for each service, reports missing/expired secrets.
- [ ] `secrets-manager/rotate.ts` — Rotation helper: triggers credential rotation via Infisical API, coordinates service restarts after rotation.

**JSON-LD Integration:**

```json
{
  "@context": "harness JSON-LD context",
  "@type": "sec:SecretAccess",
  "sec:service": "event-api",
  "sec:secretPath": "harness/xtdb/XTDB_PASSWORD",
  "sec:action": "read",
  "sec:timestamp": 1711234567890,
  "sec:source": "infisical-sdk",
  "prov:wasAssociatedWith": "pi:identity/harness-db-reader"
}
```

#### Integration with Existing Phases

- **Phase 4.1 (Secret Detection):** gitleaks + `secrets-manager/validate.ts` pre-commit hook work together — gitleaks catches known patterns, the validator catches harness-specific patterns (XTDB connection strings, Garage keys)
- **Phase 4.4 (Log Scanning):** `secrets-manager/audit.ts` feeds secret access events into the same XTDB tables that log scanning monitors — unified view of credential usage
- **Phase 6 (Error Monitoring):** Secret access failures (expired tokens, missing secrets) generate error events that feed into the auto-ticketing system
- **Phase 8 (Knowledge Graph):** `sec:SecretAccess` entities link to service identities, secret paths, and timestamps — enabling queries like "which services accessed the DB password in the last 24h?"

#### Migration Checklist (Execution Order)

1. - [ ] Deploy Infisical to docker-compose.yml (infisical + infisical-db + infisical-redis)
2. - [ ] Run `scripts/infisical-bootstrap.sh` to create project, environments, folders, and seed secrets
3. - [ ] Create Machine Identities for each service group
4. - [ ] Update Dockerfiles to include Infisical CLI
5. - [ ] Update docker-compose.yml service commands to use `infisical run --` wrapper
6. - [ ] Verify all services start correctly with Infisical-injected secrets
7. - [ ] Refactor `lib/db.ts` to read password from `process.env.XTDB_PASSWORD`
8. - [ ] Migrate all 20 files to use shared `connectXtdb()` (eliminates duplication + hardcoded passwords)
9. - [ ] Template `xtdb-primary.yaml`, `xtdb-replica.yaml` for env var substitution
10. - [ ] Template `garage.toml` for env var substitution
11. - [ ] Update `garage-init.sh` to read from env vars
12. - [ ] Remove all hardcoded credential values from version-controlled files
13. - [ ] Add `secrets-manager/validate.ts` pre-commit hook
14. - [ ] Rotate all credentials (since old ones were in version control)
15. - [ ] Update QUICKSTART.md with Infisical setup instructions
16. - [ ] Update `.gitleaks.toml` baseline (Phase 4.1) to verify zero remaining secrets

**Why foundational:** Every other phase assumes credentials are handled correctly. Without this, structured logging (Phase 1.4) would log connection strings, CI (Phase 1.3) would have plaintext secrets in build output, and the knowledge graph (Phase 8) would index credential values. This must happen early.

---

## Phase 2: Continuous Review Process

Automated code quality enforcement on every commit and PR. Goal: no quality regression gets past the CI gate.

### 2.1 Automated PR Review Agent — NEW EXTENSION: `review-gate/`

**What it does:** Runs on every CI job (triggered by Soft Serve post-receive hook). Produces a structured review report stored in XTDB as JSON-LD.

**Checks performed:**
1. **Biome CI** — lint + format (already partially exists, needs CI integration)
2. **TypeScript strict check** — `tsc --noEmit` against a strict tsconfig
3. **Complexity metrics** — cyclomatic complexity per function (using `escomplex` or a custom AST walker)
4. **File size / function size** — reuse logic from `quality-hooks/checks.ts`
5. **Duplication detection** — cross-file via `jscpd` (the existing quality-hooks only checks within a single file)
6. **Test coverage delta** — compare coverage before/after the change (requires c8 integration)
7. **Dependency diff** — compare package.json / package-lock.json against the base branch, flag new deps

**Implementation plan:**
- [ ] Create `review-gate/` directory as a new harness extension
- [ ] `review-gate/index.ts` — extension entry point, registers as a CI post-step
- [ ] `review-gate/checks/lint.ts` — runs Biome, captures structured output
- [ ] `review-gate/checks/typecheck.ts` — runs tsc, parses diagnostics
- [ ] `review-gate/checks/complexity.ts` — computes cyclomatic/cognitive complexity per function, flags threshold violations (cyclomatic > 10, cognitive > 15)
- [ ] `review-gate/checks/size.ts` — reuses quality-hooks checks for file/function size
- [ ] `review-gate/checks/duplication.ts` — runs jscpd on changed files, reports new duplications
- [ ] `review-gate/checks/deps.ts` — diffs package.json against base, flags new direct deps and major version bumps
- [ ] `review-gate/recorder.ts` — writes review results to XTDB `review_reports` table as JSON-LD
- [ ] `review-gate/gate.ts` — computes pass/fail based on configurable thresholds, fails CI if any blocking check fails

**Modifications to existing code:**
- [ ] `ci-runner/runner.ts` — add a post-step hook that invokes `review-gate` after all pipeline steps pass
- [ ] `ci-runner/pipeline.ts` — extend `resolveSteps()` to include review-gate steps
- [ ] `.ci.jsonld` — add `review-gate` as a pipeline step

**External tools needed:**
- `jscpd` (npm) — cross-file duplication detection. Already used in duplication audit, proven to work with this codebase.
- `c8` (npm) — Node.js coverage via V8. Lightweight, no instrumentation needed.
- `escomplex` (npm) OR custom — complexity analysis. Alternative: `typhonjs-escomplex`.

**Integration with harness architecture:**
- Review results stored in XTDB as `code:ReviewReport` JSON-LD entities
- Queryable via QLever: "which repos have complexity regressions?", "what's the trend in duplication?"
- Results visible in harness-ui CI Runs page (extend the existing UI to show review details)
- Blocking: CI fails if any `severity: "block"` finding exists

### 2.2 Complexity Metrics Tracking Over Time

- [ ] `review-gate/checks/complexity.ts` stores per-function complexity scores in XTDB on every CI run
- [ ] Create a harness-ui page `/quality/complexity` showing complexity trends over time (line chart per module)
- [ ] Alert when a module's average complexity increases by more than 20% in a week
- [ ] Weekly digest (via a scheduled task or cron) summarizing complexity changes

**Success metric:** Average cyclomatic complexity per module does not increase month-over-month.

### 2.3 Architecture Decision Records (ADR) Enforcement

- [ ] Create `docs/adr/` directory with ADR template (`docs/adr/TEMPLATE.md`)
- [ ] Add a `review-gate` check that flags PRs touching architectural boundaries (new services, new extensions, new DB tables, new Docker containers) without a corresponding ADR file
- [ ] The check looks for: new directories at repo root, new entries in docker-compose.yml, new `@type` in JSON-LD contexts, new Taskfile tasks with `desc:`
- [ ] Link ADRs to review reports in XTDB (ADR entity references the review entity)

### 2.4 Style Consistency Enforcement

- [ ] Biome handles formatting and most style rules (already configured)
- [ ] Add a `review-gate` check for naming conventions: files use kebab-case, exports use camelCase/PascalCase
- [ ] Add a check for import ordering (Biome's `organizeImports` is already `on` in assist, promote to lint rule)
- [ ] Add a check that new files follow the established header comment pattern (`// ─── Module Name ───`)

---

## Phase 3: Continuous Monitoring

Real-time visibility into service health, resource usage, and performance. Goal: know about problems before users report them.

### 3.1 Service Health Dashboard — EXTEND: `docker-event-collector/`

**What exists today:** `docker-event-collector` streams Docker events, transforms to JSON-LD, writes to XTDB. Has alerting for OOM, restart loops, and crashes. `harness-ui` has a basic container status view.

**What to add:**

- [ ] **Heartbeat probes** — new `health-prober/` service (or add to docker-event-collector) that hits each service's `/api/health` endpoint every 30s, records latency and status in XTDB
- [ ] **Health history** — XTDB table `service_health_checks` storing: service name, status, response time, timestamp
- [ ] **Dashboard page** — extend harness-ui with `/monitoring/health` showing:
  - Current status of all 7 app services (event-api, chat-ws, ops-api, harness-ui, ci-runner, docker-event-collector, build-service)
  - Current status of all 6 infrastructure services (xtdb-primary, xtdb-replica, redpanda, garage, soft-serve, zot)
  - Response time sparklines (last 24h)
  - Uptime percentage (last 7d, 30d)
- [ ] **SSE alerts** — extend the existing `/api/ci/notify` SSE stream to include health alerts

**Implementation:**
- [ ] Create `health-prober/` directory with `index.ts` (runs as a lightweight sidecar or within docker-event-collector)
- [ ] Probe config: read endpoints from docker-compose.yml `code:healthPath` annotations (already defined in `.cd.jsonld`)
- [ ] Store results in XTDB using JSON-LD (`code:HealthCheck` entity type)
- [ ] Add harness-ui route and page component

### 3.2 Resource Usage Monitoring

**What exists today:** Docker stats are available via Docker API. docker-event-collector has access to `/var/run/docker.sock`.

- [ ] Add `docker stats` polling to `docker-event-collector/collector.ts` — every 60s, capture CPU%, memory usage, memory limit, network I/O, block I/O for each container
- [ ] Store in XTDB `container_metrics` table
- [ ] Add harness-ui page `/monitoring/resources` showing:
  - Memory usage over time per container (line chart)
  - CPU usage over time per container
  - Memory usage vs. limit (highlight containers approaching limit)
- [ ] **Memory leak detection** — alert when a container's memory usage increases monotonically for >1 hour without a corresponding increase in load
- [ ] **Resource alerts** — configurable thresholds (default: memory > 80% of limit, CPU sustained > 90% for 5 min)

**External tools:** None needed — Docker API provides all metrics. Alternative: cAdvisor container for richer metrics.

### 3.3 Database Query Performance Monitoring

**What exists today:** XTDB primary and replica expose health endpoints. The app services connect via pgwire (PostgreSQL protocol).

- [ ] Add query timing middleware to each service's `postgres` connection (wraps the `postgres` constructor from lib/db.ts)
- [ ] `lib/db.ts` — add a `queryTimer` wrapper that logs query duration, table, operation type
- [ ] Store slow queries (>500ms) in XTDB `slow_queries` table
- [ ] Add harness-ui page `/monitoring/queries` showing:
  - Top 10 slowest queries (last 24h)
  - Query count by table and operation
  - P50/P95/P99 latency by endpoint
- [ ] Alert when P95 query latency exceeds 2s for any endpoint

### 3.4 API Response Time Tracking

- [ ] Add Hono middleware to all 5 API services that records: endpoint, method, status code, response time, request size, response size
- [ ] Create shared middleware in `lib/api-metrics.ts`
- [ ] Store in XTDB `api_metrics` table (sampled — record every Nth request or only slow ones to control volume)
- [ ] Add harness-ui page `/monitoring/api` showing:
  - Response time distribution per endpoint
  - Error rate per endpoint
  - Request volume over time
  - Slow endpoint alerts (P95 > 1s)

### 3.5 Error Rate Trending and Alerting

**What exists today:** `lib/errors.ts` captures errors to JSONL then flushes to XTDB. But adoption is spotty — most services use raw try/catch with console.error.

- [ ] Ensure all services use `captureError()` from `lib/errors.ts` in every catch block (part of the structured logging migration in Phase 1)
- [ ] Add error rate computation to the health-prober: query XTDB for error count per component per 5-minute window
- [ ] Alert when error rate exceeds: >10 errors/5min (warning), >50 errors/5min (critical)
- [ ] Add harness-ui page `/monitoring/errors` showing error trends, grouped by component and severity

---

## Phase 4: Continuous Security Scanning

Automated security checks that run on every commit and on a schedule. Goal: zero known vulnerabilities in production.

### 4.1 Secret Detection in Commits — CI STEP

**What exists today:** `protected-paths/` blocks writes to `.env` files but does NOT scan content. The security-auditor agent is manual/on-demand.

- [ ] Add `gitleaks` as a CI step in `.ci.jsonld` (runs in Docker: `zricethezav/gitleaks:latest`)
- [ ] Configuration: create `.gitleaks.toml` with rules for AWS keys, API tokens, database passwords, JWT secrets, private keys
- [ ] Make it blocking — CI fails if any secret is detected
- [ ] Add to pre-commit hook: `gitleaks protect --staged` (checks only staged files, fast)
- [ ] Create baseline file `.gitleaks-baseline.json` for existing known secrets (so CI doesn't fail on day 1)
- [ ] Remediation plan for existing hardcoded secrets: migrate to Infisical secrets manager (see Phase 1.6)
- [ ] After Phase 1.6 migration is complete, verify `.gitleaks-baseline.json` shows zero remaining secrets
- [ ] Integrate gitleaks with `secrets-manager/validate.ts` pre-commit hook (Phase 1.6) for defense-in-depth

**External tools:** `gitleaks` — open source, fast, low false-positive rate. Alternative: `trufflehog`, `detect-secrets`.
**Dependency:** Phase 1.6 (Infisical) handles the actual secret migration. This phase adds detection/prevention on top.

### 4.2 Dependency Vulnerability Scanning — CI STEP + SCHEDULED

- [ ] Add `npm audit --audit-level=high` as a CI step (fails on high/critical vulnerabilities)
- [ ] Create a scheduled task (Taskfile `security:audit`) that runs weekly: `npm audit --json > data/npm-audit.json`
- [ ] Store audit results in XTDB `dependency_audits` table
- [ ] Add harness-ui page `/security/dependencies` showing:
  - Current vulnerability count by severity
  - Dependency age (how outdated each dep is)
  - History of vulnerability count over time
- [ ] Alert on new critical vulnerabilities

**External tools:** `npm audit` (built-in). For deeper analysis: `socket.dev` CLI or `snyk` (both have free tiers).

### 4.3 Container Image Scanning — CI STEP

- [ ] Add `trivy` as a post-build step in `build-service/builder.ts`
- [ ] After building each image, run: `trivy image --exit-code 1 --severity HIGH,CRITICAL <image>`
- [ ] Store scan results in XTDB `image_scans` table
- [ ] Add to harness-ui `/security/containers` page
- [ ] Block deployment if critical vulnerabilities found

**External tools:** `trivy` (Aqua Security, open source). Alternative: `grype` (Anchore).

### 4.4 Log Scanning for Sensitive Data Leaks

- [ ] Create `log-scanner/` extension or add to docker-event-collector
- [ ] Regex patterns to detect in log output: email addresses, IP addresses, JWT tokens, credit card numbers, SSNs, API keys, connection strings with passwords
- [ ] Scan Docker log output in real-time (via docker logs stream)
- [ ] Alert immediately if sensitive data detected in logs
- [ ] Store findings in XTDB `log_leak_detections` table

### 4.5 OWASP Top 10 Automated Checks — REVIEW-GATE STEP

- [ ] Add to `review-gate/checks/security.ts`:
  - **Injection** — scan for string concatenation in SQL queries (flag `sql` template literals with `${...}` that don't use parameterized queries)
  - **Broken Auth** — flag endpoints without authentication middleware
  - **Sensitive Data Exposure** — flag responses that include full database records without field filtering
  - **XSS** — flag HTML responses built with string concatenation (not template escaping)
  - **Security Misconfiguration** — flag missing CORS headers, missing security headers, dev-mode flags in production configs
  - **Command Injection** — flag `execSync`/`spawn` with user input in arguments (the 5 critical issues from the audit)
- [ ] These run as part of every CI review-gate step

### 4.6 Rate Limiting and Abuse Detection

- [ ] Add rate limiting middleware to all public-facing API endpoints (via `hono-rate-limiter` or custom)
- [ ] Create `lib/rate-limiter.ts` with configurable limits per endpoint
- [ ] Log rate-limit hits to XTDB `rate_limit_events` table
- [ ] Alert when rate limit is triggered (potential abuse or misconfigured client)
- [ ] Add to harness-ui `/security/rate-limits` page

---

## Phase 5: Extended Testing

Comprehensive test coverage beyond unit tests. Goal: catch integration failures, performance regressions, and resilience issues before they reach production.

### 5.1 Performance Testing Framework

**What to build:**

- [ ] Create `test/performance/` directory
- [ ] `test/performance/load-test.ts` — uses `autocannon` (npm) to load-test each API endpoint
- [ ] Endpoints to test:
  - `event-api:3333/api/stats` — read-heavy, should handle 1000 rps
  - `event-api:3333/api/events` — paginated query, test with various page sizes
  - `ops-api:3335/api/health` — lightweight health check, should handle 5000 rps
  - `harness-ui:3336/` — SSR page load
  - `ci-runner:3337/api/queue` — queue status
  - `build-service:3339/api/health` — health check
- [ ] Record results in XTDB `performance_tests` table
- [ ] Add to Taskfile: `task test:perf` — runs load tests against running services
- [ ] Add to CI as an optional step (runs after integration tests, non-blocking initially)
- [ ] Establish baselines, then make blocking when P95 regresses by >20%

**External tools:** `autocannon` (npm, lightweight HTTP benchmarking). Alternative: `k6` (more features, Go binary), `artillery` (YAML-based, npm).

### 5.2 Integration Test Suite

**What exists today:** `test/contracts/` has infrastructure health checks and basic API contract tests. `test/integration.ts` exists but scope is limited.

- [ ] Expand `test/integration.ts` to cover service interactions:
  - Event ingestion flow: push event via event-api → verify it appears in XTDB → verify harness-ui can query it
  - CI flow: enqueue CI job → verify ci-runner picks it up → verify results in XTDB → verify build-service triggered
  - Docker event flow: simulate container event → verify docker-event-collector writes to XTDB → verify alerting fires
  - WebSocket chat: connect to chat-ws → send message → verify response
- [ ] Create `test/integration/` directory with one file per flow
- [ ] Add to Taskfile: `task test:integration` — requires running services (docker compose up)
- [ ] Add to CI as a step that runs after unit tests (requires services to be available — use Docker Compose in CI, or run against a staging environment)

### 5.3 End-to-End Test Cases

- [ ] Create `test/e2e/` directory
- [ ] `test/e2e/full-pipeline.ts` — pushes code to Soft Serve → CI runner detects → runs pipeline → build-service builds image → image appears in Zot registry
- [ ] `test/e2e/monitoring-flow.ts` — stops a container → docker-event-collector detects → alert fires → harness-ui shows alert
- [ ] `test/e2e/data-roundtrip.ts` — writes event via event-api → queries via ops-api → verifies consistency between primary and replica
- [ ] Add to Taskfile: `task test:e2e`
- [ ] Run on a schedule (nightly) rather than every CI run (too slow for every commit)

### 5.4 Chaos Testing

**Goal:** Verify the system degrades gracefully when components fail.

- [ ] Create `test/chaos/` directory
- [ ] `test/chaos/service-down.ts` — for each of the 7 app services: stop the container, verify other services continue operating, verify health-prober detects the failure, verify restart recovery
- [ ] `test/chaos/db-failover.ts` — stop xtdb-primary, verify ops-api falls back to replica for reads, verify writes are queued or error gracefully
- [ ] `test/chaos/network-partition.ts` — use `docker network disconnect` to isolate services, verify timeouts are handled
- [ ] `test/chaos/disk-full.ts` — fill a volume, verify XTDB handles write failures, verify error capture (lib/errors.ts) handles JSONL write failures
- [ ] Add to Taskfile: `task test:chaos` — WARNING: destructive, only run in isolated environments
- [ ] Run monthly or on-demand

**External tools:** None needed for basic scenarios — Docker CLI provides `stop`, `network disconnect`, `exec` for fault injection. For advanced chaos: `pumba` (Docker chaos tool) or `toxiproxy` (network fault injection).

### 5.5 Data Integrity Tests

- [ ] Create `test/data/` directory
- [ ] `test/data/primary-replica-sync.ts` — write to primary, wait, read from replica, verify match
- [ ] `test/data/json-ld-consistency.ts` — for each entity type in XTDB, verify JSON-LD `@context` is valid and `@type` matches the table
- [ ] `test/data/referential-integrity.ts` — verify foreign key relationships: CI runs reference repos, review reports reference CI runs, errors reference sessions
- [ ] `test/data/no-orphans.ts` — find records that reference non-existent parent records
- [ ] Add to Taskfile: `task test:data` — runs against live XTDB
- [ ] Run on a schedule (daily)

### 5.6 API Contract Testing (Consumer-Driven)

**What exists today:** `test/contracts/` has basic health check and response shape tests.

- [ ] Expand contract tests to cover all public API endpoints with:
  - Request schema validation (verify the API accepts what's documented)
  - Response schema validation (verify response shape matches expected type)
  - Error response format consistency (all errors should have `{ error: string }`)
  - Status code correctness (400 for bad input, 404 for missing resources, 500 for server errors)
- [ ] Create `test/contracts/schemas/` directory with JSON Schema or TypeBox schemas for each endpoint
- [ ] Add to CI as a required step (runs after infrastructure health, before integration tests)
- [ ] Use the existing `test/contracts/api-comprehensive.ts` as the base and expand

---

## Phase 6: Live Error Monitoring & Auto-Ticket Generation

Structured error collection with automatic severity classification and issue creation. Goal: every production error creates a trackable work item.

### 6.1 Structured Error Collection — EXTEND: `lib/errors.ts`

**What exists today:** `lib/errors.ts` captures errors to JSONL then flushes to XTDB. Captures component, operation, severity, stack traces. But adoption is spotty.

- [ ] **Enforce adoption** — add a quality-hooks check that flags `catch` blocks without a `captureError()` call
- [ ] **Add request context** — extend `CaptureErrorOptions` with: `endpoint`, `method`, `requestId`, `userAgent`
- [ ] **Add error fingerprinting** — generate a stable hash from (component + operation + error type + first 3 stack frames) for deduplication
- [ ] **Add occurrence counting** — in XTDB, track `first_seen`, `last_seen`, `occurrence_count` per fingerprint

### 6.2 Error Deduplication and Grouping

- [ ] Create `lib/error-groups.ts` — groups errors by fingerprint
- [ ] When a new error arrives:
  - Compute fingerprint
  - If fingerprint exists in XTDB: increment `occurrence_count`, update `last_seen`
  - If fingerprint is new: create new error group record
- [ ] Store error groups in XTDB `error_groups` table with fields: fingerprint, component, operation, error_type, first_seen, last_seen, occurrence_count, severity, status (new/acknowledged/resolved/ignored), assigned_to, ticket_id
- [ ] Add harness-ui page `/errors/groups` showing error groups sorted by occurrence count and recency

### 6.3 Automatic Severity Classification

- [ ] Extend the existing `ErrorSeverity` type with automated classification rules:
  - `data_loss` (CRITICAL) — errors in XTDB write operations, INSERT failures, data corruption detected
  - `degraded` (HIGH) — service health check failures, connection timeouts, OOM events
  - `transient` (MEDIUM) — network timeouts that succeed on retry, temporary resource exhaustion
  - `cosmetic` (LOW) — formatting errors, non-critical UI glitches
- [ ] Add pattern-based classification in `lib/error-classifier.ts`:
  - Stack frame in `recorder.ts` or `writer.ts` → `data_loss`
  - Error message contains "ECONNREFUSED" or "timeout" → `transient` (if first occurrence), `degraded` (if recurring)
  - Error message contains "OOM" or "ENOMEM" → `degraded`
  - Error in health check endpoint → `degraded`

### 6.4 Auto-Generation of Tickets/Issues

- [ ] Create `ticket-generator/` module (or extension)
- [ ] When a new error group is created with severity `data_loss` or `degraded`:
  - Generate a ticket with: title, description, reproduction steps (from error context), stack trace, occurrence count, affected component, affected endpoint
  - Store the ticket in XTDB `tickets` table with JSON-LD
  - Link the ticket to the error group
- [ ] Ticket template:
  - **Title:** `[{severity}] {component}: {operation} — {error_type}`
  - **Description:** What happened, when, how often, stack trace snippet
  - **Reproduction:** endpoint + method + request context (if available)
  - **Impact:** occurrence count, affected component, timeframe
- [ ] Add harness-ui page `/tickets` showing open tickets, sortable by severity and age
- [ ] Optional: integrate with external issue trackers (GitHub Issues, Linear) via webhooks — add a `TICKET_WEBHOOK_URL` environment variable

### 6.5 Error Trending and Regression Detection

- [ ] Compute rolling error rates per component per hour
- [ ] **Regression detection:** after a deployment (detected via docker-event-collector `create` events for app containers), compare error rate in the 30 minutes before vs. after
- [ ] If error rate increases by >3x after deployment → alert with severity `high`, auto-generate ticket
- [ ] Add harness-ui page `/errors/trends` showing error rate timeline per component, with deployment markers

### 6.6 Alerting Rules

Define when each type of alert fires:

| Condition | Action | Channel |
|-----------|--------|---------|
| New `data_loss` error | Immediate alert + auto-ticket | SSE to harness-ui + optional webhook |
| New `degraded` error (3+ occurrences in 5 min) | Alert + auto-ticket | SSE to harness-ui |
| Error rate increase >3x post-deploy | Regression alert + auto-ticket | SSE to harness-ui + optional webhook |
| `transient` error (10+ occurrences in 5 min) | Promote to `degraded` + alert | SSE to harness-ui |
| Service health check failure (3 consecutive) | Immediate alert | SSE to harness-ui (already exists in docker-event-collector) |
| Container OOM | Immediate alert | SSE to harness-ui (already exists) |
| Container restart loop (3+ in 5 min) | Immediate alert | SSE to harness-ui (already exists) |
| CI run failure | Alert | SSE to harness-ui (already exists) |
| Security scan finding (critical/high) | Alert + block deployment | CI gate |
| Secret detected in commit | Block commit | Pre-commit hook + CI gate |

---

## Implementation Dependencies

The phases must be executed roughly in order because each builds on the previous:

```
Phase 0 (DONE) ──→ Phase 1 (Foundation)
                        │
                        ├──→ Phase 2 (Continuous Review)
                        │        └── depends on: blocking CI, expanded .ci.jsonld
                        │
                        ├──→ Phase 3 (Continuous Monitoring)
                        │        └── depends on: structured logging, health probes
                        │
                        ├──→ Phase 4 (Continuous Security)
                        │        └── depends on: blocking CI, gitleaks installed
                        │
                        ├──→ Phase 5 (Extended Testing)
                        │        └── depends on: structured logging (for assertions), expanded CI
                        │
                        └──→ Phase 6 (Error Monitoring & Tickets)
                                 └── depends on: structured logging, error lib adoption, structured error groups
```

Within Phase 1, the ordering is: 1.1 (blocking hook) → 1.2 (biome hardening) → 1.3 (CI expansion) → 1.4 (structured logging) → 1.5 (input validation). Items 1.1–1.3 can be done in a single session. Items 1.4–1.5 are larger efforts.

Phases 2, 3, 4 can be worked on in parallel once Phase 1 is complete. Phase 5 can start during Phase 3 (testing depends on monitoring for assertions). Phase 6 depends most heavily on Phase 1.4 (structured logging) and can start once that's done.

---

## Success Metrics

### Phase 1 — Foundation
- Pre-commit hook blocks commits with lint errors: **yes/no**
- CI runs lint + typecheck + all tests: **yes/no** (currently: no)
- All services use structured logging: **0/6 services migrated** (currently: 0)
- All endpoints have input validation: **0/101 endpoints** (currently: 0)

### Phase 2 — Continuous Review
- Complexity trend: average cyclomatic complexity per module **does not increase** month-over-month
- Duplication: jscpd duplication percentage **decreases** quarter-over-quarter
- Review gate blocks: number of CI runs blocked by review gate per week (**target: captures >0 issues per week**)
- ADR coverage: architectural changes have associated ADRs **>80%**

### Phase 3 — Continuous Monitoring
- Service uptime: **>99.5%** for all app services (measured over 30d rolling window)
- MTTD (Mean Time to Detect): health issues detected within **<2 minutes** of occurrence
- Dashboard: all 13 services visible with real-time status: **yes/no**
- P95 API response time: **<500ms** for all endpoints

### Phase 4 — Continuous Security
- Known secrets in codebase: **0** (currently: 30+)
- npm audit critical/high vulnerabilities: **0**
- Container image critical vulnerabilities: **0**
- Secret detection in CI: **100% of commits scanned**
- OWASP check coverage: **all 7 relevant categories automated**

### Phase 5 — Extended Testing
- Test coverage: **>60%** of source files have tests (currently: ~8%)
- Integration test coverage: **all critical service interactions** tested
- Performance baselines: **established for all API endpoints**
- Contract tests: **all public API endpoints** covered
- Chaos test scenarios: **at least 4** (one per failure mode)

### Phase 6 — Error Monitoring
- Error capture adoption: **100%** of catch blocks use `captureError()` (currently: ~5%)
- Error deduplication: duplicate errors grouped **within 1 minute** of second occurrence
- Auto-ticket generation: **100%** of critical/high errors create tickets
- MTTR (Mean Time to Resolve): error tickets resolved **within 48 hours** of creation
- Regression detection: post-deploy error spikes detected **within 5 minutes**

---

## New Extensions / Services Summary

| Name | Type | Phase | Purpose |
|------|------|-------|---------|
| `review-gate/` | CI post-step | 2 | Automated code review on every CI run |
| `health-prober/` | Service or sidecar | 3 | Periodic health checks for all services |
| `lib/logger.ts` | Shared library | 1 | Structured logging (Pino-based) |
| `lib/api-metrics.ts` | Shared middleware | 3 | API response time tracking |
| `lib/rate-limiter.ts` | Shared middleware | 4 | Rate limiting for API endpoints |
| `lib/error-groups.ts` | Shared library | 6 | Error deduplication and grouping |
| `lib/error-classifier.ts` | Shared library | 6 | Automatic severity classification |
| `log-scanner/` | Extension or sidecar | 4 | Real-time log scanning for data leaks |
| `ticket-generator/` | Module | 6 | Auto-generates tickets from error groups |

## Existing Extensions to Modify

| Name | Phase | Modifications |
|------|-------|---------------|
| `ci-runner/` | 2, 4 | Add review-gate post-step, add gitleaks/trivy CI steps |
| `docker-event-collector/` | 3 | Add Docker stats polling, resource usage metrics |
| `quality-hooks/` | 1, 2, 6 | Add catch-block checker, naming convention checks, captureError enforcement |
| `lib/errors.ts` | 6 | Add fingerprinting, request context, occurrence counting |
| `lib/db.ts` | 3 | Add query timing wrapper |
| `.githooks/pre-commit` | 1, 4 | Make blocking, add gitleaks |
| `.ci.jsonld` | 1, 2, 4 | Add lint, typecheck, review-gate, gitleaks, npm audit steps |
| `biome.json` | 1 | Promote warn rules to error |
| `harness-ui/` | 2, 3, 4, 5, 6 | Add monitoring, security, errors, tickets pages |
| `build-service/` | 4 | Add trivy image scanning post-build |

---

## External Tools

| Tool | Purpose | Phase | Install method |
|------|---------|-------|----------------|
| Pino | Structured logging | 1 | `npm install pino` |
| Valibot | Input validation schemas | 1 | `npm install valibot` |
| gitleaks | Secret detection | 4 | Docker image `zricethezav/gitleaks:latest` |
| trivy | Container image scanning | 4 | Docker image `aquasec/trivy:latest` |
| jscpd | Cross-file duplication detection | 2 | `npm install -D jscpd` |
| c8 | Code coverage via V8 | 2 | `npm install -D c8` |
| autocannon | HTTP load testing | 5 | `npm install -D autocannon` |
| escomplex | Complexity analysis | 2 | `npm install -D escomplex` |

All external tools have open-source alternatives listed in the relevant sections above.

---

*This is a living document. Update checkboxes as work progresses. Add new items as they're discovered during implementation.*

---

## Phase 7: Native Ticket & Progress Tracking System

A first-class ticket/issue system that lives inside harness — not bolted on, but woven into the existing data model, JSON-LD vocabulary, XTDB storage, extension lifecycle, and UI. This replaces external issue trackers for harness's own development and provides the infrastructure for Phase 6's auto-ticket generation.

### Architectural Context — What Already Exists

Before designing, we surveyed every existing entity that tracks "units of work" in harness. The ticket system must complement these, not duplicate them:

| Existing Entity | Table | What It Tracks | Gap |
|---|---|---|---|
| **Requirements** | `requirements` | What needs to be built (proposed → accepted → implemented → verified) | No assignment, no workflow, no time tracking, no git linkage |
| **Decisions** | `decisions` | What was tried and why (success / failure / deferred) | Retrospective only — captures outcomes, not planned work |
| **Incidents** | `incidents` | Operational problems (open → investigating → resolved → closed) | Ops-only, no link to code changes or development work |
| **Workflow Runs** | `workflow_runs` + `workflow_step_runs` | Multi-step workflow execution | Ephemeral — tracks a single run, not persistent work items |
| **Orchestrator Tasks** | In-memory `OrcTask[]` | Session-scoped task coordination | Not persisted — lost on session end |
| **CI Runs** | `test_runs`, `releases`, `deployments` | Build/test/deploy outcomes | Captures results, not the work that led to them |
| **PROGRESS.md** | File | High-level roadmap with checkboxes | Human-readable but not queryable, no status transitions, no agent integration |

The ticket system fills the gap: **persistent, queryable, agent-integrated work items that link to all of the above**.

### 7.1 Ticket System Architecture

#### Data Model — XTDB `tickets` Table

Follows the established harness pattern: `_id text` PK, typed columns, `jsonld text` provenance, timestamps as `bigint` epoch ms.

| Column | Type | Description |
|---|---|---|
| `_id` | text | `tkt:<uuid>` — follows the `ids.ts` prefix convention |
| `project_id` | text | FK → `projects._id` |
| `title` | text | Short summary (≤120 chars) |
| `description` | text | Full description — markdown supported |
| `status` | text | `backlog` / `todo` / `in_progress` / `review` / `done` / `cancelled` |
| `priority` | text | `critical` / `high` / `medium` / `low` |
| `kind` | text | `bug` / `feature` / `task` / `chore` / `security` / `debt` |
| `assignee` | text | Agent name, `"human"`, or null (unassigned) |
| `labels` | text | JSON array of string labels (e.g. `["phase-1","ci","security"]`) |
| `source` | text | How the ticket was created: `manual` / `auto-error` / `auto-quality` / `auto-ci` / `import` |
| `parent_ticket_id` | text | FK → `tickets._id` for sub-tasks (nullable) |
| `estimate_hours` | bigint | Estimated effort in hours (nullable) |
| `actual_hours` | bigint | Actual hours spent (nullable) |
| `created_by` | text | Who/what created it: session ID, agent name, or `"human"` |
| `session_id` | text | Session that created the ticket |
| `blocked_by` | text | JSON array of ticket IDs this depends on (nullable) |
| `due_ts` | bigint | Due date as epoch ms (nullable) |
| `started_ts` | bigint | When status first moved to `in_progress` (nullable) |
| `completed_ts` | bigint | When status moved to `done` or `cancelled` (nullable) |
| `ts` | bigint | Record timestamp (created/updated) |
| `jsonld` | text | JSON-LD provenance document |

#### Data Model — XTDB `ticket_links` Table

Links tickets to other harness entities (decisions, artifacts, CI runs, requirements, commits, errors, incidents).

| Column | Type | Description |
|---|---|---|
| `_id` | text | `tktlink:<uuid>` |
| `ticket_id` | text | FK → `tickets._id` |
| `entity_type` | text | `decision` / `artifact` / `requirement` / `test_run` / `incident` / `commit` / `error_group` / `ci_run` / `ticket` |
| `entity_id` | text | The linked entity's `_id` |
| `relation` | text | `implements` / `fixes` / `blocks` / `relates_to` / `caused_by` / `verified_by` / `parent` / `child` |
| `ts` | bigint | Timestamp |

#### Data Model — XTDB `ticket_events` Table (Activity Log)

Every status change, assignment, comment, and link is recorded as an immutable event — gives a full audit trail and feeds velocity metrics.

| Column | Type | Description |
|---|---|---|
| `_id` | text | `tktev:<uuid>` |
| `ticket_id` | text | FK → `tickets._id` |
| `event_type` | text | `created` / `status_changed` / `assigned` / `commented` / `linked` / `priority_changed` / `label_added` / `label_removed` / `estimate_updated` |
| `old_value` | text | Previous value (for changes) |
| `new_value` | text | New value (for changes) |
| `comment` | text | Comment text (for `commented` events) |
| `actor` | text | Who performed the action (session ID, agent name, `"human"`) |
| `ts` | bigint | Timestamp |

#### JSON-LD Vocabulary

Tickets use the existing harness namespaces plus Schema.org's action vocabulary for natural semantic modeling:

```json
{
  "@context": {
    "ev": "https://pi.dev/events/",
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "https://schema.org/",
    "code": "https://pi.dev/code/",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:pi:tkt:a1b2c3d4-...",
  "@type": ["schema:Action", "code:Ticket"],
  "schema:name": "Harden Biome configuration — promote warn rules to error",
  "schema:description": "...",
  "schema:actionStatus": "schema:PotentialActionStatus",
  "ev:priority": "high",
  "ev:kind": "task",
  "ev:labels": ["phase-1", "quality"],
  "schema:agent": { "@type": "prov:SoftwareAgent", "schema:name": "pi-agent" },
  "prov:wasAssociatedWith": { "@id": "urn:pi:session:..." },
  "prov:atLocation": { "@id": "urn:pi:proj:harness" },
  "prov:generatedAtTime": { "@value": "2026-03-24T...", "@type": "xsd:dateTime" },
  "code:blockedBy": [{ "@id": "urn:pi:tkt:..." }],
  "code:implements": [{ "@id": "urn:pi:req:..." }]
}
```

The `schema:actionStatus` field maps to ticket status using Schema.org's standard vocabulary: `PotentialActionStatus` (backlog/todo), `ActiveActionStatus` (in_progress/review), `CompletedActionStatus` (done), `FailedActionStatus` (cancelled). This gives external systems and SPARQL queries a standards-based way to understand ticket state.

#### Storage Decision: XTDB Primary, Markdown Projection

**Primary store: XTDB** — tickets live as structured rows in the three tables above. This gives us queryable status, cross-entity linking via `ticket_links`, bitemporal history (XTDB tracks every version automatically), and JSON-LD provenance for every ticket.

**Secondary projection: PROGRESS.md sync** — a `progress-sync` module reads ticket state from XTDB and regenerates the checkbox sections of PROGRESS.md. This keeps the human-readable roadmap in sync without manual updating. The sync is one-directional (XTDB → markdown) to avoid merge conflicts.

**Why not markdown-primary:** Markdown files are great for human reading but terrible for structured queries ("show me all critical bugs assigned to ci-runner"), cross-entity linking ("which tickets are linked to this CI run?"), and automated status transitions. XTDB is already the source of truth for every other harness entity — tickets should follow the same pattern.

**Why not both as sources of truth:** Bidirectional sync between structured data and markdown creates conflict resolution problems and data loss risks. The existing PROGRESS.md was designed as a planning document; it should continue to be that, with ticket system providing the operational layer underneath.

#### ID Convention

Add to `lib/jsonld/ids.ts`:

```typescript
ticket: () => `tkt:${randomUUID()}`,
ticketLink: () => `tktlink:${randomUUID()}`,
ticketEvent: () => `tktev:${randomUUID()}`,
```

### 7.2 Ticket Manager Extension — `ticket-manager/`

A new pi extension that provides the CLI/tool interface for ticket CRUD. Follows the same patterns as `decision-log/` and `requirements-tracker/`.

#### Extension Structure

```
ticket-manager/
├── index.ts          # Extension entry point — registers tools + commands + hooks
├── types.ts          # TicketRecord, TicketLinkRecord, TicketEventRecord interfaces
├── rdf.ts            # buildTicketJsonLd() — JSON-LD builder
├── queries.ts        # XTDB query helpers (list, filter, search, stats)
├── transitions.ts    # Status transition validation + side effects
├── auto-generators.ts # Logic for auto-creating tickets from errors, quality, CI
└── package.json
```

#### Registered Tool: `manage_ticket`

Available to all agents via `pi.registerTool()`. Follows the `log_decision` pattern.

**Subcommands:**
- `create` — create a new ticket (title, description, priority, kind, labels, parent, blocked_by)
- `update` — update ticket fields (status, priority, assignee, labels, estimate)
- `comment` — add a comment to a ticket
- `link` — link a ticket to another entity (decision, artifact, requirement, commit, CI run)
- `close` — set status to `done` or `cancelled` with a closing comment
- `list` — query tickets with filters (status, priority, kind, assignee, label)
- `stats` — velocity, burndown, status distribution for a project

**Agent prompt integration** (via `before_agent_start` hook, like `decision-log`):
- Inject open tickets relevant to the current session's project
- Remind agents to update ticket status when they start/finish work
- Suggest ticket creation when the agent encounters a new bug or TODO

#### Registered Command: `/ticket`

Available via the pi CLI, following the `/req` and `/orchestrate` patterns:

```
/ticket create <title> [priority] [kind] — Create a ticket
/ticket list [status] [priority] [kind] — List tickets with filters
/ticket show <id> — Show ticket details with activity log
/ticket status <id> <new_status> — Update ticket status
/ticket assign <id> <assignee> — Assign a ticket
/ticket comment <id> <text> — Add a comment
/ticket link <id> <entity_type> <entity_id> — Link to another entity
/ticket close <id> [comment] — Close a ticket as done
/ticket cancel <id> [reason] — Cancel a ticket
/ticket import <file> — Import tickets from a markdown checklist
/ticket board — Show kanban-style board in terminal
/ticket burn — Show burndown stats
```

#### Status Transitions

Valid transitions are enforced by `transitions.ts`:

```
backlog → todo → in_progress → review → done
                                      → cancelled
backlog → cancelled (can cancel from any state)
done → in_progress (reopen)
```

Each transition records a `ticket_events` row and updates `started_ts` / `completed_ts` as appropriate.

#### Implementation Checklist

- [ ] Create `ticket-manager/` directory
- [ ] `ticket-manager/types.ts` — TypeScript interfaces for all three tables
- [ ] `ticket-manager/rdf.ts` — JSON-LD builder using existing `lib/jsonld/context.ts` helpers
- [ ] `ticket-manager/queries.ts` — XTDB query functions (list, filter, search, aggregate)
- [ ] `ticket-manager/transitions.ts` — status transition validation with side effects
- [ ] `ticket-manager/auto-generators.ts` — auto-ticket logic (see 7.4)
- [ ] `ticket-manager/index.ts` — extension entry with `manage_ticket` tool + `/ticket` command + hooks
- [ ] Add `ticket`, `ticketLink`, `ticketEvent` to `lib/jsonld/ids.ts`
- [ ] Add `tickets`, `ticket_links`, `ticket_events` tables to `docs/XTDB_SCHEMA.md`
- [ ] Add seed logic to `scripts/seed-schema.ts`

### 7.3 Agent Integration — How Tickets Weave Into the Agent Loop

The ticket system isn't just a CRUD store — it participates in the agent's decision-making loop, the same way `decision-log` injects past decisions and `requirements-tracker` injects requirements.

#### Context Injection (`before_agent_start`)

When a session starts for a project, the ticket manager injects:

1. **Open tickets assigned to this session/agent** — so the agent knows what it should work on
2. **Blocked tickets** — so the agent knows what NOT to work on (and can potentially unblock them)
3. **Recently closed tickets** — so the agent has context on what was just completed

This follows the exact same pattern as `decision-log/index.ts` lines 59-98: hook into `before_agent_start`, query XTDB, format as markdown, return as a `customType: "ticket-context"` message.

#### Auto-Linking

When the agent calls existing tools, the ticket manager auto-links:

| Agent Action | Auto-Link Created |
|---|---|
| `log_decision` called | Link ticket → decision (if decision's `task` matches an open ticket's title) |
| File written/edited (via artifact-tracker) | Link ticket → artifact (if file path matches ticket's description or labels) |
| CI run completes | Link ticket → test_run (if commit message references `tkt:` prefix) |
| Error captured | Link ticket → error_group (if error component matches ticket labels) |

This uses the same fuzzy-matching approach that `decision-log` already uses to auto-link decisions to requirements (lines 187-208 in `decision-log/index.ts`).

#### Orchestrator Integration

The existing `orchestrator/` extension stores tasks in memory (`OrcTask[]`) and loses them on session end. With the ticket system:

- `/orchestrate plan` creates tickets in XTDB instead of (or in addition to) in-memory tasks
- `/orchestrate done <id>` updates the ticket status to `done`
- Orchestrator state survives across sessions
- Multiple agents can see and work on orchestrated tasks

#### Alignment Monitor Integration

The `alignment-monitor` extension checks whether the agent is working on what it should be. With tickets:

- Alignment monitor can compare the agent's current actions against assigned tickets
- If the agent is working on something with no matching ticket, it can suggest creating one
- If the agent is idle but has assigned tickets, it can nudge

### 7.4 Auto-Ticket Generation — Sources

The ticket system generates tickets automatically from four sources. This subsumes and extends the Phase 6 `ticket-generator/` concept.

#### Source 1: Error Monitoring → Bug Tickets

When `lib/error-groups.ts` (Phase 6) detects a new error group with severity `data_loss` or `degraded`:

- **Kind:** `bug`
- **Priority:** Maps from error severity (`data_loss` → `critical`, `degraded` → `high`)
- **Title:** `[{severity}] {component}: {operation} — {error_type}`
- **Labels:** `["auto-error", component_name]`
- **Source:** `auto-error`
- **Links:** `ticket_links` row with `entity_type: "error_group"`, `relation: "caused_by"`

#### Source 2: Quality Scans → Debt Tickets

When `review-gate/` (Phase 2) finds new quality issues:

- **Kind:** `debt`
- **Priority:** `high` for complexity regressions, `medium` for new duplications, `low` for style issues
- **Title:** `[quality] {check_name}: {summary}`
- **Labels:** `["auto-quality", check_name]`
- **Source:** `auto-quality`
- **Links:** `ticket_links` row with `entity_type: "ci_run"`, `relation: "caused_by"`

#### Source 3: CI Failures → Bug Tickets

When a CI run fails:

- **Kind:** `bug`
- **Priority:** `high` (CI is broken)
- **Title:** `[ci-failure] {pipeline_step}: {error_summary}`
- **Labels:** `["auto-ci", step_name]`
- **Source:** `auto-ci`
- **Links:** `ticket_links` row with `entity_type: "test_run"`, `relation: "caused_by"`

#### Source 4: Security Findings → Security Tickets

When `gitleaks`, `trivy`, or `npm audit` (Phase 4) find vulnerabilities:

- **Kind:** `security`
- **Priority:** Maps from vulnerability severity
- **Title:** `[security] {tool}: {finding_summary}`
- **Labels:** `["auto-security", tool_name]`
- **Source:** `auto-security`

#### Deduplication

Before creating an auto-ticket, check if a matching ticket already exists (same source + same title prefix + status not `done`/`cancelled`). If so, add a comment with the new occurrence rather than creating a duplicate. Uses the same fingerprinting approach as `lib/error-groups.ts`.

#### Implementation Checklist

- [ ] Implement error → ticket generator in `ticket-manager/auto-generators.ts`
- [ ] Implement quality scan → ticket generator
- [ ] Implement CI failure → ticket generator
- [ ] Implement security finding → ticket generator
- [ ] Add deduplication logic (fingerprint match before creating)
- [ ] Wire auto-generators into respective extensions via hooks or event listeners

### 7.5 PROGRESS.md Sync — `progress-sync/`

A module that projects ticket state back into PROGRESS.md format, keeping the human-readable roadmap in sync.

#### How It Works

1. Query all tickets for the harness project, grouped by label (labels map to phases: `phase-1`, `phase-2`, etc.)
2. For each phase section in PROGRESS.md, match tickets to existing checklist items by title similarity
3. Update checkbox state: `done` → `[x]`, anything else → `[ ]`
4. Append new tickets (ones not matching any existing checklist item) to the appropriate phase section
5. Write the updated PROGRESS.md

#### When It Runs

- **On demand:** `/ticket sync` command
- **On ticket status change:** Hook in `ticket-manager` that triggers sync after any status transition to `done` or `cancelled`
- **On session end:** `session_shutdown` hook — sync once before the session closes

#### Implementation Checklist

- [ ] Create `progress-sync/` module (or integrate into `ticket-manager/`)
- [ ] Implement markdown parser that understands PROGRESS.md's phase/section/checklist structure
- [ ] Implement ticket-to-checklist matching (fuzzy title match)
- [ ] Implement checkbox updater
- [ ] Implement new-ticket appender
- [ ] Wire into ticket status change hooks and `/ticket sync` command

### 7.6 Harness UI — Ticket Views

Extend `harness-ui/` with ticket-related pages. Follows the existing pattern of server-rendered HTML pages via Hono.

#### New Pages

| Page | Route | Description |
|---|---|---|
| **Ticket Board** | `/projects/:projectId/tickets` | Kanban board — columns for each status, cards show title + priority + assignee + labels |
| **Ticket Detail** | `/projects/:projectId/tickets/:ticketId` | Full ticket view — description, activity log, linked entities, sub-tasks |
| **Ticket List** | `/projects/:projectId/tickets/list` | Table view — sortable/filterable by status, priority, kind, assignee, label |
| **Burndown** | `/projects/:projectId/tickets/burndown` | Burndown chart — tickets completed vs. remaining over time |
| **Velocity** | `/projects/:projectId/tickets/velocity` | Velocity chart — tickets completed per week/sprint, cycle time distribution |

#### Integration with Existing Pages

- **Home page** (`/`) — add ticket summary widget (open count by priority, recently completed)
- **Session Detail** (`/sessions/:id`) — show tickets touched during this session (created, updated, closed)
- **Decisions page** (`/decisions`) — show linked tickets for each decision
- **Errors page** (`/errors`) — show auto-generated ticket links for error groups
- **CI Runs page** (`/ci-runs`) — show linked tickets for CI failures

#### Implementation Checklist

- [ ] `harness-ui/pages/tickets.ts` — Kanban board page
- [ ] `harness-ui/pages/ticket-detail.ts` — Ticket detail page
- [ ] `harness-ui/pages/ticket-list.ts` — Table list page
- [ ] `harness-ui/pages/burndown.ts` — Burndown chart page
- [ ] `harness-ui/static/tickets.js` — Client-side JS for board drag-and-drop, inline editing
- [ ] Update `harness-ui/server.ts` — add ticket routes
- [ ] Update `harness-ui/components/nav.ts` — add Tickets to navigation
- [ ] Update home page with ticket summary widget
- [ ] Update session-detail page with ticket activity
- [ ] Add ticket API endpoints to `xtdb-event-logger-ui/server.ts` (or `xtdb-ops-api`)

### 7.7 Workflow Integration — How Tickets Flow Through Development

#### The Development Lifecycle with Tickets

```
1. Discovery
   ├── Human creates ticket via /ticket create
   ├── Agent creates ticket via manage_ticket tool
   ├── Auto-generated from error/quality/CI/security finding
   └── Imported from PROGRESS.md via /ticket import
        ↓
2. Triage  (status: backlog → todo)
   ├── Priority assigned
   ├── Labels added (phase, component, skill area)
   ├── Blocked-by dependencies set
   └── Estimate set (optional)
        ↓
3. Execution  (status: todo → in_progress)
   ├── Agent picks up ticket (injected via before_agent_start)
   ├── Agent works — artifacts, decisions auto-linked
   ├── Agent comments progress via manage_ticket
   └── started_ts recorded
        ↓
4. Review  (status: in_progress → review)
   ├── CI runs, review-gate checks
   ├── Test results linked
   └── Quality metrics compared to baseline
        ↓
5. Completion  (status: review → done)
   ├── completed_ts recorded
   ├── Cycle time computed (completed_ts - started_ts)
   ├── PROGRESS.md checkbox updated via progress-sync
   └── Dependent tickets unblocked
```

#### Quality Gates Reference Tickets

The `review-gate/` (Phase 2) can use tickets to enforce process:

- A CI run can check: "does the commit message reference a ticket?" (convention: `tkt:abc12345` in commit message)
- Review gate can verify: "is there a ticket for this work?"
- Deployment gate can check: "are all tickets for this release in `done` status?"

#### Orchestrator Task → Ticket Promotion

The orchestrator's in-memory tasks can be promoted to persistent tickets:

```
/orchestrate plan task1 | task2 | task3   → creates in-memory OrcTasks
/orchestrate persist                       → promotes all pending OrcTasks to tickets in XTDB
```

This lets agents use the lightweight orchestrator for session-scoped work and promote to tickets when persistence matters.

### 7.8 Metrics and Reporting

#### Velocity Metrics (Computed from `ticket_events`)

- **Throughput:** Tickets completed per week (count of `status_changed` events where `new_value = "done"`)
- **Cycle Time:** Time from `in_progress` to `done` (per ticket, average, P50/P95)
- **Lead Time:** Time from `created` to `done` (per ticket, average, P50/P95)
- **WIP (Work in Progress):** Count of tickets in `in_progress` at any point in time
- **Backlog Growth:** Rate of new tickets created vs. completed

#### Burndown (Computed from `tickets` + `ticket_events`)

For a given time range and label filter (e.g., `phase-1`):
- Total tickets at start of period
- Tickets completed per day
- Projected completion date (linear extrapolation)

#### These feed into existing harness-ui patterns

All metrics are queryable via XTDB SQL (same as every other harness metric), renderable via the existing harness-ui SSR pattern, and streamable via the existing SSE infrastructure.

### 7.9 Bootstrapping — Import PROGRESS.md Into Tickets

The very first use of the ticket system should be importing the existing PROGRESS.md checkboxes into tickets. This is the `/ticket import` command:

1. Parse PROGRESS.md — each `- [ ]` or `- [x]` becomes a ticket
2. Phase headers (`## Phase N`) become labels (`phase-1`, `phase-2`, etc.)
3. Section headers (`### N.M`) become parent tickets, individual checkboxes become child tickets
4. `[x]` items get status `done`, `[ ]` items get status `backlog`
5. Priority inferred from section context (Foundation = high, Extended Testing = medium)

This gives us approximately 120+ tickets from the existing PROGRESS.md, fully linked with parent-child relationships and phase labels.

#### Implementation Checklist

- [ ] Implement PROGRESS.md parser in `ticket-manager/index.ts` (reuse pattern from `requirements-tracker` import)
- [ ] Map phase headers to labels
- [ ] Map section headers to parent tickets
- [ ] Map checkboxes to child tickets with appropriate status
- [ ] Run import: `/ticket import PROGRESS.md`
- [ ] Verify ticket counts match checkbox counts

### 7.10 Implementation Roadmap — Building the Ticket System

The ticket system itself is built in phases, tracked by... tickets (once bootstrapped):

**Sprint 1 — Core (3-4 sessions):**
- [ ] Create `ticket-manager/` with types, RDF builder, ID conventions
- [ ] Implement `/ticket create`, `/ticket list`, `/ticket status`, `/ticket show`
- [ ] Implement `manage_ticket` tool for agent use
- [ ] Add tables to seed schema
- [ ] Add basic `before_agent_start` context injection

**Sprint 2 — Linking & Auto-Generation (2-3 sessions):**
- [ ] Implement `ticket_links` and `/ticket link`
- [ ] Implement auto-linking hooks (decisions, artifacts, CI runs)
- [ ] Implement `auto-generators.ts` for error → ticket (ties into Phase 6)
- [ ] Implement deduplication

**Sprint 3 — UI (2-3 sessions):**
- [ ] Implement kanban board page in harness-ui
- [ ] Implement ticket detail page
- [ ] Implement ticket list (table view)
- [ ] Add ticket routes to server.ts and nav

**Sprint 4 — Sync & Metrics (1-2 sessions):**
- [ ] Implement `progress-sync/` module
- [ ] Implement `/ticket import` for PROGRESS.md bootstrap
- [ ] Implement velocity and burndown metrics
- [ ] Implement burndown chart page in harness-ui

**Sprint 5 — Advanced Integration (1-2 sessions):**
- [ ] Implement orchestrator → ticket promotion
- [ ] Implement quality-gate ticket checks
- [ ] Implement alignment-monitor ticket awareness
- [ ] Implement auto-generators for quality scans, CI failures, security findings

---

## Updated Table Counts

With the ticket system, the XTDB schema grows from 30 to 33 tables (baseline is 30: the original 27 + `ci_runs`, `builds`, `docker_events` already in `seed-schema.ts`):

| Category | Tables | Count |
|---|---|---|
| Core Events | events, projections | 2 |
| Projects | projects, session_projects, project_dependencies, project_tags, decommission_records | 5 |
| Decisions & Knowledge | decisions, session_postmortems, delegations, file_metrics | 4 |
| Artifacts | artifacts, artifact_versions, artifact_reads, artifact_cleanup | 4 |
| Workflows & Requirements | workflow_runs, workflow_step_runs, requirements, requirement_links | 4 |
| CI/CD | releases, deployments, test_runs, environments | 4 |
| Operations | backup_records, incidents, lifecycle_events, errors | 4 |
| **Tickets** | **tickets, ticket_links, ticket_events** | **3** |
| **Total** | | **30** |

---

## Updated New Extensions / Services Summary

| Name | Type | Phase | Purpose |
|---|---|---|---|
| `review-gate/` | CI post-step | 2 | Automated code review on every CI run |
| `health-prober/` | Service or sidecar | 3 | Periodic health checks for all services |
| `lib/logger.ts` | Shared library | 1 | Structured logging (Pino-based) |
| `lib/api-metrics.ts` | Shared middleware | 3 | API response time tracking |
| `lib/rate-limiter.ts` | Shared middleware | 4 | Rate limiting for API endpoints |
| `lib/error-groups.ts` | Shared library | 6 | Error deduplication and grouping |
| `lib/error-classifier.ts` | Shared library | 6 | Automatic severity classification |
| `log-scanner/` | Extension or sidecar | 4 | Real-time log scanning for data leaks |
| **`ticket-manager/`** | **Extension** | **7** | **Native ticket CRUD, agent integration, auto-generation** |
| **`progress-sync/`** | **Module** | **7** | **PROGRESS.md ↔ ticket state synchronization** |

---

## Updated Implementation Dependencies

```
Phase 0 (DONE) ──→ Phase 1 (Foundation)
                        │
                        ├──→ Phase 2 (Continuous Review)
                        │
                        ├──→ Phase 3 (Continuous Monitoring)
                        │
                        ├──→ Phase 4 (Continuous Security)
                        │
                        ├──→ Phase 5 (Extended Testing)
                        │
                        ├──→ Phase 6 (Error Monitoring & Auto-Tickets)
                        │        └── depends on: structured logging, error lib
                        │
                        └──→ Phase 7 (Ticket System) ←── can start immediately
                                 │
                                 ├── Sprint 1-2: no dependencies (core CRUD + linking)
                                 ├── Sprint 3: no dependencies (UI only needs XTDB)
                                 ├── Sprint 4: depends on Sprint 1 (needs tickets to sync)
                                 └── Sprint 5: depends on Phases 2, 4, 6 (quality/security/error auto-gen)
```

Phase 7 Sprints 1-3 can start **in parallel** with Phase 1 — the ticket system only needs XTDB (already running) and the existing extension infrastructure. The auto-generation features (Sprint 5) depend on the respective Phase 2/4/6 extensions being built, but the core ticket system stands alone.

---

## Phase 8: 360° Knowledge Graph

Everything in harness is already linked data — every entity has a JSON-LD provenance document, a URN-based `@id`, typed `@type` annotations, and references to other entities via `prov:used`, `prov:wasAssociatedWith`, `prov:atLocation`, and custom `ev:` predicates. The entities reference each other through foreign key columns (`project_id`, `session_id`, `release_id`, etc.) and through JSON-LD `@id` links. Phase 8 makes this implicit graph **explicit, queryable, and navigable** — giving operators and agents a full 360° view of how any entity relates to every other entity in the system.

### Architectural Context — Why JSON-LD Makes This "Free"

Unlike systems that bolt on a graph database after the fact, harness already has the raw material for a knowledge graph:

1. **Every entity has a URI.** The `piId()` function in `lib/jsonld/context.ts` produces `urn:pi:{prefix}:{uuid}` identifiers. Every entity in XTDB has a globally unique, dereferenceable ID.

2. **Every entity has typed JSON-LD.** The `jsonld` column on each table stores a complete provenance document with `@context`, `@id`, `@type`, and relationship predicates.

3. **Relationship predicates already exist.** Decisions reference projects via `prov:used`, artifacts reference tool calls via `prov:wasGeneratedBy`, deployments reference releases via `prov:used` and environments via `prov:atLocation`, sessions link to projects via `prov:wasAssociatedWith`.

4. **XTDB provides bitemporal queries.** Every entity has full versioning — we can ask "what did the graph look like at time T?" for free.

5. **A SPARQL/graph UI already exists.** `harness-ui/pages/graph.ts` has a D3.js force-directed graph viewer and a SPARQL query proxy via QLever.

What's **missing** is the connective tissue: a unified query layer that resolves links across tables, a way to traverse the graph from any starting entity, and views that show the full picture rather than siloed entity lists.

### 8.1 Entity Catalog — The Complete Graph Vocabulary

Every entity type in harness, with its XTDB table, JSON-LD type(s), ID prefix, and existing outbound links:

| # | XTDB Table | JSON-LD `@type` | ID Prefix | Existing Outbound Links |
|---|---|---|---|---|
| 1 | `events` | `ev:{PascalCaseEventName}` (e.g. `ev:SessionStart`, `ev:ToolExecutionEnd`, `ev:TurnEnd`) | `urn:uuid:` | `ev:sessionId` → session, `ev:toolCallId` → tool call |
| 2 | `projections` | *(none — derived views)* | task/turn/mutation IDs | `task_id`, `session_id`, `system_prompt_event_id`, `input_event_id`, `turn_start_event_id`, `turn_end_event_id`, `agent_end_event_id`, `final_message_event_id` → events |
| 3 | `projects` | `doap:Project` | `proj:` | `doap:repository` → git repository |
| 4 | `session_projects` | `prov:Activity` | `sp:` | `prov:used` → project, `ev:sessionId` → session |
| 5 | `project_dependencies` | *(no JSON-LD yet)* | `pdep:` | `project_id` → project |
| 6 | `project_tags` | *(no JSON-LD yet)* | `ptag:` | `project_id` → project |
| 7 | `decommission_records` | *(has jsonld column)* | `decom:` | `project_id` → project |
| 8 | `decisions` | `prov:Activity` | `dec:` | `prov:used` → project, `ev:sessionId` → session, `ev:files` → file paths |
| 9 | `session_postmortems` | *(has jsonld column)* | `pm:` | `project_id` → project, `session_id` → session |
| 10 | `delegations` | *(has jsonld column)* | `del:` | `parent_session_id` → session, `child_session_id` → session, `project_id` → project |
| 11 | `file_metrics` | *(no jsonld column)* | *(composite)* | `project_id` → project, `session_id` → session, `file_path` → file |
| 12 | `artifacts` | `prov:Entity` | `art:` | `prov:wasGeneratedBy` → tool call, `ev:projectId` → project, `session_id` → session |
| 13 | `artifact_versions` | *(has jsonld column)* | `artver:` | `session_id` → session, `tool_call_id` → tool call, `path` → file |
| 14 | `artifact_reads` | *(no jsonld column)* | `aread:` | `session_id` → session, `tool_call_id` → tool call, `path` → file |
| 15 | `artifact_cleanup` | *(no jsonld column)* | *(composite)* | `session_id` → session, `path` → file |
| 16 | `workflow_runs` | `["schema:HowTo", "prov:Activity"]` | `wfrun:` | `prov:used` → project, `session_id` → session |
| 17 | `workflow_step_runs` | *(has jsonld column)* | `wfstep:` | `workflow_run_id` → workflow run |
| 18 | `requirements` | `["schema:CreativeWork", "prov:Entity"]` | `req:` | `ev:projectId` → project, `linked_decision_id` → decision, `linked_artifact_id` → artifact |
| 19 | `requirement_links` | *(no jsonld column)* | `reqlink:` | `requirement_id` → requirement, `entity_id` → decision/artifact/test_run |
| 20 | `releases` | `["doap:Version", "prov:Entity"]` | `rel:` | `ev:projectId` → project, `prov:wasGeneratedBy` → session, `previous_release_id` → release |
| 21 | `deployments` | `["schema:DeployAction", "prov:Activity"]` | `depl:` | `prov:used` → release, `prov:atLocation` → environment, `project_id` → project, `session_id` → session |
| 22 | `test_runs` | `["schema:CheckAction", "prov:Activity"]` | `trun:` | `project_id` → project, `session_id` → session, `release_id` → release, `deployment_id` → deployment, `git_commit` → commit |
| 23 | `environments` | `["schema:Place", "prov:Location"]` | `env:` | `project_id` → project |
| 24 | `backup_records` | *(has jsonld column)* | `bak:` | *(standalone — no entity links)* |
| 25 | `incidents` | *(jsonld = `{}`)* | `inc:` | `project_id` → project |
| 26 | `lifecycle_events` | *(no jsonld column)* | `lev:` | `entity_id` → any entity, `project_id` → project |
| 27 | `errors` | `schema:Action` + `schema:FailedActionStatus` | `err:` | `prov:wasAssociatedWith` → session, `prov:atLocation` → project |
| 28 | `tickets` *(Phase 7)* | `["schema:Action", "code:Ticket"]` | `tkt:` | `project_id` → project, `session_id` → session, `parent_ticket_id` → ticket, `code:blockedBy` → tickets, `code:implements` → requirements |
| 29 | `ticket_links` *(Phase 7)* | *(link table)* | `tktlink:` | `ticket_id` → ticket, `entity_id` → any entity |
| 30 | `ticket_events` *(Phase 7)* | *(event log)* | `tktev:` | `ticket_id` → ticket |

### 8.2 Relationship Map — The Full Graph

The entity graph has natural clusters connected by well-defined relationship paths:

```
                            ┌─────────────┐
                            │   PROJECT    │
                            │  doap:Project│
                            │   proj:*     │
                            └──────┬───────┘
              ┌───────────┬────────┼─────────┬──────────┬──────────┐
              ▼           ▼        ▼         ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────────┐
        │ SESSION  │ │REQUIRE-│ │TICKET│ │INCIDENT│ │RELEASE│ │ENVIRONMENT│
        │(via s_p) │ │MENT    │ │(Ph7) │ │        │ │       │ │           │
        │  sp:*    │ │ req:*  │ │tkt:* │ │ inc:*  │ │ rel:* │ │  env:*    │
        └────┬─────┘ └───┬────┘ └──┬───┘ └───┬────┘ └───┬───┘ └─────┬────┘
             │           │         │          │          │           │
     ┌───────┼────┐    reqlink:*  tktlink:*   │     ┌────┴────┐     │
     │       │    │      │         │          │     │         │     │
     ▼       ▼    ▼      ▼         ▼          │     ▼         ▼     ▼
  ┌──────┐┌──────┐┌────────┐┌──────────┐      │ ┌───────┐ ┌─────────┐
  │EVENT ││DECI- ││ARTIFACT││ TEST_RUN │      │ │DEPLOY-│ │DEPLOY-  │
  │ev:*  ││SION  ││prov:   │└──────────┘      │ │MENT   │ │MENT     │
  │      ││dec:* ││Entity  │                   │ │depl:* │ │depl:*   │
  └──┬───┘└──────┘│art:*   │                   │ └───────┘ └─────────┘
     │            └───┬────┘                   │
     ▼                ▼                        │
  ┌──────────┐  ┌───────────┐                  │
  │PROJECTION│  │ ARTIFACT  │                  │
  │(derived) │  │ VERSION   │                  │
  │          │  │ artver:*  │                  │
  └──────────┘  └───────────┘                  │
                                               │
     ┌───────────────┬─────────────────────────┘
     ▼               ▼
  ┌──────────┐  ┌──────────┐
  │WORKFLOW  │  │  ERROR   │
  │RUN       │  │  err:*   │
  │wfrun:*   │  └──────────┘
  └────┬─────┘
       ▼
  ┌──────────┐
  │WORKFLOW  │
  │STEP RUN  │
  │wfstep:*  │
  └──────────┘
```

#### Primary Relationship Chains

**Development chain:** Project → has Requirements → generate Tickets → worked in Sessions → produce Decisions + Artifacts → verified by Test Runs → packaged as Releases → deployed to Environments via Deployments

**Operational chain:** Project → has Environments → receive Deployments → monitored by Events → errors captured as Errors → triaged as Incidents → tracked as Tickets

**Agent workflow chain:** Session → starts Workflow Runs → executes Workflow Steps → spawns Delegations (child sessions) → produces Artifacts + Decisions → logs Events → summarized in Postmortems

**Quality chain:** Artifacts → checked by Test Runs → findings generate Tickets (auto-quality) → linked to Requirements → verified by future Test Runs

**Incident response chain:** Errors → grouped into Error Groups → generate Tickets (auto-error) → linked to Incidents → trace back to Events → identify root cause in Decisions/Artifacts

### 8.3 Missing Links Analysis — What Should Be Connected But Isn't

#### Category 1: Missing JSON-LD Provenance Documents

These entities have a `jsonld` column that is either empty, `{}`, or missing entirely. They are disconnected from the linked data graph:

| Entity | Current State | What To Add |
|---|---|---|
| `incidents` | `jsonld = "{}"` | `@type: ["schema:Event", "prov:Activity"]`, links to project, session, related errors, related tickets |
| `project_dependencies` | Has `jsonld` column, likely minimal | `@type: "code:Dependency"`, link to project |
| `project_tags` | No `jsonld` column | Add column, `@type: "schema:DefinedTerm"`, link to project |
| `decommission_records` | Has `jsonld` column | Verify it includes `prov:wasAssociatedWith` → project |
| `session_postmortems` | Has `jsonld` column | Verify it includes links to session, project, and referenced decisions |
| `delegations` | Has `jsonld` column | Verify it includes `prov:wasAssociatedWith` → parent session + child session |
| `file_metrics` | No `jsonld` column | Add column, `@type: "code:FileMetric"`, link to project, session, file |
| `artifact_reads` | No `jsonld` column | Add column, `@type: "prov:Usage"`, link to session, tool call |
| `artifact_cleanup` | No `jsonld` column | Low priority — operational entity |
| `lifecycle_events` | No `jsonld` column | Add column, `@type: "prov:Activity"`, link to affected entity and project |
| `requirement_links` | No `jsonld` column | Low priority — link table, traversed via joins |
| `projections` | No `jsonld` column | Low priority — derived data |

#### Category 2: Missing Cross-Entity References

These are relationships that **should** exist based on the data model but are not currently recorded:

| From | To | Missing Link | How To Add |
|---|---|---|---|
| `decisions` | `artifacts` | Decision doesn't link to the artifacts it produced | When `log_decision` is called, query recent artifacts in the same session and auto-link via a new `ev:producedArtifacts` predicate |
| `decisions` | `tickets` | Decision doesn't link to the ticket it was working on | Match open ticket titles against `decision.task` (same fuzzy matching as req auto-link) |
| `artifacts` | `decisions` | Artifact doesn't link back to the decision that motivated it | Bi-directional: when decision → artifact link is created, also add `prov:wasMotivatedBy` to artifact's JSON-LD |
| `test_runs` | `artifacts` | Test run doesn't link to the code artifacts it tested | Add `ev:testedArtifacts` predicate, populate from git diff of the tested commit |
| `incidents` | `errors` | Incident doesn't link to the errors that triggered it | When incident is created, query recent errors for same project/component, auto-link |
| `incidents` | `deployments` | Incident doesn't link to the deployment that may have caused it | When incident is created, query recent deployments for same project, auto-link |
| `errors` | `artifacts` | Error doesn't link to the source file where it occurred | Parse stack trace to extract file path, match against `artifacts.path` |
| `workflow_runs` | `tickets` | Workflow run doesn't link to the ticket it's executing | Add `ev:forTicket` predicate when workflow is started for a specific ticket |
| `workflow_step_runs` | `decisions` | Workflow step doesn't link to decisions made during it | Match decisions by timestamp range (step start → step end) |
| `releases` | `decisions` | Release doesn't link to all decisions since last release | Auto-generate via `generateChangelog()` already queries decisions — add JSON-LD links |
| `releases` | `tickets` | Release doesn't list tickets completed in this release | Query tickets with `completed_ts` between last release and this release |
| `deployments` | `test_runs` | Deployment doesn't link to the test run that validated it | Add `ev:validatedBy` predicate, link to most recent passing test run for same release |
| `sessions` (events) | `tickets` | No direct link from session-level events to tickets touched | Emit a `ev:ticketsTouched` array in the `session_shutdown` or postmortem JSON-LD |

#### Category 3: Missing Structural Capabilities

| Capability | What's Missing | How JSON-LD Helps |
|---|---|---|
| **Bi-directional traversal** | Given entity A → B, can't efficiently find B → A | Build a `graph_edges` materialized view or XTDB query that unions all FK columns + JSON-LD `@id` references into a single edge table |
| **Temporal traversal** | "What happened to this entity between time T1 and T2?" | XTDB bitemporal already stores this — need a query API that exposes `VALID_TIME` and `SYSTEM_TIME` ranges |
| **Causal chains** | "What caused this incident?" — trace backwards through events, errors, deployments, commits | Implement depth-limited BFS/DFS over the edge table, following `prov:wasGeneratedBy`, `prov:used`, `caused_by` predicates |
| **Cross-entity full-text search** | "Find everything related to 'Biome configuration'" | XTDB doesn't have native full-text search — implement via application-level search across title/description/task/what fields across all entity tables |
| **Entity type resolution** | Given an arbitrary ID like `dec:abc123`, determine its type and table | Build a registry from `lib/jsonld/ids.ts` prefix → table mapping, or query all tables (slow) |

### 8.4 Knowledge Graph Extension — `knowledge-graph/`

A new harness extension that provides the unified graph query layer on top of existing XTDB data.

#### Extension Structure

```
knowledge-graph/
├── index.ts              # Extension entry point — registers tools + commands
├── types.ts              # GraphNode, GraphEdge, TraversalResult interfaces
├── edge-resolver.ts      # Resolves all edges for a given entity (outbound + inbound)
├── entity-resolver.ts    # Given any ID, find its type, table, and full record
├── traversal.ts          # BFS/DFS path finding between entities
├── timeline.ts           # Cross-entity chronological event stream
├── impact-analysis.ts    # Forward traversal: "what depends on X?"
├── provenance-chain.ts   # Backward traversal: "what produced X?"
├── search.ts             # Cross-entity full-text search
├── materialized-edges.ts # Build/refresh the unified edge table
└── package.json
```

#### 8.4.1 Entity Resolution — `entity-resolver.ts`

Given any ID (e.g. `dec:abc123`, `art:xyz789`, `tkt:...`), determine its entity type and retrieve its full record. Uses the prefix → table mapping derived from `lib/jsonld/ids.ts`:

```typescript
const PREFIX_TABLE_MAP: Record<string, { table: string; type: string }> = {
  "proj:":    { table: "projects",             type: "doap:Project" },
  "sp:":      { table: "session_projects",     type: "prov:Activity" },
  "dec:":     { table: "decisions",            type: "prov:Activity" },
  "art:":     { table: "artifacts",            type: "prov:Entity" },
  "artver:":  { table: "artifact_versions",    type: "prov:Entity" },
  "aread:":   { table: "artifact_reads",       type: "prov:Usage" },
  "del:":     { table: "delegations",          type: "prov:Activity" },
  "pm:":      { table: "session_postmortems",  type: "prov:Activity" },
  "req:":     { table: "requirements",         type: "schema:CreativeWork" },
  "reqlink:": { table: "requirement_links",    type: "prov:Association" },
  "env:":     { table: "environments",         type: "schema:Place" },
  "rel:":     { table: "releases",             type: "doap:Version" },
  "depl:":    { table: "deployments",          type: "schema:DeployAction" },
  "trun:":    { table: "test_runs",            type: "schema:CheckAction" },
  "bak:":     { table: "backup_records",       type: "prov:Entity" },
  "inc:":     { table: "incidents",            type: "schema:Event" },
  "wfrun:":   { table: "workflow_runs",        type: "schema:HowTo" },
  "wfstep:":  { table: "workflow_step_runs",   type: "schema:HowToStep" },
  "decom:":   { table: "decommission_records", type: "prov:Activity" },
  "pdep:":    { table: "project_dependencies", type: "code:Dependency" },
  "ptag:":    { table: "project_tags",         type: "schema:DefinedTerm" },
  "lev:":     { table: "lifecycle_events",     type: "prov:Activity" },
  "err:":     { table: "errors",               type: "schema:Action" },
  "tkt:":     { table: "tickets",              type: "code:Ticket" },
  "tktlink:": { table: "ticket_links",         type: "prov:Association" },
  "tktev:":   { table: "ticket_events",        type: "prov:Activity" },
};
```

#### 8.4.2 Edge Resolution — `edge-resolver.ts`

For any entity, find all entities it connects to (outbound) and all entities that connect to it (inbound). This is the core of the knowledge graph.

**Strategy:** Rather than scanning all 30 tables on every query, build a **materialized edge table** (`graph_edges`) that is refreshed periodically or on-demand:

```sql
-- XTDB table: graph_edges
-- Materialized from all FK columns and JSON-LD @id references
CREATE TABLE graph_edges (
  _id TEXT,           -- edge ID
  source_id TEXT,     -- source entity ID
  source_type TEXT,   -- source entity type (table name)
  target_id TEXT,     -- target entity ID
  target_type TEXT,   -- target entity type (table name)
  predicate TEXT,     -- relationship predicate (e.g. "project_id", "prov:used", "caused_by")
  ts BIGINT           -- when the edge was created
);
```

**Population:** Scan each table's FK columns and JSON-LD `@id` references. For example, from `decisions`:
- `project_id` → edge with predicate `"ev:projectId"`
- `session_id` → edge with predicate `"ev:sessionId"`
- JSON-LD `prov:used` → edge with predicate `"prov:used"`

This gives O(1) edge lookups per entity instead of O(tables) full-table scans.

#### 8.4.3 Path Finding — `traversal.ts`

Given two entity IDs, find the shortest path(s) between them through the graph:

- **Algorithm:** Bidirectional BFS over `graph_edges`, with configurable max depth (default: 6)
- **Output:** Ordered list of `(entity, predicate, entity)` triples forming the path
- **Use case:** "How does ticket TKT-123 relate to deployment DEPL-456?" → Ticket → implements Requirement → linked to Decision → made during Session → produced Artifact → tested by Test Run → validated Release → deployed as Deployment

#### 8.4.4 Timeline View — `timeline.ts`

A unified chronological stream of all activity across all entity types:

```sql
-- Union all entities with timestamps into a single timeline
SELECT _id, 'decision' AS entity_type, task AS summary, ts FROM decisions WHERE project_id = ?
UNION ALL
SELECT _id, 'artifact' AS entity_type, path AS summary, ts FROM artifacts WHERE project_id = ?
UNION ALL
SELECT _id, 'test_run' AS entity_type, suite_name AS summary, ts FROM test_runs WHERE project_id = ?
UNION ALL
SELECT _id, 'deployment' AS entity_type, status AS summary, ts FROM deployments WHERE project_id = ?
UNION ALL
SELECT _id, 'error' AS entity_type, error_message AS summary, ts FROM errors WHERE project_id = ?
UNION ALL
SELECT _id, 'incident' AS entity_type, title AS summary, ts FROM incidents WHERE project_id = ?
UNION ALL
SELECT _id, 'release' AS entity_type, version AS summary, ts FROM releases WHERE project_id = ?
UNION ALL
SELECT _id, 'requirement' AS entity_type, title AS summary, ts FROM requirements WHERE project_id = ?
-- ... all entity types
ORDER BY ts DESC
```

Supports filtering by entity type, time range, and session. This is the "what happened?" view.

#### 8.4.5 Impact Analysis — `impact-analysis.ts`

Forward traversal from a starting entity: "If I change/remove X, what's affected?"

- Starting from an **artifact** (file): find all decisions that reference it, requirements it implements, test runs that test it, tickets about it
- Starting from a **requirement**: find all tickets that implement it, decisions linked to it, artifacts produced for it
- Starting from a **release**: find all deployments of it, test runs that validated it, environments it's deployed to
- Starting from a **session**: find all decisions made, artifacts produced, tickets touched, workflows executed

**Algorithm:** Depth-limited BFS over `graph_edges` following only outbound "depends-on" and "used-by" predicates.

#### 8.4.6 Provenance Chain — `provenance-chain.ts`

Backward traversal: "How did X come to be? What's the full history?"

- For an **artifact**: what decision motivated it → what session produced the decision → what ticket assigned the session → what requirement generated the ticket → what PROGRESS.md item created the requirement
- For an **incident**: what errors triggered it → what deployment introduced the error → what release was deployed → what test run missed the bug → what session created the release
- For a **ticket**: what source generated it (manual, auto-error, auto-quality) → if auto-error, which error group → which specific errors → which component/operation

**Algorithm:** Depth-limited BFS over `graph_edges` following only `prov:wasGeneratedBy`, `prov:used`, `prov:wasAssociatedWith`, `caused_by`, `implements` predicates (backward direction).

#### 8.4.7 Cross-Entity Search — `search.ts`

Full-text search across all entity types, since XTDB doesn't provide native full-text indexing:

```sql
-- Search across all textual fields in all entity tables
-- Application-level: run these queries in parallel, merge results by relevance
SELECT _id, 'decision' AS type, what AS title, why AS excerpt, ts
FROM decisions WHERE what LIKE ? OR task LIKE ? OR why LIKE ?

SELECT _id, 'ticket' AS type, title, description AS excerpt, ts
FROM tickets WHERE title LIKE ? OR description LIKE ?

SELECT _id, 'requirement' AS type, title, description AS excerpt, ts
FROM requirements WHERE title LIKE ? OR description LIKE ?

SELECT _id, 'incident' AS type, title, description AS excerpt, ts
FROM incidents WHERE title LIKE ? OR description LIKE ?

SELECT _id, 'error' AS type, error_message AS title, operation AS excerpt, ts
FROM errors WHERE error_message LIKE ? OR operation LIKE ? OR component LIKE ?
-- ... all searchable entity types
```

Results are ranked by recency and entity-type priority (tickets > incidents > decisions > requirements > errors > artifacts).

### 8.5 Registered Tools and Commands

#### Tool: `query_graph`

Available to all agents via `pi.registerTool()`. Lets agents ask graph questions during their work.

**Parameters:**
- `action`: `"resolve"` | `"edges"` | `"path"` | `"timeline"` | `"impact"` | `"provenance"` | `"search"`
- `entity_id`: Target entity ID (for resolve, edges, impact, provenance)
- `target_id`: Second entity ID (for path finding)
- `query`: Search text (for search)
- `filters`: Optional filters — entity types, time range, project
- `max_depth`: Maximum traversal depth (default: 4)

**Agent prompt integration** (via `before_agent_start` hook):
- When an agent is working on a ticket, inject related entities (linked decisions, artifacts, requirements) so the agent has full context
- When an agent encounters an error, auto-query the provenance chain to show what produced the failing component

#### Command: `/graph`

```
/graph resolve <id>            — Show entity details with all connections
/graph edges <id>              — List all inbound and outbound edges
/graph path <id1> <id2>        — Find how two entities relate
/graph timeline [project]      — Show cross-entity activity stream
/graph impact <id>             — Show what depends on this entity
/graph provenance <id>         — Show how this entity came to be
/graph search <text>           — Search across all entities
/graph refresh                 — Rebuild the materialized edge table
/graph stats                   — Show graph statistics (node/edge counts by type)
```

### 8.6 Harness UI — Knowledge Graph Views

Extend `harness-ui/` with graph exploration pages. Builds on the existing `graph.ts` page which already has D3.js force-directed layout and SPARQL integration.

#### New Pages

| Page | Route | Description |
|---|---|---|
| **Entity Explorer** | `/graph/entity/:id` | Single entity page: details card, inbound/outbound edges as a list, mini-graph visualization of immediate neighbors, activity timeline for this entity |
| **Relationship Graph** | `/graph/explore` | Interactive D3.js graph explorer. Start from any entity, expand neighbors on click, filter by entity type, color-code by type. Extends existing `graph.ts` with entity data from `graph_edges` |
| **System Timeline** | `/graph/timeline` | Unified chronological view of all activity — filterable by entity type, project, session, time range. Each entry links to Entity Explorer |
| **Impact Analysis** | `/graph/impact/:id` | Tree visualization showing all downstream dependencies of an entity. Collapsible levels, color-coded by entity type |
| **Provenance View** | `/graph/provenance/:id` | Reverse tree showing the full causal chain that produced an entity. Each node links to Entity Explorer |
| **Search Results** | `/graph/search?q=...` | Cross-entity search results page, grouped by entity type, with relevance ranking |

#### Integration with Existing Pages

| Existing Page | Enhancement |
|---|---|
| **Home** (`/`) | Add "Knowledge Graph Stats" widget — node counts by type, recent edge activity |
| **Session Detail** (`/sessions/:id`) | Add "Entity Graph" tab showing all entities produced/referenced during this session as a mini-graph |
| **Decisions** (`/decisions`) | Each decision row shows linked entities (requirements, artifacts, tickets) as clickable badges |
| **Artifacts** (`/artifacts`) | Each artifact shows provenance chain (who created it, why, which session) |
| **Errors** (`/errors`) | Each error shows impact chain — what it affects, related incidents, auto-generated tickets |
| **CI Runs** (`/ci-runs`) | Each run shows linked entities — release tested, tickets verified, artifacts checked |
| **Deployments** (`/deploys`) | Each deployment shows full chain — release → test run → artifacts → decisions → tickets |

### 8.7 Enriching Existing Extensions With Richer Link Data

To populate the knowledge graph with meaningful edges, existing extensions need to emit richer JSON-LD when creating entities:

#### `decision-log/rdf.ts` — Add artifact and ticket links

- [ ] When `log_decision` is called, query `artifacts` for files modified in the same session within the last 5 minutes
- [ ] Add `ev:producedArtifacts` array to the decision's JSON-LD
- [ ] Query open tickets matching the decision's `task` field and add `ev:addressesTicket` link

#### `artifact-tracker/index.ts` — Add decision back-link

- [ ] When recording an artifact, query `decisions` for the most recent decision in the same session
- [ ] Add `prov:wasMotivatedBy` → decision to the artifact's JSON-LD

#### `deployment-tracker/index.ts` — Add test run and ticket links

- [ ] When recording a deployment, query `test_runs` for the most recent passing run for the same release
- [ ] Add `ev:validatedBy` → test run to the deployment's JSON-LD
- [ ] Query tickets completed since the deployed release was created, add `ev:deliversTickets` array

#### `xtdb-ops-api/lib/incidents.ts` — Add full JSON-LD

- [ ] Build proper JSON-LD for incidents: `@type: ["schema:Event", "prov:Activity"]`
- [ ] Auto-link to recent errors for the same project/component
- [ ] Auto-link to the most recent deployment (potential cause)

#### `xtdb-ops-api/lib/ci-webhook.ts` — Add artifact and ticket links

- [ ] When recording a test run, parse the git commit message for `tkt:` references, auto-link
- [ ] Add `ev:testedCommit` with the git commit SHA as a linkable reference

#### `session-postmortem/index.ts` — Add comprehensive entity links

- [ ] When generating the postmortem, query all entities produced during the session (decisions, artifacts, tickets, workflow runs)
- [ ] Add `ev:sessionEntities` array to the postmortem JSON-LD

#### `workflow-engine/index.ts` — Add ticket and decision links

- [ ] When starting a workflow for a ticket, add `ev:forTicket` link
- [ ] When completing a workflow step, query decisions made during the step's time range, add `ev:stepDecisions`

### 8.8 New XTDB Table — `graph_edges`

The materialized edge table for O(1) graph traversal:

| Column | Type | Description |
|---|---|---|
| `_id` | text | Edge ID: `gedge:<uuid>` |
| `source_id` | text | Source entity `_id` |
| `source_type` | text | Source table name (e.g. `"decisions"`, `"artifacts"`) |
| `target_id` | text | Target entity `_id` |
| `target_type` | text | Target table name |
| `predicate` | text | Relationship name (e.g. `"project_id"`, `"prov:used"`, `"implements"`) |
| `direction` | text | `"outbound"` or `"inbound"` (stored both ways for fast lookup) |
| `ts` | bigint | When the source entity was created/modified |

**Refresh strategy:** Incremental — on each entity INSERT/UPDATE, also insert the corresponding edges. Full rebuild available via `/graph refresh` command for bootstrapping or repair.

Add to `lib/jsonld/ids.ts`:

```typescript
graphEdge: () => `gedge:${randomUUID()}`,
```

### 8.9 Implementation Checklist

#### Sprint 1 — Core Infrastructure (2-3 sessions)

- [ ] Create `knowledge-graph/` directory with `package.json`
- [ ] Implement `knowledge-graph/types.ts` — `GraphNode`, `GraphEdge`, `TraversalResult`, `TimelineEntry` interfaces
- [ ] Implement `knowledge-graph/entity-resolver.ts` — prefix → table lookup, entity fetching
- [ ] Implement `knowledge-graph/materialized-edges.ts` — full rebuild logic that scans all 30 tables, extracts FK columns + JSON-LD `@id` references, populates `graph_edges`
- [ ] Implement `knowledge-graph/edge-resolver.ts` — query `graph_edges` for a given entity ID (both directions)
- [ ] Add `graph_edges` table to `docs/XTDB_SCHEMA.md`
- [ ] Add `graphEdge` to `lib/jsonld/ids.ts`
- [ ] Add seed logic to `scripts/seed-schema.ts`

#### Sprint 2 — Query Capabilities (2-3 sessions)

- [ ] Implement `knowledge-graph/traversal.ts` — bidirectional BFS path finding
- [ ] Implement `knowledge-graph/timeline.ts` — cross-entity UNION query with filtering
- [ ] Implement `knowledge-graph/impact-analysis.ts` — forward BFS over `graph_edges`
- [ ] Implement `knowledge-graph/provenance-chain.ts` — backward BFS over `graph_edges`
- [ ] Implement `knowledge-graph/search.ts` — parallel LIKE queries across all textual fields
- [ ] Register `query_graph` tool via `pi.registerTool()` in `index.ts`
- [ ] Register `/graph` command via `pi.registerCommand()` in `index.ts`

#### Sprint 3 — Extension Enrichment (2-3 sessions)

- [ ] Enrich `decision-log/rdf.ts` — add artifact and ticket auto-links
- [ ] Enrich `artifact-tracker/index.ts` — add decision back-links
- [ ] Enrich `deployment-tracker/index.ts` — add test run and ticket links
- [ ] Enrich `xtdb-ops-api/lib/incidents.ts` — add full JSON-LD with error and deployment links
- [ ] Enrich `xtdb-ops-api/lib/ci-webhook.ts` — add commit and ticket links
- [ ] Enrich `session-postmortem/index.ts` — add comprehensive entity links
- [ ] Enrich `workflow-engine/index.ts` — add ticket and decision links
- [ ] Add `jsonld` columns to tables missing them: `file_metrics`, `artifact_reads`, `lifecycle_events`
- [ ] Implement incremental edge emission — each extension emits edges on entity creation

#### Sprint 4 — UI Views (3-4 sessions)

- [ ] Implement `harness-ui/pages/entity-explorer.ts` — entity detail + neighbor graph + timeline
- [ ] Implement `harness-ui/pages/graph-explore.ts` — interactive D3.js entity graph explorer (extends existing `graph.ts`)
- [ ] Implement `harness-ui/pages/system-timeline.ts` — unified chronological activity view
- [ ] Implement `harness-ui/pages/impact-view.ts` — tree visualization of downstream dependencies
- [ ] Implement `harness-ui/pages/provenance-view.ts` — reverse tree of causal chain
- [ ] Implement `harness-ui/pages/graph-search.ts` — cross-entity search results
- [ ] Add routes to `harness-ui/server.ts`
- [ ] Add "Knowledge Graph" section to navigation
- [ ] Add knowledge graph API endpoints to `xtdb-ops-api`

#### Sprint 5 — Integration & Polish (1-2 sessions)

- [ ] Add `before_agent_start` hook: inject related entities when agent is working on a ticket
- [ ] Add `before_agent_start` hook: on error, auto-query provenance chain for context
- [ ] Enhance existing pages — add entity badges/links to decisions, artifacts, errors, CI runs, deployments
- [ ] Add "Knowledge Graph Stats" widget to home page
- [ ] Add "Entity Graph" tab to session detail page
- [ ] Performance optimization: add indexes, tune materialized edge refresh interval
- [ ] Write integration tests for entity resolution, edge resolution, path finding

### 8.10 How Phase 8 Depends On and Enhances All Previous Phases

```
Phase 0 (DONE) ──→ Phase 1 (Foundation)
                        │
                        ├──→ Phase 2 (Continuous Review)
                        │        └── Phase 8 links: review findings → tickets → artifacts → decisions
                        │
                        ├──→ Phase 3 (Continuous Monitoring)
                        │        └── Phase 8 links: health events → incidents → errors → deployments
                        │
                        ├──→ Phase 4 (Continuous Security)
                        │        └── Phase 8 links: security findings → tickets → artifacts → commits
                        │
                        ├──→ Phase 5 (Extended Testing)
                        │        └── Phase 8 links: test runs → releases → artifacts → requirements
                        │
                        ├──→ Phase 6 (Error Monitoring)
                        │        └── Phase 8 links: errors → error groups → tickets → incidents → deployments
                        │
                        ├──→ Phase 7 (Ticket System)
                        │        └── Phase 8 links: tickets ↔ ALL other entity types via ticket_links
                        │
                        └──→ Phase 8 (360° Knowledge Graph) ←── enhances ALL phases
                                 │
                                 ├── Sprint 1-2: depends only on XTDB (can start immediately)
                                 ├── Sprint 3: benefits from Phase 7 tickets existing, but not required
                                 ├── Sprint 4: depends on Sprint 1-2 (needs query layer for UI)
                                 └── Sprint 5: benefits from all phases being complete
```

Phase 8 is the **capstone** — it doesn't add new entity types (except `graph_edges`), but it makes every existing entity type more valuable by connecting them. Each previous phase produces entities that feed into the knowledge graph:

- **Phase 1** provides the foundation (structured logging, CI) that generates machine-parseable entities
- **Phases 2-4** produce quality findings, security scans, and test results — all become graph nodes
- **Phase 5** produces performance baselines and test coverage — linked to artifacts and releases
- **Phase 6** produces error groups and auto-tickets — linked to incidents and deployments
- **Phase 7** provides the ticket system that ties everything to actionable work items

Without Phase 8, these entities exist in silos. With Phase 8, any entity is a starting point for exploring the entire system.

### 8.11 Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| **Entity coverage** | 100% of entity types resolvable via `query_graph resolve` | Count of types in `PREFIX_TABLE_MAP` vs. total tables |
| **Edge completeness** | >90% of FK columns and JSON-LD `@id` references captured in `graph_edges` | Compare `graph_edges` count vs. expected (sum of FK columns across all rows) |
| **Path finding accuracy** | Any two related entities connected within depth 6 | Sample 100 random entity pairs known to be related, verify path found |
| **Query latency** | Entity resolve <50ms, edge query <100ms, path finding <500ms, timeline <200ms | Measure via `query_graph` tool response times |
| **UI responsiveness** | Entity Explorer loads in <1s, Graph Explorer renders <2s for 100 nodes | Browser performance metrics |
| **Agent context quality** | Agents make fewer redundant decisions when graph context is injected | Compare decision deduplication rate before/after Phase 8 |
| **Cross-entity search** | Search returns relevant results from ≥3 entity types for any keyword | Manual testing with 20 common keywords |
| **Graph freshness** | New entities appear in graph within 1 minute of creation | Measure delay between entity INSERT and corresponding `graph_edges` INSERT |
| **JSON-LD completeness** | All entity types have non-empty JSON-LD provenance documents | Query `SELECT COUNT(*) FROM <table> WHERE jsonld IS NULL OR jsonld = '{}'` for each table |

### 8.12 Updated Table Counts

With the knowledge graph, the XTDB schema grows from 33 to 34 tables:

| Category | Tables | Count |
|---|---|---|
| Core Events | events, projections | 2 |
| Projects | projects, session_projects, project_dependencies, project_tags, decommission_records | 5 |
| Decisions & Knowledge | decisions, session_postmortems, delegations, file_metrics | 4 |
| Artifacts | artifacts, artifact_versions, artifact_reads, artifact_cleanup | 4 |
| Workflows & Requirements | workflow_runs, workflow_step_runs, requirements, requirement_links | 4 |
| CI/CD | releases, deployments, test_runs, environments | 4 |
| Operations | backup_records, incidents, lifecycle_events, errors | 4 |
| Tickets (Phase 7) | tickets, ticket_links, ticket_events | 3 |
| **Knowledge Graph (Phase 8)** | **graph_edges** | **1** |
| **Total** | | **31** |
