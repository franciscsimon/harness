import { serve } from "@hono/node-server";
import app from "./app";

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${label}`);
    passed++;
  } catch (err: any) {
    console.log(`❌ ${label} — ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function run() {
  // Start server
  const server = serve({ fetch: app.fetch, port: PORT });
  await new Promise((r) => setTimeout(r, 200));

  // GET / — health/info endpoint
  await test("GET / returns 200", async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
  });

  await test("GET / returns correct body", async () => {
    const res = await fetch(`${BASE}/`);
    const body = await res.json();
    assert(body.name === "hello-service", `expected name "hello-service", got "${body.name}"`);
    assert(body.version === "1.0.0", `expected version "1.0.0", got "${body.version}"`);
  });

  // GET /hello/:name
  await test("GET /hello/World returns 200 with greeting", async () => {
    const res = await fetch(`${BASE}/hello/World`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.greeting === "Hello, World!", `expected "Hello, World!", got "${body.greeting}"`);
  });

  await test("GET /hello/Pi returns 200 with greeting", async () => {
    const res = await fetch(`${BASE}/hello/Pi`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.greeting === "Hello, Pi!", `expected "Hello, Pi!", got "${body.greeting}"`);
  });

  // 404 for unknown route
  await test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    assert(res.status === 404, `expected 404, got ${res.status}`);
  });

  // Summary
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

  // Stop server
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run();
