#!/usr/bin/env npx jiti
// ─── Generate process-compose.yml from .cd.jsonld ────────────────
// Reads the JSON-LD deployment config and outputs a process-compose.yml
// Usage: npx jiti scripts/generate-compose.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const configPath = join(ROOT, ".cd.jsonld");
const outputPath = join(ROOT, "process-compose.yml");

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const services = config["code:services"] ?? [];

// Build YAML manually (no dependency needed)
const lines: string[] = [
  "# Auto-generated from .cd.jsonld — do not edit manually",
  `# Generated: ${new Date().toISOString()}`,
  `# Strategy: ${config["code:strategy"] ?? "rolling"}`,
  "",
  "version: \"0.5\"",
  "",
  "log_level: info",
  "log_length: 3000",
  "",
  "processes:",
];

for (const svc of services) {
  const name = svc["schema:name"];
  const command = svc["code:command"];
  const workDir = svc["code:workingDir"];
  const port = svc["code:port"];
  const healthPath = svc["code:healthPath"];
  const deps: string[] = svc["code:dependsOn"] ?? [];

  lines.push(`  ${name}:`);
  lines.push(`    command: "${command}"`);
  lines.push(`    working_dir: "./${workDir}"`);
  lines.push(`    namespace: harness`);

  // Readiness probe
  if (port && healthPath) {
    lines.push(`    readiness_probe:`);
    lines.push(`      http_get:`);
    lines.push(`        host: "127.0.0.1"`);
    lines.push(`        port: ${port}`);
    lines.push(`        path: "${healthPath}"`);
    lines.push(`      initial_delay_seconds: 3`);
    lines.push(`      period_seconds: 10`);
    lines.push(`      timeout_seconds: 5`);
    lines.push(`      failure_threshold: 3`);
  }

  // Liveness probe (same endpoint)
  if (port && healthPath) {
    lines.push(`    liveness_probe:`);
    lines.push(`      http_get:`);
    lines.push(`        host: "127.0.0.1"`);
    lines.push(`        port: ${port}`);
    lines.push(`        path: "${healthPath}"`);
    lines.push(`      period_seconds: 30`);
    lines.push(`      timeout_seconds: 5`);
    lines.push(`      failure_threshold: 3`);
  }

  // Restart policy
  lines.push(`    availability:`);
  lines.push(`      restart: "always"`);
  lines.push(`      backoff_seconds: 5`);
  lines.push(`      max_restarts: 0`);

  // Shutdown
  lines.push(`    shutdown:`);
  lines.push(`      signal: 15`);
  lines.push(`      timeout_seconds: 10`);

  // Dependencies
  if (deps.length > 0) {
    lines.push(`    depends_on:`);
    for (const dep of deps) {
      lines.push(`      ${dep}:`);
      lines.push(`        condition: process_healthy`);
    }
  }

  lines.push("");
}

const yaml = lines.join("\n");
writeFileSync(outputPath, yaml);
console.log(`✅ Generated ${outputPath}`);
console.log(`   ${services.length} services from .cd.jsonld`);
