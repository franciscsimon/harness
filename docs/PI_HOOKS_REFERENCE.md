# Pi Extension Hooks/Events — Complete Reference

> Source: `@mariozechner/pi-coding-agent` extension API
> 29 hooks total across 7 categories

---

## Imports

```typescript
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult, keyHint } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text, Component } from "@mariozechner/pi-tui";
```

---

## Extension Entry Point

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("event_name", async (event, ctx) => { /* ... */ });
  pi.registerTool({ /* ... */ });
  pi.registerCommand("name", { /* ... */ });
  pi.registerShortcut("ctrl+x", { /* ... */ });
  pi.registerFlag("my-flag", { /* ... */ });
}
```

---

## Lifecycle Flow

```
pi starts
  │
  ├─► session_directory          (CLI only, no ctx)
  ├─► resources_discover         (startup + /reload)
  └─► session_start
      │
      ▼
user sends prompt ─────────────────────────────────────────┐
  │                                                        │
  ├─► (extension commands checked first)                   │
  ├─► input                                                │
  ├─► (skill/template expansion)                           │
  ├─► before_agent_start                                   │
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn (repeats while LLM calls tools) ───┐      │
  │   │                                             │      │
  │   ├─► turn_start                                │      │
  │   ├─► context                                   │      │
  │   ├─► before_provider_request                   │      │
  │   │                                             │      │
  │   │   LLM responds, may call tools:             │      │
  │   │     ├─► tool_execution_start                │      │
  │   │     ├─► tool_call (can block)               │      │
  │   │     ├─► tool_execution_update               │      │
  │   │     ├─► tool_result (can modify)            │      │
  │   │     └─► tool_execution_end                  │      │
  │   │                                             │      │
  │   └─► turn_end                                  │      │
  │                                                        │
  └─► agent_end                                            │
                                                           │
user sends another prompt ◄────────────────────────────────┘

/new or /resume     → session_before_switch → session_switch
/fork               → session_before_fork   → session_fork
/compact            → session_before_compact → session_compact
/tree               → session_before_tree   → session_tree
/model or Ctrl+P    → model_select
exit                → session_shutdown
```

---

## 1. Session Lifecycle Events

### session_directory

CLI-only, startup-only. No `ctx`. Override session storage location.
Not emitted in SDK mode. Not emitted for `/new` or `/resume`.
Bypassed when `--session-dir` is provided. If multiple extensions return, last wins.

```typescript
pi.on("session_directory", async (event) => {
  // event.cwd — current working directory
  return {
    sessionDir: `/tmp/pi-sessions/${encodeURIComponent(event.cwd)}`,
  };
});
```

**Event fields:** `{ cwd: string }`
**Return:** `{ sessionDir?: string }` or `undefined`

---

### session_start

Fired on initial session load.

```typescript
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.notify(`Session: ${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`, "info");
});
```

**Event fields:** `{}`
**Return:** `void`

---

### session_before_switch

Fired before `/new` or `/resume`. Can cancel.

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason      — "new" | "resume"
  // event.targetSessionFile — only for "resume"

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("Clear?", "Delete all messages?");
    if (!ok) return { cancel: true };
  }
});
```

**Event fields:** `{ reason: "new" | "resume", targetSessionFile?: string }`
**Return:** `{ cancel?: boolean }` or `undefined`

---

### session_switch

Fired after session switch completes.

```typescript
pi.on("session_switch", async (event, ctx) => {
  // event.reason              — "new" | "resume"
  // event.previousSessionFile — session we came from
});
```

**Event fields:** `{ reason: "new" | "resume", previousSessionFile?: string }`
**Return:** `void`

---

### session_before_fork

Fired before `/fork`. Can cancel or skip conversation restore.

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId — ID of the entry being forked from

  return { cancel: true };
  // OR
  return { skipConversationRestore: true };
});
```

**Event fields:** `{ entryId: string }`
**Return:** `{ cancel?: boolean, skipConversationRestore?: boolean }` or `undefined`

---

### session_fork

Fired after fork completes.

```typescript
pi.on("session_fork", async (event, ctx) => {
  // event.previousSessionFile — previous session file
});
```

**Event fields:** `{ previousSessionFile?: string }`
**Return:** `void`

---

### session_before_tree

Fired before `/tree` navigation. Can cancel or provide custom summary.

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  // event.preparation — tree preparation data
  // event.signal      — AbortSignal

  return { cancel: true };
  // OR
  return { summary: { summary: "...", details: {} } };
});
```

