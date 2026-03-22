# Docker Event Collector — Progress

## Status: All 4 Phases Complete ✅

## Decisions
- **Architecture**: Standalone service (`docker-event-collector/`)
- **Filtering**: None — capture ALL Docker events (no filtering, query-time filtering instead)
- **Retention**: Indefinite in XTDB
- **Reconnection**: Backfill from `since=<last_seen_ts>` on reconnect
- **Scope**: All Docker events on host (not just harness compose project)

## Phases

### Phase 1: Core Collector ✅
- [ ] `docker-event-collector/package.json` + `server.ts`
- [ ] `collector.ts`: Connect to Docker socket, stream `/events` API (NDJSON)
- [ ] `transform.ts`: Raw Docker event → JSON-LD (`docker:ContainerEvent`)
- [ ] `writer.ts`: Batch write to XTDB `docker_events` table
- [ ] Reconnection logic with `since=<last_seen_timestamp>` backfill
- [ ] Health endpoint (`GET /api/health`) with event stats
- [ ] Dockerfile (node:22-slim + jiti)
- [ ] Add to docker-compose.yml with docker socket mount
- [ ] Add `docker_events` table to `scripts/seed-schema.ts`

### Phase 2: API + QLever ✅
- [ ] `/api/docker-events` endpoint on event-logger-ui (filters: severity, service, action, time range)
- [ ] `/api/docker-events/summary` (counts by severity, top crashing services)
- [ ] Add `docker_events` to `scripts/export-xtdb-triples.ts` for QLever
- [ ] SPARQL query cards: "services that crashed this week", "OOM frequency", "restart loops"

### Phase 3: UI ✅
- [ ] Docker Events page (`/projects/:id/docker-events`) in harness-ui
- [ ] Real-time event feed via SSE (collector → harness-ui)
- [ ] Severity-colored event cards (red=crash, yellow=warning, green=healthy)
- [ ] Container timeline visualization
- [ ] Alert badges on home page for critical/error events
- [ ] Add to project sub-nav

### Phase 4: Alerting ✅
- [ ] Restart loop detection (>3 restarts in 5 min)
- [ ] OOM detection with context
- [ ] Correlate `die` events with deploy timestamps
- [ ] Link to container logs (`docker logs` API)

## JSON-LD Schema
```json
{
  "@type": "docker:ContainerEvent",
  "@id": "docker:evt:<timeNano>-<containerId[:12]>",
  "docker:action": "die",
  "docker:containerName": "keycloak",
  "docker:serviceName": "keycloak",
  "docker:image": "quay.io/keycloak/keycloak:26.2.4",
  "docker:exitCode": 1,
  "docker:severity": "error"
}
```

## XTDB Table: `docker_events`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | text | `docker:evt:<timeNano>-<containerId[:12]>` |
| `event_type` | text | container, image, network, volume |
| `action` | text | die, start, oom, health_status, etc. |
| `container_id` | text | Full container ID |
| `container_name` | text | Human name |
| `service_name` | text | Compose service name (if applicable) |
| `compose_project` | text | Compose project (if applicable) |
| `image` | text | Image reference |
| `exit_code` | bigint | Exit code (on die events) |
| `severity` | text | critical, error, warning, info |
| `attributes` | text | JSON string of all Docker attributes |
| `ts` | bigint | Unix timestamp (ms) |
| `ts_nano` | bigint | Nanosecond precision |
| `jsonld` | text | Full JSON-LD document |
