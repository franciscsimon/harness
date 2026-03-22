# Docker Event Collector — Exploration

## Goal

Collect Docker container lifecycle events in real-time, transform them into JSON-LD, and store them in XTDB — the same pattern used for pi.dev coding session events. This gives us:

- **Crash detection**: know immediately when a service dies (`die`, `oom`, `kill`)
- **Lifecycle history**: full audit trail of container starts, stops, restarts, health changes
- **Correlation**: link container events to deployments, CI runs, and coding sessions via timestamps and JSON-LD
- **Alerting**: surface unhealthy containers on the stream page and home page in real-time

## Docker Events API

### Source: `/var/run/docker.sock`

Docker exposes a streaming events API via the Unix socket:

```
GET /v1.43/events?since=<timestamp>&filters={"type":["container"]}
```

This returns a **newline-delimited JSON stream** (NDJSON) that stays open forever — each event is a JSON object as it happens.

### Event Types We Care About

| Type | Action | Significance |
|------|--------|-------------|
| `container` | `create` | New container created |
| `container` | `start` | Container started |
| `container` | `stop` | Graceful stop |
| `container` | `die` | **Container exited** (includes exit code) |
| `container` | `kill` | Container killed (signal) |
| `container` | `oom` | **Out of memory** — critical |
| `container` | `restart` | Container restarted (by restart policy) |
| `container` | `health_status` | Health check changed (healthy/unhealthy) |
| `container` | `destroy` | Container removed |
| `container` | `pause` / `unpause` | Container paused/resumed |
| `image` | `pull` | Image pulled (relevant for deploys) |
| `image` | `delete` | Image removed |
| `network` | `connect` / `disconnect` | Network topology changes |

### Event Data Structure (from real output)

```json
{
  "Type": "container",
  "Action": "die",
  "Actor": {
    "ID": "e0f37f52fc33...",
    "Attributes": {
      "com.docker.compose.project": "harness",
      "com.docker.compose.service": "keycloak",
      "exitCode": "1",
      "image": "quay.io/keycloak/keycloak:26.2.4",
      "name": "keycloak"
    }
  },
  "scope": "local",
  "time": 1774203462,
  "timeNano": 1774203462027625510
}
```

Key attributes automatically included by Docker Compose:
- `com.docker.compose.project` → "harness"
- `com.docker.compose.service` → service name
- `com.docker.compose.config-hash` → config identity
- `name` → container name
- `image` → image reference
- `exitCode` → on die/exec_die events

### Filtering

The API supports server-side filtering to reduce noise:
```
filters={"type":["container","image"],"event":["start","stop","die","kill","oom","restart","health_status","pull"]}
```

This eliminates the noisy `exec_create`/`exec_start`/`exec_die` events from health checks.

## JSON-LD Schema Design