**Event fields:** `{ preparation: object, signal: AbortSignal }`
**Return:** `{ cancel?: boolean, summary?: { summary: string, details: object } }` or `undefined`

---

### session_tree

Fired after tree navigation completes.

```typescript
pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId     — new leaf entry ID
  // event.oldLeafId     — old leaf entry ID
  // event.summaryEntry  — summary entry (if summarized)
  // event.fromExtension — whether extension provided the summary
});
```

**Event fields:** `{ newLeafId: string, oldLeafId: string, summaryEntry?: object, fromExtension: boolean }`
**Return:** `void`

---

### session_shutdown

Fired on exit (Ctrl+C, Ctrl+D, SIGTERM). Use for cleanup.

```typescript
pi.on("session_shutdown", async (_event, ctx) => {
  // cleanup, save state, close connections, etc.
});
```

**Event fields:** `{}`
**Return:** `void`

---

## 2. Compaction Events

### session_before_compact

Fired before `/compact` or auto-compaction. Can cancel or provide custom summary.

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  // event.preparation       — { firstKeptEntryId, tokensBefore, ... }
  // event.branchEntries     — entries on current branch
  // event.customInstructions — user-provided instructions (if any)
  // event.signal            — AbortSignal

  // Cancel:
  return { cancel: true };

  // Custom summary:
  return {
    compaction: {
      summary: "Custom summary of conversation so far...",
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
    },
  };
});
```

**Event fields:** `{ preparation: { firstKeptEntryId: string, tokensBefore: number }, branchEntries: Entry[], customInstructions?: string, signal: AbortSignal }`
**Return:** `{ cancel?: boolean, compaction?: { summary: string, firstKeptEntryId: string, tokensBefore: number } }` or `undefined`

---

### session_compact

Fired after compaction completes.

```typescript
pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry — the saved compaction entry
  // event.fromExtension   — whether an extension provided the summary
});
```

**Event fields:** `{ compactionEntry: object, fromExtension: boolean }`
**Return:** `void`

---

## 3. Agent Lifecycle Events

### before_agent_start

Fired after user submits prompt, before agent loop. Can inject a message and/or modify system prompt.
Chained across extensions (each sees previous systemPrompt modifications).

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt      — user's prompt text
  // event.images      — attached images (if any)
  // event.systemPrompt — current system prompt (chained across extensions)

  return {
    // Inject a persistent message (stored in session, sent to LLM)
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,       // show in TUI
      details: { /* ... */ },
    },
    // Replace the system prompt for this turn
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});
```

**Event fields:** `{ prompt: string, images?: ImageContent[], systemPrompt: string }`
**Return:** `{ message?: HookMessage, systemPrompt?: string }` or `undefined`

**HookMessage shape:**
```typescript
{
  customType: string;      // your extension identifier
  content: string;         // text content sent to LLM
  display?: boolean;       // show in TUI (default false)
  details?: Record<string, any>; // metadata for rendering
}
```

---

### agent_start

Fired once when agent begins processing a prompt.

```typescript
pi.on("agent_start", async (_event, ctx) => {});
```

**Event fields:** `{}`
**Return:** `void`

---

### agent_end

Fired once when agent finishes processing a prompt.

```typescript
pi.on("agent_end", async (event, ctx) => {
  // event.messages — all messages from this prompt
});
```

**Event fields:** `{ messages: AgentMessage[] }`
**Return:** `void`

---

### turn_start

