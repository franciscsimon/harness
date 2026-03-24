#!/bin/sh
# ─── Garage Entrypoint — envsubst for TOML config ─────────────
set -e

CONFIG_TEMPLATE="${GARAGE_CONFIG_TEMPLATE:-/etc/garage.toml.tmpl}"
CONFIG_OUTPUT="${GARAGE_CONFIG:-/etc/garage.toml}"

# Validate required env vars
for var in GARAGE_RPC_SECRET GARAGE_ADMIN_TOKEN; do
  eval val=\$$var
  if [ -z "$val" ]; then
    echo "ERROR: $var must be set" >&2
    exit 1
  fi
done

# Substitute env vars
if command -v envsubst >/dev/null 2>&1; then
  envsubst '${GARAGE_RPC_SECRET} ${GARAGE_ADMIN_TOKEN}' < "$CONFIG_TEMPLATE" > "$CONFIG_OUTPUT"
else
  sed \
    -e "s|\${GARAGE_RPC_SECRET}|${GARAGE_RPC_SECRET}|g" \
    -e "s|\${GARAGE_ADMIN_TOKEN}|${GARAGE_ADMIN_TOKEN}|g" \
    "$CONFIG_TEMPLATE" > "$CONFIG_OUTPUT"
fi

echo "Garage config written to $CONFIG_OUTPUT"
exec /garage server "$@"
