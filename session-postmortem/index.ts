import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

type Sql = ReturnType<typeof postgres>;

const JSONLD_CONTEXT = {
  prov: "http://www.w3.org/ns/prov#",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

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
  let sql: Sql | null = null;
  let state = emptyState();

  async function connectDb(): Promise<Sql | null> {
    if (sql) return sql;
    try {
      sql = postgres({ host: XTDB_HOST, port: XTDB_PORT, database: "xtdb", user: "xtdb", password: "xtdb" });
      await sql`SELECT 1 AS ok`;
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
      } catch {}
    }

    // Track bash commands
    if (tool === "bash") {
      try {
        const input = e?.input ?? e?.args;
        if (input?.command) state.bashCommands.push(String(input.command).slice(0, 200));
      } catch {}
    }
  });

  // Persist post-mortem on shutdown
  pi.on("session_shutdown", async (_event, ctx) => {
    const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
    const sessionId = ctx?.sessionManager?.getSessionFile?.() ?? "unknown";

    // Only persist if there was meaningful activity
    if (state.turnCount === 0) {
      if (sql) { try { await sql.end(); } catch {} sql = null; }
      return;
    }

    const db = await connectDb();
    if (!db) return;

    const id = `pm:${randomUUID()}`;
    const now = Date.now();
    const files = [...state.filesChanged];

    // Derive what worked / what failed from collected state
    const whatWorked = files.length > 0
      ? `Modified ${files.length} file(s): ${files.map(f => f.split("/").pop()).join(", ")}`
      : "No files modified";

    const whatFailed = state.failedTools.length > 0
      ? state.failedTools.slice(0, 5).map(f => `${f.tool}: ${f.error.slice(0, 100)}`).join("; ")
      : "No tool failures";

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
    } catch (err) {
      console.error(`[session-postmortem] persist failed: ${err}`);
    }

    if (sql) { try { await sql.end(); } catch {} sql = null; }
  });
}
