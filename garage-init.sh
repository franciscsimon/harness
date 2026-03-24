#!/bin/sh
# Idempotent Garage bootstrap: layout, key, bucket

ADMIN="http://garage:3903"
AUTH="Authorization: Bearer ${GARAGE_ADMIN_TOKEN:-admin-secret}"
CT="Content-Type: application/json"
ACCESS_KEY="${GARAGE_ACCESS_KEY:-GK02e8e11dbf9b0325065707e5}"
SECRET_KEY="${GARAGE_SECRET_KEY:-9834ce4f6ac15c899f31534198c3b15b67e0f30939a8911c7939c88e7603dc56}"

apk add --no-cache curl jq >/dev/null 2>&1

echo "Waiting for Garage..."
until curl -sf "$ADMIN/health" >/dev/null 2>&1; do sleep 1; done
echo "Garage is up"

# Layout
NODE_ID=$(curl -sf -H "$AUTH" "$ADMIN/v1/status" | jq -r '.node')
LAYOUT_VER=$(curl -sf -H "$AUTH" "$ADMIN/v1/layout" | jq -r '.version')
if [ "$LAYOUT_VER" = "0" ]; then
  echo "Assigning layout..."
  curl -s -H "$AUTH" -H "$CT" -X POST "$ADMIN/v1/layout" \
    -d "[{\"id\":\"$NODE_ID\",\"zone\":\"dc1\",\"capacity\":1073741824,\"tags\":[\"main\"]}]" >/dev/null
  curl -s -H "$AUTH" -H "$CT" -X POST "$ADMIN/v1/layout/apply" -d '{"version":1}' >/dev/null
  sleep 2
  echo "Layout applied"
else
  echo "Layout OK (v$LAYOUT_VER)"
fi

# Key
KEY_COUNT=$(curl -s -H "$AUTH" "$ADMIN/v1/key" | jq '[.[] | select(.accessKeyId=="'"$ACCESS_KEY"'")] | length')
if [ "$KEY_COUNT" = "0" ]; then
  echo "Importing key..."
  curl -s -H "$AUTH" -H "$CT" -X POST "$ADMIN/v1/key/import" \
    -d "{\"accessKeyId\":\"$ACCESS_KEY\",\"secretAccessKey\":\"$SECRET_KEY\",\"name\":\"xtdb-key\"}" >/dev/null
  echo "Key imported"
else
  echo "Key OK"
fi

# Bucket
BUCKET_ID=$(curl -s -H "$AUTH" "$ADMIN/v1/bucket?alias=xtdb" | jq -r '.id // empty' 2>/dev/null)
if [ -z "$BUCKET_ID" ]; then
  echo "Creating bucket..."
  BUCKET_ID=$(curl -s -H "$AUTH" -H "$CT" -X POST "$ADMIN/v1/bucket" \
    -d '{"globalAliases":["xtdb"]}' | jq -r '.id')
  curl -s -H "$AUTH" -X PUT "$ADMIN/v1/bucket/alias/global?id=$BUCKET_ID&alias=xtdb" >/dev/null
  curl -s -H "$AUTH" -H "$CT" -X POST "$ADMIN/v1/bucket/allow" \
    -d "{\"bucketId\":\"$BUCKET_ID\",\"accessKeyId\":\"$ACCESS_KEY\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" >/dev/null
  echo "Bucket created: $BUCKET_ID"
else
  echo "Bucket OK: $BUCKET_ID"
fi

echo "=== Garage ready ==="
