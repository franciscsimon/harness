import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadWorkflowDir, type WorkflowDef, type WorkflowStep } from "./rdf/workflow-graph.ts";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { JSONLD_CONTEXT, piId, piRef } from "../lib/jsonld/context.ts";

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
  if (process.env.XTDB_EVENT_LOGGING !== "true") return;

  const workflows = new Map<string, WorkflowDef>();
  let state: WorkflowState = emptyState();
  let sql: Sql | null = null;
  let wfRunId: string | null = null;

  async function db(): Promise<Sql> {
    if (!sql) {
      sql = connectXtdb();
      if (!await ensureConnected(sql)) throw new Error("XTDB unreachable");
    }
    return sql;
  }

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

  async function ensureWorkflowsLoaded() {
    if (workflows.size > 0) return;
    const loaded = await loadWorkflowDir(WORKFLOWS_DIR);
    for (const [name, def] of loaded) workflows.set(name, def);
    if (workflows.size > 0) {
      console.log(`[workflow-engine] Loaded ${workflows.size} workflows: ${[...workflows.keys()].join(", ")}`);
    }
  }

  function formatWorkflowList(): string {
    if (workflows.size === 0) return "No workflows loaded. Add .jsonld files to ~/.pi/agent/workflows/";
    const lines = [...workflows.entries()].map(([name, wf]) => {
      const chain = wf.steps.map(s => s.agentRole).join(" → ");
      return `  ${name}: ${wf.description}\n    ${chain}`;
    });
    const status = state.active ? `\nActive: ${state.workflowName} (step ${state.currentStep})` : "\nNo active workflow.";
    return `Available workflows:\n${lines.join("\n")}${status}`;
  }

  // ─── Load workflows on session start ────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    await ensureWorkflowsLoaded();

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

  async function activateWorkflow(name: string, task: string, ctx: any): Promise<string> {
    await ensureWorkflowsLoaded();
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

    // Persist workflow run to XTDB (historical record)
    try {
      const s = await db();
      const t = (v: string | null) => s.typed(v as any, 25);
      const n = (v: number | null) => s.typed(v as any, 20);
      const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
      wfRunId = `wfrun:${randomUUID()}`;
      const now = Date.now();

      const jsonld = JSON.stringify({
        "@context": JSONLD_CONTEXT,
        "@id": piId(wfRunId),
        "@type": ["schema:HowTo", "prov:Activity"],
        "schema:name": name,
        "prov:used": projectId ? piRef(projectId) : null,
        "schema:description": task,
        "schema:actionStatus": "ActiveActionStatus",
        "prov:startedAtTime": { "@value": String(now), "@type": "xsd:long" },
      });

      await s`INSERT INTO workflow_runs (
        _id, project_id, session_id, workflow_name, task_description,
        status, current_step, total_steps, started_ts, completed_ts, ts, jsonld
      ) VALUES (
        ${t(wfRunId)}, ${t(projectId)}, ${t(null)},
        ${t(name)}, ${t(task)}, ${t('running')},
        ${n(1)}, ${n(wf.steps.length)},
        ${n(now)}, ${n(null)}, ${n(now)}, ${t(jsonld)}
      )`;
    } catch (err) {
      console.warn(`[workflow-engine] XTDB write failed: ${err}`);
    }

    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));

    const step = wf.steps[0];
    return `🔄 Workflow "${name}" activated — ${wf.steps.length} steps\n` +
      `Starting step 1: ${step.name} (${step.agentRole})\n` +
      `Task: ${task}`;
  }

  // ─── Advance to next step ───────────────────────────────────────

  async function advanceStep(ctx: any): Promise<string> {
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

      // Record completed step + workflow completion in XTDB
      try {
        if (wfRunId) {
          const s = await db();
          const t = (v: string | null) => s.typed(v as any, 25);
          const n = (v: number | null) => s.typed(v as any, 20);
          const stepId = `wfstep:${randomUUID()}`;
          const now = Date.now();

          await s`INSERT INTO workflow_step_runs (
            _id, workflow_run_id, step_name, agent_role, position,
            status, started_ts, completed_ts, ts, jsonld
          ) VALUES (
            ${t(stepId)}, ${t(wfRunId)}, ${t(wf.steps[curIdx]?.name ?? 'unknown')},
            ${t(wf.steps[curIdx]?.agentRole ?? 'unknown')}, ${n(state.stepStates[curIdx]?.position ?? 0)},
            ${t('done')}, ${n(state.stepStates[curIdx]?.startedAt ?? now)},
            ${n(now)}, ${n(now)}, ${t('{}')}
          )`;

          const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
          await s`INSERT INTO workflow_runs (
            _id, project_id, session_id, workflow_name, task_description,
            status, current_step, total_steps, started_ts, completed_ts, ts, jsonld
          ) VALUES (
            ${t(wfRunId)}, ${t(projectId)}, ${t(null)},
            ${t(state.workflowName)}, ${t(state.task)},
            ${t('completed')},
            ${n(state.currentStep)}, ${n(wf.steps.length)},
            ${n(state.stepStates[0]?.startedAt ?? now)},
            ${n(now)}, ${n(now)}, ${t('{}')}
          )`;
        }
      } catch (err) {
        console.warn(`[workflow-engine] XTDB step write failed: ${err}`);
      }

      return `✅ Workflow "${state.workflowName}" complete — all ${wf.steps.length} steps done.`;
    }

    state.currentStep = state.stepStates[nextIdx].position;
    state.stepStates[nextIdx].status = "active";
    state.stepStates[nextIdx].startedAt = Date.now();

    saveState();
    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));

    // Record completed step + progress in XTDB
    try {
      if (wfRunId) {
        const s = await db();
        const t = (v: string | null) => s.typed(v as any, 25);
        const n = (v: number | null) => s.typed(v as any, 20);
        const stepId = `wfstep:${randomUUID()}`;
        const now = Date.now();

        await s`INSERT INTO workflow_step_runs (
          _id, workflow_run_id, step_name, agent_role, position,
          status, started_ts, completed_ts, ts, jsonld
        ) VALUES (
          ${t(stepId)}, ${t(wfRunId)}, ${t(wf.steps[curIdx]?.name ?? 'unknown')},
          ${t(wf.steps[curIdx]?.agentRole ?? 'unknown')}, ${n(state.stepStates[curIdx]?.position ?? 0)},
          ${t('done')}, ${n(state.stepStates[curIdx]?.startedAt ?? now)},
          ${n(now)}, ${n(now)}, ${t('{}')}
        )`;

        const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
        await s`INSERT INTO workflow_runs (
          _id, project_id, session_id, workflow_name, task_description,
          status, current_step, total_steps, started_ts, completed_ts, ts, jsonld
        ) VALUES (
          ${t(wfRunId)}, ${t(projectId)}, ${t(null)},
          ${t(state.workflowName)}, ${t(state.task)},
          ${t('running')},
          ${n(state.currentStep)}, ${n(wf.steps.length)},
          ${n(state.stepStates[0]?.startedAt ?? now)},
          ${n(null)}, ${n(now)}, ${t('{}')}
        )`;
      }
    } catch (err) {
      console.warn(`[workflow-engine] XTDB step write failed: ${err}`);
    }

    const step = wf.steps[nextIdx];
    const prompt = step.promptTemplate
      .replace(/\{task\}/g, state.task)
      .replace(/\{cwd\}/g, process.cwd())
      .replace(/\{context\}/g, state.task);

    return `🔄 Step ${step.position}/${wf.steps.length}: ${step.name} (${step.agentRole})\n\n${prompt}`;
  }

  // ─── Skip current step ──────────────────────────────────────────

  async function skipStep(ctx: any): Promise<string> {
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
    const prevTask = state.task;
    const prevWf = workflows.get(state.workflowName);

    // Record abandonment in XTDB
    try {
      if (wfRunId) {
        const abandon = async () => {
          const s = await db();
          const t = (v: string | null) => s.typed(v as any, 25);
          const n = (v: number | null) => s.typed(v as any, 20);
          const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
          const now = Date.now();
          await s`INSERT INTO workflow_runs (
            _id, project_id, session_id, workflow_name, task_description,
            status, current_step, total_steps, started_ts, completed_ts, ts, jsonld
          ) VALUES (
            ${t(wfRunId)}, ${t(projectId)}, ${t(null)},
            ${t(name)}, ${t(prevTask)},
            ${t('abandoned')},
            ${n(state.currentStep)}, ${n(prevWf?.steps.length ?? 0)},
            ${n(state.stepStates[0]?.startedAt ?? now)},
            ${n(now)}, ${n(now)}, ${t('{}')}
          )`;
        };
        abandon().catch(err => console.warn(`[workflow-engine] XTDB abandon write failed: ${err}`));
      }
    } catch (err) {
      console.warn(`[workflow-engine] XTDB abandon write failed: ${err}`);
    }

    state = emptyState();
    wfRunId = null;
    saveState();
    ctx.ui.setStatus("workflow", JSON.stringify(statusPayload()));
    return `🛑 Workflow "${name}" abandoned.`;
  }

  // ─── /workflow command ──────────────────────────────────────────

  pi.registerCommand("workflow", {
    description: "Manage workflow: /workflow list | start <name> <task> | advance | skip | abandon",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const sub = parts[0] ?? "list";
      let msg: string;

      switch (sub) {
        case "list": {
          await ensureWorkflowsLoaded();
          msg = formatWorkflowList(); break;
        }
        case "start": {
          const name = parts[1];
          const task = parts.slice(2).join(" ");
          if (!name) { msg = "Usage: /workflow start <name> <task description>"; break; }
          if (!task) { msg = "Please provide a task description: /workflow start feature-build Add user authentication"; break; }
          msg = await activateWorkflow(name, task, ctx); break;
        }
        case "advance": msg = await advanceStep(ctx); break;
        case "skip": msg = await skipStep(ctx); break;
        case "abandon": msg = abandonWorkflow(ctx); break;
        case "status":
          msg = state.active
            ? `Workflow: ${state.workflowName} — Step ${state.currentStep} — ${progressBar()}`
            : "No active workflow.";
          break;
        default:
          msg = "Usage: /workflow list | start <name> <task> | advance | skip | abandon | status";
      }
      ctx.ui.notify(msg, "info");
    },
  });

  // ─── set_workflow tool (LLM can activate workflows) ─────────────

  pi.registerTool({
    name: "set_workflow",
    label: "Set Workflow",
    description: "Activate a workflow template. Use /workflow list to see available workflows.",
    parameters: Type.Object({
      action: StringEnum(["start", "advance", "skip", "abandon", "list"]),
      workflowName: Type.Optional(Type.String({ description: "Workflow name (for start action)" })),
      task: Type.Optional(Type.String({ description: "Task description (for start action)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let msg: string;
      switch (params.action) {
        case "list": {
          await ensureWorkflowsLoaded();
          msg = formatWorkflowList();
          break;
        }
        case "start": {
          if (!params.workflowName || !params.task) { msg = "Need workflowName and task."; break; }
          msg = await activateWorkflow(params.workflowName, params.task, ctx); break;
        }
        case "advance": msg = await advanceStep(ctx); break;
        case "skip": msg = await skipStep(ctx); break;
        case "abandon": msg = abandonWorkflow(ctx); break;
        default: msg = "Unknown action.";
      }
      return { content: [{ type: "text" as const, text: msg }] };
    },
  });

  // ─── Clean up DB connection on shutdown ──────────────────────────

  pi.on("session_shutdown", async () => {
    if (sql) { try { await sql.end(); } catch { /* cleanup — safe to ignore */ } sql = null; }
  });

  // ─── Auto-advance on agent_end if transition is "auto" ──────────

  pi.on("agent_end", async (_event, ctx) => {
    if (!state.active) return;
    const step = currentStepDef();
    if (step?.transitionMode === "auto") {
      const msg = await advanceStep(ctx);
      console.log(`[workflow-engine] Auto-advanced: ${msg}`);
    }
  });
}
