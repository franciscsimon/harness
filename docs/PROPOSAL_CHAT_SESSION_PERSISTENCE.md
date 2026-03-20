# Proposal: Chat Session Persistence

## Problem

The web-chat UI loses all state on browser reload. Every page refresh opens a new WebSocket, generates a new `connectionId`, and calls `SessionManager.create(cwd)` — which always creates a new session file. Conversation history is lost. The user expects to continue where they left off.

## Current Architecture

### Session Flow (broken)

```
Browser reload → new WebSocket → randomUUID() connId → SessionManager.create(cwd) → empty session
```

### Key Files

| File | Role | Problem |
|---|---|---|
| `lib/session-pool.ts` | Creates AgentSession per WS connection | Always uses `SessionManager.create(cwd)` — always a fresh session |
| `server.ts` | WS handler, generates `connId = randomUUID()` | No way to reconnect to an existing session |
| `static/chat.js` | Client — connects WS on page load | No stored sessionId, no resume message |
| `lib/ws-protocol.ts` | Typed message definitions | No `init`/`resume` message type |
| `pages/chat.ts` | HTML shell | No session picker UI |

### What the SDK Provides

```typescript
SessionManager.create(cwd)           // Always creates new session file
SessionManager.continueRecent(cwd)   // Opens most recent session (or creates if none)
SessionManager.open(path)            // Opens a specific session file by path
SessionManager.list(cwd)             // Lists sessions: { path, id, firstMessage, messageCount, ... }

session.switchSession(sessionPath)   // Switch to different session file (within same AgentSession)
session.newSession()                 // Start fresh session (within same AgentSession)
session.sessionFile                  // Full path: ~/.pi/agent/sessions/<encoded-cwd>/2026-...jsonl
session.sessionId                    // UUID portion
```

Session data IS persisted to `.jsonl` files under `~/.pi/agent/sessions/<encoded-cwd>/`. The data survives everything — we're just never reopening it.

---

## Approach Evaluation

### Approach A: Server-side continueRecent on first connect

Change `SessionManager.create(cwd)` → `SessionManager.continueRecent(cwd)`.

| Criterion | Rating | Notes |
|---|---|---|
| Lines changed | ~5 | Just swap one function call |
| Browser reload | ✅ | Reopens most recent session |
| Server restart | ✅ | continueRecent reads from disk |
| Multi-tab | ❌ | Both tabs open the same session. Two tabs prompting = interleaved messages, corrupted context |
| Session picker | ❌ | No mechanism to select a specific session |
| Edge cases | Session deleted → creates new (OK). Two tabs → undefined behavior |

**Verdict**: Too simple. Multi-tab is fundamentally broken.

### Approach B: sessionStorage + init message

Client stores `sessionFile` path in `sessionStorage` (per-tab, survives reload). On WS connect, client sends `{ type: "init", sessionFile?: string }`. Server opens that file or falls back to `continueRecent`.

| Criterion | Rating | Notes |
|---|---|---|
| Lines changed | ~60 | New message type, modified init flow, sessionStorage reads/writes, session picker |
| Browser reload | ✅ | sessionStorage persists across reload → resumes exact session |
| Server restart | ✅ | Client reconnects with stored path → `SessionManager.open(path)` |
| Multi-tab | ✅ | sessionStorage is per-tab → each tab has independent session |
| Session picker | ✅ | User switches session → `switchSession(path)` → update sessionStorage |
| New tab | ✅ | No sessionStorage → `continueRecent(cwd)` → shows most recent |
| Edge cases | File deleted → catch error → fallback to continueRecent. cwd change → server sends new session_info → client updates |

**Verdict**: Right level of complexity. Per-tab isolation for free. Explicit resume protocol.

### Approach C: URL-based session routing

Session ID in URL: `/chat?session=<path>`.

