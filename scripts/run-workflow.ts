#!/usr/bin/env npx jiti
/**
 * Run a multi-agent workflow via Temporal.
 *
 * Usage:
 *   # Run a predefined workflow from ~/.pi/agent/workflows/
 *   npx jiti scripts/run-workflow.ts feature "add dark mode support"
 *   npx jiti scripts/run-workflow.ts bugfix "fix login timeout issue"
 *   npx jiti scripts/run-workflow.ts refactor "clean up the auth module"
 *
 *   # Run an ad-hoc pipeline with any agents
 *   npx jiti scripts/run-workflow.ts --agents planner,architect,worker "build a REST API"
 *   npx jiti scripts/run-workflow.ts --agents researcher,architect,worker,tester "migrate to PostgreSQL"
 *
 *   # List available workflows and agents
 *   npx jiti scripts/run-workflow.ts --list
 *
 *   # Check status of a running workflow
 *   npx jiti scripts/run-workflow.ts --status <workflow-id>
 *
 *   # Cancel a running workflow
 *   npx jiti scripts/run-workflow.ts --cancel <workflow-id>
 */
import { Connection, Client } from "@temporalio/client";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const WORKFLOWS_DIR = join(process.env.HOME ?? "~", ".pi/agent/workflows");
const AGENTS_DIR = join(process.env.HOME ?? "~", ".pi/agent/agents");
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";

// ── Parse workflow .jsonld ──────────────────────────────────────

interface Step {
  position: number;
  name: string;
  actionType: string;
  agentRole: string;
  promptTemplate?: string;
  transitionMode: string;
}

function loadWorkflowDef(name: string): { name: string; description: string; steps: Step[] } {
  const filePath = join(WORKFLOWS_DIR, `${name}.jsonld`);
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const steps: Step[] = (raw["schema:step"] ?? []).map((s: any) => ({
    position: s["schema:position"] ?? 0,
    name: s["schema:name"] ?? "Step",
    actionType: "agent",
    agentRole: (s["schema:agent"]?.["@id"] ?? "worker").split(":").pop(),
    promptTemplate: s["ev:promptTemplate"],
    transitionMode: "auto", // automated — no human gates
  }));
  steps.sort((a, b) => a.position - b.position);
  return {
    name: raw["schema:name"] ?? name,
    description: raw["schema:description"] ?? "",
    steps,
  };
}

function buildAdHocWorkflow(agents: string[], task: string): Step[] {
  return agents.map((agent, i) => ({
    position: i + 1,
    name: `${agent.charAt(0).toUpperCase() + agent.slice(1)} phase`,
    actionType: "agent",
    agentRole: agent,
    transitionMode: "auto",
  }));
}

