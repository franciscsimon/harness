import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const XTDB_HOST = process.env.XTDB_EVENT_HOST ?? "localhost";
const XTDB_PORT = Number(process.env.XTDB_EVENT_PORT ?? "5433");

type Sql = ReturnType<typeof postgres>;

const JSONLD_CONTEXT = {
  prov: "http://www.w3.org/ns/prov#",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

// Map pending tool calls to their input (path + content)
interface PendingCall {
  toolName: string;
  path: string;
  contentForHash: string | null;
}

export default function (pi: ExtensionAPI) {
  let sql: Sql | null = null;
  const pending = new Map<string, PendingCall>();

  async function ensureDb(): Promise<Sql | null> {
    if (sql) return sql;
    try {
      sql = postgres({ host: XTDB_HOST, port: XTDB_PORT, database: "xtdb", user: "xtdb", password: "xtdb" });
      await sql`SELECT 1 AS ok`;
      await sql`INSERT INTO artifacts (
        _id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld
      ) VALUES ('_seed', '', '', '', '', '', '', '', 0, '')`;
      await sql`DELETE FROM artifacts WHERE _id = '_seed'`;
      return sql;
    } catch {
      sql = null;
      return null;
    }
  }

  // Capture tool_call input to extract file path and content
  pi.on("tool_call", async (event) => {
    const e = event as any;
    const tool = e?.toolName;
    if (tool !== "write" && tool !== "edit") return;

    const input = e?.input;
    if (!input?.path) return;

    const callId = e?.toolCallId;
    if (!callId) return;

    // For write: hash the full content. For edit: hash oldText+newText
    let contentForHash: string | null = null;
    if (tool === "write" && input.content) {
      contentForHash = input.content;
    } else if (tool === "edit" && input.newText) {
      contentForHash = `${input.oldText ?? ""}→${input.newText}`;
    }

    pending.set(callId, { toolName: tool, path: input.path, contentForHash });
  });

  // On successful tool_execution_end, persist artifact record
  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const callId = e?.toolCallId;
    if (!callId) return;

    const call = pending.get(callId);
    if (!call) return;
    pending.delete(callId);

    // Only track successful operations
    if (e?.isError) return;

    const db = await ensureDb();
    if (!db) return;

    const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
    const sessionId = (globalThis as any).__piLastEvent?.sessionId ?? "unknown";

    const hash = call.contentForHash
      ? createHash("sha256").update(call.contentForHash).digest("hex").slice(0, 16)
      : null;

    // Infer kind from file extension
    const ext = call.path.split(".").pop()?.toLowerCase() ?? "";
    const kind = inferKind(ext);

    const id = `art:${randomUUID()}`;
    const now = Date.now();
    const t = (v: string | null) => db.typed(v as any, 25);
    const n = (v: number | null) => db.typed(v as any, 20);

    const jsonld = JSON.stringify({
      "@context": JSONLD_CONTEXT,
      "@id": `urn:pi:${id}`,
      "@type": "prov:Entity",
      "prov:wasGeneratedBy": { "@id": `urn:pi:toolcall:${callId}` },
      "ev:projectId": projectId,
      "ev:path": call.path,
      "ev:contentHash": hash,
      "ev:kind": kind,
      "ev:operation": call.toolName,
      "ev:ts": { "@value": String(now), "@type": "xsd:long" },
    });

    try {
      await db`INSERT INTO artifacts (
        _id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(sessionId)},
        ${t(call.path)}, ${t(hash)}, ${t(kind)},
        ${t(call.toolName)}, ${t(callId)}, ${n(now)}, ${t(jsonld)}
      )`;
    } catch (err) {
      console.error(`[artifact-tracker] persist failed: ${err}`);
    }
  });

  pi.on("session_shutdown", async () => {
    pending.clear();
    if (sql) { try { await sql.end(); } catch {} sql = null; }
  });
}

function inferKind(ext: string): string {
  if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h"].includes(ext)) return "code";
  if (["md", "txt", "rst"].includes(ext)) return "doc";
  if (["json", "yaml", "yml", "toml", "env"].includes(ext)) return "config";
  if (["css", "html", "svg"].includes(ext)) return "asset";
  return "other";
}
