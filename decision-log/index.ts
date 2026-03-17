import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { buildDecisionJsonLd } from "./rdf.ts";
import type { DecisionRecord, LogDecisionInput } from "./types.ts";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

type Sql = ReturnType<typeof postgres>;

const OUTCOME_ICONS: Record<string, string> = {
  success: "✅",
  failure: "❌",
  deferred: "⏸️",
};

async function connectXtdb(): Promise<Sql> {
  const sql = postgres({ host: XTDB_HOST, port: XTDB_PORT, database: "xtdb", user: "xtdb", password: "xtdb" });
  await sql`SELECT 1 AS ok`;
  // Ensure decisions table exists (XTDB is schema-on-write)
  await sql`INSERT INTO decisions (_id, project_id, session_id, ts, task, what, outcome, why, jsonld)
    VALUES ('dec:seed', '', '', 0, '', '', '', '', '')`;
  await sql`DELETE FROM decisions WHERE _id = 'dec:seed'`;
  return sql;
}

/**
 * Query all decisions for a project, newest first.
 */
async function getProjectDecisions(sql: Sql, projectId: string): Promise<DecisionRecord[]> {
  const t = (v: string) => sql.typed(v as any, 25);
  const rows = await sql`
    SELECT * FROM decisions
    WHERE project_id = ${t(projectId)}
    ORDER BY ts DESC
  `;
  return rows as unknown as DecisionRecord[];
}

/**
 * Format decisions into a compact markdown block for context injection.
 */
function formatDecisionsForContext(decisions: DecisionRecord[]): string {
  if (decisions.length === 0) return "";

  const lines = decisions.map((d) => {
    const date = new Date(d.ts).toISOString().slice(0, 10);
    const icon = OUTCOME_ICONS[d.outcome] ?? "•";
    return `- ${date} ${icon} **${d.what}** — ${d.why} (task: ${d.task})`;
  });

  return `## Project Decision Log\n\nBefore planning or implementing, review these prior decisions and outcomes.\nDo not retry approaches marked ❌ unless the circumstances have changed.\n\n${lines.join("\n")}`;
}

export default function (pi: ExtensionAPI) {
  let sql: Sql | null = null;

  // ── Inject decisions into context before each agent turn ───────

  pi.on("before_agent_start", async (_event, _ctx) => {
    const current = (globalThis as any).__piCurrentProject;
    if (!current?.projectId) return;

    if (!sql) {
      try {
        sql = await connectXtdb();
      } catch {
        return;
      }
    }

    let decisions: DecisionRecord[];
    try {
      decisions = await getProjectDecisions(sql, current.projectId);
    } catch {
      return;
    }

    if (decisions.length === 0) return;

    const md = formatDecisionsForContext(decisions);
    return {
      message: {
        customType: "decision-log",
        content: md,
        display: false,
      },
    };
  });

  // ── Tool: log_decision ────────────────────────────────────────

  pi.registerTool({
    name: "log_decision",
    label: "Log Decision",
    description: "Record a design decision, failed approach, or deferred choice for the current project. This persists across sessions so future agents know what was tried and why.",
    promptSnippet: "log_decision — record a decision/failure/deferral for the project history",
    promptGuidelines: [
      "When you make a design decision, encounter a failed approach, or defer a choice, use log_decision to record it.",
      "Include the task you were working on, what you tried or decided, the outcome (success/failure/deferred), and the reasoning.",
    ],
    parameters: Type.Object({
      task: Type.String({ description: "What were you trying to accomplish" }),
      what: Type.String({ description: "What was tried or decided" }),
      outcome: Type.Union(
        [Type.Literal("success"), Type.Literal("failure"), Type.Literal("deferred")],
        { description: "success = worked and adopted, failure = tried and rejected, deferred = postponed" },
      ),
      why: Type.String({ description: "Why this outcome — root cause for failures, reasoning for decisions" }),
    }),
    async execute(_toolCallId, params: LogDecisionInput, _signal, _onUpdate, _ctx) {
      const current = (globalThis as any).__piCurrentProject;
      if (!current?.projectId) {
        return {
          content: [{ type: "text", text: "No project registered for current session. Decision not logged." }],
          details: {},
        };
      }

      if (!sql) {
        try {
          sql = await connectXtdb();
        } catch (err) {
          return {
            content: [{ type: "text", text: `XTDB connection failed: ${err}` }],
            details: {},
          };
        }
      }

      const sessionId = _ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      const now = Date.now();
      const t = (v: string | null) => sql!.typed(v as any, 25);
      const n = (v: number | null) => sql!.typed(v as any, 20);

      const record: DecisionRecord = {
        _id: `dec:${randomUUID()}`,
        project_id: current.projectId,
        session_id: sessionId,
        ts: now,
        task: params.task,
        what: params.what,
        outcome: params.outcome,
        why: params.why,
        jsonld: "",
      };
      record.jsonld = JSON.stringify(buildDecisionJsonLd(record));

      try {
        await sql!`INSERT INTO decisions (
          _id, project_id, session_id, ts, task, what, outcome, why, jsonld
        ) VALUES (
          ${t(record._id)}, ${t(record.project_id)},
          ${t(record.session_id)}, ${n(record.ts)},
          ${t(record.task)}, ${t(record.what)},
          ${t(record.outcome)}, ${t(record.why)},
          ${t(record.jsonld)}
        )`;
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to persist decision: ${err}` }],
          details: {},
        };
      }

      const icon = OUTCOME_ICONS[params.outcome] ?? "•";
      return {
        content: [{ type: "text", text: `${icon} Decision logged: ${params.what}` }],
        details: { id: record._id, project: current.projectId },
      };
    },
  });

  // ── Cleanup ───────────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    if (sql) {
      try { await sql.end(); } catch {}
      sql = null;
    }
  });
}
