#!/bin/sh
# Rotate Keycloak admin password. Called by Infisical rotation scheduler.
set -e
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
echo "[rotate-keycloak] Rotating keycloak password..."
infisical secrets set "KEYCLOAK_ADMIN_PASSWORD=${NEW_PASSWORD}" \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --env="${INFISICAL_ENV:-prod}" 2>/dev/null || {
  echo "ERROR: Failed to update keycloak password in Infisical"
  exit 1
}
docker compose restart keycloak 2>/dev/null || true
echo "[rotate-keycloak] Keycloak password rotated successfully"
