const BASE = `http://localhost:${process.env.PORT ?? 4000}`;

async function run() {
  console.log("Testing hello-service...\n");

  // Test root
  const r1 = await fetch(`${BASE}/`);
  const j1 = await r1.json();
  console.log(`GET /         → ${JSON.stringify(j1)}`);
  assert(j1.service === "hello-service", "root returns service name");

  // Test hello
  const r2 = await fetch(`${BASE}/hello/World`);
  const j2 = await r2.json();
  console.log(`GET /hello/World → ${JSON.stringify(j2)}`);
  assert(j2.message === "Hello World!", "hello returns greeting");

  // Test with different name
  const r3 = await fetch(`${BASE}/hello/Pi`);
  const j3 = await r3.json();
  console.log(`GET /hello/Pi    → ${JSON.stringify(j3)}`);
  assert(j3.message === "Hello Pi!", "hello returns greeting with name");

  console.log("\n✅ All tests passed");
}

function assert(ok: boolean, msg: string) {
  if (!ok) { console.error(`❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`  ✅ ${msg}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
