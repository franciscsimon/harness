#!/bin/sh
# Rotate Garage S3 keys. Called by Infisical rotation scheduler.
set -e
NEW_KEY=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
echo "[rotate-garage] Rotating garage keys..."
infisical secrets set "GARAGE_ACCESS_KEY=${NEW_KEY}" \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --env="${INFISICAL_ENV:-prod}" 2>/dev/null || {
  echo "ERROR: Failed to update garage keys in Infisical"
  exit 1
}
docker compose restart garage 2>/dev/null || true
echo "[rotate-garage] Garage keys rotated successfully"
