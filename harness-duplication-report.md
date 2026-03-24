**Harness Monorepo**
**Code Duplication Analysis Report**
Prepared: March 23, 2026
# **Executive Summary**
This report presents a comprehensive code duplication analysis of the Harness monorepo. The analysis combined automated detection (jscpd) with manual side-by-side comparison of source files across all modules. The codebase contains approximately 170 source files across 50+ modules.

| Metric | Value |
| --- | --- |
| Duplication Groups Identified | 11 |
| Total Duplicated Lines | ~491 |
| Files Affected | 68 |
| High Priority Issues | 4 |
| Medium Priority Issues | 4 |
| Low Priority Issues | 3 |

The most severe duplication is in the XTDB typed parameter helpers (t/n/b functions), which are copy-pasted across 31 files despite already being exported from the shared lib/db.ts. The second critical area is the XTDB connection boilerplate repeated in 10 files, and two pairs of byte-for-byte identical files (mock-pi.ts and health.ts). Addressing the top 4 high-priority groups alone would eliminate duplication across 53 unique files.

# **Duplication Groups Summary**

| ID | Pattern | Files | Lines | Priority | Refactoring |
| --- | --- | --- | --- | --- | --- |
| DG-01 | Identical Mock API Files | 2 | ~39 | HIGH | Move to lib/mock-pi. |
| DG-02 | Identical Health Scoring Functions | 2 | ~45 | HIGH | Move to lib/health. |
| DG-03 | XTDB Typed Parameter Helpers (t/n/b pattern) | 31 | ~62 | HIGH | lib/db. |
| DG-04 | XTDB Connection Boilerplate | 10 | ~80 | HIGH | All modules should use lib/db. |
| DG-05 | Session Shutdown DB Cleanup Pattern | 11 | ~55 | MEDIUM | Create a lib/extension-db. |
| DG-06 | RDF Namespace Re-exports | 2 | ~28 | MEDIUM | Either import directly from lib/jsonld/context. |
| DG-07 | XTDB Recorder Pattern (Build + CI) | 2 | ~64 | MEDIUM | Extract a generic lib/recorder. |
| DG-08 | Dockerfile Docker CLI Installation Block | 4 | ~32 | MEDIUM | Create a shared base image (e. |
| DG-09 | Dockerfile Multi-Stage Build Pattern | 6 | ~36 | LOW | Create a reusable Dockerfile template or docker-bake. |
| DG-10 | Hono HTTP Server Setup Boilerplate | 7 | ~35 | LOW | Create lib/server. |
| DG-11 | Duplicated postgres Dependency in package.json Files | 15 | ~15 | LOW | Use npm workspaces (or pnpm workspaces) to hoist shared dependencies. |

# **Detailed Analysis**
## **DG-01: Identical Mock API Files****  [HIGH]**
Two byte-for-byte identical copies of the same mock ExtensionAPI file (createMockPi). Both files even share the same comment noting they are 'shared', yet exist as separate copies. Any change to the mock API requires updating both files.
**Affected Files **(2 files, ~39 duplicated lines):
`quality-hooks/mock-pi.ts`
`test/mock-pi.ts`
**Recommended Fix: **Move to lib/mock-pi.ts or test/helpers/mock-pi.ts. Update both consumers to import from the single canonical location.
## **DG-02: Identical Health Scoring Functions****  [HIGH]**
Two byte-for-byte identical copies of computeHealthScore(), healthColor(), and healthLabel() pure functions plus the HealthInput interface. Both UIs use the exact same scoring algorithm but maintain separate copies.
**Affected Files **(2 files, ~45 duplicated lines):
`harness-ui/lib/health.ts`
`xtdb-event-logger-ui/lib/health.ts`
**Recommended Fix: **Move to lib/health.ts (already exists as a shared lib directory). Both harness-ui and xtdb-event-logger-ui import from the shared location.
## **DG-03: XTDB Typed Parameter Helpers (t/n/b pattern)****  [HIGH]**
The pattern 'const t = (v: string | null) => sql.typed(v as any, 25)' and 'const n = (v: number | null) => sql.typed(v as any, 20)' is copy-pasted into 31 files across the entire monorepo. Each file re-declares the same one-liner helpers for XTDB's typed parameter binding. lib/db.ts already exports these as functions but most modules ignore them and re-declare locally.
**Affected Files **(31 files, ~62 duplicated lines):
`agent-spawner/index.ts`
`artifact-tracker/index.ts`
`artifact-tracker/db.ts`
`artifact-tracker/versioning.ts`
`build-service/recorder.ts`
`build-service/server.ts`
`ci-runner/recorder.ts`
`data-examples/test-xtdb-insert.ts`
`decision-log/index.ts`
`docker-event-collector/writer.ts`
`history-retrieval/index.ts`
`lib/db.ts`
`lib/errors.ts`
`lib/test-recorder.ts`
`project-registry/index.ts`
`scripts/backfill-lifecycle-phase.ts`
`scripts/retain.ts`
`session-postmortem/index.ts`
`sunk-cost-detector/index.ts`
`test/contracts/infrastructure.ts`
`test/integration.ts`
`test/lifecycle.ts`
`test/run-tests.ts`
`test/seed-augmented-patterns.ts`
`workflow-engine/index.ts`
`xtdb-event-logger/endpoints/xtdb.ts`
`xtdb-event-logger-ui/lib/db.ts`
`xtdb-ops-api/lib/backup.ts`
`xtdb-ops-api/lib/ci-webhook.ts`
`xtdb-ops-api/lib/incidents.ts`
`xtdb-projector/index.ts`
**Recommended Fix: **lib/db.ts already exports t(), n(), b() helpers. All 31 files should import {t, n, b} from '../lib/db.ts' instead of re-declaring. For modules that need a different sql instance, use the existing pattern: t(sql, value) already exported by lib/db.ts.
## **DG-04: XTDB Connection Boilerplate****  [HIGH]**
The XTDB_HOST/XTDB_PORT environment variable reading and postgres() connection initialization is repeated in 10 files. Each copies the same pattern: read env vars, create postgres connection with identical credentials (user: 'xtdb', password: 'xtdb', database: 'xtdb'). lib/db.ts already provides connectXtdb() but most modules don't use it.
**Affected Files **(10 files, ~80 duplicated lines):
`agent-spawner/index.ts`
`artifact-tracker/db.ts`
`build-service/recorder.ts`
`build-service/server.ts`
`ci-runner/recorder.ts`
`history-retrieval/index.ts`
`lib/db.ts`
`lib/test-recorder.ts`
`sunk-cost-detector/index.ts`
`xtdb-ops-api/lib/ci-webhook.ts`
**Recommended Fix: **All modules should use lib/db.ts connectXtdb(). Remove the 10 copies of XTDB_HOST/XTDB_PORT + postgres({...}) and replace with a single import.
## **DG-05: Session Shutdown DB Cleanup Pattern****  [MEDIUM]**
11 extensions register nearly identical pi.on('session_shutdown') handlers that run 'try { await sql.end(); } catch { } sql = null'. The exact same error-swallowing cleanup pattern is repeated in every extension that opens a database connection.
**Affected Files **(11 files, ~55 duplicated lines):
`agent-spawner/index.ts`
`artifact-tracker/db.ts`
`decision-log/index.ts`
`happy-to-delete/index.ts`
`history-retrieval/index.ts`
`project-lifecycle/index.ts`
`project-registry/index.ts`
`requirements-tracker/index.ts`
`session-postmortem/index.ts`
`sunk-cost-detector/index.ts`
`workflow-engine/index.ts`
**Recommended Fix: **Create a lib/extension-db.ts helper that wraps connectXtdb() and auto-registers a shutdown handler. Extensions call createExtensionDb(pi) which returns {sql, t, n, b} and registers cleanup automatically.
## **DG-06: RDF Namespace Re-exports****  [MEDIUM]**
Two separate files re-export the same namespace constants (SCHEMA, PROV, EV, RDF, XSD, FOAF, DOAP) from lib/jsonld/context.ts. Both exist solely to provide shorter import paths for their respective modules.
**Affected Files **(2 files, ~28 duplicated lines):
`workflow-engine/rdf/namespaces.ts`
`xtdb-event-logger/rdf/namespaces.ts`
**Recommended Fix: **Either import directly from lib/jsonld/context.ts in consuming files, or create a single lib/rdf/namespaces.ts re-export file. Remove the two module-specific copies.
## **DG-07: XTDB Recorder Pattern (Build + CI)****  [MEDIUM]**
Both recorder files share identical structure: lazy db() connection function (lines 14-28 identical), typed helper declarations, JSON-LD construction with JSONLD_CONTEXT, closeRecorder() function. The build-service/recorder.ts file even has a comment saying 'Same pattern as ci-runner/recorder.ts'. Only the table names and field mappings differ.
**Affected Files **(2 files, ~64 duplicated lines):
`build-service/recorder.ts`
`ci-runner/recorder.ts`
**Recommended Fix: **Extract a generic lib/recorder.ts base with createRecorder<T>({table, mapFields, buildJsonLd}) that handles the connection, typed helpers, and cleanup. Each recorder becomes a thin config wrapper.
## **DG-08: Dockerfile Docker CLI Installation Block****  [MEDIUM]**
4 Dockerfiles contain nearly identical 8-line blocks that install Docker CE CLI: apt-get update, install ca-certificates/curl/gnupg, add Docker GPG key, add Docker apt repo, install docker-ce-cli, cleanup. Only minor differences in additional packages (ssh, openssh-client, docker-compose-plugin).
**Affected Files **(4 files, ~32 duplicated lines):
`build-service/Dockerfile`
`ci-runner/Dockerfile`
`harness-ui/Dockerfile`
`xtdb-ops-api/Dockerfile`
**Recommended Fix: **Create a shared base image (e.g., harness-base:node22-docker) that pre-installs Docker CLI, or extract the installation into a shared script at scripts/install-docker-cli.sh that each Dockerfile COPYs and RUNs.
## **DG-09: Dockerfile Multi-Stage Build Pattern****  [LOW]**
6 Dockerfiles use an identical multi-stage build pattern: FROM node:22-slim AS deps, WORKDIR, COPY package.json, RUN npm ci + jiti, then second stage copies node_modules and source. The pattern is structurally identical, varying only by service name and port.
**Affected Files **(6 files, ~36 duplicated lines):
`ci-runner/Dockerfile`
`docker-event-collector/Dockerfile`
`harness-ui/Dockerfile`
`web-chat/Dockerfile`
`xtdb-event-logger-ui/Dockerfile`
`xtdb-ops-api/Dockerfile`
**Recommended Fix: **Create a reusable Dockerfile template or docker-bake.hcl configuration. Alternatively, use a Makefile/Taskfile target that generates Dockerfiles from a template with service-specific variables.
## **DG-10: Hono HTTP Server Setup Boilerplate****  [LOW]**
7 server files repeat the same pattern: import Hono + serve, create app instance, define PORT from env, add /api/health endpoint, call serve({fetch: app.fetch, port}). Each health endpoint follows a similar structure returning status/uptime.
**Affected Files **(7 files, ~35 duplicated lines):
`build-service/server.ts`
`ci-runner/server.ts`
`docker-event-collector/server.ts`
`harness-ui/server.ts`
`web-chat/server.ts`
`xtdb-event-logger-ui/server.ts`
`xtdb-ops-api/server.ts`
**Recommended Fix: **Create lib/server.ts with a createServer({port, envVar, healthExtra}) factory that sets up Hono, static file serving, CORS, health endpoint, and graceful shutdown. Each service imports and extends the base.
## **DG-11: Duplicated postgres Dependency in package.json Files****  [LOW]**
15 separate package.json files each declare their own 'postgres' dependency. Each module installs its own copy of the postgres driver into its own node_modules, creating 15 separate installations of the same package.
**Affected Files **(15 files, ~15 duplicated lines):
`agent-spawner/package.json`
`artifact-tracker/package.json`
`canary-monitor/package.json`
`ci-runner/package.json`
`decision-log/package.json`
`deployment-tracker/package.json`
`history-retrieval/package.json`
`project-lifecycle/package.json`
`project-registry/package.json`
`requirements-tracker/package.json`
`session-postmortem/package.json`
`sunk-cost-detector/package.json`
`workflow-engine/package.json`
`xtdb-event-logger/package.json`
`xtdb-projector/package.json`
**Recommended Fix: **Use npm workspaces (or pnpm workspaces) to hoist shared dependencies. Declare postgres once in the root package.json and let workspace resolution handle it.

# **Prioritized Refactoring Plan**
## **Phase 1: Quick Wins (1-2 days)**
DG-01 (mock-pi.ts): Delete test/mock-pi.ts, update imports to use quality-hooks/mock-pi.ts (or move to lib/). 5 minutes.
DG-02 (health.ts): Delete xtdb-event-logger-ui/lib/health.ts, import from harness-ui/lib/health.ts or move to lib/health.ts. 10 minutes.
DG-06 (RDF namespaces): Delete both module-specific namespaces.ts files, import directly from lib/jsonld/context.ts. 15 minutes.
## **Phase 2: Core Infrastructure (3-5 days)**
DG-03 (typed helpers): Audit all 31 files. Replace local t/n/b declarations with imports from lib/db.ts. The lib already exports these helpers taking (sql, value) form. Update call sites from t(value) to t(sql, value) or create a factory: const {t, n} = createTypedHelpers(sql).
DG-04 (connection boilerplate): Replace all 10 copies of XTDB_HOST/XTDB_PORT + postgres({...}) with lib/db.ts connectXtdb(). Remove dead environment variable reads.
DG-05 (shutdown cleanup): Create lib/extension-db.ts with createExtensionDb(pi, opts?) that returns typed helpers and auto-registers pi.on('session_shutdown') cleanup. Update all 11 extensions.
## **Phase 3: Service Consolidation (1-2 weeks)**
DG-07 (recorder pattern): Extract lib/recorder.ts with a generic createRecorder<T>() factory. Reduce build-service/recorder.ts and ci-runner/recorder.ts to thin config wrappers.
DG-08 (Dockerfile Docker CLI): Create a shared base Docker image with Docker CLI pre-installed, or extract install script to scripts/install-docker-cli.sh.
DG-09 (Dockerfile build pattern): Consider a Dockerfile template or docker-bake.hcl for the 6 near-identical multi-stage Dockerfiles.
DG-10 (Hono server setup): Create lib/server.ts with createServer() factory including health endpoints and shutdown handlers.
DG-11 (package.json dependencies): Adopt npm/pnpm workspaces to hoist postgres and other shared dependencies to the root.

# **Files for Refactoring: Master List**
Every file in the monorepo that requires refactoring work to eliminate duplication, sorted by priority. Files appearing in multiple duplication groups are listed once at their highest priority level.

| File Path | Priority | Duplication Group(s) |
| --- | --- | --- |
| agent-spawner/index.ts | HIGH | DG-03, DG-04, DG-05 |
| artifact-tracker/db.ts | HIGH | DG-03, DG-04, DG-05 |
| artifact-tracker/index.ts | HIGH | DG-03 |
| artifact-tracker/versioning.ts | HIGH | DG-03 |
| build-service/recorder.ts | HIGH | DG-03, DG-04, DG-07 |
| build-service/server.ts | HIGH | DG-03, DG-04, DG-10 |
| ci-runner/recorder.ts | HIGH | DG-03, DG-04, DG-07 |
| data-examples/test-xtdb-insert.ts | HIGH | DG-03 |
| decision-log/index.ts | HIGH | DG-03, DG-05 |
| docker-event-collector/writer.ts | HIGH | DG-03 |
| harness-ui/lib/health.ts | HIGH | DG-02 |
| history-retrieval/index.ts | HIGH | DG-03, DG-04, DG-05 |
| lib/db.ts | HIGH | DG-03, DG-04 |
| lib/errors.ts | HIGH | DG-03 |
| lib/test-recorder.ts | HIGH | DG-03, DG-04 |
| project-registry/index.ts | HIGH | DG-03, DG-05 |
| quality-hooks/mock-pi.ts | HIGH | DG-01 |
| scripts/backfill-lifecycle-phase.ts | HIGH | DG-03 |
| scripts/retain.ts | HIGH | DG-03 |
| session-postmortem/index.ts | HIGH | DG-03, DG-05 |
| sunk-cost-detector/index.ts | HIGH | DG-03, DG-04, DG-05 |
| test/contracts/infrastructure.ts | HIGH | DG-03 |
| test/integration.ts | HIGH | DG-03 |
| test/lifecycle.ts | HIGH | DG-03 |
| test/mock-pi.ts | HIGH | DG-01 |
| test/run-tests.ts | HIGH | DG-03 |
| test/seed-augmented-patterns.ts | HIGH | DG-03 |
| workflow-engine/index.ts | HIGH | DG-03, DG-05 |
| xtdb-event-logger-ui/lib/db.ts | HIGH | DG-03 |
| xtdb-event-logger-ui/lib/health.ts | HIGH | DG-02 |
| xtdb-event-logger/endpoints/xtdb.ts | HIGH | DG-03 |
| xtdb-ops-api/lib/backup.ts | HIGH | DG-03 |
| xtdb-ops-api/lib/ci-webhook.ts | HIGH | DG-03, DG-04 |
| xtdb-ops-api/lib/incidents.ts | HIGH | DG-03 |
| xtdb-projector/index.ts | HIGH | DG-03 |
| build-service/Dockerfile | MEDIUM | DG-08 |
| ci-runner/Dockerfile | MEDIUM | DG-08, DG-09 |
| happy-to-delete/index.ts | MEDIUM | DG-05 |
| harness-ui/Dockerfile | MEDIUM | DG-08, DG-09 |
| project-lifecycle/index.ts | MEDIUM | DG-05 |
| requirements-tracker/index.ts | MEDIUM | DG-05 |
| workflow-engine/rdf/namespaces.ts | MEDIUM | DG-06 |
| xtdb-event-logger/rdf/namespaces.ts | MEDIUM | DG-06 |
| xtdb-ops-api/Dockerfile | MEDIUM | DG-08, DG-09 |
| agent-spawner/package.json | LOW | DG-11 |
| artifact-tracker/package.json | LOW | DG-11 |
| canary-monitor/package.json | LOW | DG-11 |
| ci-runner/package.json | LOW | DG-11 |
| ci-runner/server.ts | LOW | DG-10 |
| decision-log/package.json | LOW | DG-11 |
| deployment-tracker/package.json | LOW | DG-11 |
| docker-event-collector/Dockerfile | LOW | DG-09 |
| docker-event-collector/server.ts | LOW | DG-10 |
| harness-ui/server.ts | LOW | DG-10 |
| history-retrieval/package.json | LOW | DG-11 |
| project-lifecycle/package.json | LOW | DG-11 |
| project-registry/package.json | LOW | DG-11 |
| requirements-tracker/package.json | LOW | DG-11 |
| session-postmortem/package.json | LOW | DG-11 |
| sunk-cost-detector/package.json | LOW | DG-11 |
| web-chat/Dockerfile | LOW | DG-09 |
| web-chat/server.ts | LOW | DG-10 |
| workflow-engine/package.json | LOW | DG-11 |
| xtdb-event-logger-ui/Dockerfile | LOW | DG-09 |
| xtdb-event-logger-ui/server.ts | LOW | DG-10 |
| xtdb-event-logger/package.json | LOW | DG-11 |
| xtdb-ops-api/server.ts | LOW | DG-10 |
| xtdb-projector/package.json | LOW | DG-11 |

**Total unique files requiring refactoring: 68**
