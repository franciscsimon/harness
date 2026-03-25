#!/bin/sh
# Infisical CLI wrapper — injects secrets before running the service command.
# Usage: entrypoint in docker-compose: ["sh", "/scripts/infisical-wrapper.sh", "npx", "jiti", "server.ts"]
#
# Requires: INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID env vars
# Falls back to plain execution if Infisical is unavailable.

if command -v infisical >/dev/null 2>&1 && [ -n "$INFISICAL_CLIENT_ID" ]; then
  echo "[infisical-wrapper] Injecting secrets from Infisical..."
  exec infisical run \
    --client-id="$INFISICAL_CLIENT_ID" \
    --client-secret="$INFISICAL_CLIENT_SECRET" \
    --projectId="$INFISICAL_PROJECT_ID" \
    --env="${INFISICAL_ENV:-prod}" \
    -- "$@"
else
  echo "[infisical-wrapper] Infisical not available, running without secret injection"
  exec "$@"
fi
