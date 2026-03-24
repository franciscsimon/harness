#!/usr/bin/env bash
# ── Harness Status ─────────────────────────────────────────────
# Shows enabled/disabled state of all infrastructure, app services,
# and pi resources. Designed for quick orientation on session start.
#
# Usage: task status   (or: bash scripts/status.sh)
set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { printf "  ${GREEN}✓${RESET} %-28s %s\n" "$1" "$2"; }
fail() { printf "  ${RED}✗${RESET} %-28s %s\n" "$1" "$2"; }
warn() { printf "  ${YELLOW}~${RESET} %-28s %s\n" "$1" "$2"; }
skip() { printf "  ${DIM}-${RESET} %-28s %s\n" "$1" "$2"; }

# ── Docker container check ─────────────────────────────────────
# Args: container_name display_name
check_container() {
  local container="$1"
  local label="${2:-$1}"
  local state health

  state=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null) || {
    fail "$label" "not found"
    return
  }

  if [ "$state" != "running" ]; then
    fail "$label" "$state"
    return
  fi

  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null) || health="unknown"

  case "$health" in
    healthy)  ok   "$label" "running (healthy)" ;;
    none)     ok   "$label" "running" ;;
    starting) warn "$label" "running (starting)" ;;
    *)        warn "$label" "running ($health)" ;;
  esac
}

# ── HTTP endpoint check ────────────────────────────────────────
# Args: url label [timeout]
check_http() {
  local url="$1"
  local label="$2"
  local timeout="${3:-2}"

  if curl -sf --connect-timeout "$timeout" --max-time "$timeout" "$url" >/dev/null 2>&1; then
    ok "$label" "$url"
  else
    fail "$label" "$url"
  fi
}

# ── TCP port check ─────────────────────────────────────────────
check_tcp() {
  local host="$1"
  local port="$2"
  local label="$3"

  if nc -z -w2 "$host" "$port" 2>/dev/null; then
    ok "$label" "$host:$port"
  else
    fail "$label" "$host:$port"
  fi
}

# ── Directory/file existence check ─────────────────────────────
check_dir() {
  local path="$1"
  local label="$2"

  if [ -d "$path" ]; then
    local count
    count=$(ls -1 "$path" 2>/dev/null | wc -l | tr -d ' ')
    ok "$label" "$count items in $(echo "$path" | sed "s|$HOME|~|")"
  else
    fail "$label" "not found"
  fi
}

# ════════════════════════════════════════════════════════════════
echo ""
printf "${BOLD}Harness Status${RESET}  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')${RESET}\n"
echo ""

# ── 1. Docker daemon ──────────────────────────────────────────
printf "${BOLD}Docker${RESET}\n"
if docker info >/dev/null 2>&1; then
  ok "docker daemon" "running"
else
  fail "docker daemon" "not running — infrastructure services unavailable"
  echo ""
  printf "${BOLD}Skipping Docker service checks.${RESET}\n"
  DOCKER_OK=false
fi
DOCKER_OK=${DOCKER_OK:-true}

# ── 2. Infrastructure services (Docker) ───────────────────────
if [ "$DOCKER_OK" = true ]; then
  echo ""
  printf "${BOLD}Infrastructure${RESET}\n"
  check_container caddy          "Caddy (reverse proxy)"
  check_container redpanda       "Redpanda (Kafka)"
  check_container garage         "Garage (S3 store)"
  check_container xtdb-events    "XTDB Primary"
  check_container xtdb-replica   "XTDB Replica"
  check_container keycloak       "Keycloak (auth)"
  check_container qlever         "QLever (SPARQL)"
  check_container soft-serve     "Soft Serve (Git)"
  check_container zot            "Zot (OCI registry)"

  # ── 3. App services (Docker) ──────────────────────────────────
  echo ""
  printf "${BOLD}App Services (Docker)${RESET}\n"
  check_container event-api              "Event API"
  check_container chat-ws                "Chat WebSocket"
  check_container ops-api                "Ops API"
  check_container harness-ui             "Harness UI"
  check_container ci-runner              "CI Runner"
  check_container docker-event-collector "Docker Event Collector"
  check_container build-service          "Build Service"
fi

# ── 4. Local dev services (process-compose) ───────────────────
echo ""
printf "${BOLD}Local Dev Services${RESET}\n"
check_http "http://localhost:3333/api/stats"  "Event API (local)"    1
check_http "http://localhost:3334/"            "Chat WS (local)"     1
check_http "http://localhost:3335/api/health"  "Ops API (local)"     1
check_http "http://localhost:3336/"            "Harness UI (local)"  1
check_http "http://localhost:3337/api/health"  "CI Runner (local)"   1

# ── 5. XTDB connectivity ──────────────────────────────────────
echo ""
printf "${BOLD}XTDB Connectivity${RESET}\n"
check_tcp localhost 5433 "Primary pgwire"
check_tcp localhost 5434 "Replica pgwire"
check_http "http://localhost:8083/healthz/alive" "Primary HTTP"  2
check_http "http://localhost:8084/healthz/alive" "Replica HTTP"  2

if command -v psql >/dev/null 2>&1 && nc -z localhost 5433 2>/dev/null; then
  COUNT=$(PGPASSWORD=xtdb psql -h localhost -p 5433 -U xtdb -d xtdb -Atqc "SELECT COUNT(*) FROM events" 2>/dev/null) || COUNT="?"
  ok "Event count" "$COUNT events"
else
  skip "Event count" "psql unavailable or XTDB down"
fi

# ── 6. Pi resources ───────────────────────────────────────────
echo ""
printf "${BOLD}Pi Resources${RESET}\n"
PI_DIR="$HOME/.pi/agent"

check_dir "$PI_DIR/extensions"  "Extensions"
check_dir "$PI_DIR/agents"      "Agents"
check_dir "$PI_DIR/skills"      "Skills"
check_dir "$PI_DIR/prompts"     "Prompts"

# List extensions with quick health
if [ -d "$PI_DIR/extensions" ]; then
  echo ""
  printf "${BOLD}Deployed Extensions${RESET}\n"
  for ext in "$PI_DIR/extensions"/*/; do
    [ -d "$ext" ] || continue
    name=$(basename "$ext")
    if [ -f "$ext/package.json" ]; then
      has_pi=$(node -e "const p=require('$ext/package.json'); process.exit(p.pi?.extensions ? 0 : 1)" 2>/dev/null) && \
        ok "$name" "extension" || \
        skip "$name" "lib (no pi.extensions)"
    elif [ -d "$ext/node_modules" ]; then
      ok "$name" "installed"
    else
      warn "$name" "no package.json"
    fi
  done
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
printf "${DIM}Run 'task doctor' for deep XTDB diagnostics${RESET}\n"
printf "${DIM}Run 'task smoke' for full deployment verification${RESET}\n"
echo ""
