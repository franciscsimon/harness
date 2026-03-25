/**
 * Integration tests for Knowledge Graph — entity resolution, edge resolution, path finding.
 * Phase L: Sprint 5 — Integration tests
 * Run: npx jiti test/integration/knowledge-graph.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.XTDB_URL ?? "postgresql://localhost:5432/xtdb");

interface TestResult { name: string; passed: boolean; detail: string }
const results: TestResult[] = [];

async function run(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, passed: true, detail });
  } catch (e: any) {
    results.push({ name, passed: false, detail: e.message });
  }
}

const TEST_PREFIX = `test-kg-${Date.now()}`;

// ── Entity Resolution ──────────────────────────────────────────

await run("Insert test entities as graph edges", async () => {
  const edges = [
    { source: `${TEST_PREFIX}:session:1`, stype: "session", target: `${TEST_PREFIX}:project:1`, ttype: "project", rel: "works_on" },
    { source: `${TEST_PREFIX}:project:1`, stype: "project", target: `${TEST_PREFIX}:file:main.ts`, ttype: "file", rel: "contains" },
    { source: `${TEST_PREFIX}:error:1`, stype: "error", target: `${TEST_PREFIX}:project:1`, ttype: "project", rel: "occurs_in" },
    { source: `${TEST_PREFIX}:ticket:1`, stype: "ticket", target: `${TEST_PREFIX}:project:1`, ttype: "project", rel: "belongs_to" },
  ];
  for (const e of edges) {
    await sql`INSERT INTO graph_edges (_id, source_id, source_type, target_id, target_type, relation, weight, metadata_json, ts, _valid_from)
      VALUES (${`ge:${e.source}:${e.target}:${Date.now()}`}, ${e.source}, ${e.stype}, ${e.target}, ${e.ttype}, ${e.rel}, ${"1.0"}, ${"{}"},${Date.now()}, CURRENT_TIMESTAMP)`;
  }
  return `${edges.length} edges inserted`;
});

await run("Query edges by source", async () => {
  const rows = await sql`SELECT * FROM graph_edges WHERE source_id = ${`${TEST_PREFIX}:session:1`}`;
  if (rows.length === 0) throw new Error("No edges found for session");
  return `Found ${rows.length} edge(s) from session`;
});

await run("Query edges by target", async () => {
  const rows = await sql`SELECT * FROM graph_edges WHERE target_id = ${`${TEST_PREFIX}:project:1`}`;
  if (rows.length < 3) throw new Error(`Expected >=3 edges targeting project, got ${rows.length}`);
  return `Found ${rows.length} edge(s) targeting project`;
});

await run("Find path: session → project → file (2-hop)", async () => {
  // Hop 1: session → project
  const hop1 = await sql`SELECT target_id FROM graph_edges WHERE source_id = ${`${TEST_PREFIX}:session:1`} AND relation = ${"works_on"}`;
  if (hop1.length === 0) throw new Error("No session→project edge");
  // Hop 2: project → file
  const hop2 = await sql`SELECT target_id FROM graph_edges WHERE source_id = ${hop1[0].target_id} AND relation = ${"contains"}`;
  if (hop2.length === 0) throw new Error("No project→file edge");
  return `Path found: session:1 → project:1 → file:main.ts`;
});

await run("Find neighbors of project (all relations)", async () => {
  const rows = await sql`SELECT * FROM graph_edges WHERE source_id = ${`${TEST_PREFIX}:project:1`} OR target_id = ${`${TEST_PREFIX}:project:1`}`;
  const relations = [...new Set(rows.map((r: any) => r.relation))];
  return `${rows.length} neighbors, relations: ${relations.join(", ")}`;
});

// ── Cleanup ────────────────────────────────────────────────────

await run("Cleanup test data", async () => {
  await sql`DELETE FROM graph_edges WHERE source_id LIKE ${`${TEST_PREFIX}%`} OR target_id LIKE ${`${TEST_PREFIX}%`}`;
  return "Cleaned up";
});

await sql.end();

// ── Report ─────────────────────────────────────────────────────

console.log("\n=== Integration: Knowledge Graph ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
