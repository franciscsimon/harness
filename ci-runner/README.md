# Harness CI Runner

A minimal, harness-native CI/CD runner designed for Soft Serve.
Everything is JSON-LD — pipeline configs, run results, step outcomes.
No YAML. No translation layer. It's in the graph from the start.

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
       ├─ 2. Reads .ci.jsonld OR auto-detects language
       ├─ 3. Runs each step in a Docker container
       ├─ 4. Writes results to XTDB as JSON-LD (code:CIRun)
       ├─ 5. Pipeline config itself stored as JSON-LD (code:Pipeline)
       └─ 6. Cleans up working directory
              │
              ▼
         XTDB ci_runs table (jsonld column)
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

### Option A: Explicit `.ci.jsonld`

Place a `.ci.jsonld` in your repo root. It's native JSON-LD — the same
format as every other entity in the harness. No YAML to validate, no
translation to get it into the graph. It IS the graph.

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "code": "https://pi.dev/code/"
  },
  "@type": "code:Pipeline",
  "schema:name": "harness CI",
  "code:steps": [
    {
      "@type": "code:PipelineStep",
      "schema:name": "check",
      "code:image": "oven/bun:latest",
      "code:commands": [
        "bun install --frozen-lockfile",
        "npx biome ci ."
      ]
    },
    {
      "@type": "code:PipelineStep",
      "schema:name": "test",
      "code:image": "oven/bun:latest",
      "code:commands": ["bun test"]
    },
    {
      "@type": "code:PipelineStep",
      "schema:name": "typecheck",
      "code:image": "oven/bun:latest",
      "code:commands": [
        "bun install --frozen-lockfile",
        "npx tsc --noEmit"
      ]
    }
  ]
}
```

### Option B: Auto-detection

If no `.ci.jsonld` exists, the runner detects the language from manifest
files and generates the pipeline as JSON-LD on the fly:

| Detected file | Language | Steps |
|---|---|---|
| `package.json` + `biome.json` | TypeScript | biome ci, tests, tsc --noEmit |
| `go.mod` | Go | gofmt, go vet, go test -race |
| `Cargo.toml` | Rust | cargo fmt --check, cargo clippy, cargo test |
| `pyproject.toml` | Python | ruff check, ruff format --check, pytest |
| `mix.exs` | Elixir | mix format --check, mix credo, mix test |
| `*.sh` only | Shell | shellcheck |

The auto-detected pipeline is converted to `code:Pipeline` JSON-LD and
stored alongside the run results. SPARQL can query both explicit and
auto-detected pipelines the same way.

## Why JSON-LD, not YAML

Every entity in the harness is JSON-LD:
- Decisions → `prov:Activity`
- Test runs → `schema:AssessAction`
- Functions → `schema:DefinedTerm`
- Events → `ev:*`
- Deployments → `schema:DeployAction`
- **CI runs → `code:CIRun`**
- **CI pipelines → `code:Pipeline`**

If the pipeline config were YAML, it would need to be parsed, validated
against a schema, and translated into JSON-LD before it could enter the
graph. That's three steps of lossy transformation. With `.ci.jsonld`,
the config file IS the graph node. Zero translation.

This means SPARQL queries like these work directly:

```sparql
# Which repos use Biome?
SELECT ?repo WHERE {
  ?pipeline a code:Pipeline ;
            code:repo ?repo ;
            code:steps ?step .
  ?step code:commands ?cmd .
  FILTER(CONTAINS(?cmd, "biome"))
}

# What images does the harness CI use?
SELECT DISTINCT ?image WHERE {
  ?pipeline a code:Pipeline ;
            code:repo "harness" ;
            code:steps ?step .
  ?step code:image ?image .
}

# Failed CI runs where the pipeline had no test step
SELECT ?run ?repo ?commit WHERE {
  ?run a code:CIRun ;
       code:repo ?repo ;
       code:commitHash ?commit ;
       schema:actionStatus schema:FailedActionStatus ;
       code:pipeline ?pipeline .
  ?pipeline code:steps ?step .
  FILTER NOT EXISTS {
    ?pipeline code:steps ?testStep .
    ?testStep schema:name "test" .
  }
}
```

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

## Integration TODO

- [ ] Add `ci_runs` to `scripts/export-xtdb-triples.ts` table list
- [ ] Add CI query cards to `harness-ui/pages/graph.ts`
- [ ] Add `ci: () => "ci:${randomUUID()}"` to `lib/jsonld/ids.ts`
- [ ] SSH notification on failure (message back to pusher via Soft Serve)
