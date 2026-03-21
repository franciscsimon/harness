#!/bin/bash
# qlever-index.sh — Build QLever index from harness-graph.ttl
#
# Uses qlever-index binary directly via docker exec.
# After indexing, restarts the qlever container to serve the new index.
#
# Usage: ./scripts/qlever-index.sh
# Requires: data/harness-graph.ttl (present), docker

set -euo pipefail

TTL_FILE="data/harness-graph.ttl"

if [ ! -f "$TTL_FILE" ]; then
  echo "❌ $TTL_FILE not found. Run the export scripts first:"
  echo "   NODE_PATH=xtdb-projector/node_modules npx jiti scripts/parse-call-graph.ts"
  echo "   NODE_PATH=xtdb-event-logger/node_modules npx jiti scripts/export-xtdb-triples.ts"
  exit 1
fi

# Ensure container exists
docker compose up -d --no-recreate qlever 2>/dev/null || true

echo "=== Copying TTL into qlever container ==="
docker cp "$TTL_FILE" qlever:/data/harness.ttl

echo "=== Writing settings file ==="
docker exec qlever sh -c 'cat > /data/settings.json << EOF
{"languages-internal": [], "ascii-prefixes-only": true, "num-triples-per-batch": 100000}
EOF'

echo "=== Building index with qlever-index binary ==="
docker exec qlever /qlever/qlever-index \
  -i /data/harness \
  -f /data/harness.ttl \
  -F ttl \
  -s /data/settings.json

echo "=== Restarting qlever to serve new index ==="
docker restart qlever

# Wait for server to be ready
echo -n "Waiting for SPARQL endpoint"
for i in $(seq 1 15); do
  if curl -sf http://localhost:7001/ --data-urlencode 'query=SELECT * WHERE { ?s ?p ?o } LIMIT 1' >/dev/null 2>&1; then
    echo " ready!"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "✅ QLever SPARQL endpoint ready at http://localhost:7001"
echo ""
# Count triples
RESULT=$(curl -s http://localhost:7001/ --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }' -H "Accept: application/json" 2>/dev/null)
COUNT=$(echo "$RESULT" | grep -o '"value":"[0-9]*"' | head -1 | grep -o '[0-9]*')
echo "   Total triples: ${COUNT:-unknown}"
