# CI Runner + Soft Serve — Implementation Progress

> Status: Patch applied, exploration complete, ready for implementation
> Last updated: 2026-03-21

## What We Have (from patch)

### Code
- `ci-runner/runner.ts` — background process, watches queue dir, checks out code, runs steps in Docker containers, records results to XTDB
- `ci-runner/pipeline.ts` — resolves pipeline config from `.ci.jsonld` or auto-detects language (TS/Go/Rust/Python/Elixir/Shell)
- `ci-runner/recorder.ts` — writes CI run results to XTDB `ci_runs` table with JSON-LD
- `ci-runner/enqueue.sh` — writes job JSON to queue dir (called by git hook)
- `ci-runner/hooks/post-receive` — Soft Serve git hook that calls enqueue.sh on push
- `ci-runner/README.md` — full architecture docs

### Config
- `.ci.jsonld` format — native JSON-LD pipeline config (not YAML)
- Auto-detection for 6 languages from manifest files
- Taskfile tasks: `ci:runner`, `ci:run`, `ci:hook:install`

### Docs
- `docs/PROGRESS_FUNCTION_LIFECYCLE.md` — research on function lifecycle tracking
- `docs/CODE_QUALITY_STANDARD.md` — universal quality rules for all languages
- `docs/RDF_ENFORCEMENT.md` — plan to replace string-soup JSON-LD with typed RDF

### Quality Framework
- `biome.json` — TypeScript/JS quality config
- `code-quality/` — language-agnostic detection extension (17 languages)

## What's Missing — Docker Compose + Integration

### 1. Add Soft Serve to docker-compose.yml
**Image:** `charmcli/soft-serve:latest` (88MB, already pulled)
**Ports:**
- `:23231` — SSH (git push/pull)
- `:23232` — HTTP (web UI)
- `:23233` — Stats

**Volume:** `soft-serve-data:/soft-serve` for repos and config

**Config needed:**
- Initial admin key (SSH public key for access)
- Hook installation (post-receive for CI)
- Repo creation for `harness` project

### 2. Wire CI Runner into Infrastructure
- [ ] Add `soft-serve` service to `docker-compose.yml`
- [ ] Add `ci-runner` as a Node.js service (or run on host with `task ci:runner`)
- [ ] Configure `CI_REPOS_DIR` to point to Soft Serve's repos directory
- [ ] Install post-receive hook into Soft Serve container
- [ ] Add `ci_runs` table to `scripts/seed-schema.ts`

### 3. Harness UI Integration
- [ ] Add CI Runs page to harness-ui (list of runs with status)
- [ ] Add CI status dot to home page System Health table
- [ ] Add `ci_runs` to `scripts/export-xtdb-triples.ts` for QLever
- [ ] Add CI SPARQL queries to `/graph` page (failed runs, slow pipelines, repos without CI)

### 4. Graph Integration
- [ ] Add `ci: () => "ci:${randomUUID()}"` to `lib/jsonld/ids.ts`
- [ ] Add CI query cards to graph page

## Decisions (2026-03-22)

### Q1: CI step execution → **A: Docker socket mount (start), containerized (target)**
Runner runs on host, spawns `docker run` per step. Future: move runner itself into a Docker container with socket mount.

### Q2: Soft Serve repo setup → **B: Init bare repo + push**
Soft Serve is the canonical git host. Create bare repo, push all branches. Soft Serve holds all repos.

### Q3: CI notifications → **C: SSE event via Event API**
CI results emit SSE events to harness-ui `/stream`. Visible alongside session events.

### Q4: Ports → **Confirmed**
- `:23231` SSH (git push/pull)
- `:23232` HTTP (web UI)

## Implementation Steps

### Phase 1: Soft Serve in Docker Compose (est. 30 min)
1. Add `soft-serve` service to `docker-compose.yml`
2. Configure volumes, ports, admin SSH key
3. Verify `git clone ssh://localhost:23231/test` works
4. Push harness repo to Soft Serve

### Phase 2: CI Runner Wiring (est. 1h)
1. Add `ci_runs` table to seed schema
2. Install post-receive hook in Soft Serve container
3. Configure and test `runner.ts` with a test push
4. Verify CI results appear in XTDB

### Phase 3: Harness UI Integration (est. 1h)
1. Add CI Runs page to harness-ui
2. Add `ci_runs` to QLever export + graph queries
3. Add CI runner status to System Health
4. Wire CI event notifications to /stream

### Phase 4: End-to-End Verification (est. 30 min)
1. Push a commit to Soft Serve
2. CI runner picks it up, runs pipeline
3. Results appear in XTDB, QLever, harness-ui
4. Commit and document

## Effort Estimate
Total: ~3 hours
