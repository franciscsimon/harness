#!/usr/bin/env npx jiti
/**
 * Extract one JSON-LD example per event type from XTDB.
 * Saves each as data-examples/<event_name>.jsonld
 *
 * Usage: npx jiti data-examples/extract.ts
 */
import postgres from "postgres";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const OUT_DIR = dirname(new URL(import.meta.url).pathname);

async function main() {
  const sql = postgres({
    host: "localhost",
    port: 5433,
    database: "xtdb",
    user: "xtdb",
    password: "xtdb",
  });

  mkdirSync(OUT_DIR, { recursive: true });

  // Get distinct event types
  const types = await sql`SELECT DISTINCT event_name FROM events ORDER BY event_name`;
  console.log(`Found ${types.length} event types`);

  let extracted = 0;

  for (const row of types) {
    const eventName = row.event_name;

    // Get one example with jsonld for this event type
    const examples = await sql`
      SELECT _id, event_name, jsonld, ts
      FROM events
      WHERE event_name = ${eventName} AND jsonld IS NOT NULL
      LIMIT 1
    `;

    if (examples.length === 0) {
      console.log(`  ⏭️  ${eventName}: no jsonld data`);
      continue;
    }

    const example = examples[0];
    const jsonld = example.jsonld;

    // Pretty-print the JSON-LD
    let formatted: string;
    try {
      const parsed = JSON.parse(jsonld);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = jsonld;
    }

    const outFile = join(OUT_DIR, `${eventName}.jsonld`);
    writeFileSync(outFile, formatted + "\n", "utf-8");
    console.log(`  ✅ ${eventName}.jsonld (${formatted.length} bytes)`);
    extracted++;
  }

  console.log(`\nExtracted ${extracted}/${types.length} event examples to ${OUT_DIR}/`);

  await sql.end();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