function listAvailable(): void {
  console.log("\n📋 Available workflows:\n");
  try {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith(".jsonld"));
    for (const f of files) {
      const name = basename(f, ".jsonld");
      try {
        const wf = loadWorkflowDef(name);
        const agents = wf.steps.map(s => s.agentRole).join(" → ");
        console.log(`  ${name.padEnd(20)} ${wf.steps.length} steps: ${agents}`);
      } catch { console.log(`  ${name.padEnd(20)} (parse error)`); }
    }
  } catch { console.log("  (no workflows directory)"); }

  console.log("\n🤖 Available agents:\n");
  try {
    const agents = readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith(".md"))
      .map(f => basename(f, ".md"))
      .sort();
    console.log(`  ${agents.join(", ")}`);
  } catch { console.log("  (no agents directory)"); }

  console.log("\nUsage:");
  console.log("  npx jiti scripts/run-workflow.ts feature \"add dark mode\"");
  console.log("  npx jiti scripts/run-workflow.ts --agents planner,worker,tester \"build API\"");
  console.log("");
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--list") {
    listAvailable();
    return;
  }

  // --status <id>
  if (args[0] === "--status") {
    const wfId = args[1];
    if (!wfId) { console.log("Usage: --status <workflow-id>"); return; }
    const conn = await Connection.connect({ address: TEMPORAL_ADDRESS });
    const client = new Client({ connection: conn });
    const handle = client.workflow.getHandle(wfId);
    const desc = await handle.describe();
    console.log(`\nWorkflow: ${wfId}`);
    console.log(`Status: ${desc.status.name}`);
    try {
      const status = await handle.query("fullStatus");
      console.log(`Progress: ${(status as any).stepResults?.filter((r: any) => r?.status === "done").length}/${(status as any).totalSteps}`);
      for (const [i, step] of ((status as any).steps ?? []).entries()) {
        const result = (status as any).stepResults?.[i];
        const icon = result?.status === "done" ? "✅" : result?.status === "failed" ? "❌" : result?.status === "skipped" ? "⊘" : i === (status as any).currentStep ? "🔄" : "⬜";
        console.log(`  ${icon} ${step.position}. ${step.name} [${step.agentRole}] ${result?.status ?? "pending"}`);
      }
    } catch {}
    if (desc.status.name === "COMPLETED") {
      const result = await handle.result();
      console.log("\nResult:", JSON.stringify(result, null, 2));
    }
    await conn.close();
    return;
  }

  // --cancel <id>
  if (args[0] === "--cancel") {
    const wfId = args[1];
    if (!wfId) { console.log("Usage: --cancel <workflow-id>"); return; }
    const conn = await Connection.connect({ address: TEMPORAL_ADDRESS });
    const client = new Client({ connection: conn });
    const handle = client.workflow.getHandle(wfId);
    await handle.signal("cancel");
    console.log(`✅ Cancelled: ${wfId}`);
    await conn.close();
    return;
  }

  // --agents agent1,agent2 "task"
  let steps: Step[];
  let workflowName: string;
  let task: string;

  if (args[0] === "--agents") {
    const agentList = (args[1] ?? "").split(",").map(a => a.trim()).filter(Boolean);
    task = args.slice(2).join(" ");
    if (agentList.length === 0 || !task) {
      console.log("Usage: --agents planner,architect,worker \"task description\"");
      return;
    }
    steps = buildAdHocWorkflow(agentList, task);
    workflowName = `custom-${agentList.join("-")}`;
  } else {
    // Named workflow
    workflowName = args[0];
    task = args.slice(1).join(" ");
    if (!task) {
      console.log(`Usage: npx jiti scripts/run-workflow.ts ${workflowName} "task description"`);
      return;
    }
    try {
      const wf = loadWorkflowDef(workflowName);
      steps = wf.steps;
      console.log(`\n📋 Workflow: ${wf.name}`);
      console.log(`📝 Task: ${task}`);
      console.log(`🔗 Steps: ${steps.length}\n`);
      for (const s of steps) {
        console.log(`  ${s.position}. ${s.name} → 🤖 ${s.agentRole}`);
      }
    } catch (err: any) {
      console.log(`❌ Workflow "${workflowName}" not found: ${err.message}`);
      listAvailable();
      return;
    }
  }

  // ── Start the Temporal workflow ──
  console.log(`\n🚀 Starting workflow via Temporal...`);

  const conn = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const client = new Client({ connection: conn });

  const wfId = `${workflowName}-${Date.now()}`;
  const handle = await client.workflow.start("automatedWorkflow", {
    workflowId: wfId,
    taskQueue: "agent-execution",
    args: [{
      workflowName,
      task,
      steps,
      cwd: process.cwd(),
      sessionId: wfId,
    }],
  });

  console.log(`✅ Started: ${wfId}`);
  console.log(`🔗 Temporal UI: http://localhost/temporal/namespaces/default/workflows/${wfId}`);
  console.log(`\n⏳ Waiting for completion... (Ctrl+C to detach — workflow keeps running)\n`);

  // Poll for status
  const startTime = Date.now();
  let lastStep = -1;

  try {
    const result = await handle.result();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`✅ Workflow completed in ${elapsed}s`);
    console.log(`   ${(result as any).completedSteps}/${(result as any).totalSteps} steps succeeded`);

    for (const [i, sr] of ((result as any).stepResults ?? []).entries()) {
      const step = steps[i];
      const icon = sr?.status === "done" ? "✅" : "❌";
      console.log(`\n${icon} Step ${step.position}: ${step.name} [${step.agentRole}]`);
      if (sr?.output) {
        console.log(`   ${sr.output.slice(0, 200).replace(/\n/g, "\n   ")}`);
      }
    }
    console.log(`${"═".repeat(60)}\n`);
  } catch (err: any) {
    console.log(`\n❌ Workflow failed: ${err.message}`);
  }

  await conn.close();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