Following our existing patterns from `lib/jsonld/context.ts`:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "code": "https://pi.dev/code/",
    "docker": "https://pi.dev/docker/"
  },
  "@type": "docker:ContainerEvent",
  "@id": "docker:evt:<timeNano>-<containerID[:12]>",
  "schema:name": "container.die",
  "docker:eventType": "container",
  "docker:action": "die",
  "docker:containerId": "e0f37f52fc33...",
  "docker:containerName": "keycloak",
  "docker:serviceName": "keycloak",
  "docker:composeProject": "harness",
  "docker:image": "quay.io/keycloak/keycloak:26.2.4",
  "docker:exitCode": 1,
  "docker:severity": "error",
  "schema:dateCreated": "2026-03-22T18:17:42.027Z",
  "code:timestamp": 1774203462027
}
```

### Severity Classification

| Action | Severity | Rationale |
|--------|----------|-----------|
| `oom` | `critical` | Memory exhaustion — needs immediate attention |
| `die` (exitCode != 0) | `error` | Crash — service went down unexpectedly |
| `die` (exitCode == 0) | `info` | Graceful shutdown |
| `kill` | `warning` | Forced termination |
| `health_status: unhealthy` | `warning` | Health check failing |
| `health_status: healthy` | `info` | Recovery |
| `restart` | `warning` | Auto-restart triggered |
| `start` / `stop` | `info` | Normal lifecycle |
| `create` / `destroy` | `info` | Container lifecycle |
| `pull` | `info` | Image update |

## XTDB Table: `docker_events`

```sql
CREATE TABLE docker_events (
  _id           TEXT,      -- 'docker:evt:<timeNano>-<containerId[:12]>'
  event_type    TEXT,      -- 'container', 'image', 'network'
  action        TEXT,      -- 'die', 'start', 'oom', 'health_status', etc.
  container_id  TEXT,      -- full container ID
  container_name TEXT,     -- human name (e.g. 'keycloak')
  service_name  TEXT,      -- compose service name
  compose_project TEXT,    -- 'harness'
  image         TEXT,      -- image reference
  exit_code     BIGINT,    -- exit code (on die events)
  severity      TEXT,      -- 'critical', 'error', 'warning', 'info'
  attributes    TEXT,      -- JSON string of full attributes
  ts            BIGINT,    -- unix timestamp (ms)
  ts_nano       BIGINT,    -- nanosecond precision timestamp
  jsonld        TEXT       -- full JSON-LD document
);
```

## Architecture Options

### Option A: Standalone Service (`docker-event-collector`)

A new service in docker-compose.yml that:
1. Connects to Docker socket (mount `/var/run/docker.sock`)
2. Streams events via Docker API (`GET /events`)
3. Transforms each event to JSON-LD
4. Writes to XTDB via postgres wire protocol
5. Optionally POSTs to harness-ui `/api/ci/notify` for SSE propagation

**Pros**: Clean separation, restartable independently, own failure domain
**Cons**: Another container to manage (14th), another service codebase

### Option B: Integrated into harness-ui

Add event collection as a background worker in harness-ui (which already has docker socket mount):
1. On startup, open streaming connection to Docker socket
2. Parse NDJSON stream
3. Insert into XTDB via event-api
4. Push to SSE stream for real-time UI updates

**Pros**: No new service, events immediately available in SSE stream, fewer moving parts
**Cons**: Couples collection to UI server, if harness-ui crashes we lose events until restart

### Option C: Integrated into ops-api

Add to ops-api (which already does Docker health checks and has socket mount):
1. Background streaming from Docker events API
2. Write to XTDB directly (ops-api already has postgres connection)
3. Expose via `/api/docker-events` endpoint

**Pros**: Ops-api is the right domain (infrastructure monitoring), already has socket
**Cons**: ops-api is currently stateless/lightweight

### Recommendation: Option A (Standalone)

Follows the same pattern as all other harness services — standalone, restartable, single responsibility. The collector can crash and restart without affecting the UI or ops API. It mirrors how the CI runner is a standalone service for CI concerns.

## Implementation Plan

### Phase 1: Core Collector
- [ ] Create `docker-event-collector/` service directory
- [ ] `server.ts`: Connect to Docker socket, stream events API
- [ ] `transform.ts`: Raw Docker event → JSON-LD
- [ ] `writer.ts`: Batch write to XTDB `docker_events` table
- [ ] Dockerfile (node:22-slim + docker socket mount)
- [ ] Add to docker-compose.yml

### Phase 2: XTDB + API
- [ ] Add `docker_events` table to seed-schema.ts
- [ ] Add `/api/docker-events` endpoint to event-logger-ui
- [ ] Filters: severity, service, action, time range
- [ ] Add to QLever triple export

### Phase 3: UI Integration
- [ ] Docker Events page in harness-ui (`/projects/:id/docker-events`)
- [ ] Real-time event feed (SSE from collector → harness-ui)
- [ ] Severity-colored event cards (red=crash, yellow=warning, green=healthy)
- [ ] Container timeline visualization
- [ ] Alert badges on home page for critical/error events

### Phase 4: Alerting & Correlation
- [ ] Correlate `die` events with deploy timestamps (was this expected?)
- [ ] Auto-detect restart loops (>3 restarts in 5 min)
- [ ] OOM detection with memory stats context
- [ ] Link to container logs (docker logs API)
- [ ] SPARQL queries: "services that crashed this week", "OOM frequency by service"

## Decisions (Resolved)

1. **Event filtering**: **No filtering** — capture ALL event types including `exec_*`. Full audit trail, can always filter at query time.

2. **Retention**: **Indefinite** in XTDB, same as other events. XTDB is the record of truth once Docker's ~24h buffer expires.

3. **Reconnection**: **Yes, backfill** — on reconnect, use `since=<last_seen_timestamp>` to catch events missed during downtime.

4. **Scope**: **All Docker events on host** — not filtered by compose project. Captures everything: harness containers, CI step containers, manual docker runs, etc.

## Implementation Notes

- Docker socket streaming uses HTTP chunked transfer encoding — just `fetch()` the `/events` endpoint and read the `ReadableStream`
- Node.js can connect to Unix sockets via `http.request({ socketPath: '/var/run/docker.sock' })`
- The `timeNano` field gives nanosecond precision — useful for ordering events that happen in the same second
- Docker Desktop on macOS retains events for ~24h, so backfill on restart is possible
- The `com.docker.compose.*` labels are automatically added by Docker Compose — no configuration needed
