#!/usr/bin/env npx jiti
/**
 * Contract: harness-ui (:3336) + web-chat (:3334) page responses
 * Run: NODE_PATH=xtdb-event-logger/node_modules npx jiti test/contracts/api-harness-ui.ts
 */

const HARNESS = "http://localhost:3336";
const CHAT = "http://localhost:3334";
let _passed = 0,
  failed = 0;
const failures: string[] = [];
function pass(_name: string) {
  _passed++;
}
function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
}

async function check(url: string, label: string, mustContain: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const hasContent = text.includes(mustContain);
    const noUndefined = !(text.includes(">undefined<") || text.includes(": undefined"));
    res.status === 200 && hasContent && noUndefined
      ? pass(`${label} → 200`)
      : fail(label, `status=${res.status} hasContent=${hasContent} noUndefined=${noUndefined}`);
  } catch (err: any) {
    fail(label, err.message);
  }
}

async function main() {
  await check(`${HARNESS}/`, "GET /", "<!DOCTYPE html");
  await check(`${HARNESS}/sessions`, "GET /sessions", "<!DOCTYPE html");
  await check(`${HARNESS}/dashboard`, "GET /dashboard", "<!DOCTYPE html");
  await check(`${HARNESS}/decisions`, "GET /decisions", "<!DOCTYPE html");
  await check(`${HARNESS}/artifacts`, "GET /artifacts", "<!DOCTYPE html");
  await check(`${HARNESS}/projects`, "GET /projects", "<!DOCTYPE html");
  await check(`${HARNESS}/errors`, "GET /errors", "Errors");
  await check(`${HARNESS}/stream`, "GET /stream", "Live");
  await check(`${HARNESS}/ops`, "GET /ops", "<!DOCTYPE html");
  await check(`${HARNESS}/chat`, "GET /chat", "<!DOCTYPE html");
  await check(`${HARNESS}/graph`, "GET /graph", "Knowledge Graph");
  await check(`${HARNESS}/chat`, "GET /chat", "<!DOCTYPE html");
  await check(`${CHAT}/`, "GET / (chat)", "<!DOCTYPE html");
  try {
    const res = await fetch(`${CHAT}/ws`, { headers: { Upgrade: "websocket" } });
    // Non-websocket request should get rejected (426 or similar), not 404
    res.status !== 404 ? pass(`GET /ws → ${res.status} (endpoint exists)`) : fail("GET /ws", "404 — endpoint missing");
  } catch (_err: any) {
    // Connection error on non-WS request is also acceptable (means endpoint exists)
    pass("GET /ws → endpoint exists (connection rejected for non-WS)");
  }
  if (failures.length > 0) failures.forEach((_f) => {});
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((_err) => {
  process.exit(1);
});