| Criterion | Rating | Notes |
|---|---|---|
| Lines changed | ~100+ | URL routing, redirects, history API integration |
| Browser reload | ✅ | URL preserved → resumes session |
| Server restart | ✅ | Same URL → same session |
| Multi-tab | ✅ | Different URLs per tab |
| Session picker | ✅ | Navigate to new URL |
| Edge cases | Page navigation kills WebSocket → need reconnect logic. URL contains full file path → ugly, security concern |

**Verdict**: Over-engineered for a local dev tool. URL-based routing adds complexity without proportional benefit. WebSocket teardown on navigation is a real pain point.

### Approach D: Hybrid localStorage + server mapping

Server maintains `Map<sessionId, sessionFilePath>`. Client stores sessionId in localStorage with tab-scoping logic.

| Criterion | Rating | Notes |
|---|---|---|
| Lines changed | ~80 | Server-side mapping, client scoping logic, fallback chains |
| Browser reload | ✅ | |
| Server restart | ⚠️ | Server map is lost — must rebuild from `SessionManager.list()` on startup |
| Multi-tab | ⚠️ | localStorage is shared across tabs — needs manual tab ID generation for scoping |
| Edge cases | Tab ID management is fragile. Server mapping adds state that can get stale. |

**Verdict**: More complexity than B for the same result. sessionStorage already gives per-tab isolation — no need to reinvent it with localStorage + tab IDs.

---

## Recommendation: Approach B — sessionStorage + init message

### Why

1. **sessionStorage is purpose-built for this**: per-tab, survives reload, cleared on tab close. Exactly the semantics we need.
2. **~60 lines of change** across 5 files — no new files, no new dependencies.
3. **Graceful fallback**: missing/stale sessionFile → `continueRecent(cwd)` → always lands somewhere valid.
4. **SDK does the heavy lifting**: `SessionManager.open(path)` and `SessionManager.continueRecent(cwd)` handle all the disk I/O, message parsing, and context reconstruction.
5. **Session picker comes naturally**: `SessionManager.list(cwd)` already returns everything the UI needs.

### Desired Session Flow

```
Tab 1 (reload):
  sessionStorage has sessionFile → send init → SessionManager.open(path) → full history restored

Tab 2 (new):
  sessionStorage empty → send init (no path) → SessionManager.continueRecent(cwd) → most recent session

"New Session" button:
  session.newSession() → server sends session_info with new sessionFile → client updates sessionStorage

Session picker:
  session.switchSession(path) → server sends session_info → client updates sessionStorage

cwd change:
  server destroys session, creates new with continueRecent(newCwd) → sends session_info → client updates
```

---

## Implementation Plan

### Step 1: Add `init` client message and `sessionFile` to session_info

**File: `lib/ws-protocol.ts`**

Add to `ClientMessage` union:
```typescript
| { type: "init"; sessionFile?: string }
```

Add `sessionFile` field to the `session_info` server message:
```typescript
| { type: "session_info"; sessionId: string; sessionFile?: string; model: string; thinkingLevel: string; isStreaming: boolean }
```

**~4 lines changed**

### Step 2: Add `resumeOrCreatePoolSession` to session pool

**File: `lib/session-pool.ts`**

Add new function that accepts an optional `sessionFile` parameter:
```typescript
export async function resumeOrCreatePoolSession(
  connectionId: string,
  cwd: string,
  sessionFile?: string
): Promise<AgentSession>
```

Logic:
1. If `pool.size >= MAX_SESSIONS`, evict oldest (existing logic).
2. If `sessionFile` is provided:
   - Try `SessionManager.open(sessionFile)` in a try/catch.
   - On error (file missing/corrupted), fall through to step 3.
3. Fallback: `SessionManager.continueRecent(cwd)`.
4. Pass the `SessionManager` instance to `createAgentSession({ sessionManager })`.
5. Add to pool, return session.

Update `getSessionInfo` to include `session.sessionFile`:
```typescript
export function getSessionInfo(session: AgentSession): {
  sessionId: string;
  sessionFile?: string;
  model: string;
  thinkingLevel: string;
  isStreaming: boolean;
} {
  return {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    model: session.model?.id ?? "unknown",
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
  };
}
```

