#!/bin/sh
# Generic healthcheck for harness services.
# Usage in Dockerfile: HEALTHCHECK CMD /app/healthcheck.sh http://localhost:PORT/api/health
URL="${1:-http://localhost:3000/api/health}"
wget -q --spider --timeout=5 "$URL" || exit 1
