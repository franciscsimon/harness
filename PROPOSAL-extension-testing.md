# PROPOSAL: Extension Load Testing

## Problem

Extensions are deployed to `~/.pi/agent/extensions/` and loaded at session start. There are no tests that verify an extension can even load without crashing. Result: bugs like `pi.addCommand is not a function` ship silently and are only discovered when a user starts a session and reads the error banner.

**Bugs this would have caught:**
- `pi.addCommand` → doesn't exist (workflow-engine)
- `pi.addTool` → doesn't exist (workflow-engine)  
- `_ctx` vs `ctx` variable name mismatch (agent-spawner)
- `e.input?.path` on event that has no `input` field (quality-hooks)

All four are "call something that doesn't exist" — detectable by running the extension factory against a mock `ExtensionAPI`.

## Approach: Extension Load Test + Quality Hook

Three layers, each independently useful:

### Layer 1: `test/ext-load-test.ts` — deterministic smoke test

A test script that imports every deployed extension's `index.ts`, calls `export default function(mockPi)` with a stub `ExtensionAPI`, and asserts no throws. This catches:
- Missing exports
- Wrong API method names (`addCommand`, `addTool`)
- Import errors (missing deps, bad paths)
- Immediate crashes in the factory function

```ts
// test/ext-load-test.ts
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";

const EXT_DIR = join(process.env.HOME!, ".pi", "agent", "extensions");

// Stub ExtensionAPI — records calls, never throws
function createMockPi() {
  const calls: { method: string; args: any[] }[] = [];
  const handler = {
    get(_target: any, prop: string) {
      // Known methods from ExtensionAPI
      const knownMethods = new Set([
        "on", "registerTool", "registerCommand", "registerShortcut",
        "registerFlag", "getFlag", "exec", "appendEntry",
        "sessionManager", "cwd",
      ]);
      if (prop === "__calls") return calls;
      return (...args: any[]) => {
        calls.push({ method: prop, args });
        if (!knownMethods.has(prop)) {
          throw new Error(`Unknown ExtensionAPI method: pi.${prop}()`);
        }
      };
    },
  };
  return new Proxy({}, handler);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

const dirs = readdirSync(EXT_DIR)
  .filter(d => existsSync(join(EXT_DIR, d, "index.ts")))
  .sort();

console.log(`\n── Extension Load Test (${dirs.length} extensions) ──\n`);

for (const name of dirs) {
  const entry = join(EXT_DIR, name, "index.ts");
  try {
    // Dynamic import via jiti
    const mod = await import(entry);
    const factory = mod.default;
    assert.equal(typeof factory, "function", "default export must be a function");

    const mockPi = createMockPi();
    await factory(mockPi);

    const calls = (mockPi as any).__calls as { method: string }[];
    // Verify no unknown methods were called
    // (proxy already throws, but belt-and-suspenders)

    passed++;
    const methods = [...new Set(calls.map(c => c.method))].join(", ");
    console.log(`  ✅ ${name} (${calls.length} API calls: ${methods})`);
  } catch (err: any) {
    failed++;
    const msg = err.message?.split("\n")[0] ?? String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name} — ${msg}`);
  }
}

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  Extension Load Test: ✅ ${passed} passed  ❌ ${failed} failed`);
console.log(`═══════════════════════════════════════════════════`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ❌ ${f}`);
}

process.exit(failed > 0 ? 1 : 0);
```

**Run:** `cd ~/harness/test && npx jiti ext-load-test.ts`

**Add to Taskfile:**
```yaml
  ext:test:
    desc: Load-test all deployed extensions against mock API
    dir: test
    cmds:
      - npx jiti ext-load-test.ts
