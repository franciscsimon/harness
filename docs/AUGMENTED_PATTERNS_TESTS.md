# Augmented Coding Patterns — Test Plan

> Tests for the 6 features defined in `AUGMENTED_PATTERNS.md`.
> Three testing layers: **seed data** (synthetic events for deterministic tests),
> **unit tests** (logic in isolation), **integration tests** (live XTDB + UI + extensions).
> References: `AUGMENTED_PATTERNS.md`, `TEST.md`, `SESSION_GROUPING.md`

---

## Table of Contents

- [T0. Test Infrastructure](#t0-test-infrastructure)
- [T1. Feature 1: Context Markers in UI](#t1-feature-1-context-markers-in-ui)
- [T2. Feature 2: Focused Agent Templates](#t2-feature-2-focused-agent-templates)
- [T3. Feature 3: Canary Metrics](#t3-feature-3-canary-metrics)
- [T4. Feature 4: Habit Hooks](#t4-feature-4-habit-hooks)
- [T5. Feature 5: Session Health Dashboard](#t5-feature-5-session-health-dashboard)
- [T6. Feature 6: Knowledge Extraction](#t6-feature-6-knowledge-extraction)
- [Appendix A. Seed Data Scenarios](#appendix-a-seed-data-scenarios)
- [Appendix B. Test Execution Checklist](#appendix-b-test-execution-checklist)

---

## T0. Test Infrastructure

### T0.1 Prerequisites

```bash
# XTDB running
docker ps --filter name=xtdb-events --format "{{.Status}}"
# Expected: "Up ... (healthy)"

# UI server running
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/
# Expected: 200

# Existing test data present
curl -s http://localhost:3333/api/stats | python3 -m json.tool
# Expected: eventCount >= 35
```

### T0.2 Seed Data Strategy

Many features need specific event patterns that may not exist in test data.
Each feature section defines seed scenarios. Seed events are inserted directly
into XTDB via the `postgres` driver, reusing the same schema the logger uses.

**Seed helper:**

```typescript
// test/seed.ts — reusable seed insertion
import postgres from "postgres";

const sql = postgres({ host: "localhost", port: 5433, database: "xtdb", username: "xtdb" });

interface SeedEvent {
  event_name: string;
  category: string;
  session_id: string;
  seq: number;
  ts: number;
  // optional columns
  context_msg_count?: number;
  provider_payload_bytes?: number;
  tool_name?: string;
  tool_call_id?: string;
  is_error?: boolean;
  turn_index?: number;
  bash_command?: string;
  agent_end_msg_count?: number;
  [key: string]: unknown;
}

export async function seedSession(sessionId: string, events: SeedEvent[]) {
  for (const ev of events) {
    await sql`INSERT INTO events (_id, environment, event_name, category,
      can_intercept, ts, seq, session_id, cwd,
      context_msg_count, provider_payload_bytes,
      tool_name, tool_call_id, is_error, turn_index,
      bash_command, agent_end_msg_count)
    VALUES (
      ${crypto.randomUUID()}, 'pi.dev', ${ev.event_name}, ${ev.category},
      ${false}, ${ev.ts}, ${ev.seq}, ${ev.session_id}, ${'/test/cwd'},
      ${ev.context_msg_count ?? null}, ${ev.provider_payload_bytes ?? null},
      ${ev.tool_name ?? null}, ${ev.tool_call_id ?? null}, ${ev.is_error ?? null},
      ${ev.turn_index ?? null}, ${ev.bash_command ?? null},
      ${ev.agent_end_msg_count ?? null}
    )`;
  }
}

export async function close() { await sql.end(); }
```

### T0.3 Seed Data Sessions

Each feature gets a dedicated test session ID so tests don't interfere:

| Session ID | Feature | Description |
|-----------|---------|-------------|
| `/test/ctx-markers-healthy` | F1 | Session with small, stable context |
| `/test/ctx-markers-bloated` | F1 | Session with context growing into rot zone |
| `/test/ctx-markers-compacted` | F1 | Session with compaction event resetting context |
| `/test/canary-thrashing` | F3 | Session with high tool error rate |
| `/test/canary-inflated` | F3 | Session with many turns per agent run |
| `/test/canary-retry-storm` | F3 | Session with repeated identical tool calls |
| `/test/canary-healthy` | F3 | Session with normal metrics (no alerts) |
| `/test/habit-no-commit` | F4 | Session with many edits but no git commit |
| `/test/habit-no-test` | F4 | Session with file writes but no test runs |
| `/test/habit-error-streak` | F4 | Session with 3+ consecutive tool errors |
| `/test/habit-scope-creep` | F4 | Session touching 10+ unique files |
| `/test/dashboard-mixed` | F5 | Multiple sessions with varying health |
| `/test/knowledge-rich` | F6 | Session with diverse tool usage for extraction |

---

## T1. Feature 1: Context Markers in UI

### T1.1 Context Metrics Query

**Goal:** `getSessionContextMetrics()` returns correct running totals.

**Seed:** `/test/ctx-markers-bloated` — a session where `provider_payload_bytes`
grows from 30KB → 100KB → 200KB → 350KB across 8 `before_provider_request` events,
with `context_msg_count` growing from 5 → 50 across matching `context` events.

```
#0  session_start              [session]
#1  turn_start                 [agent]    turn_index=0
#2  context                    [tool]     context_msg_count=5
#3  before_provider_request    [tool]     provider_payload_bytes=30000
#4  tool_execution_start       [tool]
#5  tool_execution_end         [tool]
#6  turn_end                   [agent]    turn_index=0
#7  turn_start                 [agent]    turn_index=1
#8  context                    [tool]     context_msg_count=15
#9  before_provider_request    [tool]     provider_payload_bytes=65000
#10 turn_end                   [agent]    turn_index=1
#11 turn_start                 [agent]    turn_index=2
#12 context                    [tool]     context_msg_count=30
#13 before_provider_request    [tool]     provider_payload_bytes=110000
#14 turn_end                   [agent]    turn_index=2
#15 turn_start                 [agent]    turn_index=3
#16 context                    [tool]     context_msg_count=50
#17 before_provider_request    [tool]     provider_payload_bytes=200000
#18 turn_end                   [agent]    turn_index=3
#19 turn_start                 [agent]    turn_index=4
#20 context                    [tool]     context_msg_count=65
#21 before_provider_request    [tool]     provider_payload_bytes=350000
#22 turn_end                   [agent]    turn_index=4
#23 agent_end                  [agent]
```

**Verify:**

```bash
# API returns events with context data
curl -s "http://localhost:3333/api/sessions/$(urlencode '/test/ctx-markers-bloated')/events" | \
  python3 -c "
import sys, json
events = json.load(sys.stdin)
ctx_events = [e for e in events if e.get('contextMsgCount') or e.get('providerPayloadBytes')]
for e in ctx_events:
    print(f'#{e[\"seq\"]} {e[\"eventName\"]}: msgs={e.get(\"contextMsgCount\",\"-\")} bytes={e.get(\"providerPayloadBytes\",\"-\")}')
print(f'Total context events: {len(ctx_events)}')
"
```

**Expected:** 10 events (5 `context` + 5 `before_provider_request`) with growing values.

**Pass:** All context metric events returned with correct values.

---

### T1.2 Context Data Attributes in HTML

**Goal:** Session detail page renders `data-ctx-msgs` and `data-ctx-bytes` on events.

**Verify:**

```bash
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep -oE 'data-ctx-msgs="[^"]*"|data-ctx-bytes="[^"]*"' | sort -u
```

**Expected:**
```
data-ctx-bytes="30000"
data-ctx-bytes="65000"
data-ctx-bytes="110000"
data-ctx-bytes="200000"
data-ctx-bytes="350000"
data-ctx-msgs="5"
data-ctx-msgs="15"
data-ctx-msgs="30"
data-ctx-msgs="50"
data-ctx-msgs="65"
```

**Pass:** All 10 data attributes present with correct values.

---

### T1.3 Sparkline Rendering

**Goal:** SVG sparkline appears at top of session detail page.

**Verify:**

```bash
# Sparkline SVG element exists
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep -c 'class="ctx-sparkline"'
# Expected: 1

# Has data points (polyline or path)
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep -oE '<(polyline|path|line)[^>]*ctx-spark' | head -3
```

**Pass:** Sparkline SVG present with data points.

---

### T1.4 Context Health Colors

**Goal:** Events are color-coded by context health.

**Verify (in HTML):**

```bash
# Green zone (< 50KB)
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep 'data-ctx-bytes="30000"' | grep -o 'ctx-health-[a-z]*'
# Expected: ctx-health-green

# Yellow zone (50-100KB)
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep 'data-ctx-bytes="65000"' | grep -o 'ctx-health-[a-z]*'
# Expected: ctx-health-yellow

# Red zone (> 100KB)
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep 'data-ctx-bytes="350000"' | grep -o 'ctx-health-[a-z]*'
# Expected: ctx-health-red
```

**Pass:** Correct color classes applied at each threshold.

---

### T1.5 Context Rot Zone Marker

**Goal:** Events after payload exceeds 100KB get the rot zone indicator.

**Verify:**

```bash
# Count events with rot zone class
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-bloated')" | \
  grep -c 'ctx-rot-zone'
# Expected: > 0 (events after seq #13 where bytes first exceeded 100KB)
```

**Pass:** Rot zone markers appear on events after the 100KB threshold.

---

### T1.6 Compaction Reset Line

**Goal:** Compaction events show as vertical reset lines in the sparkline.

**Seed:** `/test/ctx-markers-compacted` — session with context growing to 200KB,
then `session_compact` event, then context dropping back to 30KB.

```
#0  session_start
#1  context                    context_msg_count=10
#2  before_provider_request    provider_payload_bytes=50000
#3  context                    context_msg_count=40
#4  before_provider_request    provider_payload_bytes=200000
#5  session_before_compact     compact_tokens=5000
#6  session_compact            compact_from_ext=false
#7  context                    context_msg_count=5
#8  before_provider_request    provider_payload_bytes=30000
```

**Verify:**

```bash
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-compacted')" | \
  grep -c 'ctx-compact-reset'
# Expected: 1 (one compaction event)
```

**Pass:** Compaction shows as a visual reset in the sparkline.

---

### T1.7 Healthy Session Has No Warnings

**Seed:** `/test/ctx-markers-healthy` — session where `provider_payload_bytes`
never exceeds 40KB.

**Verify:**

```bash
curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-healthy')" | \
  grep -c 'ctx-rot-zone'
# Expected: 0

curl -s "http://localhost:3333/sessions/$(urlencode '/test/ctx-markers-healthy')" | \
  grep -c 'ctx-health-red'
# Expected: 0
```

**Pass:** No rot zone markers, no red indicators.

---

## T2. Feature 2: Focused Agent Templates

### T2.1 Template Files Exist

**Verify:**

```bash
ls -1 harness/templates/*.md
```

**Expected:**

```
harness/templates/committer.md
harness/templates/reviewer.md
harness/templates/refactorer.md
harness/templates/debugger.md
harness/templates/planner.md
```

**Pass:** All 5 template files exist.

---

### T2.2 Template Structure

**Goal:** Each template contains the required sections.

**Verify (for each template):**

```bash
for f in harness/templates/*.md; do
  echo "=== $(basename $f) ==="
  grep -c "^#" "$f"           # has headings
  grep -c "Context Marker" "$f" || grep -c "STARTER" "$f"  # has context marker
  grep -c "Push back\|push back\|Challenge\|Say.*don't know" "$f"  # has Active Partner
  echo ""
done
```

**Expected per template:**
- At least 2 headings (role name + sections)
- Context marker defined (emoji specified)
- Active Partner directive present (push back / challenge / question)

**Pass:** All 5 templates have role definition, context marker, and Active Partner directive.

---

### T2.3 Template Content Validation

**Goal:** Templates enforce focused scope — each has clear "DO" and "DON'T" boundaries.

| Template | Must Contain | Must NOT Allow |
|----------|-------------|----------------|
| `committer.md` | "commit message", "conventional commits" | "write code", "implement" |
| `reviewer.md` | "review", "flag issues" | "modify", "Write", "Edit" |
| `refactorer.md` | "refactor", "tests must pass" | "new feature", "add functionality" |
| `debugger.md` | "console.log", "hypothesis" | "guess", "assume" |
| `planner.md` | "plan", "does this match" | "implement", "write code" |

**Verify:**

```bash
for f in harness/templates/*.md; do
  name=$(basename "$f" .md)
  echo "=== $name ==="
  case "$name" in
    committer)  grep -ci "commit" "$f"; grep -ci "conventional" "$f" ;;
    reviewer)   grep -ci "review" "$f"; grep -ci "flag" "$f" ;;
    refactorer) grep -ci "refactor" "$f"; grep -ci "tests" "$f" ;;
    debugger)   grep -ci "log\|hypothesis" "$f" ;;
    planner)    grep -ci "plan" "$f"; grep -ci "match.*intent\|does this" "$f" ;;
  esac
  echo ""
done
```

**Pass:** Each template contains its role-specific keywords.

---

### T2.4 Role Loader Extension Loads

**Goal:** Extension registers without errors.

**Verify:**

```bash
# Extension directory exists with correct structure
ls ~/.pi/agent/extensions/role-loader/index.ts
ls ~/.pi/agent/extensions/role-loader/package.json

# package.json has pi.extensions field
grep -o '"extensions"' ~/.pi/agent/extensions/role-loader/package.json
```

**Pass:** Extension files exist with correct structure.

---

### T2.5 `/role list` Command

**Goal:** Command shows available roles.

**Action:** In a pi session, type `/role list`.

**Expected output (approximate):**

```
Available roles:
  ✅ committer  — Review staged changes and write commit messages
  🔍 reviewer   — Review code, flag issues, never modify files
  🌀 refactorer — Refactor existing code, never add features
  🔬 debugger   — Debug with log-first approach
  📋 planner    — Plan only, never implement
```

**Pass:** All 5 roles listed with emoji markers and descriptions.

---

### T2.6 `/role <name>` Activates Role

**Goal:** Loading a role injects the template and sets status.

**Action:** Type `/role committer`.

**Verify:**
- Status bar shows `✅ committer` or similar indicator
- Next response from agent starts with `✅` (context marker)
- Agent's behavior aligns with committer role (won't write code if asked)

**Pass:** Status updated. Context marker appears. Agent follows role constraints.

---

### T2.7 `/role clear` Deactivates

**Action:** Type `/role clear`.

**Verify:**
- Status indicator removed
- Agent returns to normal behavior (no context marker, no role restrictions)

**Pass:** Status cleared. Agent behavior returns to default.

---

### T2.8 Role Persistence Across Turns

**Goal:** Role context survives multiple turns within a session.

**Action:**
1. `/role reviewer`
2. Ask agent to review a file → should comply (review only)
3. Ask agent to edit a file → should refuse or push back
4. Ask agent another question → still shows 🔍 marker

**Pass:** Role constraints maintained across 3+ turns.

---

## T3. Feature 3: Canary Metrics

### T3.1 Extension Loads and Connects

**Goal:** `canary-monitor` extension initializes and connects to XTDB.

**Verify:**

```bash
# Extension exists
ls ~/.pi/agent/extensions/canary-monitor/index.ts
ls ~/.pi/agent/extensions/canary-monitor/package.json

# After /reload, check no error notifications appear
# Status should show canary indicator
```

**Pass:** Extension loads without errors.

---

### T3.2 Tool Failure Rate Detection

**Seed:** `/test/canary-thrashing` — session with 10 tool calls, 4 errors (40% failure rate).

```
#0  session_start
#1  agent_start
#2  turn_start                 turn_index=0
#3  tool_execution_start       tool_name=bash  tool_call_id=tc-01
#4  tool_execution_end         tool_name=bash  tool_call_id=tc-01  is_error=false
#5  tool_execution_start       tool_name=bash  tool_call_id=tc-02
#6  tool_execution_end         tool_name=bash  tool_call_id=tc-02  is_error=true
#7  tool_execution_start       tool_name=bash  tool_call_id=tc-03
#8  tool_execution_end         tool_name=bash  tool_call_id=tc-03  is_error=true
#9  tool_execution_start       tool_name=read  tool_call_id=tc-04
#10 tool_execution_end         tool_name=read  tool_call_id=tc-04  is_error=false
#11 tool_execution_start       tool_name=bash  tool_call_id=tc-05
#12 tool_execution_end         tool_name=bash  tool_call_id=tc-05  is_error=true
#13 tool_execution_start       tool_name=bash  tool_call_id=tc-06
#14 tool_execution_end         tool_name=bash  tool_call_id=tc-06  is_error=false
#15 tool_execution_start       tool_name=bash  tool_call_id=tc-07
#16 tool_execution_end         tool_name=bash  tool_call_id=tc-07  is_error=true
#17 tool_execution_start       tool_name=bash  tool_call_id=tc-08
#18 tool_execution_end         tool_name=bash  tool_call_id=tc-08  is_error=false
#19 tool_execution_start       tool_name=bash  tool_call_id=tc-09
#20 tool_execution_end         tool_name=bash  tool_call_id=tc-09  is_error=false
#21 tool_execution_start       tool_name=bash  tool_call_id=tc-10
#22 tool_execution_end         tool_name=bash  tool_call_id=tc-10  is_error=false
#23 turn_end                   turn_index=0
#24 agent_end                  agent_end_msg_count=5
```

**Unit test (metrics.ts):**

```typescript
// computeToolFailureRate(sessionId) → { rate: number, threshold: number, alert: boolean }
const result = computeToolFailureRate("/test/canary-thrashing");
assert(result.rate === 0.4);          // 4 errors / 10 calls
assert(result.alert === true);        // exceeds 30% threshold
```

**Integration test:**

```bash
# Query to verify metric computation
node -e "
const pg = require('postgres');
const sql = pg({host:'localhost',port:5433,database:'xtdb',user:'xtdb'});
(async () => {
  const total = await sql\`SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = '/test/canary-thrashing' AND event_name = 'tool_execution_end'\`;
  const errors = await sql\`SELECT COUNT(*) AS cnt FROM events
    WHERE session_id = '/test/canary-thrashing' AND event_name = 'tool_execution_end' AND is_error = true\`;
  const rate = Number(errors[0].cnt) / Number(total[0].cnt);
  console.log('Rate:', rate, 'Alert:', rate > 0.3);
  await sql.end();
})();
"
# Expected: Rate: 0.4 Alert: true
```

**Pass:** Failure rate computed as 0.4 (40%). Alert triggered (> 30% threshold).

---

### T3.3 Tool Failure Rate — No False Positive

**Seed:** `/test/canary-healthy` — session with 10 tool calls, 1 error (10% failure rate).

```
#0-#22: same structure as T3.2 but only tc-03 has is_error=true (1 out of 10)
```

**Verify:** `computeToolFailureRate("/test/canary-healthy")` → `rate: 0.1`, `alert: false`.

**Pass:** No alert at 10% failure rate.

---

### T3.4 Turn Inflation Detection

**Seed:** `/test/canary-inflated` — session with 1 agent run spanning 8 turns.

```
#0  session_start
#1  agent_start
#2  turn_start     turn_index=0
#3  turn_end       turn_index=0
#4  turn_start     turn_index=1
#5  turn_end       turn_index=1
#6  turn_start     turn_index=2
#7  turn_end       turn_index=2
#8  turn_start     turn_index=3
#9  turn_end       turn_index=3
#10 turn_start     turn_index=4
#11 turn_end       turn_index=4
#12 turn_start     turn_index=5
#13 turn_end       turn_index=5
#14 turn_start     turn_index=6
#15 turn_end       turn_index=6
#16 turn_start     turn_index=7
#17 turn_end       turn_index=7
#18 agent_end      agent_end_msg_count=20
```

**Unit test:**

```typescript
const result = computeTurnInflation("/test/canary-inflated");
assert(result.turnCount === 8);       // 8 turns in one agent run
assert(result.alert === true);        // exceeds 5-turn threshold
```

**Pass:** Turn count = 8. Alert triggered.

---

### T3.5 Context Bloat Detection

**Goal:** Alert when `provider_payload_bytes` exceeds 100KB.

**Verify against existing real data:**

```bash
# The real session has payload growing to 386KB
node -e "
const pg = require('postgres');
const sql = pg({host:'localhost',port:5433,database:'xtdb',user:'xtdb'});
(async () => {
  const rows = await sql\`SELECT provider_payload_bytes FROM events
    WHERE provider_payload_bytes IS NOT NULL ORDER BY seq DESC LIMIT 1\`;
  const bytes = Number(rows[0].provider_payload_bytes);
  console.log('Latest payload:', bytes, 'bytes', '(' + Math.round(bytes/1024) + 'KB)');
  console.log('Alert:', bytes > 100000);
  await sql.end();
})();
"
# Expected: Latest payload: 386883 bytes (377KB), Alert: true
```

**Pass:** Bloat detected on real data. Alert triggered at 377KB.

---

### T3.6 Retry Storm Detection

**Seed:** `/test/canary-retry-storm` — session with 4 consecutive `bash` tool calls.

```
#0  session_start
#1  agent_start
#2  turn_start                 turn_index=0
#3  tool_execution_start       tool_name=bash  tool_call_id=tc-r1
#4  tool_execution_end         tool_name=bash  tool_call_id=tc-r1  is_error=true
#5  tool_execution_start       tool_name=bash  tool_call_id=tc-r2
#6  tool_execution_end         tool_name=bash  tool_call_id=tc-r2  is_error=true
#7  tool_execution_start       tool_name=bash  tool_call_id=tc-r3
#8  tool_execution_end         tool_name=bash  tool_call_id=tc-r3  is_error=true
#9  tool_execution_start       tool_name=bash  tool_call_id=tc-r4
#10 tool_execution_end         tool_name=bash  tool_call_id=tc-r4  is_error=false
#11 turn_end                   turn_index=0
#12 agent_end
```

**Unit test:**

```typescript
const result = detectRetryStorm("/test/canary-retry-storm");
assert(result.detected === true);
assert(result.tool === "bash");
assert(result.consecutiveCount === 4);  // 4 consecutive bash calls
```

**Pass:** Retry storm detected with 4 consecutive `bash` calls.

---

### T3.7 No Retry Storm — Mixed Tools

**Seed:** `/test/canary-healthy` includes: bash → read → bash → write → bash (no 3 consecutive same tool).

**Verify:** `detectRetryStorm("/test/canary-healthy")` → `detected: false`.

**Pass:** No false positive when tools alternate.

---

### T3.8 Live Status Widget Content

**Goal:** Widget shows current metric summary.

**Expected format (approximate):**

```
🐤 Canary: turns=3 errors=0/5 ctx=45KB
```

**Verify:** After loading extension in pi session, widget appears in TUI footer
or status area. Values update after each `turn_end`.

**Pass:** Widget visible. Values match actual session state.

---

### T3.9 Configuration Override

**Goal:** Custom thresholds from config file are respected.

**Setup:**

```bash
cat > ~/.pi/agent/canary-monitor.json << 'EOF'
{
  "thresholds": {
    "toolFailureRate": 0.5,
    "maxTurnsPerRun": 10,
    "contextBloatBytes": 200000,
    "retryStormCount": 5
  }
}
EOF
```

**Verify:** With 40% failure rate and threshold at 50%, no alert fires.
With threshold at 30% (default), alert fires.

**Pass:** Config overrides change alert behavior.

---

### T3.10 Session Duration Metric

**Seed:** Agent run spanning 15 minutes (timestamps 15 min apart).

```
#0  agent_start    ts=1700000000000
#1  turn_start     ts=1700000000000    turn_index=0
...
#N  turn_end       ts=1700000900000    turn_index=K    (15 min = 900000ms later)
#M  agent_end      ts=1700000900000
```

**Verify:** Duration computed as 900000ms (15 min). Alert fires (> 10 min threshold).

**Pass:** Duration metric alerts on long-running sessions.

---

### T3.11 Tool Call Density Metric

**Seed:** Turn with 10 tool calls.

**Verify:** Density = 10 tools/turn. Alert fires (> 8 threshold = distracted agent).

**Pass:** Density alert fires.

---

## T4. Feature 4: Habit Hooks

### T4.1 Extension Loads

**Verify:**

```bash
ls ~/.pi/agent/extensions/habit-monitor/index.ts
ls ~/.pi/agent/extensions/habit-monitor/package.json
```

**Pass:** Extension files exist, loads without errors after `/reload`.

---

### T4.2 Commit Reminder — Fires

**Seed:** `/test/habit-no-commit` — session with 12 tool calls (writes and edits)
but no `user_bash` event containing "git commit".

```
#0  session_start
#1  agent_start
#2  turn_start                 turn_index=0
#3  tool_execution_start       tool_name=write  tool_call_id=tc-w1
#4  tool_execution_end         tool_name=write  tool_call_id=tc-w1
#5  tool_execution_start       tool_name=edit   tool_call_id=tc-e1
#6  tool_execution_end         tool_name=edit   tool_call_id=tc-e1
#7  tool_execution_start       tool_name=write  tool_call_id=tc-w2
#8  tool_execution_end         tool_name=write  tool_call_id=tc-w2
#9  tool_execution_start       tool_name=bash   tool_call_id=tc-b1
#10 tool_execution_end         tool_name=bash   tool_call_id=tc-b1
#11 tool_execution_start       tool_name=write  tool_call_id=tc-w3
#12 tool_execution_end         tool_name=write  tool_call_id=tc-w3
#13 tool_execution_start       tool_name=edit   tool_call_id=tc-e2
#14 tool_execution_end         tool_name=edit   tool_call_id=tc-e2
#15 turn_end                   turn_index=0
```

**Unit test:**

```typescript
const result = checkCommitHabit("/test/habit-no-commit");
assert(result.editsSinceCommit === 5);  // 3 writes + 2 edits
assert(result.alert === true);          // exceeds threshold (default: 5)
```

**Pass:** Commit reminder triggered after 5 file modifications without commit.

---

### T4.3 Commit Reminder — Suppressed When Committed

**Seed:** Same as T4.2 but add a `user_bash` event with `bash_command = "git commit -m 'wip'"` after seq #8.

**Verify:** `checkCommitHabit()` → `editsSinceCommit = 2` (only edits after the commit), `alert = false`.

**Pass:** Commit resets the counter. No false positive.

---

### T4.4 Test Reminder — Fires

**Seed:** `/test/habit-no-test` — 6 file writes (Write/Edit tools) with no
`bash` tool call containing "test" or "vitest" or "jest" or "npm test".

**Unit test:**

```typescript
const result = checkTestHabit("/test/habit-no-test");
assert(result.editsSinceTest === 6);
assert(result.alert === true);   // exceeds threshold (default: 5)
```

**Pass:** Test reminder triggered.

---

### T4.5 Test Reminder — Suppressed After Test Run

**Seed:** Same as T4.4 but with `tool_name=bash, bash_command="npm test"` midway.

**Verify:** Edits counted only from after the test run. No alert.

**Pass:** Test run resets the counter.

---

### T4.6 Step-Back on Consecutive Errors

**Seed:** `/test/habit-error-streak` — 3 consecutive `tool_execution_end` with `is_error=true`.

```
#0  tool_execution_end   tool_name=bash  is_error=true   tool_call_id=tc-e1
#1  tool_execution_end   tool_name=bash  is_error=true   tool_call_id=tc-e2
#2  tool_execution_end   tool_name=read  is_error=true   tool_call_id=tc-e3
```

**Unit test:**

```typescript
const result = checkErrorStreak("/test/habit-error-streak");
assert(result.consecutiveErrors === 3);
assert(result.alert === true);
assert(result.prompt.includes("Stop") || result.prompt.includes("step back"));
```

**Pass:** Error streak detected. Strong prompt injected.

---

### T4.7 Step-Back — No False Positive on Interleaved Success

**Seed:** Error → Success → Error → Error.

**Verify:** Only 2 consecutive errors. Below threshold of 3. No alert.

**Pass:** Interleaved success breaks the streak.

---

### T4.8 Scope Creep Detection

**Seed:** `/test/habit-scope-creep` — single agent run touching 12 unique file paths
across Write/Edit/Read tool calls.

**Unit test:**

```typescript
const result = checkScopeCreep("/test/habit-scope-creep");
assert(result.uniqueFiles >= 12);
assert(result.alert === true);   // exceeds threshold (default: 8)
```

**Pass:** Scope creep detected with 12 files.

---

### T4.9 Snooze Mechanism

**Goal:** Snoozed habits don't fire during the snooze window.

**Action:**
1. Trigger commit reminder alert
2. `/habit snooze commit 5` (snooze for 5 minutes)
3. Continue editing files
4. Verify no commit reminder for 5 minutes
5. After 5 minutes, alert fires again

**Pass:** Alert suppressed during snooze. Resumes after window expires.

---

### T4.10 `/habit list` Shows Status

**Action:** Type `/habit list`.

**Expected:**

```
Habits:
  ✅ commit-reminder     threshold=5 edits    status=active
  ✅ test-reminder       threshold=5 edits    status=active
  ✅ error-streak        threshold=3 errors   status=active
  ✅ fresh-start         threshold=150KB      status=active
  ✅ scope-creep         threshold=8 files    status=active
```

**Pass:** All habits listed with thresholds and status.

---

### T4.11 Fresh Start Hint

**Verify against existing real data:**

The real session has `provider_payload_bytes` reaching 386KB.

```typescript
const result = checkFreshStart(realSessionId);
assert(result.currentBytes > 150000);
assert(result.alert === true);
```

**Pass:** Fresh start hint triggered on real session data with 377KB payload.

---

## T5. Feature 5: Session Health Dashboard

### T5.1 Dashboard Route Returns 200

**Verify:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/dashboard
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/api/dashboard
# Expected: 200
```

**Pass:** Both routes return 200.

---

### T5.2 Dashboard Stats Query

**Verify:**

```bash
curl -s http://localhost:3333/api/dashboard | python3 -m json.tool
```

**Expected structure:**

```json
{
  "totalSessions": 4,
  "totalEvents": 500,
  "avgEventsPerSession": 125,
  "avgDurationMs": 300000,
  "overallErrorRate": 0.05,
  "sessions": [
    {
      "sessionId": "/test/...",
      "healthScore": 85,
      "healthColor": "green",
      "eventCount": 30,
      "errorRate": 0.0,
      "turnCount": 2,
      "maxPayloadBytes": 40000
    }
  ],
  "toolUsage": [
    { "tool": "bash", "count": 20, "errorRate": 0.1 },
    { "tool": "read", "count": 10, "errorRate": 0.0 }
  ]
}
```

**Pass:** JSON response has `totalSessions`, `sessions` array with health scores, `toolUsage` array.

---

### T5.3 Health Score Algorithm

**Unit tests for score computation:**

```typescript
// Perfect session: no errors, few turns, small context
assert(computeHealthScore({ errorRate: 0, turnCount: 2, maxPayloadBytes: 30000, durationMs: 60000 }) >= 90);

// Mediocre session: some errors, many turns
assert(computeHealthScore({ errorRate: 0.2, turnCount: 6, maxPayloadBytes: 120000, durationMs: 300000 }) >= 40);
assert(computeHealthScore({ errorRate: 0.2, turnCount: 6, maxPayloadBytes: 120000, durationMs: 300000 }) <= 70);

// Bad session: high errors, many turns, huge context
assert(computeHealthScore({ errorRate: 0.5, turnCount: 12, maxPayloadBytes: 400000, durationMs: 900000 }) <= 30);
```

**Pass:** Scores decrease with worse metrics. Boundaries respected.

---

### T5.4 Health Score Colors

```typescript
assert(healthColor(95) === "green");
assert(healthColor(60) === "yellow");
assert(healthColor(25) === "red");
```

**Pass:** Green ≥ 80, Yellow 40–79, Red < 40.

---

### T5.5 Dashboard HTML Contains Key Elements

**Verify:**

```bash
curl -s http://localhost:3333/dashboard | grep -c 'class="dash-stat-card"'
# Expected: >= 3 (total sessions, avg events, error rate)

curl -s http://localhost:3333/dashboard | grep -c 'class="health-score"'
# Expected: >= 1 (one per session)

curl -s http://localhost:3333/dashboard | grep -c 'class="tool-bar"'
# Expected: >= 1 (tool usage bars)
```

**Pass:** Summary cards, health scores, and tool bars all present.

---

### T5.6 Dashboard Navigation

**Verify:**

```bash
# Dashboard link in header of all pages
for path in "/" "/sessions" "/dashboard"; do
  echo -n "$path has Dashboard link: "
  curl -s "http://localhost:3333$path" | grep -c 'href="/dashboard"'
done
# Expected: 1 for each

# Session links from dashboard go to session detail
curl -s http://localhost:3333/dashboard | grep -oE 'href="/sessions/[^"]*"' | head -3
# Expected: valid session detail links
```

**Pass:** Navigation works in both directions.

---

### T5.7 Sessions Page Shows Health Badges

**Verify:**

```bash
curl -s http://localhost:3333/sessions | grep -c 'health-badge'
# Expected: >= 1 (one per session card)
```

**Pass:** Health badges appear on session list cards.

---

## T6. Feature 6: Knowledge Extraction

### T6.1 Knowledge Query

**Seed:** `/test/knowledge-rich` — session with diverse tool usage:
- 3 `write` calls (3 unique files)
- 2 `edit` calls (1 new file, 1 repeat)
- 4 `bash` calls (npm test, git status, ls, grep)
- 1 `read` call
- 2 tool errors
- 5 turns

**Verify:**

```typescript
const knowledge = await getSessionKnowledge("/test/knowledge-rich");
assert(knowledge.filesModified.length === 4);     // 3 unique write + 1 unique edit
assert(knowledge.toolUsage.bash === 4);
assert(knowledge.toolUsage.write === 3);
assert(knowledge.errorCount === 2);
assert(knowledge.turnCount === 5);
assert(knowledge.bashCommands.includes("npm test"));
```

**Pass:** Knowledge data correctly aggregated.

---

### T6.2 Markdown Generation

**Goal:** Generator produces valid, useful markdown.

**Verify:**

```typescript
const md = generateKnowledgeMarkdown("/test/knowledge-rich", knowledge);

// Has required sections
assert(md.includes("# Session Summary"));
assert(md.includes("## Files Modified"));
assert(md.includes("## Tools Used"));
assert(md.includes("## Errors"));
assert(md.includes("## Key Commands"));

// Contains actual data
assert(md.includes("npm test"));
assert(md.match(/\d+ files modified/));
assert(md.match(/\d+ turns/));
```

**Pass:** Markdown has all sections with real data.

---

### T6.3 Knowledge Route Returns Content

**Verify:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3333/sessions/$(urlencode '/test/knowledge-rich')/knowledge"
# Expected: 200

curl -s "http://localhost:3333/sessions/$(urlencode '/test/knowledge-rich')/knowledge" | \
  grep -c "Session Summary"
# Expected: 1
```

**Pass:** Route returns 200 with knowledge document content.

---

### T6.4 Knowledge for Empty Session

**Verify:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3333/sessions/$(urlencode '/test/nonexistent')/knowledge"
# Expected: 404
```

**Pass:** Returns 404 for nonexistent session.

---

### T6.5 Knowledge Extension Writes File

**Goal:** On `session_shutdown`, knowledge file is written.

**Verify:**

```bash
# After a pi session ends, check for knowledge file
ls ~/.pi/agent/sessions/*.knowledge.md 2>/dev/null
```

**Pass:** `.knowledge.md` file exists for completed sessions.

---

### T6.6 Knowledge File Content

**Verify the written file:**

```bash
cat ~/.pi/agent/sessions/latest.knowledge.md | head -20
# Should show: Session Summary, Files Modified, Tools Used, etc.
```

**Pass:** File contains valid knowledge document with real session data.

---

## Appendix A. Seed Data Scenarios

### A.1 Complete Seed Script

```bash
# Run all seed insertions
cd /Users/opunix/harness
npx jiti test/seed-augmented-patterns.ts
```

### A.2 Seed Session Summary

| Session | Events | Purpose | Key Properties |
|---------|--------|---------|----------------|
| `/test/ctx-markers-healthy` | 12 | F1: no warnings | payload < 40KB throughout |
| `/test/ctx-markers-bloated` | 24 | F1: context rot | payload 30KB → 350KB |
| `/test/ctx-markers-compacted` | 9 | F1: compaction reset | payload 200KB → 30KB after compact |
| `/test/canary-thrashing` | 25 | F3: high error rate | 4/10 tool errors (40%) |
| `/test/canary-inflated` | 19 | F3: many turns | 8 turns in one agent run |
| `/test/canary-retry-storm` | 13 | F3: repeated tools | 4 consecutive bash calls |
| `/test/canary-healthy` | 25 | F3: no alerts | 1/10 errors, 3 turns |
| `/test/habit-no-commit` | 16 | F4: no git commit | 5 writes/edits, no commit |
| `/test/habit-no-test` | 14 | F4: no test run | 6 writes, no test |
| `/test/habit-error-streak` | 5 | F4: consecutive errors | 3 errors in a row |
| `/test/habit-scope-creep` | 26 | F4: many files | 12 unique file paths |
| `/test/knowledge-rich` | 20 | F6: diverse tools | writes, edits, bash, read, errors |

**Total seed events: ~208 across 12 test sessions.**

### A.3 Verification After Seeding

```sql
-- Verify all test sessions exist
SELECT session_id, COUNT(*) AS cnt
FROM events
WHERE session_id LIKE '/test/%'
GROUP BY session_id
ORDER BY session_id;

-- Expected: 12 sessions (plus the 2 existing test sessions)
```

---

## Appendix B. Test Execution Checklist

Run in order. Mark pass/fail.

```
INFRASTRUCTURE
[ ] T0.1  Prerequisites (XTDB, UI server, existing data)
[ ] T0.2  Seed data inserted (12 test sessions, ~208 events)

FEATURE 1: CONTEXT MARKERS IN UI
[ ] T1.1  Context metrics query returns correct data
[ ] T1.2  data-ctx-msgs and data-ctx-bytes attributes in HTML
[ ] T1.3  Sparkline SVG renders
[ ] T1.4  Health colors: green (< 50KB), yellow (50-100KB), red (> 100KB)
[ ] T1.5  Context rot zone markers appear after 100KB
[ ] T1.6  Compaction shows as sparkline reset
[ ] T1.7  Healthy session has no warnings

FEATURE 2: FOCUSED AGENT TEMPLATES
[ ] T2.1  All 5 template files exist
[ ] T2.2  Templates have required sections (role, marker, Active Partner)
[ ] T2.3  Template content matches role focus
[ ] T2.4  role-loader extension loads
[ ] T2.5  /role list shows all roles
[ ] T2.6  /role <name> activates role + status + marker
[ ] T2.7  /role clear deactivates
[ ] T2.8  Role persists across turns

FEATURE 3: CANARY METRICS
[ ] T3.1   Extension loads and connects
[ ] T3.2   Tool failure rate: 40% → alert fires
[ ] T3.3   Tool failure rate: 10% → no false positive
[ ] T3.4   Turn inflation: 8 turns → alert fires
[ ] T3.5   Context bloat: 377KB → alert fires (real data)
[ ] T3.6   Retry storm: 4 consecutive bash → detected
[ ] T3.7   No retry storm with mixed tools
[ ] T3.8   Live status widget shows metrics
[ ] T3.9   Config override changes thresholds
[ ] T3.10  Session duration: 15 min → alert
[ ] T3.11  Tool call density: 10/turn → alert

FEATURE 4: HABIT HOOKS
[ ] T4.1   Extension loads
[ ] T4.2   Commit reminder: 5 edits no commit → fires
[ ] T4.3   Commit reminder: suppressed after git commit
[ ] T4.4   Test reminder: 6 edits no test → fires
[ ] T4.5   Test reminder: suppressed after test run
[ ] T4.6   Error streak: 3 consecutive → fires
[ ] T4.7   Error streak: interleaved success → no false positive
[ ] T4.8   Scope creep: 12 files → fires
[ ] T4.9   Snooze mechanism works
[ ] T4.10  /habit list shows status
[ ] T4.11  Fresh start hint: 377KB → fires (real data)

FEATURE 5: SESSION HEALTH DASHBOARD
[ ] T5.1  Dashboard routes return 200
[ ] T5.2  Dashboard stats JSON correct
[ ] T5.3  Health score algorithm boundaries
[ ] T5.4  Health score colors
[ ] T5.5  Dashboard HTML has cards, scores, bars
[ ] T5.6  Navigation (header links + session links)
[ ] T5.7  Session list shows health badges

FEATURE 6: KNOWLEDGE EXTRACTION
[ ] T6.1  Knowledge query aggregates correctly
[ ] T6.2  Markdown generation has all sections
[ ] T6.3  Knowledge route returns 200
[ ] T6.4  Knowledge for nonexistent session → 404
[ ] T6.5  Extension writes .knowledge.md on shutdown
[ ] T6.6  Written file contains valid content

TOTAL: 53 test cases across 6 features
```

---

## References

- Feature definitions: `docs/AUGMENTED_PATTERNS.md`
- Existing event tests: `docs/TEST.md`
- Session grouping: `docs/SESSION_GROUPING.md`
- XTDB event schema: `docs/PROGRESS.md` (Section 4: Column Inventory)
- Pi extension API: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
