#!/bin/sh
# ─── Infisical Bootstrap ──────────────────────────────────────────
# Creates project, environments, and seeds initial secrets.
# Run after Infisical server is up: ./scripts/infisical-bootstrap.sh
# Requires: INFISICAL_TOKEN or interactive login
set -e

INFISICAL_URL="${INFISICAL_URL:-http://localhost:8180}"
PROJECT_NAME="${INFISICAL_PROJECT:-harness}"

echo "=== Infisical Bootstrap ==="
echo "URL: $INFISICAL_URL"

# Wait for Infisical
echo "Waiting for Infisical..."
until curl -sf "$INFISICAL_URL/api/status" >/dev/null 2>&1; do sleep 2; done
echo "Infisical is up"

# Check if infisical CLI is available
if ! command -v infisical >/dev/null 2>&1; then
  echo "ERROR: infisical CLI not found. Install: brew install infisical/get-cli/infisical"
  exit 1
fi

# Login if no token
if [ -z "$INFISICAL_TOKEN" ]; then
  echo "No INFISICAL_TOKEN set — using interactive login"
  infisical login --domain="$INFISICAL_URL"
fi

# Create project (idempotent — will fail silently if exists)
echo "Creating project '$PROJECT_NAME'..."
infisical projects create --name="$PROJECT_NAME" 2>/dev/null || echo "Project may already exist"

# Seed secrets from .env.example
echo "Seeding secrets from .env.example..."
if [ -f .env.example ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    case "$key" in \#*|"") continue ;; esac
    # Strip inline comments
    value=$(echo "$value" | sed 's/ *#.*//')
    if [ -n "$key" ] && [ -n "$value" ]; then
      infisical secrets set "$key=$value" --env=dev 2>/dev/null || true
    fi
  done < .env.example
  echo "Secrets seeded for dev environment"
else
  echo "WARNING: .env.example not found, skipping secret seeding"
fi

echo ""
echo "=== Bootstrap Complete ==="
echo "Next steps:"
echo "  1. Create prod/staging environments in Infisical UI"
echo "  2. Update secrets with real production values"
echo "  3. Set INFISICAL_TOKEN in CI for automated access"
echo "  4. Wrap service commands: infisical run --env=dev -- <cmd>"

# ── Machine Identities ──────────────────────────────────────────
echo "Creating machine identities..."

create_machine_identity() {
  local name="$1"
  local description="$2"
  curl -s -X POST "${INFISICAL_URL}/api/v1/auth/universal-auth/identities" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${name}\", \"description\": \"${description}\"}" 2>/dev/null || true
}

create_machine_identity "harness-services" "Shared identity for harness-ui, health-prober, docker-event-collector"
create_machine_identity "ci-runner" "CI runner pipeline identity"
create_machine_identity "build-service" "Build service + image scanner identity"
create_machine_identity "monitoring" "Monitoring services (health-prober, log-scanner)"

echo "Machine identities created (retrieve client IDs from Infisical UI)"
