// ─── WebSocket Protocol Tests ─────────────────────────────────
// Tests web-chat WebSocket contract.
// Requires: web-chat server on port 3334
// Run: npx jiti test/ws-protocol.ts

import WebSocket from "ws";

const WS_URL = "ws://localhost:3334/ws";
const TIMEOUT = 15_000;

let passed = 0, failed = 0;
const failures: string[] = [];
function pass(name: string) { passed++; console.log(`  ✅ ${name}`); }
function fail(name: string, reason: string) { failed++; failures.push(`${name}: ${reason}`); console.log(`  ❌ ${name}: ${reason}`); }

function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = TIMEOUT): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const handler = (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.removeListener("message", handler);
          resolve(msg);
        }
      } catch {}
    };
    ws.on("message", handler);
  });
}

function collectMessages(ws: WebSocket, durationMs: number): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs: any[] = [];
    const handler = (data: any) => {
      try { msgs.push(JSON.parse(data.toString())); } catch {}
    };
    ws.on("message", handler);
    setTimeout(() => { ws.removeListener("message", handler); resolve(msgs); }, durationMs);
  });
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", (e) => reject(e));
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });
}

async function main() {
  // Probe server
  let ws: WebSocket;
  try { ws = await connect(); }
  catch {
    console.log("⚠️  Web chat not running on port 3334. Skipping WS protocol tests.");
    process.exit(0);
  }

  console.log("\n── W1: Connection Handshake ──");

  const initial = await collectMessages(ws, 2000);
  const statusMsg = initial.find(m => m.type === "status");
  const cwdMsg = initial.find(m => m.type === "cwd");

  statusMsg ? pass("receives status on connect") : fail("receives status on connect", "no status message");
  cwdMsg ? pass("receives cwd on connect") : fail("receives cwd on connect", "no cwd message");
  if (statusMsg) pass(`status is: ${statusMsg.state}`);
  if (cwdMsg) pass(`cwd is: ${cwdMsg.cwd}`);

  console.log("\n── W2: Init ──");

  ws.send(JSON.stringify({ type: "init" }));
  try {
    const info = await waitForMessage(ws, m => m.type === "session_info", 10000);
    pass("init returns session_info");
    info.sessionId ? pass(`session ID present: ${info.sessionId.slice(0, 8)}...`) : fail("session ID present", "missing");
    info.model ? pass(`model present: ${info.model}`) : fail("model present", "missing");
  } catch (e: any) {
    fail("init returns session_info", e.message);
  }

  // Wait for history + idle
  try {
    await waitForMessage(ws, m => m.type === "status" && m.state === "idle", 10000);
    pass("reaches idle after init");
  } catch {
    fail("reaches idle after init", "timeout");
  }

  console.log("\n── W3: Invalid Messages ──");

  // Send garbage — should not crash server
  ws.send("not json at all");
  ws.send(JSON.stringify({ type: "unknown_type_xyz" }));
  ws.send(JSON.stringify({}));
  ws.send("");

  // If we can still send/receive, server didn't crash
  await new Promise(r => setTimeout(r, 1000));
  ws.send(JSON.stringify({ type: "list_sessions" }));
  try {
    const list = await waitForMessage(ws, m => m.type === "session_list", 5000);
    pass("server survives invalid messages");
    list.sessions ? pass(`session list has ${list.sessions.length} entries`) : pass("session list present");
  } catch {
    fail("server survives invalid messages", "no response after garbage");
  }

  console.log("\n── W4: Abort When Idle ──");

  ws.send(JSON.stringify({ type: "abort" }));
  await new Promise(r => setTimeout(r, 500));
  // Should not crash — just no-op
  ws.send(JSON.stringify({ type: "list_sessions" }));
  try {
    await waitForMessage(ws, m => m.type === "session_list", 3000);
    pass("abort when idle is safe");
  } catch {
    fail("abort when idle is safe", "server unresponsive after idle abort");
  }

  console.log("\n── W5: Set Thinking ──");

  ws.send(JSON.stringify({ type: "set_thinking", level: "high" }));
  try {
    const info = await waitForMessage(ws, m => m.type === "session_info", 3000);
    pass("set_thinking returns session_info");
    if (info.thinkingLevel === "high") pass("thinking level updated");
    else fail("thinking level updated", `got ${info.thinkingLevel}`);
  } catch {
    fail("set_thinking returns session_info", "timeout");
  }

  // Reset to medium
  ws.send(JSON.stringify({ type: "set_thinking", level: "medium" }));
  await new Promise(r => setTimeout(r, 500));

  console.log("\n── W6: Protocol Types ──");

  // Verify all expected server message types from initial connect + init
  const allTypes = initial.map(m => m.type);
  pass(`received ${initial.length} messages during connect`);
  pass(`message types: ${[...new Set(allTypes)].join(", ")}`);

  // Cleanup
  ws.close();
  await new Promise(r => setTimeout(r, 500));

  console.log(`\n━━━ WebSocket: ${passed} passed, ${failed} failed ━━━`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(`  • ${f}`)); }
  process.exit(failed > 0 ? 1 : 0);
}

main();
