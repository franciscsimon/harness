#!/bin/sh
# ─── XTDB Entrypoint — envsubst for YAML config ───────────────
# XTDB YAML configs don't support env var expansion natively.
# This script substitutes ${GARAGE_ACCESS_KEY} and ${GARAGE_SECRET_KEY}
# in the YAML template before starting XTDB.
set -e

CONFIG_TEMPLATE="${XTDB_CONFIG_TEMPLATE:-/etc/xtdb/node.yaml.tmpl}"
CONFIG_OUTPUT="${XTDB_CONFIG:-/etc/xtdb/node.yaml}"

# Validate required env vars
if [ -z "$GARAGE_ACCESS_KEY" ] || [ -z "$GARAGE_SECRET_KEY" ]; then
  echo "ERROR: GARAGE_ACCESS_KEY and GARAGE_SECRET_KEY must be set" >&2
  exit 1
fi

# Substitute env vars in YAML template
if command -v envsubst >/dev/null 2>&1; then
  envsubst '${GARAGE_ACCESS_KEY} ${GARAGE_SECRET_KEY}' < "$CONFIG_TEMPLATE" > "$CONFIG_OUTPUT"
else
  # Fallback: simple sed replacement
  sed \
    -e "s|\${GARAGE_ACCESS_KEY}|${GARAGE_ACCESS_KEY}|g" \
    -e "s|\${GARAGE_SECRET_KEY}|${GARAGE_SECRET_KEY}|g" \
    "$CONFIG_TEMPLATE" > "$CONFIG_OUTPUT"
fi

echo "XTDB config written to $CONFIG_OUTPUT"

# Start XTDB with the generated config
exec java -jar /app/xtdb.jar --config "$CONFIG_OUTPUT" "$@"
