/**
 * Activity: Load and parse a JSON-LD workflow definition.
 * Returns WorkflowStep[] for use by the agentWorkflow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowStep } from "../shared/types.js";

const WORKFLOWS_DIR = process.env.PI_WORKFLOWS_DIR
  ?? join(process.env.HOME ?? "/root", ".pi", "agent", "workflows");

export interface LoadWorkflowInput {
  workflowName: string;
  /** Override directory to search for workflow files */
  workflowsDir?: string;
}

export async function loadWorkflowDefinition(input: LoadWorkflowInput): Promise<WorkflowStep[]> {
  const dir = input.workflowsDir ?? WORKFLOWS_DIR;
  const filePath = join(dir, `${input.workflowName}.jsonld`);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Workflow definition not found: ${filePath}`);
  }

  const doc = JSON.parse(raw);

  // Extract steps from JSON-LD graph
  const graph = doc["@graph"] ?? [doc];
  const steps: WorkflowStep[] = [];

  for (const node of graph) {
    const type = node["@type"] ?? "";
    if (!type.includes("Action") && !type.includes("Step")) continue;

    steps.push({
      position: Number(node["schema:position"] ?? node.position ?? steps.length + 1),
      name: node["schema:name"] ?? node.name ?? `Step ${steps.length + 1}`,
      actionType: (node["schema:actionType"] ?? node.actionType ?? "agent") as "agent" | "human" | "automated",
      agentRole: node["ev:agentRole"] ?? node.agentRole ?? "worker",
      promptTemplate: node["ev:promptTemplate"] ?? node.promptTemplate,
      transitionMode: (node["ev:transitionMode"] ?? node.transitionMode ?? "auto") as "auto" | "user",
      timeoutMs: node["ev:timeoutMs"] ? Number(node["ev:timeoutMs"]) : undefined,
    });
  }

  // Sort by position
  steps.sort((a, b) => a.position - b.position);

  if (steps.length === 0) {
    throw new Error(`No steps found in workflow definition: ${filePath}`);
  }

  return steps;
}
