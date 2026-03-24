import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

type Sql = ReturnType<typeof postgres>;

/**
 * History Retrieval Extension
 *
 * On before_agent_start:
 * 1. Extract file paths from user prompt
 * 2. Query XTDB for prior decisions, post-mortems, and artifacts touching those files
 * 3. Inject "Prior Work" context + failure warnings into agent context
 */
export default function (pi: ExtensionAPI) {
  if (process.env.XTDB_EVENT_LOGGING !== "true") return;

  let sql: Sql | null = null;

  async function ensureDb(): Promise<Sql | null> {
    if (sql) return sql;
    try {
      sql = postgres({
        host: XTDB_HOST,
        port: XTDB_PORT,
        database: "xtdb",
        user: "xtdb",
        password: "xtdb",
        max: 1,
        idle_timeout: 30,
        connect_timeout: 10,
      });
      await sql`SELECT 1 AS ok`;
      return sql;
    } catch {
      sql = null;
      return null;
    }
  }

  pi.on("before_agent_start", async (event) => {
    const current = (globalThis as any).__piCurrentProject;
    if (!current?.projectId) return;

    const e = event as any;
    const prompt = String(e?.prompt ?? "");
    if (!prompt) return;

    const db = await ensureDb();
    if (!db) return;

    const t = (v: string) => db.typed(v as any, 25);
    const projectId = current.projectId;

    // Extract file paths from prompt (paths with extensions, @references)
    const filePaths = extractPaths(prompt);

    const sections: string[] = [];

    // 1. Failed decisions for this project
    try {
      const failures = await db`
        SELECT task, what, why, files, ts FROM decisions
        WHERE project_id = ${t(projectId)} AND outcome = 'failure'
        ORDER BY ts DESC LIMIT 10
      `;
      if (failures.length > 0) {
        const lines = failures.map((f: any) => {
          const date = new Date(Number(f.ts)).toISOString().slice(0, 10);
          const filesNote = f.files ? ` [${truncFiles(f.files)}]` : "";
          return `- ${date} ❌ ${f.what} — ${f.why}${filesNote}`;
        });
        sections.push(`### Failed Approaches\nDo NOT retry these unless circumstances changed:\n${lines.join("\n")}`);
      }
    } catch {}

    // 2. If prompt mentions specific files, check prior work on those files
    if (filePaths.length > 0) {
      try {
        // Check artifacts for prior sessions that touched these files
        const priorWork: string[] = [];
        for (const fp of filePaths.slice(0, 5)) {
          const artifacts = await db`
            SELECT DISTINCT session_id, operation, ts FROM artifacts
            WHERE project_id = ${t(projectId)} AND path LIKE ${`%${fp}`}
            ORDER BY ts DESC LIMIT 3
          `;
          if (artifacts.length > 0) {
            priorWork.push(
              `- \`${fp}\`: modified in ${artifacts.length} prior session(s), last ${new Date(Number(artifacts[0].ts)).toISOString().slice(0, 10)}`,
            );
          }
        }
        if (priorWork.length > 0) {
          sections.push(`### Prior File History\n${priorWork.join("\n")}`);
        }

        // Check for file-specific failed decisions
        for (const fp of filePaths.slice(0, 5)) {
          const fileFailures = await db`
            SELECT what, why, ts FROM decisions
            WHERE project_id = ${t(projectId)} AND outcome = 'failure'
              AND files LIKE ${`%${fp}%`}
            ORDER BY ts DESC LIMIT 3
          `;
          if (fileFailures.length > 0) {
            const lines = fileFailures.map((f: any) => `- ⚠️ \`${fp}\`: previously failed: ${f.what} — ${f.why}`);
            sections.push(`### File-Specific Warnings\n${lines.join("\n")}`);
          }
        }
      } catch {}
    }

    // 3. Recent post-mortems with failures
    try {
      const postmortems = await db`
        SELECT goal, what_failed, error_count, ts FROM session_postmortems
        WHERE project_id = ${t(projectId)} AND error_count > 0
        ORDER BY ts DESC LIMIT 5
      `;
      const relevant = postmortems.filter((pm: any) => pm.what_failed && pm.what_failed !== "No tool failures");
      if (relevant.length > 0) {
        const lines = relevant.map((pm: any) => {
          const date = new Date(Number(pm.ts)).toISOString().slice(0, 10);
          const goal = String(pm.goal ?? "").slice(0, 80);
          return `- ${date}: "${goal}" — ${String(pm.what_failed).slice(0, 120)}`;
        });
        sections.push(`### Recent Sessions with Failures\n${lines.join("\n")}`);
      }
    } catch {}

    if (sections.length === 0) return;

    const md = `## Prior Work — ${current.name}\n\nReview before planning. Avoid repeating failed approaches.\n\n${sections.join("\n\n")}`;

    return {
      message: {
        customType: "history-retrieval",
        content: md,
        display: false,
      },
    };
  });

  pi.on("session_shutdown", async () => {
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

/** Extract file paths from prompt text */
function extractPaths(text: string): string[] {
  const paths = new Set<string>();
  // Match @references (pi file refs)
  for (const m of text.matchAll(/@([\w./-]+\.\w+)/g)) {
    paths.add(m[1]);
  }
  // Match quoted or bare paths with extensions
  for (const m of text.matchAll(
    /(?:^|\s|`|")([\w./-]+\.(?:ts|js|tsx|jsx|py|rs|go|md|json|yaml|yml|css|html|sql))\b/g,
  )) {
    paths.add(m[1]);
  }
  return [...paths];
}

/** Truncate files JSON for display */
function truncFiles(filesJson: string): string {
  try {
    const arr = JSON.parse(filesJson);
    if (Array.isArray(arr)) return arr.map((f: string) => f.split("/").pop()).join(", ");
  } catch {
    /* parse fallback — use default */
  }
  return filesJson.slice(0, 60);
}
