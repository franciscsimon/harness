import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadWorkflowDir, type WorkflowDef, type WorkflowStep } from "./rdf/workflow-graph.ts";

// ─── Workflow Engine Extension ────────────────────────────────────
// Composable workflow templates using Schema.org Action + PROV-O.
// Defines, loads, and runs multi-step agent-role workflows.

const WORKFLOWS_DIR = join(process.env.HOME ?? "~", ".pi/agent/workflows");

interface StepState {
  position: number;
  status: "pending" | "active" | "done" | "skipped";
  startedAt?: number;
  endedAt?: number;
}

interface WorkflowState {
  active: boolean;
  workflowName: string;
  currentStep: number;  // 1-based position
  stepStates: StepState[];
  task: string;         // User's original task description
}

export default function (pi: ExtensionAPI) {
  const workflows = new Map<string, WorkflowDef>();
  let state: WorkflowState = emptyState();

  function emptyState(): WorkflowState {
    return { active: false, workflowName: "", currentStep: 0, stepStates: [], task: "" };
  }

  function progressBar(): string {
    if (!state.active || state.stepStates.length === 0) return "";
    const done = state.stepStates.filter(s => s.status === "done" || s.status === "skipped").length;
    const total = state.stepStates.length;
    const filled = Math.round((done / total) * 5);
    return `[${"■".repeat(filled)}${"□".repeat(5 - filled)}] ${done}/${total}`;
  }

  function currentStepDef(): WorkflowStep | undefined {
    if (!state.active) return undefined;
    const wf = workflows.get(state.workflowName);
    return wf?.steps.find(s => s.position === state.currentStep);
  }

  function statusPayload() {
    const wf = workflows.get(state.workflowName);
    return {
      active: state.active,
      workflowName: state.workflowName,
      description: wf?.description ?? "",
      currentStep: state.currentStep,
      steps: state.stepStates.map((ss, i) => {
        const def = wf?.steps[i];
        return {
          position: ss.position,
          name: def?.name ?? "",
          agentRole: def?.agentRole ?? "",
          actionType: def?.actionType.replace("https://schema.org/", "") ?? "",
          status: ss.status,
        };
      }),
      progress: progressBar(),
    };
  }

  // ─── Load workflows on session start ────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    // Load workflow definitions from .jsonld files
    const loaded = await loadWorkflowDir(WORKFLOWS_DIR);
    for (const [name, def] of loaded) workflows.set(name, def);
    if (workflows.size > 0) {
      console.log(`[workflow-engine] Loaded ${workflows.size} workflows: ${[...workflows.keys()].join(", ")}`);
    }

    // Restore state from appendEntry
    state = emptyState();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "workflow-state") {
        const data = (entry as any).data;
        if (data) {
          state = { ...emptyState(), ...data };
        }
      }
    }
    if (state.active) {
      ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));
    }
  });

  // ─── Inject agent role prompt on each turn ──────────────────────

  pi.on("before_agent_start", async (event) => {
    if (!state.active) return;

    const step = currentStepDef();
    if (!step) return;

    // Load the agent role system prompt
    const rolePath = join(process.env.HOME ?? "~", `.pi/agent/agents/${step.agentRole}.md`);
    let rolePrompt = "";
    try {
      const raw = readFileSync(rolePath, "utf-8");
      // Strip YAML frontmatter
      const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      rolePrompt = match ? match[1].trim() : raw;
    } catch {
      rolePrompt = `You are acting as a ${step.agentRole}.`;
    }

    const wf = workflows.get(state.workflowName);
    const progress = progressBar();

    const injection =
      `\n\n---\n\n` +
      `🔄 WORKFLOW: ${state.workflowName} — ${progress}\n` +
      `Step ${step.position}/${wf?.steps.length ?? "?"}: ${step.name} (${step.actionType.replace("https://schema.org/", "")})\n` +
      `Agent role: ${step.agentRole}\n` +
      `Task: ${state.task}\n\n` +
      rolePrompt;

    return {
      systemPrompt: (event as any).systemPrompt + injection,
    };
  });

  // ─── Persist state ──────────────────────────────────────────────

  function saveState() {
    pi.appendEntry("workflow-state", {
      active: state.active,
      workflowName: state.workflowName,
      currentStep: state.currentStep,
      stepStates: state.stepStates,
      task: state.task,
    });
  }

  // ─── Activate a workflow ────────────────────────────────────────

  function activateWorkflow(name: string, task: string, ctx: any): string {
    const wf = workflows.get(name);
    if (!wf) {
      const available = [...workflows.keys()].join(", ");
      return `Workflow "${name}" not found. Available: ${available || "none (no .jsonld files in ~/.pi/agent/workflows/)"}`;
    }

    state = {
      active: true,
      workflowName: name,
      currentStep: 1,
      stepStates: wf.steps.map(s => ({ position: s.position, status: "pending" as const })),
      task,
    };

    // Mark first step as active
    if (state.stepStates.length > 0) {
      state.stepStates[0].status = "active";
      state.stepStates[0].startedAt = Date.now();
    }

    saveState();
    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));

    const step = wf.steps[0];
    return `🔄 Workflow "${name}" activated — ${wf.steps.length} steps\n` +
      `Starting step 1: ${step.name} (${step.agentRole})\n` +
      `Task: ${task}`;
  }

  // ─── Advance to next step ───────────────────────────────────────

  function advanceStep(ctx: any): string {
    if (!state.active) return "No active workflow.";

    const wf = workflows.get(state.workflowName);
    if (!wf) return "Workflow definition not found.";

    // Mark current as done
    const curIdx = state.stepStates.findIndex(s => s.position === state.currentStep);
    if (curIdx >= 0) {
      state.stepStates[curIdx].status = "done";
      state.stepStates[curIdx].endedAt = Date.now();
    }

    // Find next pending step
    const nextIdx = state.stepStates.findIndex(s => s.status === "pending");
    if (nextIdx < 0) {
      state.active = false;
      saveState();
      ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));
      return `✅ Workflow "${state.workflowName}" complete — all ${wf.steps.length} steps done.`;
    }

    state.currentStep = state.stepStates[nextIdx].position;
    state.stepStates[nextIdx].status = "active";
    state.stepStates[nextIdx].startedAt = Date.now();

    saveState();
    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));

    const step = wf.steps[nextIdx];
    const prompt = step.promptTemplate
      .replace(/\{task\}/g, state.task)
      .replace(/\{cwd\}/g, process.cwd())
      .replace(/\{context\}/g, state.task);

    return `🔄 Step ${step.position}/${wf.steps.length}: ${step.name} (${step.agentRole})\n\n${prompt}`;
  }

  // ─── Skip current step ──────────────────────────────────────────

  function skipStep(ctx: any): string {
    if (!state.active) return "No active workflow.";

    const curIdx = state.stepStates.findIndex(s => s.position === state.currentStep);
    if (curIdx >= 0) {
      state.stepStates[curIdx].status = "skipped";
      state.stepStates[curIdx].endedAt = Date.now();
    }

    return advanceStep(ctx);
  }

  // ─── Abandon workflow ───────────────────────────────────────────

  function abandonWorkflow(ctx: any): string {
    if (!state.active) return "No active workflow.";
    const name = state.workflowName;
    state = emptyState();
    saveState();
    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));
    return `🛑 Workflow "${name}" abandoned.`;
  }

  // ─── /workflow command ──────────────────────────────────────────

  pi.addCommand({
    name: "workflow",
    description: "Manage workflow: /workflow list | start <name> <task> | advance | skip | abandon",
    execute: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0] ?? "list";

      switch (sub) {
        case "list": {
          if (workflows.size === 0) return "No workflows loaded. Add .jsonld files to ~/.pi/agent/workflows/";
          const lines = [...workflows.entries()].map(([name, wf]) => {
            const chain = wf.steps.map(s => s.agentRole).join(" → ");
            return `  ${name}: ${chain}`;
          });
          const status = state.active ? `\nActive: ${state.workflowName} (step ${state.currentStep})` : "\nNo active workflow.";
          return `Available workflows:\n${lines.join("\n")}${status}`;
        }
        case "start": {
          const name = parts[1];
          const task = parts.slice(2).join(" ");
          if (!name) return "Usage: /workflow start <name> <task description>";
          if (!task) return "Please provide a task description: /workflow start feature-build Add user authentication";
          return activateWorkflow(name, task, ctx);
        }
        case "advance": return advanceStep(ctx);
        case "skip": return skipStep(ctx);
        case "abandon": return abandonWorkflow(ctx);
        case "status": return state.active
          ? `Workflow: ${state.workflowName} — Step ${state.currentStep} — ${progressBar()}`
          : "No active workflow.";
        default:
          return "Usage: /workflow list | start <name> <task> | advance | skip | abandon | status";
      }
    },
  });

  // ─── set_workflow tool (LLM can activate workflows) ─────────────

  pi.addTool({
    name: "set_workflow",
    description: "Activate a workflow template. Use /workflow list to see available workflows.",
    parameters: Type.Object({
      action: StringEnum(["start", "advance", "skip", "abandon", "list"]),
      workflowName: Type.Optional(Type.String({ description: "Workflow name (for start action)" })),
      task: Type.Optional(Type.String({ description: "Task description (for start action)" })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      switch (params.action) {
        case "list": {
          const names = [...workflows.keys()];
          return names.length ? `Available: ${names.join(", ")}` : "No workflows loaded.";
        }
        case "start": {
          if (!params.workflowName || !params.task) return "Need workflowName and task.";
          return activateWorkflow(params.workflowName, params.task, ctx);
        }
        case "advance": return advanceStep(ctx);
        case "skip": return skipStep(ctx);
        case "abandon": return abandonWorkflow(ctx);
        default: return "Unknown action.";
      }
    },
  });

  // ─── Auto-advance on agent_end if transition is "auto" ──────────

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active) return;
    const step = currentStepDef();
    if (step?.transitionMode === "auto") {
      const msg = advanceStep(ctx);
      console.log(`[workflow-engine] Auto-advanced: ${msg}`);
    }
  });
}
