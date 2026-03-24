import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { captureError } from "../lib/errors.ts";
import { JSONLD_CONTEXT } from "../lib/jsonld/context.ts";
import { ids } from "../lib/jsonld/ids.ts";

// ─── In-memory state collected during session ──────────────────────

interface SessionState {
  goal: string | null;
  filesChanged: Set<string>;
  toolUsage: Record<string, number>;
  errorCount: number;
  turnCount: number;
  decisionsMade: string[];
  failedTools: Array<{ tool: string; error: string }>;
  bashCommands: string[];
}

function emptyState(): SessionState {
  return {
    goal: null,
    filesChanged: new Set(),
    toolUsage: {},
    errorCount: 0,
    turnCount: 0,
    decisionsMade: [],
    failedTools: [],
    bashCommands: [],
  };
}

export default function (pi: ExtensionAPI) {
  if (process.env.XTDB_EVENT_LOGGING !== "true") return;

  let sql: Sql | null = null;
  let state = emptyState();

  async function connectDb(): Promise<Sql | null> {
    if (sql) return sql;
    try {
      sql = connectXtdb();
      if (!(await ensureConnected(sql))) {
        sql = null;
        return null;
      }
      await sql`INSERT INTO session_postmortems (
        _id, project_id, session_id, goal, what_worked, what_failed,
        files_changed, error_count, turn_count, ts, jsonld
      ) VALUES ('_seed', '', '', '', '', '', '', 0, 0, 0, '')`;
      await sql`DELETE FROM session_postmortems WHERE _id = '_seed'`;
      return sql;
    } catch {
      sql = null;
      return null;
    }
  }

  pi.on("session_start", async () => {
    state = emptyState();
  });

  // Capture goal from first user prompt
  pi.on("before_agent_start", async (event) => {
    if (!state.goal) {
      const e = event as any;
      state.goal = String(e?.prompt ?? "").slice(0, 500) || null;
    }
  });

  pi.on("turn_start", async () => {
    state.turnCount++;
  });

  // Track tool usage + file changes
  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const tool = e?.toolName ?? "unknown";
    state.toolUsage[tool] = (state.toolUsage[tool] ?? 0) + 1;

    if (e?.isError) {
      state.errorCount++;
      const errSnippet = String(e?.result?.content ?? "").slice(0, 200);
      state.failedTools.push({ tool, error: errSnippet });
    }

    // Track file changes from write/edit
    if ((tool === "write" || tool === "edit") && !e?.isError) {
      try {
        const input = e?.input ?? e?.args;
        if (input?.path) state.filesChanged.add(input.path);
      } catch (err) {
        captureError({
          component: "session-postmortem",
          operation: "track file changes",
          error: err,
          severity: "degraded",
        });
      }
    }

    // Track bash commands
    if (tool === "bash") {
      try {
        const input = e?.input ?? e?.args;
        if (input?.command) state.bashCommands.push(String(input.command).slice(0, 200));
      } catch (err) {
        captureError({
          component: "session-postmortem",
          operation: "track bash commands",
          error: err,
          severity: "degraded",
        });
      }
    }
  });

  // Persist post-mortem on shutdown
  pi.on("session_shutdown", async (_event, ctx) => {
    const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
    const sessionId = ctx?.sessionManager?.getSessionFile?.() ?? "unknown";

    // Only persist if there was meaningful activity
    if (state.turnCount === 0) {
      if (sql) {
        try {
          await sql.end();
        } catch {
          /* cleanup — safe to ignore */
        }
        sql = null;
      }
      return;
    }

    const db = await connectDb();
    if (!db) return;

    const id = ids.postmortem();
    const now = Date.now();
    const files = [...state.filesChanged];

    // Derive what worked / what failed from collected state
    const whatWorked =
      files.length > 0
        ? `Modified ${files.length} file(s): ${files.map((f) => f.split("/").pop()).join(", ")}`
        : "No files modified";

    const whatFailed =
      state.failedTools.length > 0
        ? state.failedTools
            .slice(0, 5)
            .map((f) => `${f.tool}: ${f.error.slice(0, 100)}`)
            .join("; ")
        : "No tool failures";

    let artifactVersionCount = 0,
      decisionCount = 0,
      delegationCount = 0;
    try {
      const [av] = await db`SELECT COUNT(*)::int AS c FROM artifact_versions WHERE session_id = ${sessionId}`;
      artifactVersionCount = av?.c ?? 0;
    } catch (err) {
      captureError({
        component: "session-postmortem",
        operation: "SELECT artifact_versions count",
        error: err,
        severity: "degraded",
      });
    }
    try {
      const [dc] = await db`SELECT COUNT(*)::int AS c FROM decisions WHERE session_id = ${sessionId}`;
      decisionCount = dc?.c ?? 0;
    } catch (err) {
      captureError({
        component: "session-postmortem",
        operation: "SELECT decisions count",
        error: err,
        severity: "degraded",
      });
    }
    try {
      const [dl] = await db`SELECT COUNT(*)::int AS c FROM delegations WHERE parent_session_id = ${sessionId}`;
      delegationCount = dl?.c ?? 0;
    } catch (err) {
      captureError({
        component: "session-postmortem",
        operation: "SELECT delegations count",
        error: err,
        severity: "degraded",
      });
    }

    const jsonld = JSON.stringify({
      "@context": JSONLD_CONTEXT,
      "@id": `urn:pi:${id}`,
      "@type": "prov:Activity",
      "ev:projectId": projectId,
      "ev:sessionId": sessionId,
      "ev:goal": state.goal,
      "ev:whatWorked": whatWorked,
      "ev:whatFailed": whatFailed,
      "ev:filesChanged": files,
      "ev:errorCount": { "@value": String(state.errorCount), "@type": "xsd:integer" },
      "ev:turnCount": { "@value": String(state.turnCount), "@type": "xsd:integer" },
      "ev:artifactVersionsProduced": { "@value": String(artifactVersionCount), "@type": "xsd:integer" },
      "ev:decisionsLogged": { "@value": String(decisionCount), "@type": "xsd:integer" },
      "ev:delegationsSpawned": { "@value": String(delegationCount), "@type": "xsd:integer" },
      "ev:ts": { "@value": String(now), "@type": "xsd:long" },
    });

    const t = (v: string | null) => db.typed(v as any, 25);
    const n = (v: number | null) => db.typed(v as any, 20);

    try {
      await db`INSERT INTO session_postmortems (
        _id, project_id, session_id, goal, what_worked, what_failed,
        files_changed, error_count, turn_count, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(sessionId)},
        ${t(state.goal)}, ${t(whatWorked)}, ${t(whatFailed)},
        ${t(JSON.stringify(files))}, ${n(state.errorCount)}, ${n(state.turnCount)},
        ${n(now)}, ${t(jsonld)}
      )`;
    } catch (_err) {}

    if (sql) {
      try {
        await sql.end();
      } catch {
        /* cleanup — safe to ignore */
      }
      sql = null;
    }
  });
}
