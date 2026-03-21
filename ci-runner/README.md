# Harness CI Runner

A minimal, harness-native CI/CD runner designed for Soft Serve.

## Architecture

```
Developer pushes code
       │
       ▼
Soft Serve (git server)
       │
       ├─ post-receive hook fires
       │
       ▼
enqueue.sh
       │  writes job JSON to ~/.ci-runner/queue/
       │  developer sees "CI job queued" in terminal
       │  push completes immediately (async)
       │
       ▼
runner.ts (background process)
       │  watches queue directory
       │  picks up job file
       │
       ├─ 1. Checks out code at pushed commit
       ├─ 2. Reads .ci.yaml OR auto-detects language
       ├─ 3. Runs each step in a Docker container
       ├─ 4. Writes results to XTDB as JSON-LD
       └─ 5. Cleans up working directory
              │
              ▼
         XTDB ci_runs table
              │
              ▼
    export-xtdb-triples.ts → QLever → /graph page
    (queryable via SPARQL alongside test results,
     function lifecycle, decisions, requirements)
```

## Quick Start

```bash
# 1. Start the runner
task ci:runner

# 2. Run CI on current repo (one-shot, for testing)
task ci:run

# 3. Install the Soft Serve hook
task ci:hook:install
```

## Pipeline Configuration

### Option A: Explicit `.ci.yaml`

Place a `.ci.yaml` in your repo root:

```yaml
steps:
  - name: check
    image: oven/bun:latest
    commands:
      - bun install --frozen-lockfile
      - npx biome ci .

  - name: test
    image: oven/bun:latest
    commands:
      - bun test

  - name: typecheck
    image: oven/bun:latest
    commands:
      - bun install --frozen-lockfile
      - npx tsc --noEmit
```

### Option B: Auto-detection

If no `.ci.yaml` exists, the runner detects the language from manifest files and runs the canonical quality tools:

| Detected file | Language | Steps |
|---|---|---|
| `package.json` + `biome.json` | TypeScript | biome ci, tests, tsc --noEmit |
| `go.mod` | Go | gofmt, go vet, go test -race |
| `Cargo.toml` | Rust | cargo fmt --check, cargo clippy, cargo test |
| `pyproject.toml` | Python | ruff check, ruff format --check, pytest |
| `mix.exs` | Elixir | mix format --check, mix credo, mix test |
| `*.sh` only | Shell | shellcheck |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CI_QUEUE_DIR` | `~/.ci-runner/queue` | Where job files are written |
| `CI_WORK_DIR` | `~/.ci-runner/work` | Temporary checkout directory |
| `CI_REPOS_DIR` | — | Path to bare repos (Soft Serve repos dir) |
| `SOFT_SERVE_DATA_PATH` | — | Soft Serve data path (repos at `$path/repos/`) |
| `CI_POLL_MS` | `2000` | Queue poll interval (ms) |
| `CI_DOCKER_TIMEOUT` | `300` | Max seconds per step |
| `XTDB_EVENT_HOST` | `localhost` | XTDB host for recording results |
| `XTDB_EVENT_PORT` | `5433` | XTDB port |

## XTDB Integration

CI results are stored in the `ci_runs` table as JSON-LD:

```json
{
  "@type": "code:CIRun",
  "code:repo": "harness",
  "code:commitHash": "abc123...",
  "schema:actionStatus": "schema:CompletedActionStatus",
  "code:steps": [
    { "@type": "code:CIStep", "schema:name": "check", "code:exitCode": 0 },
    { "@type": "code:CIStep", "schema:name": "test", "code:exitCode": 0 }
  ],
  "code:durationMs": 4521
}
```

### SPARQL Queries

After adding `ci_runs` to `export-xtdb-triples.ts`, these queries work on `/graph`:

```sparql
# Recent CI runs
SELECT ?run ?repo ?status ?duration WHERE {
  ?run a code:CIRun ;
       code:repo ?repo ;
       schema:actionStatus ?status ;
       code:durationMs ?duration .
} ORDER BY DESC(?run) LIMIT 20

# Failed runs with commit info
SELECT ?repo ?commit ?message WHERE {
  ?run a code:CIRun ;
       code:repo ?repo ;
       code:commitHash ?commit ;
       code:commitMessage ?message ;
       schema:actionStatus schema:FailedActionStatus .
}

# CI + test coverage: commits that failed CI AND touched untested functions
# (requires function lifecycle + test coverage data)
SELECT ?commit ?repo ?fn WHERE {
  ?run a code:CIRun ;
       code:commitHash ?commit ;
       code:repo ?repo ;
       schema:actionStatus schema:FailedActionStatus .
  ?event a code:FunctionEvent ;
         code:commitHash ?commit ;
         code:functionName ?fn .
  FILTER NOT EXISTS { ?test code:tests ?fn }
}
```

## Integration TODO

- [ ] Add `ci_runs` to `scripts/export-xtdb-triples.ts` table list
- [ ] Add CI run query cards to `harness-ui/pages/graph.ts`
- [ ] Add `ci: () => "ci:${randomUUID()}"` to `lib/jsonld/ids.ts`
- [ ] Notification on failure (SSH message back to pusher, or Slack)
