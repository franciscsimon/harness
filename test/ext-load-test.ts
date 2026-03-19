#!/usr/bin/env npx jiti
// Extension Load Test — verifies every deployed extension can load
// against a mock ExtensionAPI without crashing.
// Catches: wrong API methods, missing exports, import errors, factory crashes.
// Run: cd ~/harness/test && npx jiti ext-load-test.ts

import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Module resolution: local mocks first (test/node_modules/@mariozechner/pi-ai),
// then SDK deps (@sinclair/typebox etc), then global modules.
// NODE_PATH must be set BEFORE jiti starts — use the Taskfile or wrapper script.
// See: task ext:test
import { createMockPi, type ApiCall } from "./mock-pi.ts";

const EXT_DIR = join(process.env.HOME!, ".pi", "agent", "extensions");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, detail: string) { passed++; console.log(`  ✅ ${name} — ${detail}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  ❌ ${name} — ${reason}`); }

const dirs = readdirSync(EXT_DIR)
  .filter(d => {
    try {
      const dir = join(EXT_DIR, d);
      return statSync(dir).isDirectory() && existsSync(join(dir, "index.ts"));
    } catch { return false; }
  })
  .sort();

console.log(`\n── Extension Load Test (${dirs.length} extensions) ──\n`);

for (const name of dirs) {
  const entry = join(EXT_DIR, name, "index.ts");
  try {
    const mod = await import(entry + "?t=" + Date.now());
    const factory = mod.default;

    if (typeof factory !== "function") {
      fail(name, `default export is ${typeof factory}, expected function`);
      continue;
    }

    const { pi, calls } = createMockPi();

    // Run factory — may be sync or async
    await Promise.resolve(factory(pi));

    const methods = [...new Set(calls.map((c: ApiCall) => c.method))].join(", ");
    ok(name, `${calls.length} API calls: ${methods}`);
  } catch (err: any) {
    const msg = err.message?.split("\n")[0] ?? String(err);
    // Distinguish API errors from infra errors (DB, file system)
    const isApiError = msg.includes("Unknown ExtensionAPI method")
      || msg.includes("is not a function")
      || msg.includes("is not defined");
    const prefix = isApiError ? "🔴 API" : "🟡 INFRA";
    fail(name, `${prefix}: ${msg}`);
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
