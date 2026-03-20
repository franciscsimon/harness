#!/bin/bash
# Run all contract tests in order. Fails fast if infrastructure is down.
# Usage: ./scripts/test-contracts.sh

set -e
cd "$(dirname "$0")/.."
export NODE_PATH=xtdb-event-logger/node_modules

echo "╔══════════════════════════════════════════╗"
echo "║     Contract Test Suite                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

TOTAL_PASS=0
TOTAL_FAIL=0

run_test() {
  local name="$1"
  local file="$2"
  echo "━━━ $name ━━━"
  if npx jiti "$file" 2>&1; then
    echo ""
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo ""
    echo "⚠️  $name had failures"
    echo ""
  fi
  TOTAL_PASS=$((TOTAL_PASS + 1))
}

run_test "Phase 1: Infrastructure Health" "test/contracts/infrastructure.ts"
run_test "Phase 2a: Event Logger UI API (:3333)" "test/contracts/api-event-logger.ts"
run_test "Phase 2b: Ops API (:3335)" "test/contracts/api-ops.ts"
run_test "Phase 2c: Harness UI + Web Chat (:3336/:3334)" "test/contracts/api-harness-ui.ts"

echo "╔══════════════════════════════════════════╗"
echo "║  $TOTAL_PASS suites run, $TOTAL_FAIL with failures          ║"
echo "╚══════════════════════════════════════════╝"

[ "$TOTAL_FAIL" -eq 0 ] && exit 0 || exit 1