Keep `createPoolSession` as-is for backward compatibility, or replace it since only `server.ts` calls it. **Recommend**: rename `createPoolSession` → `resumeOrCreatePoolSession` with the new signature, update the single call site in server.ts.

**~20 lines changed**

### Step 3: Handle `init` message in server, change session initialization

**File: `server.ts`**

Current flow (broken):
```
onMessage → if !initialized && msg.type !== "list_sessions" → createPoolSession(connId, connCwd)
```

New flow:
```
onMessage(type: "init") → resumeOrCreatePoolSession(connId, connCwd, msg.sessionFile)
                        → subscribe, send session_info + history
                        → set initialized = true

onMessage(type: "prompt" && !initialized) → same as init with no sessionFile (auto-init)
```

Concrete changes:

1. Add `init` case before the existing `if (!initialized)` block.
2. Extract the initialization logic (create session, subscribe, send session_info + history) into a helper function:
   ```typescript
   async function initSession(connId, cwd, ws, sessionFile?) { ... }
   ```
3. Call `initSession` from both the `init` handler and the existing auto-init fallback.
4. In `initSession`, call `resumeOrCreatePoolSession(connId, cwd, sessionFile)`.
5. `session_info` message now includes `sessionFile` from `getSessionInfo()`.

For the `new_session` case: after `session.newSession()`, send the updated `session_info` (which now has the new `sessionFile`).

For the `switch_session` case: already sends `session_info` — just needs the `sessionFile` field which comes automatically from the updated `getSessionInfo`.

For the `set_cwd` case: already destroys session and resets `initialized = false`. Next message triggers re-init with `continueRecent(newCwd)`. Client's sessionStorage will be updated when it receives the new `session_info`.

**~25 lines changed (mostly refactoring existing init into helper)**

### Step 4: Client — send init, store sessionFile, handle session picker

**File: `static/chat.js`**

#### On connect — send init message:
```javascript
ws.onopen = () => {
  reconnectDelay = 1000;
  const sessionFile = sessionStorage.getItem("sessionFile");
  wsSend({ type: "init", sessionFile: sessionFile || undefined });
};
```

#### On session_info — update sessionStorage:
```javascript
case "session_info":
  if (msg.sessionFile) sessionStorage.setItem("sessionFile", msg.sessionFile);
  $sessionId.textContent = `Session: ${msg.sessionId.split("/").pop()}  ·  Model: ${msg.model}  ·  Thinking: ${msg.thinkingLevel}`;
  break;
```

#### On new session — clear and let server assign:
Already handled: `new_session` → server calls `session.newSession()` → sends back `session_info` with new `sessionFile` → client stores it.

#### On cwd change — clear sessionStorage:
```javascript
// In the cwd keydown handler:
if (cwd) {
  sessionStorage.removeItem("sessionFile");
  wsSend({ type: "set_cwd", cwd });
  $messages.innerHTML = "";
}
```

#### Session list handler — populate picker and handle selection:
```javascript
case "session_list":
  renderSessionPicker(msg.sessions);
  break;
```

Add `renderSessionPicker(sessions)` function:
- Populate a `<select>` or dropdown with `session.firstMessage` as display text (truncated to ~60 chars) and `session.path` as value.
- On selection change: `wsSend({ type: "switch_session", path: selectedPath })`.

#### Request session list on init:
After receiving `session_info` (session is ready), request the list:
```javascript
case "session_info":
  // ... existing code ...
  wsSend({ type: "list_sessions" });
  break;
```

**~20 lines changed**

### Step 5: Add session picker UI elements

**File: `pages/chat.ts`**

Add a `<select>` element in the `.chat-controls` div, next to the "New" button:
```html
<select id="session-picker" class="chat-session-picker" title="Switch session">
  <option value="">Sessions...</option>
</select>
```

