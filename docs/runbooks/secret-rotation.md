# Secret Rotation Runbook

## Automated Rotation (via Infisical)

When Infisical is deployed, these rotate automatically on a 90-day schedule:

| Secret | Rotation | Impact |
|--------|----------|--------|
| XTDB_PASSWORD | Automatic | All services restart via Infisical CLI |
| GARAGE_ACCESS_KEY / GARAGE_SECRET_KEY | Automatic | XTDB nodes + garage-init restart |
| KEYCLOAK_ADMIN_PASSWORD | Automatic | Keycloak admin access only |

## Manual Rotation: Garage RPC Secret

The Garage RPC secret requires a **coordinated restart** of all Garage nodes simultaneously. It cannot be rotated without downtime.

### Procedure

1. **Schedule maintenance window** (2-5 minutes downtime for S3 storage)

2. **Generate new secret:**
   ```bash
   NEW_RPC_SECRET=$(openssl rand -hex 32)
   echo "New RPC secret: $NEW_RPC_SECRET"
   ```

3. **Stop all Garage nodes:**
   ```bash
   docker compose stop garage
   ```

4. **Update the secret:**
   ```bash
   # If using Infisical:
   infisical secrets set GARAGE_RPC_SECRET="$NEW_RPC_SECRET" --env=prod

   # If using .env:
   sed -i '' "s/GARAGE_RPC_SECRET=.*/GARAGE_RPC_SECRET=$NEW_RPC_SECRET/" .env
   ```

5. **Restart Garage:**
   ```bash
   docker compose up -d garage
   ```

6. **Verify cluster health:**
   ```bash
   docker compose exec garage /garage status
   ```

7. **Verify XTDB can reach S3:**
   ```bash
   curl -sf http://localhost:8083/status | jq .
   ```

## Manual Rotation: XTDB Password

If not using Infisical automatic rotation:

1. **Update password in PostgreSQL:**
   ```sql
   ALTER USER xtdb PASSWORD 'new-password-here';
   ```

2. **Update env var:**
   ```bash
   # .env or Infisical
   XTDB_PASSWORD=new-password-here
   ```

3. **Restart all services that connect to XTDB:**
   ```bash
   docker compose restart xtdb-event-logger-ui harness-ui web-chat xtdb-ops-api ci-runner
   ```

## Post-Rotation Verification

After any rotation, run the contract tests:

```bash
./scripts/test-contracts.sh
```

All 34 tests should pass. If any fail, check service logs:

```bash
docker compose logs --tail=20 <service-name>
```

## Credential Backup

Infisical's own credentials (`ENCRYPTION_KEY`, `AUTH_SECRET`) are set at first boot and **cannot be rotated**. Back them up:

```bash
# Export to encrypted file
infisical export --env=prod --format=dotenv | gpg -c > infisical-backup-$(date +%Y%m%d).env.gpg
```

Store the GPG-encrypted backup offline. If these are lost, Infisical must be redeployed from scratch.
