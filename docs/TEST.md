# TEST.md — Pi.dev XTDB Event Logger Verification Plan

> Tests every one of the 30 pi.dev events end-to-end.
> Each test: trigger the event → query XTDB → verify exact columns.
> References: `PROGRESS.md` (extraction spec), `PI_HOOKS_REFERENCE.md` (event fields)

---

## Table of Contents

- [T0. Test Infrastructure](#t0-test-infrastructure)
- [T1. Smoke Test](#t1-smoke-test)
- [T2. Pre-Connect Buffer](#t2-pre-connect-buffer)
- [T3–T11. Session Events (9)](#t3-t11-session-events)
- [T12–T13. Compaction Events (2)](#t12-t13-compaction-events)
- [T14–T18. Agent Events (5)](#t14-t18-agent-events)
- [T19–T21. Message Events (3)](#t19-t21-message-events)
- [T22–T28. Tool Events (7)](#t22-t28-tool-events)
- [T29–T30. Input Events (2)](#t29-t30-input-events)
- [T31. Model Events (1)](#t31-model-events)
- [T32. Resource Events (1)](#t32-resource-events)
- [T33. Safety Tests](#t33-safety-tests)
- [T34. Sampling Tests](#t34-sampling-tests)
- [T35. Infrastructure Tests](#t35-infrastructure-tests)
- [T36. Full Session Lifecycle](#t36-full-session-lifecycle)
- [Appendix A. SQL Helper Queries](#appendix-a-sql-helper-queries)
- [Appendix B. Test Execution Checklist](#appendix-b-test-execution-checklist)

---

## T0. Test Infrastructure

### T0.1 XTDB Health

**Pre-condition:** XTDB Docker container running.

```bash
# Verify container is up
docker ps | grep xtdb-events

# Verify health endpoint
curl -s http://localhost:8081/healthz/alive
# Expected: "Alive."

# Verify Postgres wire protocol
nc -z localhost 5433 && echo "OK" || echo "FAIL"
```

**Pass:** Container running, health OK, port 5433 open.

### T0.2 Clean Slate

Before each test run, wipe the events table to get a clean count:

```sql
-- Connect to XTDB
-- psql -h localhost -p 5433 -U xtdb xtdb

-- XTDB is immutable; you can't DELETE. Instead, use a fresh table
-- or filter by _system_from > test_start_time.

-- Recommended: record a timestamp before each test
SELECT CURRENT_TIMESTAMP AS test_start;
-- Then filter: WHERE _system_from > '<test_start>'
```

**Alternative:** Destroy and recreate the Docker container for a truly clean slate:

```bash
docker rm -f xtdb-events
docker run -d --name xtdb-events --restart unless-stopped \
  -p 5433:5432 -p 8081:8080 ghcr.io/xtdb/xtdb:latest
sleep 10
```

### T0.3 Extension Loaded

**Action:** Start pi with the extension.

```bash
pi -e ~/.pi/agent/extensions/xtdb-event-logger/index.ts
```

**Verify:** Footer shows `📊` or `📊 XTDB logging active` status.

**Pass:** No error notifications. Status indicator visible.

### T0.4 Query Helper

All test verifications use this connection:

```bash
# Option A: psql (if installed)
psql -h localhost -p 5433 -U xtdb xtdb

# Option B: Node.js one-liner
node -e "
  import('postgres').then(({default:p}) => {
    const sql = p({host:'localhost',port:5433,database:'xtdb',username:'xtdb'});
    sql\`SELECT event_name, COUNT(*) AS cnt FROM events GROUP BY event_name ORDER BY cnt DESC\`
      .then(r => { console.table(r); return sql.end(); });
  });
"
```

---

## T1. Smoke Test

**Goal:** Confirm at least one event reaches XTDB after starting pi.

**Action:**
1. Start pi with extension loaded
2. Wait 3 seconds (for session_start + buffered events to flush)

**Verify:**

```sql
SELECT COUNT(*) AS total FROM events;
-- Expected: total >= 1

SELECT event_name FROM events ORDER BY seq LIMIT 5;
-- Expected: should see session_directory, resources_discover, session_start (in some order)
```

**Pass:** At least 1 row. `session_start` present.

---

## T2. Pre-Connect Buffer

**Goal:** Events that fire BEFORE `session_start` are buffered and flushed.

**Action:** Start pi fresh. Wait 5 seconds.

**Verify:**

```sql
-- session_directory fires before session_start (CLI only)
SELECT event_name, seq FROM events
WHERE event_name IN ('session_directory', 'resources_discover', 'session_start')
ORDER BY seq;
```

**Expected:**
- `session_directory` present (seq = 0 or 1)
- `resources_discover` present (seq = 0 or 1)
- `session_start` present (seq = 2 or later)
- All three have `_system_from` timestamps close together (buffered events flushed on connect)

**Pass:** All three events present. `session_directory` and `resources_discover` have seq numbers lower than `session_start`.

---

## T3–T11. Session Events

### T3. `session_directory` — Event #1

**Trigger:** Automatically fires on pi CLI startup.

**Verify:**

```sql
SELECT _id, event_name, category, can_intercept, cwd, session_id
FROM events WHERE event_name = 'session_directory';
```

| Column | Expected |
|--------|----------|
| `event_name` | `'session_directory'` |
| `category` | `'session'` |
| `can_intercept` | `true` |
| `cwd` | A valid directory path (e.g. `/Users/opunix/harness`) |
| `session_id` | `null` (no ctx) |

**Pass:** Row exists. `cwd` is a real path. `session_id` is null.

---

### T4. `session_start` — Event #2

**Trigger:** Automatically fires when session loads.

**Verify:**

```sql
SELECT _id, event_name, category, can_intercept, session_id, cwd
FROM events WHERE event_name = 'session_start';
```

| Column | Expected |
|--------|----------|
| `event_name` | `'session_start'` |
| `category` | `'session'` |
| `can_intercept` | `false` |
| `session_id` | A file path (e.g. ending in `.jsonl`) or `null` if ephemeral |
| `cwd` | A valid directory path |

**Pass:** Row exists. `session_id` populated (or null for in-memory). `cwd` is a real path.

---

### T5. `session_before_switch` — Event #3

**Trigger:** Type `/new` in pi.

**Verify:**

```sql
SELECT event_name, switch_reason, switch_target, can_intercept
FROM events WHERE event_name = 'session_before_switch';
```

| Column | Expected |
|--------|----------|
| `switch_reason` | `'new'` |
| `switch_target` | `null` (only set for `'resume'`) |
| `can_intercept` | `true` |

**Pass:** Row exists. `switch_reason = 'new'`.

---

### T6. `session_switch` — Event #4

**Trigger:** Fires after `/new` completes.

**Verify:**

```sql
SELECT event_name, switch_reason, switch_previous
FROM events WHERE event_name = 'session_switch';
```

| Column | Expected |
|--------|----------|
| `switch_reason` | `'new'` |
| `switch_previous` | Previous session file path or `null` |

**Pass:** Row exists. Appears after `session_before_switch` by seq.

---

### T7. `session_before_switch` (resume variant) — Event #3 alt

**Trigger:** Type `/resume`, pick a session.

**Verify:**

```sql
SELECT switch_reason, switch_target
FROM events
WHERE event_name = 'session_before_switch' AND switch_reason = 'resume';
```

| Column | Expected |
|--------|----------|
| `switch_reason` | `'resume'` |
| `switch_target` | A session file path (not null) |

**Pass:** Row with `reason='resume'` and non-null `switch_target`.

---

### T8. `session_before_fork` — Event #5

**Trigger:** Type `/fork` in pi.

**Verify:**

```sql
SELECT event_name, fork_entry_id, can_intercept
FROM events WHERE event_name = 'session_before_fork';
```

| Column | Expected |
|--------|----------|
| `fork_entry_id` | A non-empty string (entry UUID) |
| `can_intercept` | `true` |

**Pass:** Row exists. `fork_entry_id` is non-null, non-empty.

---

### T9. `session_fork` — Event #6

**Trigger:** Fires after `/fork` completes.

**Verify:**

```sql
SELECT event_name, fork_previous
FROM events WHERE event_name = 'session_fork';
```

| Column | Expected |
|--------|----------|
| `fork_previous` | Previous session file path |

**Pass:** Row exists. `fork_previous` is a file path.

---

### T10. `session_before_tree` + `session_tree` — Events #7 & #8

**Trigger:** Build up at least 2 branches (use `/fork`, then `/tree` to navigate).

**Pre-condition:** Session must have a tree structure (fork creates branches).

**Verify:**

```sql
-- session_before_tree
SELECT event_name, can_intercept
FROM events WHERE event_name = 'session_before_tree';

-- session_tree
SELECT event_name, tree_new_leaf, tree_old_leaf, tree_from_ext
FROM events WHERE event_name = 'session_tree';
```

| Event | Column | Expected |
|-------|--------|----------|
| `session_before_tree` | `can_intercept` | `true` |
| `session_tree` | `tree_new_leaf` | Non-empty string |
| `session_tree` | `tree_old_leaf` | Non-empty string |
| `session_tree` | `tree_new_leaf` ≠ `tree_old_leaf` | Different IDs |
| `session_tree` | `tree_from_ext` | `false` (unless another extension provided summary) |

**Pass:** Both events present. Leaf IDs populated and different.

---

### T11. `session_shutdown` — Event #9

**Trigger:** Press Ctrl+C or Ctrl+D to exit pi.

**Verify:** After restart, check DB:

```sql
SELECT event_name, category, seq
FROM events WHERE event_name = 'session_shutdown';
```

| Column | Expected |
|--------|----------|
| `event_name` | `'session_shutdown'` |
| `category` | `'session'` |
| `seq` | Highest seq in that session (it's the last event) |

**Pass:** Row exists. seq is the highest or near-highest for that session_id.

**Note:** This is the hardest event to verify — the flush must complete before
the process exits. If missing, the shutdown flush logic has a bug.

---

## T12–T13. Compaction Events

### T12. `session_before_compact` — Event #10

**Trigger:** Type `/compact` in pi (requires enough conversation to compact).

**Alternative trigger:** Have a long conversation until auto-compaction fires.

**Verify:**

```sql
SELECT event_name, compact_tokens, can_intercept
FROM events WHERE event_name = 'session_before_compact';
```

| Column | Expected |
|--------|----------|
| `compact_tokens` | A positive number (tokens before compaction) |
| `can_intercept` | `true` |

**Pass:** Row exists. `compact_tokens > 0`.

---

### T13. `session_compact` — Event #11

**Trigger:** Fires after compaction completes.

**Verify:**

```sql
SELECT event_name, compact_from_ext
FROM events WHERE event_name = 'session_compact';
```

| Column | Expected |
|--------|----------|
| `compact_from_ext` | `false` (unless custom compaction extension) |

**Pass:** Row exists. Appears after `session_before_compact` by seq.

---

## T14–T18. Agent Events

### T14. `before_agent_start` — Event #12

**Trigger:** Type any prompt (e.g. `say hello`).

**Verify:**

```sql
SELECT event_name, prompt_text, input_has_images, can_intercept
FROM events WHERE event_name = 'before_agent_start'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `prompt_text` | The prompt text (e.g. `'say hello'`) |
| `input_has_images` | `false` (unless images attached) |
| `can_intercept` | `true` |
| `prompt_text` length | ≤ 2048 chars |

**Pass:** Row exists. `prompt_text` matches what was typed.

---

### T15. `agent_start` — Event #13

**Trigger:** Fires with every prompt.

**Verify:**

```sql
SELECT event_name, category, can_intercept
FROM events WHERE event_name = 'agent_start'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `category` | `'agent'` |
| `can_intercept` | `false` |

**Pass:** Row exists. No event-specific columns populated.

---

### T16. `agent_end` — Event #14

**Trigger:** Agent finishes responding to a prompt.

**Verify:**

```sql
SELECT event_name, agent_end_msg_count
FROM events WHERE event_name = 'agent_end'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `agent_end_msg_count` | ≥ 1 (at least the assistant message) |

**Pass:** Row exists. `agent_end_msg_count >= 1`.

---

### T17. `turn_start` — Event #15

**Trigger:** Fires at the start of each LLM turn (one per prompt minimum).

**Verify:**

```sql
SELECT event_name, turn_index, turn_timestamp
FROM events WHERE event_name = 'turn_start'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `turn_index` | `0` for first turn, incrementing |
| `turn_timestamp` | Recent Unix timestamp (ms) |

**Pass:** Row exists. `turn_index >= 0`. `turn_timestamp` is within last 60 seconds.

---

### T18. `turn_end` — Event #16

**Trigger:** Fires at end of each turn.

**Verify:**

```sql
SELECT event_name, turn_index, turn_end_tool_count
FROM events WHERE event_name = 'turn_end'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `turn_index` | Matches corresponding `turn_start` |
| `turn_end_tool_count` | ≥ 0 (0 if no tools called, N if tools used) |

**Pass:** Row exists. `turn_index` matches. Pairing test:

```sql
-- Every turn_start has a matching turn_end
SELECT s.turn_index, s.seq AS start_seq, e.seq AS end_seq
FROM events s
JOIN events e ON s.turn_index = e.turn_index
  AND s.session_id = e.session_id
WHERE s.event_name = 'turn_start' AND e.event_name = 'turn_end'
  AND e.seq > s.seq;
-- Expected: one row per turn, end_seq > start_seq
```

---

## T19–T21. Message Events

### T19. `message_start` — Event #17

**Trigger:** Any prompt (user message starts, then assistant message starts).

**Verify:**

```sql
SELECT event_name, message_role
FROM events WHERE event_name = 'message_start'
ORDER BY seq DESC LIMIT 3;
```

| Column | Expected |
|--------|----------|
| `message_role` | `'user'`, `'assistant'`, or `'toolResult'` |

**Pass:** Multiple rows. At least `'user'` and `'assistant'` roles present.

---

### T20. `message_update` — Event #18 (Sampled)

**Trigger:** Any prompt that generates a multi-token response.

**Verify:**

```sql
SELECT event_name, stream_delta_type, stream_delta_len, seq
FROM events WHERE event_name = 'message_update'
ORDER BY seq DESC LIMIT 5;
```

| Column | Expected |
|--------|----------|
| `stream_delta_type` | `'text_delta'` or `'thinking_delta'` |
| `stream_delta_len` | > 0 (accumulated bytes since last sample) |

**Sampling verification:**

```sql
-- Count message_update rows vs message_start/end for assistant messages
SELECT
  (SELECT COUNT(*) FROM events WHERE event_name = 'message_update') AS update_count,
  (SELECT COUNT(*) FROM events WHERE event_name = 'message_end' AND message_role = 'assistant') AS end_count;
-- Expected: update_count is small (1-5 per response), NOT hundreds
```

**Pass:** Rows exist. `stream_delta_len > 0`. Count is reasonable (not hundreds per response).

---

### T21. `message_end` — Event #19

**Trigger:** Message completes.

**Verify:**

```sql
SELECT event_name, message_role
FROM events WHERE event_name = 'message_end'
ORDER BY seq DESC LIMIT 3;
```

**Pairing test:**

```sql
-- Every message_start has a message_end (within same session)
SELECT
  (SELECT COUNT(*) FROM events WHERE event_name = 'message_start') AS starts,
  (SELECT COUNT(*) FROM events WHERE event_name = 'message_end') AS ends;
-- Expected: starts == ends
```

**Pass:** Counts match. Roles present.

---

## T22–T28. Tool Events

### T22. `tool_call` — Event #20

**Trigger:** Ask pi to do something that uses a tool (e.g. `list files in the current directory`).

**Verify:**

```sql
SELECT event_name, tool_name, tool_call_id, can_intercept, payload
FROM events WHERE event_name = 'tool_call'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `tool_name` | `'bash'`, `'read'`, `'write'`, `'edit'`, etc. |
| `tool_call_id` | Non-empty UUID-like string |
| `can_intercept` | `true` |
| `payload` | JSON string with tool input (e.g. `{"command":"ls"}`) |
| `payload` length | ≤ 4096 |

**Pass:** Row exists. All tool fields populated. `payload` is valid JSON.

---

### T23. `tool_result` — Event #21

**Trigger:** Same as above (follows tool_call).

**Verify:**

```sql
SELECT event_name, tool_name, tool_call_id, is_error, can_intercept
FROM events WHERE event_name = 'tool_result'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `tool_name` | Matches the corresponding `tool_call` |
| `tool_call_id` | Matches the corresponding `tool_call` |
| `is_error` | `false` (for successful commands) |
| `can_intercept` | `true` |

**Pass:** Row exists. `tool_call_id` matches a `tool_call` row.

---

### T24. `tool_execution_start` — Event #22

**Trigger:** Same tool use prompt.

**Verify:**

```sql
SELECT event_name, tool_name, tool_call_id
FROM events WHERE event_name = 'tool_execution_start'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `tool_name` | Matches `tool_call` |
| `tool_call_id` | Matches `tool_call` |

**Pass:** Row exists. Fields match corresponding tool_call.

---

### T25. `tool_execution_update` — Event #23 (Sampled)

**Trigger:** Ask pi to run a command with long output (e.g. `run ls -laR /usr`).

**Verify:**

```sql
SELECT event_name, tool_name, tool_call_id
FROM events WHERE event_name = 'tool_execution_update'
ORDER BY seq DESC LIMIT 5;
```

**Sampling verification:**

```sql
-- Should have far fewer rows than actual streaming chunks
SELECT
  (SELECT COUNT(*) FROM events WHERE event_name = 'tool_execution_update') AS update_count,
  (SELECT COUNT(*) FROM events WHERE event_name = 'tool_execution_end') AS end_count;
-- Expected: update_count is small per tool call (1-3), not hundreds
```

**Pass:** Rows present for long-running tools. Count is reasonable.

---

### T26. `tool_execution_end` — Event #24

**Trigger:** Same tool use prompt.

**Verify:**

```sql
SELECT event_name, tool_name, tool_call_id, is_error
FROM events WHERE event_name = 'tool_execution_end'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `is_error` | `false` for successful tool |

**Full lifecycle pairing:**

```sql
-- Every tool has start → call → result → end with matching tool_call_id
SELECT
  s.tool_call_id,
  s.tool_name,
  s.seq AS exec_start_seq,
  c.seq AS call_seq,
  r.seq AS result_seq,
  e.seq AS exec_end_seq,
  e.is_error
FROM events s
JOIN events c ON s.tool_call_id = c.tool_call_id AND c.event_name = 'tool_call'
JOIN events r ON s.tool_call_id = r.tool_call_id AND r.event_name = 'tool_result'
JOIN events e ON s.tool_call_id = e.tool_call_id AND e.event_name = 'tool_execution_end'
WHERE s.event_name = 'tool_execution_start';
-- Expected: exec_start_seq < call_seq < result_seq < exec_end_seq
```

**Pass:** All four events present per tool call. Sequence order is correct.

---

### T27. `tool_result` with error — Event #21 (error variant)

**Trigger:** Ask pi to read a non-existent file (e.g. `read /nonexistent/path`).

**Verify:**

```sql
SELECT tool_name, tool_call_id, is_error
FROM events
WHERE event_name = 'tool_result' AND is_error = true
ORDER BY seq DESC LIMIT 1;
```

**Pass:** Row exists with `is_error = true`.

---

### T28. `context` — Event #25

**Trigger:** Any prompt (fires before each LLM call).

**Verify:**

```sql
SELECT event_name, context_msg_count, can_intercept
FROM events WHERE event_name = 'context'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `context_msg_count` | ≥ 1 (at least the user message) |
| `can_intercept` | `true` |

**Pass:** Row exists. `context_msg_count >= 1`.

---

### T28b. `before_provider_request` — Event #26

**Trigger:** Any prompt (fires before HTTP request to provider).

**Verify:**

```sql
SELECT event_name, provider_payload_bytes, can_intercept
FROM events WHERE event_name = 'before_provider_request'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `provider_payload_bytes` | > 0 (payload has content) |
| `can_intercept` | `true` |

**Pass:** Row exists. `provider_payload_bytes > 100` (payload is always non-trivial).

---

## T29–T30. Input Events

### T29. `input` — Event #27

**Trigger:** Type any prompt (e.g. `hello world`).

**Verify:**

```sql
SELECT event_name, input_text, input_source, input_has_images, can_intercept
FROM events WHERE event_name = 'input'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `input_text` | `'hello world'` (the typed text) |
| `input_source` | `'interactive'` (typed in TUI) |
| `input_has_images` | `false` |
| `can_intercept` | `true` |

**Truncation test:** Type a prompt longer than 2048 characters.

```sql
SELECT LENGTH(input_text) AS len
FROM events WHERE event_name = 'input'
ORDER BY seq DESC LIMIT 1;
-- Expected: len <= 2048
```

**Pass:** Row exists. All fields correct. Truncation enforced.

---

### T30. `user_bash` — Event #28

**Trigger:** Type `!echo hello` in pi (user bash command).

**Verify:**

```sql
SELECT event_name, bash_command, bash_exclude, can_intercept
FROM events WHERE event_name = 'user_bash'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `bash_command` | `'echo hello'` |
| `bash_exclude` | `false` (single `!` prefix) |
| `can_intercept` | `true` |

**`!!` variant:** Type `!!echo hello` (excluded from context).

```sql
SELECT bash_command, bash_exclude
FROM events WHERE event_name = 'user_bash' AND bash_exclude = true
ORDER BY seq DESC LIMIT 1;
-- Expected: bash_exclude = true
```

**Pass:** Both variants captured with correct `bash_exclude` flag.

---

## T31. Model Events

### T31. `model_select` — Event #29

**Trigger:** Press Ctrl+P to cycle model, or type `/model` and select one.

**Verify:**

```sql
SELECT event_name, model_provider, model_id, model_source,
       prev_model_provider, prev_model_id
FROM events WHERE event_name = 'model_select'
ORDER BY seq DESC LIMIT 1;
```

| Column | Expected |
|--------|----------|
| `model_provider` | `'anthropic'`, `'openai'`, `'google'`, etc. |
| `model_id` | A model ID string |
| `model_source` | `'set'` (from `/model`) or `'cycle'` (from Ctrl+P) or `'restore'` |
| `prev_model_provider` | Previous provider or `null` (first selection) |
| `prev_model_id` | Previous model ID or `null` |

**Pass:** Row exists. `model_provider` and `model_id` are non-null.

---

## T32. Resource Events

### T32. `resources_discover` — Event #30

**Trigger:** Fires automatically on startup. Also fires on `/reload`.

**Verify:**

```sql
SELECT event_name, category, can_intercept, session_id
FROM events WHERE event_name = 'resources_discover';
```

| Column | Expected |
|--------|----------|
| `category` | `'resource'` |
| `can_intercept` | `true` |
| `session_id` | `null` (no ctx on this event) |

**`/reload` test:** Type `/reload` in pi and verify a second row appears:

```sql
SELECT COUNT(*) FROM events WHERE event_name = 'resources_discover';
-- Expected: >= 2 (startup + reload)
```

**Pass:** At least 1 row on startup. Count increases after `/reload`.

---

## T33. Safety Tests

### T33.1 No Interference — Interceptable Events

**Goal:** Confirm the extension NEVER blocks, cancels, or modifies behavior.

**Test for each interceptable event:**

| Event | Dangerous Return | Test |
|-------|-----------------|------|
| `tool_call` | `{ block: true }` | Run `ls` → tool executes normally |
| `tool_result` | `{ content: [...] }` | Run `ls` → result appears unmodified |
| `context` | `{ messages: [] }` | Send prompt → LLM receives full context |
| `before_provider_request` | Modified payload | Send prompt → response is normal |
| `input` | `{ action: "handled" }` | Type prompt → agent processes it |
| `user_bash` | `{ result: {...} }` | Type `!echo test` → real output appears |
| `session_before_switch` | `{ cancel: true }` | Type `/new` → session actually switches |
| `session_before_fork` | `{ cancel: true }` | Type `/fork` → fork actually happens |
| `session_before_tree` | `{ cancel: true }` | Type `/tree` → navigation works |
| `session_before_compact` | `{ cancel: true }` | Type `/compact` → compaction happens |
| `before_agent_start` | `{ systemPrompt: "..." }` | Send prompt → system prompt unchanged |
| `resources_discover` | `{ skillPaths: [...] }` | `/reload` → no phantom skills |

**Procedure:** Perform each action above. Verify pi behavior is completely normal.
Check no error notifications appear. Then verify the event IS in XTDB.

**Pass:** All actions succeed normally AND all events appear in DB.

---

### T33.2 Error Resilience

**Goal:** Extension errors don't crash pi or block tools.

**Test:** Stop XTDB Docker container mid-session.

```bash
docker stop xtdb-events
```

Then in pi:
1. Type a prompt → should work normally (LLM responds)
2. Use tools → should work normally
3. Type `/new` → should switch session

**Verify:** Pi continues functioning. No crash. Possibly a warning notification.

**Restart XTDB:**

```bash
docker start xtdb-events
```

**Verify:** After XTDB restarts, new events should start appearing again
(if reconnect logic exists) or the session must be restarted.

**Pass:** Pi never crashes or hangs, even with XTDB down.

---

### T33.3 No Handler Slowdown

**Goal:** DB writes don't slow down the agent.

**Test:** Send a prompt that triggers multiple tool calls. Measure subjective response time.

**Compare:** Run the same prompt with and without the extension:

```bash
# Without extension
pi

# With extension
pi -e ~/.pi/agent/extensions/xtdb-event-logger/index.ts
```

**Pass:** No perceptible difference in response time (writes are async/queued).

---

## T34. Sampling Tests

### T34.1 `message_update` Debounce

**Goal:** Verify streaming produces sampled rows, not per-token rows.

**Action:** Send a prompt that produces a long response (e.g. `write a 500 word essay about testing`).

**Verify:**

```sql
-- Count updates for the most recent agent run
SELECT COUNT(*) AS update_rows
FROM events
WHERE event_name = 'message_update'
  AND seq > (SELECT MAX(seq) FROM events WHERE event_name = 'agent_start');
```

**Expected:** `update_rows` is 1–10 (sampled at 2s intervals), NOT 100+.

```sql
-- Verify accumulated delta length is reasonable
SELECT stream_delta_len
FROM events
WHERE event_name = 'message_update'
ORDER BY seq DESC LIMIT 5;
-- Expected: each row has stream_delta_len > 50 (accumulated, not single token)
```

**Pass:** Row count per response ≤ ~15. `stream_delta_len` reflects accumulated bytes.

---

### T34.2 `tool_execution_update` Debounce

**Goal:** Verify tool streaming produces sampled rows.

**Action:** Ask pi to run a command with lots of output: `run find /usr -name "*.h" -type f`

**Verify:**

```sql
SELECT COUNT(*) AS update_rows
FROM events
WHERE event_name = 'tool_execution_update'
  AND seq > (SELECT MAX(seq) FROM events WHERE event_name = 'tool_execution_start' ORDER BY seq DESC LIMIT 1);
```

**Expected:** Small number of rows (1–5), not hundreds.

**Pass:** Row count per tool execution is ≤ ~10.

---

### T34.3 Sampler Flush on End

**Goal:** When `message_end` fires, any remaining sampled data is flushed.

**Action:** Send a very short prompt (e.g. `say hi`) where streaming lasts < 2 seconds.

**Verify:**

```sql
-- Should still have at least 1 message_update (flushed on message_end)
SELECT COUNT(*) AS cnt
FROM events
WHERE event_name = 'message_update'
  AND seq > (SELECT MAX(seq) FROM events WHERE event_name = 'message_start' AND message_role = 'assistant');
-- Expected: cnt >= 1 (final flush captured the accumulated data)
```

**Pass:** At least 1 `message_update` row even for fast responses.

---

## T35. Infrastructure Tests

### T35.1 Base Column Integrity

**Goal:** Every row has the required base columns.

```sql
SELECT COUNT(*) AS missing_base
FROM events
WHERE _id IS NULL
   OR environment IS NULL
   OR event_name IS NULL
   OR category IS NULL
   OR ts IS NULL
   OR seq IS NULL;
-- Expected: 0
```

**Pass:** 0 rows with missing base columns.

---

### T35.2 Environment Value

```sql
SELECT DISTINCT environment FROM events;
-- Expected: exactly one value: 'pi.dev'
```

**Pass:** Only `'pi.dev'`.

---

### T35.3 Category Values

```sql
SELECT DISTINCT category FROM events ORDER BY category;
-- Expected: agent, compaction, input, message, model, resource, session, tool
```

**Pass:** All 8 categories present (over time, after all events triggered).

---

### T35.4 Sequence Monotonicity

```sql
-- Sequences should be strictly increasing within a session
SELECT a.seq AS a_seq, b.seq AS b_seq
FROM events a, events b
WHERE a.session_id = b.session_id
  AND a._system_from < b._system_from
  AND a.seq >= b.seq
LIMIT 1;
-- Expected: 0 rows (no out-of-order sequences)
```

**Pass:** 0 rows returned.

---

### T35.5 XTDB Time-Travel Works

```sql
-- Record a timestamp
-- ... trigger some events ...

-- Query historical state
SELECT COUNT(*) FROM events FOR SYSTEM_TIME AS OF TIMESTAMP '2026-03-16T12:00:00Z';
-- Expected: fewer rows than current count (events added after noon missing)
```

**Pass:** Historical count < current count.

---

### T35.6 Truncation Limits

```sql
-- No input_text exceeds 2KB
SELECT MAX(LENGTH(input_text)) FROM events WHERE input_text IS NOT NULL;
-- Expected: <= 2048

-- No prompt_text exceeds 2KB
SELECT MAX(LENGTH(prompt_text)) FROM events WHERE prompt_text IS NOT NULL;
-- Expected: <= 2048

-- No bash_command exceeds 2KB
SELECT MAX(LENGTH(bash_command)) FROM events WHERE bash_command IS NOT NULL;
-- Expected: <= 2048

-- No payload exceeds 4KB
SELECT MAX(LENGTH(payload)) FROM events WHERE payload IS NOT NULL;
-- Expected: <= 4096 + small truncation marker
```

**Pass:** All within limits.

---

## T36. Full Session Lifecycle

**Goal:** Run a complete session and verify the event sequence is coherent.

**Action script (type in pi, one by one):**

```
1.  (pi starts — session_directory, resources_discover, session_start, model_select fire)
2.  "list files here"          → input, before_agent_start, agent_start, turn_start,
                                  context, before_provider_request, message_start (user),
                                  message_start (assistant), message_update (sampled),
                                  tool_execution_start, tool_call, tool_result,
                                  tool_execution_end, message_end (assistant),
                                  turn_end, agent_end
3.  !echo manual bash           → user_bash
4.  Ctrl+P                      → model_select (cycle)
5.  "say hello"                 → (full agent cycle again)
6.  /compact                    → session_before_compact, session_compact
7.  /new                        → session_before_switch, session_switch, session_start
8.  /resume (pick old session)  → session_before_switch (resume), session_switch
9.  /fork                       → session_before_fork, session_fork
10. /reload                     → resources_discover
11. Ctrl+C                      → session_shutdown
```

**Verify complete capture:**

```sql
SELECT event_name, COUNT(*) AS cnt
FROM events
GROUP BY event_name
ORDER BY event_name;
```

**Expected: all 30 event types present.**

```sql
-- Full ordered timeline
SELECT seq, event_name, category, tool_name, message_role, turn_index
FROM events
ORDER BY seq;
```

**Verify the sequence makes logical sense:**
- `session_directory` → `resources_discover` → `session_start` at the beginning
- `input` → `before_agent_start` → `agent_start` → `turn_start` → ... → `turn_end` → `agent_end` per prompt
- `session_shutdown` at the end
- Tool events have matching `tool_call_id` across start/call/result/end
- Turn events have matching `turn_index` across start/end

**Pass:** All 30 event types present. Sequence is logically ordered.

---

## Appendix A. SQL Helper Queries

```sql
-- A1. Quick event count dashboard
SELECT event_name, category, COUNT(*) AS cnt
FROM events
GROUP BY event_name, category
ORDER BY category, event_name;

-- A2. Missing event types (compare against expected 30)
WITH expected(name) AS (VALUES
  ('session_directory'),('session_start'),('session_before_switch'),('session_switch'),
  ('session_before_fork'),('session_fork'),('session_before_tree'),('session_tree'),
  ('session_shutdown'),('session_before_compact'),('session_compact'),
  ('before_agent_start'),('agent_start'),('agent_end'),('turn_start'),('turn_end'),
  ('message_start'),('message_update'),('message_end'),
  ('tool_call'),('tool_result'),('tool_execution_start'),('tool_execution_update'),
  ('tool_execution_end'),('context'),('before_provider_request'),
  ('input'),('user_bash'),('model_select'),('resources_discover')
)
SELECT e.name AS missing_event
FROM expected e
WHERE e.name NOT IN (SELECT DISTINCT event_name FROM events);

-- A3. Tool lifecycle completeness (orphaned events)
SELECT 'orphaned_start' AS issue, s.tool_call_id
FROM events s
WHERE s.event_name = 'tool_execution_start'
  AND s.tool_call_id NOT IN (SELECT tool_call_id FROM events WHERE event_name = 'tool_execution_end')
UNION ALL
SELECT 'orphaned_end', e.tool_call_id
FROM events e
WHERE e.event_name = 'tool_execution_end'
  AND e.tool_call_id NOT IN (SELECT tool_call_id FROM events WHERE event_name = 'tool_execution_start');

-- A4. Events per minute (throughput)
SELECT
  ts / 60000 * 60000 AS minute,
  COUNT(*) AS events
FROM events
GROUP BY minute
ORDER BY minute;

-- A5. can_intercept accuracy
SELECT event_name, can_intercept
FROM events
GROUP BY event_name, can_intercept
ORDER BY event_name;
-- Cross-reference against PI_HOOKS_REFERENCE.md table
```

---

## Appendix B. Test Execution Checklist

Run these in order. Mark each as pass/fail.

```
INFRASTRUCTURE
[ ] T0.1  XTDB health check
[ ] T0.2  Clean slate / record test_start timestamp
[ ] T0.3  Extension loaded (📊 status visible)
[ ] T1    Smoke test (≥1 row in events)
[ ] T2    Pre-connect buffer (session_directory + resources_discover present)

SESSION EVENTS
[ ] T3    session_directory — cwd populated, session_id null
[ ] T4    session_start — session_id populated
[ ] T5    session_before_switch (/new) — switch_reason = 'new'
[ ] T6    session_switch (/new) — switch_previous populated
[ ] T7    session_before_switch (/resume) — switch_target populated
[ ] T8    session_before_fork — fork_entry_id populated
[ ] T9    session_fork — fork_previous populated
[ ] T10   session_before_tree + session_tree — leaf IDs populated
[ ] T11   session_shutdown — row present after Ctrl+C exit

COMPACTION EVENTS
[ ] T12   session_before_compact — compact_tokens > 0
[ ] T13   session_compact — compact_from_ext populated

AGENT EVENTS
[ ] T14   before_agent_start — prompt_text matches typed prompt
[ ] T15   agent_start — row exists
[ ] T16   agent_end — agent_end_msg_count >= 1
[ ] T17   turn_start — turn_index >= 0, turn_timestamp recent
[ ] T18   turn_end — turn_index matches, pairing correct

MESSAGE EVENTS
[ ] T19   message_start — user + assistant roles present
[ ] T20   message_update — sampled, stream_delta_len > 0
[ ] T21   message_end — count matches message_start

TOOL EVENTS
[ ] T22   tool_call — tool_name, tool_call_id, payload present
[ ] T23   tool_result — matches tool_call, is_error = false
[ ] T24   tool_execution_start — matches tool_call
[ ] T25   tool_execution_update — sampled, small count
[ ] T26   tool_execution_end — full lifecycle pairing correct
[ ] T27   tool_result (error) — is_error = true
[ ] T28   context — context_msg_count >= 1
[ ] T28b  before_provider_request — provider_payload_bytes > 100

INPUT EVENTS
[ ] T29   input — input_text matches, input_source = 'interactive', truncation works
[ ] T30   user_bash — bash_command matches, bash_exclude variants

MODEL EVENTS
[ ] T31   model_select — model_provider + model_id non-null

RESOURCE EVENTS
[ ] T32   resources_discover — present on startup, count increases on /reload

SAFETY
[ ] T33.1 No interference — all interceptable events don't block/modify
[ ] T33.2 Error resilience — XTDB down doesn't crash pi
[ ] T33.3 No slowdown — async writes don't delay responses

SAMPLING
[ ] T34.1 message_update debounce — ≤15 rows per response
[ ] T34.2 tool_execution_update debounce — ≤10 rows per tool
[ ] T34.3 Sampler flush on end — at least 1 row for short responses

INFRASTRUCTURE INTEGRITY
[ ] T35.1 Base columns non-null on all rows
[ ] T35.2 Environment = 'pi.dev' only
[ ] T35.3 All 8 categories present
[ ] T35.4 Sequence monotonicity
[ ] T35.5 XTDB time-travel works
[ ] T35.6 Truncation limits enforced

FULL LIFECYCLE
[ ] T36   Complete session — all 30 event types present, sequence logical
```

**Total: 42 test cases covering all 30 events + safety + sampling + infrastructure.**