**File: `static/chat.css`** (if needed)

Style the session picker to match existing controls (small select, dark theme).

**~10 lines changed**

### Step 6: Update `session_list` server message to include `path`

**File: `lib/ws-protocol.ts`**

The `session_list` message type currently has:
```typescript
sessions: Array<{ id: string; firstMessage: string; messageCount: number }>
```

Add `path`:
```typescript
sessions: Array<{ id: string; path: string; firstMessage: string; messageCount: number }>
```

**File: `server.ts`**

The `list_sessions` handler currently maps `SessionInfo` → `{ id, firstMessage, messageCount }`. Add `path`:
```typescript
send(ws, {
  type: "session_list",
  sessions: list.map(s => ({
    id: s.id,
    path: s.path,
    firstMessage: s.firstMessage ?? "",
    messageCount: s.messageCount,
  }))
});
```

**~4 lines changed**

---

## Summary of Changes

| File | Lines Changed | What |
|---|---|---|
| `lib/ws-protocol.ts` | ~6 | Add `init` message type, add `path` to session_list, add `sessionFile` to session_info |
| `lib/session-pool.ts` | ~20 | New `resumeOrCreatePoolSession` with `SessionManager.open`/`continueRecent`, add `sessionFile` to `getSessionInfo` |
| `server.ts` | ~25 | Handle `init` message, extract init helper, add `path` to list_sessions mapping |
| `static/chat.js` | ~20 | Send init on connect, store sessionFile in sessionStorage, session picker handler |
| `pages/chat.ts` | ~5 | Add `<select id="session-picker">` |
| `static/chat.css` | ~5 | Style session picker (optional) |
| **Total** | **~80** | |

## Dependency Order

```
Step 1 (ws-protocol types) → Step 2 (session-pool) → Step 3 (server) → Step 6 (session_list path)
                                                                      ↘ Step 4 (chat.js)
                                                                      ↘ Step 5 (chat.ts HTML)
```

Steps 4, 5, and 6 can be done in parallel after Step 3. Steps 1→2→3 must be sequential.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `SessionManager.open(path)` throws on corrupted/missing file | Medium (files can be deleted externally) | Catch error, fall back to `continueRecent(cwd)`, log warning |
| `continueRecent` returns empty session if no sessions exist for cwd | Low (first-time use) | Same as current behavior — user gets an empty session |
| sessionStorage cleared by browser privacy settings | Low | Fallback to `continueRecent` — user just sees most recent session instead of exact session |
| Race: two rapid reconnects before first init completes | Low | The `initialized` flag already guards against this. Could add a mutex if paranoid |
| Large session list with many sessions for a cwd | Low | `SessionManager.list()` is already used by the existing `list_sessions` handler. Could add pagination later |

## Verification

1. **Reload test**: Open chat → send a message → reload page → same conversation appears with full history.
2. **Multi-tab test**: Open two tabs → each sends a message → reload each independently → each shows its own conversation.
3. **New session test**: Click "New" → empty conversation → previous session still accessible via picker.
4. **Session picker test**: Select a past session from picker → history loads → can continue that conversation.
5. **Server restart test**: Kill and restart server → reload page → session resumes from where it was.
6. **cwd change test**: Change cwd → session resets → new cwd's most recent session loads (or empty if none).
7. **Missing file test**: Manually delete a session file → reload → gracefully falls back to most recent.

## What This Does NOT Address

- **Session naming/search**: Sessions are identified by first message and timestamp. A `/rename` command could be added later using `session.setSessionName()`.
- **Cross-device sync**: sessionStorage is per-browser. This is a local dev tool, so that's fine.
- **Session deletion from UI**: Not in scope. Sessions can be manually deleted from `~/.pi/agent/sessions/`.
- **Session forking/branching UI**: The SDK supports branching (`session.fork()`, `session.navigateTree()`), but exposing that in the chat UI is a separate feature.