Fired at the start of each turn (one LLM response + tool calls).

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex — 0-based turn index
  // event.timestamp — timestamp
});
```

**Event fields:** `{ turnIndex: number, timestamp: number }`
**Return:** `void`

---

### turn_end

Fired at the end of each turn.

```typescript
pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex   — 0-based turn index
  // event.message     — assistant response message
  // event.toolResults — tool results from this turn
});
```

**Event fields:** `{ turnIndex: number, message: AgentMessage, toolResults: ToolResult[] }`
**Return:** `void`

---

## 4. Message Events

### message_start

Fired when a new message starts (user, assistant, or toolResult).

```typescript
pi.on("message_start", async (event, ctx) => {
  // event.message — the message object
});
```

**Event fields:** `{ message: AgentMessage }`
**Return:** `void`

---

### message_update

Fired for assistant streaming updates (token-by-token). Only fires for assistant messages.

```typescript
pi.on("message_update", async (event, ctx) => {
  // event.message               — current message state
  // event.assistantMessageEvent — stream event with delta
  //   .type = "text_delta"    → .delta has text chunk
  //   .type = "thinking_delta" → .delta has thinking chunk
});
```

**Event fields:** `{ message: AgentMessage, assistantMessageEvent: { type: "text_delta" | "thinking_delta" | ..., delta?: string } }`
**Return:** `void`

---

### message_end

Fired when a message is complete.

```typescript
pi.on("message_end", async (event, ctx) => {
  // event.message — the completed message
});
```

**Event fields:** `{ message: AgentMessage }`
**Return:** `void`

---

## 5. Tool Events

### tool_call

Fired after `tool_execution_start`, before the tool executes. **Can block.**
`ctx.sessionManager` is synced through the current assistant message before handlers run.
In parallel tool mode, sibling tool results from the same assistant message may not be visible.

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName   — "bash", "read", "write", "edit", "grep", "find", "ls", or custom
  // event.toolCallId — unique ID for this call
  // event.input      — tool parameters (untyped unless narrowed)

  // Type-narrow built-in tools:
  if (isToolCallEventType("bash", event)) {
    // event.input is { command: string; timeout?: number }
    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command blocked" };
    }
  }

  if (isToolCallEventType("read", event)) {
    // event.input is { path: string; offset?: number; limit?: number }
  }

  if (isToolCallEventType("write", event)) {
    // event.input is { path: string; content: string }
  }

  if (isToolCallEventType("edit", event)) {
    // event.input is { path: string; oldText: string; newText: string }
  }

  // Type-narrow custom tools (provide type params):
  // if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) { ... }
});
```

**Event fields:** `{ toolName: string, toolCallId: string, input: Record<string, any> }`
**Return:** `{ block?: boolean, reason?: string }` or `undefined`

---

### tool_result

Fired after tool execution, before `tool_execution_end`. **Can modify result.**
Handlers chain in extension load order — each sees latest result after previous handler.
Return partial patches; omitted fields keep current values.

```typescript
import { isBashToolResult } from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName   — tool name
  // event.toolCallId — unique ID
  // event.input      — original tool parameters
  // event.content    — result content array [{type:"text", text:"..."}]
  // event.details    — result details object
  // event.isError    — whether execution errored

  if (isBashToolResult(event)) {
    // event.details is typed as BashToolDetails
  }

  // Modify result (partial patch):
  return {
    content: [{ type: "text", text: "Modified output" }],
    details: { modified: true },
    isError: false,
  };
});
```

**Event fields:** `{ toolName: string, toolCallId: string, input: object, content: ContentBlock[], details: object, isError: boolean }`
**Return:** `{ content?: ContentBlock[], details?: object, isError?: boolean }` or `undefined`

---

### tool_execution_start

Fired when tool execution begins. Observational.

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId — unique ID
  // event.toolName   — tool name
  // event.args       — tool arguments
});
```

**Event fields:** `{ toolCallId: string, toolName: string, args: object }`
**Return:** `void`

---

### tool_execution_update

Fired during tool execution for streaming partial output.
In parallel mode, updates may interleave across tools.

```typescript
pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId   — unique ID
  // event.toolName     — tool name
  // event.args         — tool arguments
  // event.partialResult — streaming partial result
});
```

**Event fields:** `{ toolCallId: string, toolName: string, args: object, partialResult: object }`
**Return:** `void`

---

### tool_execution_end

Fired when tool execution completes.
In parallel mode, emitted in assistant source order (matching final tool result message order).

```typescript
pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId — unique ID
  // event.toolName   — tool name
  // event.result     — final result
  // event.isError    — whether it errored
});
```

**Event fields:** `{ toolCallId: string, toolName: string, result: object, isError: boolean }`
**Return:** `void`

---

### context

Fired before each LLM call. Modify messages non-destructively.
Receives a deep copy — safe to mutate.

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages — deep copy of message array

  // Filter, inject, rewrite messages:
  const filtered = event.messages.filter((m) => !shouldPrune(m));
  return { messages: filtered };
});
```

**Event fields:** `{ messages: AgentMessage[] }`
**Return:** `{ messages?: AgentMessage[] }` or `undefined`

---

### before_provider_request

Fired after provider payload is built, right before the HTTP request.
Handlers run in extension load order. Return `undefined` to keep unchanged, or return modified payload.

```typescript
pi.on("before_provider_request", (event, ctx) => {
  // event.payload — provider-specific request payload (Anthropic, OpenAI, etc.)

  console.log(JSON.stringify(event.payload, null, 2));

  // Optional: replace payload
  // return { ...event.payload, temperature: 0 };
});
```

