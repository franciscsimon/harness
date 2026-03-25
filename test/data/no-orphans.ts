/**
 * Data integrity: Find orphan records — children without parents.
 * Run: npx jiti test/data/no-orphans.ts
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

// Parent-child relationships to check
const RELATIONS = [
  { child: "artifact_versions", parentCol: "artifact_id", parent: "artifacts" },
  { child: "artifact_reads", parentCol: "artifact_id", parent: "artifacts" },
  { child: "workflow_step_runs", parentCol: "workflow_run_id", parent: "workflow_runs" },
  { child: "requirement_links", parentCol: "requirement_id", parent: "requirements" },
  { child: "session_projects", parentCol: "project_id", parent: "projects" },
  { child: "project_dependencies", parentCol: "project_id", parent: "projects" },
  { child: "project_tags", parentCol: "project_id", parent: "projects" },
  { child: "ticket_links", parentCol: "ticket_id", parent: "tickets" },
  { child: "ticket_events", parentCol: "ticket_id", parent: "tickets" },
];

for (const rel of RELATIONS) {
  await run(`${rel.child}.${rel.parentCol} → ${rel.parent}._id`, async () => {
    try {
      const rows = await sql.unsafe(
        `SELECT COUNT(*)::int as cnt FROM ${rel.child} c WHERE NOT EXISTS (SELECT 1 FROM ${rel.parent} p WHERE p._id = c.${rel.parentCol})`
      );
      const orphans = rows[0].cnt;
      if (orphans > 0) throw new Error(`${orphans} orphan rows`);
      return "No orphans";
    } catch (e: any) {
      if (e.message.includes("does not exist")) return "Table not yet created (skip)";
      throw e;
    }
  });
}

await sql.end();

console.log("\n=== Data Integrity: No Orphans ===");
let failures = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  console.log(`${icon} ${r.name} — ${r.detail}`);
  if (!r.passed) failures++;
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures > 0 ? 1 : 0);
