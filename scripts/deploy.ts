#!/usr/bin/env npx jiti
// ─── Rolling Deploy Script ───────────────────────────────────────
// Triggered after CI passes. Does a rolling restart of all services
// via process-compose REST API.
//
// Usage: npx jiti scripts/deploy.ts [--commit <hash>]
//
// Steps:
// 1. git pull from Soft Serve
// 2. npm install in each service dir
// 3. Regenerate process-compose.yml from .cd.jsonld
// 4. Rolling restart each service via process-compose API
// 5. Health check after each restart
// 6. Record deployment to XTDB

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const PC_API = process.env.PC_API ?? "http://localhost:8080";

// ── Helpers ──

function run(cmd: string, cwd = ROOT): string {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

async function pcRestart(processName: string): Promise<boolean> {
  try {
    const r = await fetch(`${PC_API}/process/restart/${processName}`, { method: "POST" });
    return r.ok;
  } catch { return false; }
}

async function waitHealthy(processName: string, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${PC_API}/process/info/${processName}`);
      if (r.ok) {
        const info = await r.json();
        if (info.is_ready) return true;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// ── Main ──

async function main() {
  const startTime = Date.now();
  const commitArg = process.argv.includes("--commit")
    ? process.argv[process.argv.indexOf("--commit") + 1]
    : null;

  console.log("🚀 Rolling deploy started");
  console.log(`   Root: ${ROOT}`);
  console.log(`   PC API: ${PC_API}`);

  // 1. Git pull
  console.log("\n📥 Step 1: git pull");
  try {
    const pullResult = run("git pull soft-serve main");
    console.log(`   ${pullResult}`);
  } catch (e) {
    console.error("   ⚠️  git pull failed, continuing with current code:", (e as Error).message?.slice(0, 100));
  }

  const currentCommit = run("git rev-parse --short HEAD");
  console.log(`   Current commit: ${currentCommit}`);

  // 2. Read service config
  const config = JSON.parse(readFileSync(join(ROOT, ".cd.jsonld"), "utf-8"));
  const services: any[] = config["code:services"] ?? [];
  console.log(`   ${services.length} services to deploy`);

  // 3. npm install in each service dir
  console.log("\n📦 Step 2: npm install");
  for (const svc of services) {
    const dir = svc["code:workingDir"];
    const name = svc["schema:name"];
    try {
      run("npm install --ignore-scripts 2>/dev/null", join(ROOT, dir));
      console.log(`   ✅ ${name}`);
    } catch {
      console.log(`   ⚠️  ${name} (npm install failed, continuing)`);
    }
  }

  // 4. Regenerate process-compose.yml
  console.log("\n📝 Step 3: regenerate process-compose.yml");
  try {
    run("npx jiti scripts/generate-compose.ts");
  } catch (e) {
    console.error("   ⚠️  Failed to regenerate:", (e as Error).message?.slice(0, 100));
  }

  // 5. Rolling restart
  console.log("\n🔄 Step 4: rolling restart");
  const results: { name: string; success: boolean; durationMs: number }[] = [];

  for (const svc of services) {
    const name = svc["schema:name"];
    const t = Date.now();
    console.log(`   Restarting ${name}...`);

    const restarted = await pcRestart(name);
    if (!restarted) {
      console.log(`   ❌ ${name}: restart request failed`);
      results.push({ name, success: false, durationMs: Date.now() - t });
      continue;
    }

    const healthy = await waitHealthy(name);
    const dur = Date.now() - t;
    if (healthy) {
      console.log(`   ✅ ${name}: healthy (${dur}ms)`);
    } else {
      console.log(`   ⚠️  ${name}: restarted but not healthy after 30s`);
    }
    results.push({ name, success: healthy, durationMs: dur });
  }

  // 6. Summary
  const totalDuration = Date.now() - startTime;
  const allGood = results.every(r => r.success);
  console.log(`\n${allGood ? "✅" : "⚠️"} Deploy ${allGood ? "complete" : "completed with warnings"}`);
  console.log(`   Commit: ${currentCommit}`);
  console.log(`   Duration: ${totalDuration}ms`);
  console.log(`   Services: ${results.filter(r => r.success).length}/${results.length} healthy`);

  // Record to XTDB via harness-ui notification
  try {
    await fetch("http://localhost:3336/api/ci/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deployment",
        commitHash: currentCommit,
        status: allGood ? "success" : "partial",
        services: results,
        durationMs: totalDuration,
      }),
    });
  } catch { /* best-effort */ }

  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error("Deploy failed:", e);
  process.exit(1);
});