**Event fields:** `{ payload: object }`
**Return:** modified payload object or `undefined`

---

## 6. Input & User Events

### input

Fired when user input is received. After extension commands are checked, before skill/template expansion.
Sees raw input text (`/skill:foo` and `/template` not yet expanded).

**Processing order:**
1. Extension commands (`/cmd`) → if found, handler runs, `input` skipped
2. `input` event fires
3. Skill commands (`/skill:name`) expanded
4. Prompt templates (`/template`) expanded
5. Agent processing begins

```typescript
pi.on("input", async (event, ctx) => {
  // event.text   — raw input text (before expansion)
  // event.images — attached images, if any
  // event.source — "interactive" | "rpc" | "extension"

  // Transform: rewrite input before expansion
  if (event.text.startsWith("?quick ")) {
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };
  }

  // Handle: respond without LLM (extension handles it)
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // Continue: pass through unchanged (default)
  return { action: "continue" };
});
```

**Event fields:** `{ text: string, images?: ImageContent[], source: "interactive" | "rpc" | "extension" }`
**Return:** `{ action: "continue" } | { action: "transform", text: string, images?: ImageContent[] } | { action: "handled" }` or `undefined` (= continue)

Transforms chain across handlers. First handler returning `"handled"` wins.

---

### user_bash

Fired when user executes `!` or `!!` shell commands. Can intercept.

```typescript
pi.on("user_bash", (event, ctx) => {
  // event.command            — the bash command
  // event.excludeFromContext — true if !! prefix
  // event.cwd               — working directory

  // Provide custom operations (e.g., SSH):
  return { operations: remoteBashOps };

  // OR full replacement — return result directly:
  return {
    result: {
      output: "custom output",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    },
  };
});
```

**Event fields:** `{ command: string, excludeFromContext: boolean, cwd: string }`
**Return:** `{ operations?: BashOperations } | { result?: BashResult }` or `undefined`

---

## 7. Model & Resource Events

### model_select

Fired when the model changes via `/model`, Ctrl+P cycling, or session restore.

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model         — newly selected model { provider, id, name, ... }
  // event.previousModel — previous model (undefined if first selection)
  // event.source        — "set" | "cycle" | "restore"

  const prev = event.previousModel
    ? `${event.previousModel.provider}/${event.previousModel.id}`
    : "none";
  const next = `${event.model.provider}/${event.model.id}`;
  ctx.ui.notify(`Model: ${prev} → ${next} (${event.source})`, "info");
});
```

**Event fields:** `{ model: Model, previousModel?: Model, source: "set" | "cycle" | "restore" }`
**Return:** `void`

---

### resources_discover

Fired during resource loading (startup + `/reload`). Inject custom skills, prompts, and themes dynamically.

```typescript
pi.on("resources_discover", () => {
  return {
    skillPaths: ["/path/to/SKILL.md"],
    promptPaths: ["/path/to/prompt.md"],
    themePaths: ["/path/to/theme.json"],
  };
});
```

**Event fields:** `{}`
**Return:** `{ skillPaths?: string[], promptPaths?: string[], themePaths?: string[] }` or `undefined`

---

## ExtensionContext (ctx)

All handlers except `session_directory` receive `ctx: ExtensionContext`.

### ctx.ui — User Interaction

```typescript
// Dialogs (blocking)
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("Title", "Are you sure?");
const name = await ctx.ui.input("Name:", "placeholder");
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Timed dialogs (auto-dismiss with countdown)
const ok = await ctx.ui.confirm("Title", "Message", { timeout: 5000 });
const choice = await ctx.ui.select("Pick:", items, { timeout: 3000 });
const val = await ctx.ui.input("Name:", "", { timeout: 10000 });

// Manual dismissal with AbortSignal
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const ok = await ctx.ui.confirm("Title", "Msg", { signal: controller.signal });

// Notifications (non-blocking)
ctx.ui.notify("Done!", "info");     // "info" | "warning" | "error" | "success"

// Footer status (persistent until cleared)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // clear

// Working message (shown during streaming)
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // restore default

