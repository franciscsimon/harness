import { loadWorkflowFile, loadWorkflowDir } from "./rdf/workflow-graph.ts";
import { join } from "node:path";

const WF_DIR = join(process.env.HOME ?? "~", ".pi/agent/workflows");

async function main() {
  console.log("Loading all workflows from", WF_DIR);
  const workflows = await loadWorkflowDir(WF_DIR);

  for (const [name, wf] of workflows) {
    console.log(`\n✅ ${name}: ${wf.description}`);
    console.log(`   ID: ${wf.id}`);
    console.log(`   Steps (${wf.steps.length}):`);
    for (const s of wf.steps) {
      const type = s.actionType.replace("https://schema.org/", "");
      console.log(`     ${s.position}. ${s.name} (${s.agentRole}) [${type}] → ${s.transitionMode}${s.skill ? ` +${s.skill}` : ""}`);
    }
  }

  console.log(`\nTotal: ${workflows.size} workflows loaded.`);
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
