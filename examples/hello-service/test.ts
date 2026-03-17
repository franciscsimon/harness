import { strict as assert } from "node:assert";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { registerRoutes } from "./routes";

const PORT = 9876;
const BASE = `http://localhost:${PORT}`;

async function run() {
  const app = new Hono();
  registerRoutes(app);

  const server = serve({ fetch: app.fetch, port: PORT });
  await new Promise((r) => setTimeout(r, 500));

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  console.log("hello-service tests\n");

  // 1. GET / — correct JSON shape
  await test("GET / returns 200 with { name, version }", async () => {
    const res = await fetch(BASE);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/json"));
    const body = await res.json();
    assert.equal(body.name, "hello-service");
    assert.equal(body.version, "1.0.0");
    assert.deepEqual(Object.keys(body).sort(), ["name", "version"]);
  });

  // 2. GET /hello/World
  await test("GET /hello/World returns greeting", async () => {
    const res = await fetch(`${BASE}/hello/World`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/json"));
    const body = await res.json();
    assert.equal(body.greeting, "Hello, World!");
  });

  // 3. GET /hello/Pi
  await test("GET /hello/Pi returns greeting", async () => {
    const res = await fetch(`${BASE}/hello/Pi`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.greeting, "Hello, Pi!");
  });

  // 4. GET /nonexistent — 404
  await test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    assert.equal(res.status, 404);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run();