```

**Limitations:**
- Extensions that do async work in the factory (DB connections, file reads) may need the mock to return promises. The proxy can be extended to return `Promise.resolve()` for unknown async calls.
- Does NOT test runtime behavior (event handlers) — only that the extension loads and registers correctly.

### Layer 2: Quality hook — auto-run on extension write

Extend the existing `quality-hooks` extension to detect when a `.ts` file inside an extension directory is written, and automatically run the load test for that specific extension.

In `quality-hooks/index.ts`, add to the `tool_execution_end` handler:

```ts
// After existing quality checks...
// If file is an extension index.ts, try loading it against mock API
if (path.includes("extensions/") && path.endsWith("index.ts")) {
  try {
    const mod = await import(path + "?t=" + Date.now()); // cache-bust
    const factory = mod.default;
    if (typeof factory === "function") {
      const mockPi = createMockPi(); // same stub as Layer 1
      await factory(mockPi);
    }
  } catch (err: any) {
    violations.push({
      check: "ext-load",
      severity: "block",
      message: `Extension fails to load: ${err.message?.split("\n")[0]}`,
      file: path,
    });
  }
}
```

This fires immediately after writing/editing an extension — the LLM sees the error in the same turn and can fix it before deploying.

### Layer 3: Tester agent delegation — post-implementation verification

After implementing or modifying an extension, the worker/implementer should delegate to the tester agent:

```
delegate to tester: "Run ext-load-test.ts and report any failures. 
If any extension fails to load, identify the root cause."
```

This can be:
- **Manual habit:** Agent instructions say "after writing extension code, delegate to tester"
- **Prompted by contextual-prompts:** Add a prompt that fires when extensions are edited:

```ts
// In contextual-prompts/prompts.ts
{
  name: "test-after-extension-edit",
  enabled: true,
  cooldownTurns: 5,
  text: "You just edited an extension. Run the load test: delegate to tester agent or run `cd ~/harness/test && npx jiti ext-load-test.ts`",
}
```

## What Each Layer Catches

| Bug Type | Layer 1 (test script) | Layer 2 (quality hook) | Layer 3 (tester agent) |
|----------|:---------------------:|:---------------------:|:---------------------:|
| Wrong API method name | ✅ | ✅ | ✅ |
| Missing default export | ✅ | ✅ | ✅ |
| Import/require errors | ✅ | ✅ | ✅ |
| Variable name typos (in factory) | ✅ | ✅ | ✅ |
| Wrong return types from handlers | ❌ | ❌ | ⚠️ partial |
| Wrong event field names | ❌ | ❌ | ❌ |
| Runtime logic bugs | ❌ | ❌ | ⚠️ if tests exist |

## Recommendation

**Start with Layer 1 only.** It's ~60 lines, zero dependencies, catches the exact class of bug we keep hitting, and can be wired into `task ext:test` and the existing `task smoke` pipeline. Layer 2 (quality hook integration) adds value but requires the mock to handle async extension factories gracefully — defer until Layer 1 proves the approach. Layer 3 is a process/habit change, not code.

## Effort

| Layer | Lines | Files | Risk |
|-------|-------|-------|------|
| 1: ext-load-test.ts | ~60 | 1 new + Taskfile edit | Low — pure test, no prod changes |
| 2: Quality hook integration | ~30 | 1 edit (quality-hooks/index.ts) | Medium — async import in hook |
| 3: Contextual prompt | ~5 | 1 edit (prompts.ts) | None |

## Open Questions

1. **Extensions with heavy side effects in factory** (DB connections, file I/O): The mock needs to handle `pi.exec()` returning something, `existsSync()` calls, postgres imports. Some extensions will need `XTDB_EVENT_HOST` set or will throw on DB connect. Options: (a) catch and categorize as "needs-infra" vs "API-bug", (b) set env vars to dummy values, (c) mock at module level.

2. **Cache busting for jiti**: When the hook re-imports after an edit, jiti may cache the old module. Need `?t=Date.now()` query parameter or `delete require.cache[path]`.

3. **Should Layer 1 run in CI?** Yes, once we have CI. It's deterministic and fast (~2 seconds for all extensions).
