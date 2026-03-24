import { join } from "node:path";
import { loadWorkflowDir } from "./rdf/workflow-graph.ts";

const WF_DIR = join(process.env.HOME ?? "~", ".pi/agent/workflows");

async function main() {
  const workflows = await loadWorkflowDir(WF_DIR);

  for (const [_name, wf] of workflows) {
    for (const s of wf.steps) {
      const _type = s.actionType.replace("https://schema.org/", "");
    }
  }
}

main().catch((_e) => {
  process.exit(1);
});
