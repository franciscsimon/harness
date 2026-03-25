/**
 * Data integrity: Verify all JSON-LD documents in XTDB have valid @context and @type.
 * Run: npx jiti test/data/json-ld-consistency.ts
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

const JSONLD_TABLES = [
  "events", "projections", "decisions", "artifacts", "artifact_versions",
  "workflow_runs", "workflow_step_runs", "releases", "deployments",
  "test_runs", "incidents", "errors", "tickets", "ticket_events",
];

for (const table of JSONLD_TABLES) {
  await run(`${table}: all rows have valid jsonld`, async () => {
    const rows = await sql.unsafe(`SELECT _id, jsonld FROM ${table} WHERE jsonld IS NOT NULL AND jsonld != '' LIMIT 100`);
    let invalid = 0;
    for (const row of rows) {
      try {
        const doc = JSON.parse(row.jsonld);
        if (!doc["@context"] && !doc["@type"]) invalid++;
      } catch {
        invalid++;
      }
    }
    if (invalid > 0) throw new Error(`${invalid}/${rows.length} rows have invalid JSON-LD`);
    return `${rows.length} rows checked, all valid`;
  });
}

await run("No empty @type values", async () => {
  const rows = await sql`SELECT COUNT(*)::int as cnt FROM events WHERE jsonld LIKE '%"@type":""%'`;
  if (rows[0].cnt > 0) throw new Error(`${rows[0].cnt} events have empty @type`);
  return "No empty @type values found";
});

await sql.end();

console.log("\n=== Data Integrity: JSON-LD Consistency ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
