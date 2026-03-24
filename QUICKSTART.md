# Quickstart

Get the harness running and build a service using harness tools and agents.

## 0. Install Git Hooks (mandatory)

```bash
task hooks:install
# Or manually: git config core.hooksPath .githooks
```

> **⚠️ Hooks are mandatory.** The pre-commit hook runs Biome lint + format checks and blocks commits with violations. It is installed automatically by `task setup` and `task setup:all`. If you clone fresh, run `task hooks:install` before your first commit. Commits without hooks will be caught by CI anyway, but fixing locally is faster.

## 1. Start Infrastructure

```bash
cd ~/harness

# Start all services (XTDB primary+replica, Redpanda, Garage S3, Keycloak)
docker compose up -d

# Wait for XTDB to be ready (~10s)
until curl -sf http://localhost:8083/status > /dev/null 2>&1; do sleep 1; done

# Seed the schema (registers all 30 tables in XTDB)
NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/seed-schema.ts
```

## 2. Start Services

Open separate terminals for each:

```bash
# Event API (data layer — required for Harness UI)
cd ~/harness/xtdb-event-logger-ui && npm install && npm start
# → http://localhost:3333

# Harness UI (unified dashboard)
cd ~/harness/harness-ui && npm install && npx jiti server.ts
# → http://localhost:3336

# Web Chat (optional — WebSocket chat interface)
cd ~/harness/web-chat && npm install && npx jiti server.ts
# → http://localhost:3334

# Ops API (optional — infrastructure management)
cd ~/harness/xtdb-ops-api && npm install && npx jiti server.ts
# → http://localhost:3335
```

Or use the Taskfile:

```bash
task ui:start        # Start event-logger-ui
task harness:start   # Start harness-ui
task chat:start      # Start web-chat
task ops:start       # Start ops-api
```

## 3. Start pi

```bash
pi
```

Extensions auto-load from `~/.pi/agent/extensions/`. Events flow into XTDB automatically. Open http://localhost:3336 to see them.

## 4. Verify Everything Works

```bash
# Run contract tests (checks infrastructure + all APIs + UI pages)
./scripts/test-contracts.sh
```

Expected: 34 tests across 4 suites, all passing.

## 5. Explore the UI

Open http://localhost:3336 and explore:

| Page | What you'll see |
|------|-----------------|
| **Home** (`/`) | Service health dots (green = up), event stats |
| **Stream** (`/stream`) | Live events flowing in real-time via SSE |
| **Sessions** (`/sessions`) | All agent sessions with health scores |
| **Session Detail** | Click a session → event timeline with context sparkline |
| **Flow** | Click "🔀 Flow" → task/reasoning/result projections |
| **Knowledge** | Click "📝 Knowledge" → extracted session summary |
| **Errors** (`/errors`) | Captured errors by severity and component |
| **Chat** (`/chat`) | Chat with pi agents via WebSocket |

## 6. Build Something (Example)

Give pi a one-line prompt:

```
Build a REST service called hello-service with GET / and GET /hello/:name
```

The harness tools kick in automatically:

1. **`plan_chunks`** breaks it into ordered steps
2. **`delegate → architect`** designs the API (isolated process, writes DESIGN.md)
3. **`delegate → worker`** implements from the design
4. **`quality_check`** verifies code quality on each file
5. **`delegate → tester`** writes and runs tests
6. **`check_alignment`** confirms no drift from goal

Meanwhile, 40 extensions run in the background capturing events, tracking decisions, monitoring context health, and detecting anti-patterns.

### Run the example

```bash
cd ~/harness/examples/hello-service
npm install && npm start   # → http://localhost:3111

curl http://localhost:3111/
# → {"name":"hello-service","version":"1.0.0"}

curl http://localhost:3111/hello/World
# → {"greeting":"Hello, World!"}

npx jiti test.ts           # 5 tests pass
```

## 7. Key Tools

| Tool | What it does |
|------|-------------|
| `plan_chunks` | Break complex tasks into ordered steps |
| `delegate` | Spawn a focused subagent (architect, worker, tester, etc.) |
| `quality_check` | Run code quality checks on a file |
| `diff_check` | Check if staged changes are commit-sized |
| `check_alignment` | Verify work matches original request |
| `log_decision` | Record a decision, failure, or deferral |
| `save_checkpoint` | Save session state before risky changes |
| `set_zoom` | Control response detail level |
| `lookup_docs` | Search and load documentation |

## 8. Querying XTDB Directly

```bash
# Connect (or use any PostgreSQL client on port 5433)
psql -h localhost -p 5433 -d xtdb -U xtdb

# Recent events
SELECT event_name, ts, session_id FROM events ORDER BY seq DESC LIMIT 20;

# Decisions
SELECT task, what, outcome FROM decisions ORDER BY ts DESC LIMIT 10;

# Errors
SELECT component, severity, error_message FROM errors ORDER BY ts DESC LIMIT 10;

# Tool usage
SELECT tool_name, COUNT(*) AS cnt FROM events
WHERE event_name = 'tool_call' GROUP BY tool_name ORDER BY cnt DESC;
```

## Secrets Management (Infisical)

The harness uses environment variables for all credentials. A `.env.example` file lists every required variable with placeholder values.

### Quick Start (env vars only)

```bash
# Copy the example and fill in real values
cp .env.example .env

# Docker Compose reads .env automatically
docker compose up -d
```

### Production Setup (Infisical)

For production, we recommend [Infisical](https://infisical.com/) for centralized secret management:

1. **Deploy Infisical** — add `infisical`, `infisical-db`, `infisical-redis` to docker-compose.yml (see PROGRESS-DEFERRED.md Phase A)
2. **Bootstrap** — run `scripts/infisical-bootstrap.sh` to create the project, environments, and seed secrets
3. **Inject** — wrap service commands with `infisical run --projectId=<id> --env=dev -- node server.js`
4. **Local dev** — `brew install infisical/get-cli/infisical && infisical login && infisical run --env=dev -- npm run dev`

See `PROGRESS-DEFERRED.md` Phase A for the full 35-item implementation checklist.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Column not found" warnings | Run `NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/seed-schema.ts` |
| XTDB nodes not syncing | Both nodes must share Garage S3 storage. Check `docker compose logs xtdb-primary` |
| Harness UI shows no data | Ensure event-logger-ui (:3333) is running — harness-ui fetches from it |
| Chat "New Session" opens wrong page | Update to latest `harness-ui/static/chat.js` |
| Contract tests fail | Start all 4 services first, then run `./scripts/test-contracts.sh` |