// Widget (above editor by default)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
ctx.ui.setWidget("my-widget", ["Line 1"], { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // clear

// Custom footer (replaces built-in entirely)
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // restore

// Terminal title
ctx.ui.setTitle("pi - my-project");

// Editor text
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();
ctx.ui.pasteToEditor("pasted content");

// Tool output expansion
ctx.ui.setToolsExpanded(true);
const wasExpanded = ctx.ui.getToolsExpanded();

// Custom editor component
ctx.ui.setEditorComponent((tui, theme, keybindings) => new MyEditor(theme, keybindings));
ctx.ui.setEditorComponent(undefined);  // restore default

// Custom component (replaces editor temporarily)
const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter/Escape", 1, 1);
  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };
  return text;
});

// Overlay component (floating modal)
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlay({ onClose: done }),
  { overlay: true, overlayOptions: { anchor: "top-right", width: "50%", margin: 2 } }
);

// Theme management
const themes = ctx.ui.getAllThemes();
const theme = ctx.ui.getTheme("light");
ctx.ui.setTheme("light");
ctx.ui.setTheme(themeObject);
```

### ctx — Other Properties

```typescript
ctx.hasUI          // false in print mode (-p) and JSON mode
ctx.cwd            // current working directory

// Session state (read-only)
ctx.sessionManager.getEntries()       // all entries
ctx.sessionManager.getBranch()        // current branch
ctx.sessionManager.getLeafId()        // current leaf entry ID
ctx.sessionManager.getEntry(id)       // entry by ID
ctx.sessionManager.getChildren(id)    // direct children
ctx.sessionManager.getLabel(id)       // label for entry
ctx.sessionManager.getSessionFile()   // session file path

// Model access
ctx.modelRegistry                     // find models, get available
ctx.model                             // current model

// Control flow
ctx.isIdle()                          // is agent idle?
ctx.abort()                           // abort current operation
ctx.hasPendingMessages()              // are there queued messages?
ctx.shutdown()                        // graceful shutdown (deferred until idle)

// Context usage
const usage = ctx.getContextUsage();  // { tokens: number, ... } | undefined

// Compaction
ctx.compact({
  customInstructions: "Focus on recent changes",
  onComplete: (result) => { /* ... */ },
  onError: (error) => { /* ... */ },
});

// System prompt
const prompt = ctx.getSystemPrompt();
```

---

## ExtensionAPI (pi) Methods

### Event Subscription

```typescript
pi.on("event_name", async (event, ctx) => { /* ... */ });
```

### Tool Registration

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "One-line entry in Available tools section",
  promptGuidelines: ["Bullet added to Guidelines when tool is active"],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // StringEnum for Google compat
    text: Type.Optional(Type.String()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (signal?.aborted) return { content: [{ type: "text", text: "Cancelled" }] };
    onUpdate?.({ content: [{ type: "text", text: "Working..." }], details: { progress: 50 } });
    return {
      content: [{ type: "text", text: "Done" }],  // sent to LLM
      details: { data: "..." },                    // for rendering & state
    };
  },
  renderCall(args, theme) { /* return Component */ },
  renderResult(result, { expanded, isPartial }, theme) { /* return Component */ },
});
```

**Error signaling:** Throw to set `isError: true`. Return value never sets error flag.

### Tool Management

```typescript
const active = pi.getActiveTools();       // ["read", "bash", "edit", "write"]
const all = pi.getAllTools();             // [{ name, description, ... }]
pi.setActiveTools(["read", "bash"]);     // enable/disable tools at runtime
```

### Message Injection

```typescript
// Custom message (not a user message)
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { /* ... */ },
}, {
  deliverAs: "steer",     // "steer" (default) | "followUp" | "nextTurn"
  triggerTurn: true,       // if idle, trigger LLM response (steer/followUp only)
});

// User message (appears as if typed by user, always triggers turn)
pi.sendUserMessage("What is 2+2?");
pi.sendUserMessage([
  { type: "text", text: "Describe:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);
// During streaming — must specify delivery:
pi.sendUserMessage("Focus on errors", { deliverAs: "steer" });
pi.sendUserMessage("Then summarize", { deliverAs: "followUp" });
```

**deliverAs modes:**
- `"steer"` — Interrupts streaming. Delivered after current tool, remaining skipped.
- `"followUp"` — Waits for agent to finish. Delivered when no more tool calls.
- `"nextTurn"` — Queued for next user prompt. No interrupt or trigger.

### Session State Persistence

```typescript
// Persist extension state (NOT sent to LLM)
pi.appendEntry("my-state", { count: 42 });

// Session naming
pi.setSessionName("Refactor auth module");
const name = pi.getSessionName();

// Entry labels (bookmarks for /tree)
pi.setLabel(entryId, "checkpoint-before-refactor");
pi.setLabel(entryId, undefined);  // clear
```

