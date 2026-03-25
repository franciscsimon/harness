#!/usr/bin/env npx jiti
// ─── Knowledge Graph ─────────────────────────────────────────
// Unified graph query layer over all harness entities (Phase 8).
//
// CLI Usage:
//   npx jiti knowledge-graph/index.ts resolve <id>
//   npx jiti knowledge-graph/index.ts edges <id>
//   npx jiti knowledge-graph/index.ts path <id1> <id2>
//   npx jiti knowledge-graph/index.ts timeline [--project=X]
//   npx jiti knowledge-graph/index.ts impact <id>
//   npx jiti knowledge-graph/index.ts provenance <id>
//   npx jiti knowledge-graph/index.ts search <query>
//   npx jiti knowledge-graph/index.ts refresh
//   npx jiti knowledge-graph/index.ts stats

import { connectXtdb } from "../lib/db.ts";
import { getAllEdges } from "./edge-resolver.ts";
import { resolveEntity } from "./entity-resolver.ts";
import { analyzeImpact } from "./impact-analysis.ts";
import { getEdgeStats, rebuildEdges } from "./materialized-edges.ts";
import { traceProvenance } from "./provenance-chain.ts";
import { searchEntities } from "./search.ts";
import { getTimeline } from "./timeline.ts";
import { findPath } from "./traversal.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help") {
    console.log(`
Knowledge Graph — query layer over all harness entities

Commands:
  resolve <id>           Show entity details with all connections
  edges <id>             List all inbound and outbound edges
  path <id1> <id2>       Find how two entities relate
  timeline [--project=X] Show cross-entity activity stream
  impact <id>            Show what depends on this entity
  provenance <id>        Show how this entity came to be
  search <text>          Search across all entities
  refresh                Rebuild the materialized edge table
  stats                  Show graph statistics
`);
    return;
  }

  const sql = connectXtdb({ max: 2 });

  try {
    switch (cmd) {
      case "resolve": {
        const node = await resolveEntity(sql, args[1]);
        if (!node) { console.error("Entity not found"); process.exit(1); }
        console.log(JSON.stringify(node, null, 2));
        break;
      }

      case "edges": {
        const { inbound, outbound } = await getAllEdges(sql, args[1]);
        console.log(`\n📊 Edges for ${args[1]}`);
        console.log(`\n  Outbound (${outbound.length}):`);
        for (const e of outbound) console.log(`    → ${e.targetId} [${e.predicate}]`);
        console.log(`\n  Inbound (${inbound.length}):`);
        for (const e of inbound) console.log(`    ← ${e.sourceId} [${e.predicate}]`);
        break;
      }

      case "path": {
        const result = await findPath(sql, args[1], args[2]);
        if (!result) { console.log("No path found"); break; }
        console.log(`\n🔗 Path (depth ${result.depth}):\n`);
        for (const step of result.path) {
          console.log(`  ${step.node.type} ${step.node.id}: ${step.node.title}`);
          if (step.edge) console.log(`    ↕ [${step.edge.predicate}]`);
        }
        break;
      }

      case "timeline": {
        const projectId = args.find((a) => a.startsWith("--project="))?.split("=")[1];
        const entries = await getTimeline(sql, { projectId, limit: 30 });
        console.log(`\n📅 Timeline (${entries.length} entries):\n`);
        for (const e of entries) {
          const date = new Date(e.ts).toISOString().slice(0, 16);
          console.log(`  ${date}  [${e.entityType.padEnd(12)}] ${e.title}`);
        }
        break;
      }

      case "impact": {
        const result = await analyzeImpact(sql, args[1]);
        if (!result) { console.error("Entity not found"); process.exit(1); }
        console.log(`\n💥 Impact of ${result.root.title} (${result.affected.length} affected):\n`);
        for (const a of result.affected) {
          console.log(`  ${"  ".repeat(a.depth)}↳ ${a.node.type} ${a.node.title} [${a.edge.predicate}]`);
        }
        break;
      }

      case "provenance": {
        const chain = await traceProvenance(sql, args[1]);
        console.log(`\n🔍 Provenance of ${args[1]} (${chain.length} ancestors):\n`);
        for (const c of chain) {
          console.log(`  ${"  ".repeat(c.depth)}↑ ${c.node.type} ${c.node.title} [${c.edge.predicate}]`);
        }
        break;
      }

      case "search": {
        const query = args.slice(1).join(" ");
        const results = await searchEntities(sql, query);
        console.log(`\n🔎 Search: "${query}" (${results.length} results):\n`);
        for (const r of results) {
          console.log(`  [${r.entityType.padEnd(12)}] ${r.title}`);
          if (r.excerpt) console.log(`    ${r.excerpt.slice(0, 80)}`);
        }
        break;
      }

      case "refresh": {
        console.log("Rebuilding graph edges...");
        const { total, errors } = await rebuildEdges(sql);
        console.log(`✅ Rebuilt: ${total} edges, ${errors} errors`);
        break;
      }

      case "stats": {
        const stats = await getEdgeStats(sql);
        console.log(`\n📊 Graph Statistics`);
        console.log(`   Total edges: ${stats.total}`);
        console.log(`   By source type:`, stats.bySourceType);
        console.log(`   By predicate:`, stats.byPredicate);
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main();

// §1.3 — Ensure graph indexes on startup + periodic materialized edge refresh
import { ensureGraphIndexes } from "./indexes.ts";
import { refreshMaterializedEdges } from "./materialized-edges.ts";

async function initGraphInfra() {
  try {
    const { connectXtdb } = await import("../lib/db.ts");
    const sql = connectXtdb();
    const created = await ensureGraphIndexes(sql);
    if (created.length > 0) console.log(`[knowledge-graph] indexes ensured: ${created.join(", ")}`);
    // Refresh materialized edges every 5 minutes
    setInterval(() => {
      refreshMaterializedEdges(sql).catch(() => {});
    }, 5 * 60 * 1000);
  } catch {
    // Non-critical — graph works without indexes, just slower
  }
}
initGraphInfra();
