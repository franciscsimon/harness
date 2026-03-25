#!/usr/bin/env npx jiti
/**
 * Progress Sync — reconcile PROGRESS-DEFERRED.md checkboxes with actual codebase state.
 *
 * Scans for file existence, function exports, docker-compose services, etc.
 * and reports which deferred items are actually complete vs still pending.
 *
 * Usage: npx jiti scripts/progress-sync.ts
 * Phase G: Progress Sync (5 items)
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

interface CheckResult {
  phase: string;
  item: string;
  done: boolean;
  evidence: string;
}

const results: CheckResult[] = [];

function check(phase: string, item: string, fn: () => string | false) {
  try {
    const evidence = fn();
    results.push({ phase, item, done: evidence !== false, evidence: evidence || "not found" });
  } catch {
    results.push({ phase, item, done: false, evidence: "check failed" });
  }
}

function fileExists(path: string): string | false {
  return existsSync(path) ? `exists (${path})` : false;
}

function fileContains(path: string, pattern: string): string | false {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf-8");
  return content.includes(pattern) ? `contains '${pattern}'` : false;
}

function grepCount(pattern: string, glob: string): number {
  try {
    const out = execSync(`grep -rl '${pattern}' ${glob} 2>/dev/null | wc -l`, { encoding: "utf-8" });
    return parseInt(out.trim(), 10);
  } catch {
    return 0;
  }
}

// ── Phase K: Documentation ─────────────────────────────────────
check("K", "Biome noConsole override", () => fileContains("biome.json", "noConsole"));
check("K", "XTDB_SCHEMA updated", () => fileContains("docs/XTDB_SCHEMA.md", "graph_edges"));
check("K", "QUICKSTART Infisical section", () => fileContains("QUICKSTART.md", "Infisical"));
check("K", "Secret rotation runbook", () => fileExists("docs/runbooks/secret-rotation.md"));

// ── Phase B: Config Templating ─────────────────────────────────
check("B", "XTDB primary template", () => fileExists("xtdb-primary.yaml.tmpl"));
check("B", "XTDB replica template", () => fileExists("xtdb-replica.yaml.tmpl"));
check("B", "Garage TOML template", () => fileExists("garage.toml.tmpl"));
check("B", "XTDB entrypoint script", () => fileExists("scripts/xtdb-entrypoint.sh"));
check("B", "Garage entrypoint script", () => fileExists("scripts/garage-entrypoint.sh"));

// ── Phase J: CI/CD Hardening ───────────────────────────────────
check("J", "Gitleaks in pre-commit", () => fileContains(".githooks/pre-commit", "gitleaks"));
check("J", "Contract CI step", () => fileContains(".ci.jsonld", "contracts"));
check("J", "Taskfile test targets", () => fileContains("Taskfile.yml", "test:unit"));
check("J", "Review-gate post-step", () => fileContains("ci-runner/runner.ts", "review-gate"));

// ── Phase I: Error Monitoring ──────────────────────────────────
check("I", "Fingerprint in captureError", () => fileContains("lib/errors.ts", "fingerprint"));
check("I", "Request context fields", () => fileContains("lib/errors.ts", "requestId"));
check("I", "XTDB error group flush", () => fileContains("lib/error-groups.ts", "flushGroupsToXtdb"));

// ── Phase H: Testing ───────────────────────────────────────────
check("H", "Chaos: db-failover", () => fileExists("test/chaos/db-failover.ts"));
check("H", "Chaos: network-partition", () => fileExists("test/chaos/network-partition.ts"));
check("H", "Chaos: disk-full", () => fileExists("test/chaos/disk-full.ts"));
check("H", "Data: json-ld-consistency", () => fileExists("test/data/json-ld-consistency.ts"));
check("H", "Data: no-orphans", () => fileExists("test/data/no-orphans.ts"));
check("H", "Contracts: request-response", () => fileExists("test/contracts/request-response-validation.ts"));

// ── Phase C: XTDB Storage ──────────────────────────────────────
check("C", "Seed schema: monitoring tables", () => fileContains("scripts/seed-schema.ts", "service_health_checks"));
check("C", "Seed schema: security tables", () => fileContains("scripts/seed-schema.ts", "image_scans"));
check("C", "Seed schema: graph_edges", () => fileContains("scripts/seed-schema.ts", "graph_edges"));

// ── Phase A: Infisical ─────────────────────────────────────────
check("A", "Infisical in docker-compose", () => fileContains("docker-compose.yml", "infisical"));
check("A", "Bootstrap script", () => fileExists("scripts/infisical-bootstrap.sh"));

// ── Phase E: pi Hooks ──────────────────────────────────────────
check("E", "Knowledge graph hooks", () => fileExists("knowledge-graph/hooks.ts"));
check("E", "Ticket manager hooks", () => fileExists("ticket-manager/hooks.ts"));

// ── Phase F: Enrichment ────────────────────────────────────────
check("F", "Enrichment hooks", () => fileExists("knowledge-graph/enrichment.ts"));

// ── Phase D: UI Pages ──────────────────────────────────────────
check("D", "Ticket UI routes", () => fileContains("harness-ui/server.ts", "tickets"));
check("D", "Graph UI routes", () => fileContains("harness-ui/server.ts", "graph"));

// ── Phase M: Tickets ───────────────────────────────────────────
check("M", "Ticket queries", () => fileExists("ticket-manager/queries.ts"));
check("M", "Ticket transitions", () => fileExists("ticket-manager/transitions.ts"));
check("M", "Auto generators", () => fileExists("ticket-manager/auto-generators.ts"));

// ── Phase L: Knowledge Graph ───────────────────────────────────
check("L", "Entity resolver", () => fileExists("knowledge-graph/entity-resolver.ts"));
check("L", "Edge resolver", () => fileExists("knowledge-graph/edge-resolver.ts"));
check("L", "Impact analysis", () => fileExists("knowledge-graph/impact-analysis.ts"));
check("L", "Provenance chain", () => fileExists("knowledge-graph/provenance-chain.ts"));

// ── Report ─────────────────────────────────────────────────────
const done = results.filter((r) => r.done);
const pending = results.filter((r) => !r.done);

console.log(`\n=== Progress Sync: ${done.length}/${results.length} items verified ===\n`);

const phases = [...new Set(results.map((r) => r.phase))];
for (const phase of phases) {
  const phaseResults = results.filter((r) => r.phase === phase);
  const phaseDone = phaseResults.filter((r) => r.done).length;
  console.log(`Phase ${phase}: ${phaseDone}/${phaseResults.length}`);
  for (const r of phaseResults) {
    console.log(`  ${r.done ? "✅" : "❌"} ${r.item} — ${r.evidence}`);
  }
}

if (pending.length > 0) {
  console.log(`\n⚠️  ${pending.length} items still pending`);
}
