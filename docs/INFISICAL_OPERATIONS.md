# Infisical Operations Guide

## Service Architecture
- **infisical**: Main server (port 8080)
- **infisical-db**: PostgreSQL 16 (stores encrypted secrets)
- **infisical-redis**: Redis 7 (session cache)
- **Caddy**: Reverse proxy at `/infisical`

## Machine Identities
| Identity | Services | Scope |
|----------|----------|-------|
| harness-services | harness-ui, health-prober, docker-event-collector | Read production secrets |
| ci-runner | ci-runner | Read CI secrets, inject into pipelines |
| build-service | build-service, image-scanner | Read build/registry secrets |
| monitoring | health-prober, log-scanner | Read monitoring config |

## Secret Rotation
Configured in `config/infisical-rotation.json`:
- XTDB_PASSWORD: 90 days
- GARAGE_ACCESS_KEY: 90 days
- KEYCLOAK_ADMIN_PASSWORD: 90 days

Rotation scripts: `scripts/rotate-{xtdb,garage,keycloak}-password.sh`

Alert on failure → SSE to harness-ui `/api/ci/notify`

## Access Policies
- **dev**: Read-only for all identities, write for admin
- **staging**: Read for service identities, no write
- **prod**: Read for specific service identities only

Configure via Infisical UI at `/infisical` or API.

## Audit Logging
Infisical logs all secret access. View at:
- Infisical UI → Audit Log
- API: `GET /api/v1/audit-logs`

## Break-Glass Procedure
If Infisical is down:
1. Services fall back to `.env` file (via `infisical-wrapper.sh`)
2. Emergency: `docker exec infisical-db psql -U infisical -c "SELECT * FROM secrets"`
3. Restore from backup: `ENCRYPTION_KEY` and `AUTH_SECRET` must match original

## Backup
```bash
# Backup Infisical DB
docker exec infisical-db pg_dump -U infisical infisical > backup-$(date +%Y%m%d).sql

# CRITICAL: Also backup these values (stored in .env, never in Git)
# - ENCRYPTION_KEY
# - AUTH_SECRET
```

## Local Development
```bash
# Install Infisical CLI
brew install infisical/tap/infisical

# Login and run with secrets
infisical login
task dev:secrets
# or: infisical run --env=dev -- task dev
```