### Commands

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  getArgumentCompletions: (prefix) => {
    // return AutocompleteItem[] | null
    return [{ value: "dev", label: "dev" }].filter((i) => i.value.startsWith(prefix));
  },
  handler: async (args, ctx) => {
    // ctx is ExtensionCommandContext (extends ExtensionContext)
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  },
});

// List all commands
const commands = pi.getCommands();
// [{ name, description?, source: "extension"|"prompt"|"skill", location?, path? }]
```

### ExtensionCommandContext Extras

Command handlers get `ExtensionCommandContext` with session control methods (only safe in commands, not events):

```typescript
await ctx.waitForIdle();

await ctx.newSession({ parentSession: ctx.sessionManager.getSessionFile() });
await ctx.fork("entry-id-123");
await ctx.navigateTree("entry-id-456", {
  summarize: true,
  customInstructions: "Focus on error handling",
  replaceInstructions: false,
  label: "review-checkpoint",
});
await ctx.reload();  // treat as terminal: await ctx.reload(); return;
```

### Shortcuts

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

### Flags

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});
if (pi.getFlag("--plan")) { /* ... */ }
```

### Shell Execution

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### Model Control

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
}
const level = pi.getThinkingLevel();   // "off"|"minimal"|"low"|"medium"|"high"|"xhigh"
pi.setThinkingLevel("high");
```

### Provider Registration

```typescript
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_API_KEY",  // env var name or literal
  api: "anthropic-messages", // or "openai-completions", "openai-responses"
  headers: {},               // custom headers
  authHeader: true,          // auto Authorization: Bearer
  models: [{ id, name, reasoning, input, cost, contextWindow, maxTokens }],
  oauth: { name, login, refreshToken, getApiKey },  // for /login support
});

pi.unregisterProvider("my-proxy");  // remove, restore built-in models
```

### Inter-Extension Communication

```typescript
pi.events.on("my:event", (data) => { /* ... */ });
pi.events.emit("my:event", { key: "value" });
```

### Message Rendering

```typescript
pi.registerMessageRenderer("my-extension", (message, { expanded }, theme) => {
  let text = theme.fg("accent", `[${message.customType}] `) + message.content;
  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }
  return new Text(text, 0, 0);
});
```

---

## Quick Reference: All 29 Hooks

| # | Hook | Category | Can Intercept | ctx |
|---|------|----------|---------------|-----|
| 1 | `session_directory` | Session | ✅ returns sessionDir | ❌ |
| 2 | `session_start` | Session | — | ✅ |
| 3 | `session_before_switch` | Session | ✅ cancel | ✅ |
| 4 | `session_switch` | Session | — | ✅ |
| 5 | `session_before_fork` | Session | ✅ cancel / skipRestore | ✅ |
| 6 | `session_fork` | Session | — | ✅ |
| 7 | `session_before_tree` | Session | ✅ cancel / summary | ✅ |
| 8 | `session_tree` | Session | — | ✅ |
| 9 | `session_shutdown` | Session | — | ✅ |
| 10 | `session_before_compact` | Compaction | ✅ cancel / summary | ✅ |
| 11 | `session_compact` | Compaction | — | ✅ |
| 12 | `before_agent_start` | Agent | ✅ message / systemPrompt | ✅ |
| 13 | `agent_start` | Agent | — | ✅ |
| 14 | `agent_end` | Agent | — | ✅ |
| 15 | `turn_start` | Agent | — | ✅ |
| 16 | `turn_end` | Agent | — | ✅ |
| 17 | `message_start` | Message | — | ✅ |
| 18 | `message_update` | Message | — | ✅ |
| 19 | `message_end` | Message | — | ✅ |
| 20 | `tool_call` | Tool | ✅ block | ✅ |
| 21 | `tool_result` | Tool | ✅ modify result | ✅ |
| 22 | `tool_execution_start` | Tool | — | ✅ |
| 23 | `tool_execution_update` | Tool | — | ✅ |
| 24 | `tool_execution_end` | Tool | — | ✅ |
| 25 | `context` | Tool | ✅ modify messages | ✅ |
| 26 | `before_provider_request` | Tool | ✅ modify payload | ✅ |
| 27 | `input` | Input | ✅ transform / handle | ✅ |
| 28 | `user_bash` | Input | ✅ operations / result | ✅ |
| 29 | `model_select` | Model | — | ✅ |
| 30 | `resources_discover` | Resource | ✅ paths | — |
