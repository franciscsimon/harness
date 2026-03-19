import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import { resolve, relative, extname } from "node:path";
import { ensureDb, typed, typedNum, closeDb } from "./db.js";
import { captureVersion, cleanupArtifacts, clearVersionState } from "./versioning.js";
import { cmdList, cmdRestore, cmdHistory } from "./commands.js";
import { cmdExportProvenance } from "./provenance.js";
import { JSONLD_CONTEXT } from "../lib/jsonld/context.ts";

interface PendingCall {
  toolName: string;
  path: string;
  contentForHash: string | null;
}

export default function (pi: ExtensionAPI) {
  const pending = new Map<string, PendingCall>();

  pi.on("tool_call", async (event) => {
    const e = event as any;
    const tool = e?.toolName;
    const input = e?.input;
    const callId = e?.toolCallId;
    if (!input?.path || !callId) return;

    if (tool === "read" && extname(input.path).toLowerCase() === ".md") {
      trackArtifactRead(input.path, callId);
      return;
    }

    if (tool !== "write" && tool !== "edit") return;

    let contentForHash: string | null = null;
    if (tool === "write" && input.content) contentForHash = input.content;
    else if (tool === "edit" && input.newText) contentForHash = `${input.oldText ?? ""}→${input.newText}`;

    pending.set(callId, { toolName: tool, path: input.path, contentForHash });
  });

  async function trackArtifactRead(path: string, callId: string) {
    const db = await ensureDb();
    if (!db) return;
    const sessionId = (globalThis as any).__piLastEvent?.sessionId ?? "unknown";
    const absPath = resolve(path);
    const t = (v: string | null) => typed(db, v);
    const n = (v: number | null) => typedNum(db, v);
    const id = `aread:${randomUUID()}`;
    try {
      await db`INSERT INTO artifact_reads (_id, session_id, path, tool_call_id, ts)
        VALUES (${t(id)}, ${t(sessionId)}, ${t(absPath)}, ${t(callId)}, ${n(Date.now())})`;
    } catch {}
  }

  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const callId = e?.toolCallId;
    if (!callId) return;
    const call = pending.get(callId);
    if (!call) return;
    pending.delete(callId);
    if (e?.isError) return;

    const db = await ensureDb();
    if (!db) return;

    const projectId = (globalThis as any).__piCurrentProject?.projectId ?? null;
    const sessionId = (globalThis as any).__piLastEvent?.sessionId ?? "unknown";
    const absPath = resolve(call.path);
    const relPath = relative(process.cwd(), absPath);
    const hash = call.contentForHash
      ? createHash("sha256").update(call.contentForHash).digest("hex").slice(0, 16)
      : null;
    const ext = extname(call.path).slice(1).toLowerCase();
    const kind = inferKind(ext);
    const id = `art:${randomUUID()}`;
    const now = Date.now();
    const t = (v: string | null) => typed(db, v);
    const n = (v: number | null) => typedNum(db, v);

    const jsonld = JSON.stringify({
      "@context": JSONLD_CONTEXT,
      "@id": `urn:pi:${id}`, "@type": "prov:Entity",
      "prov:wasGeneratedBy": { "@id": `urn:pi:toolcall:${callId}` },
      "ev:projectId": projectId, "ev:path": absPath, "ev:contentHash": hash,
      "ev:kind": kind, "ev:operation": call.toolName,
      "ev:ts": { "@value": String(now), "@type": "xsd:long" },
    });

    try {
      await db`INSERT INTO artifacts (
        _id, project_id, session_id, path, content_hash, kind, operation, tool_call_id, ts, jsonld
      ) VALUES (
        ${t(id)}, ${t(projectId)}, ${t(sessionId)}, ${t(absPath)}, ${t(hash)}, ${t(kind)},
        ${t(call.toolName)}, ${t(callId)}, ${n(now)}, ${t(jsonld)}
      )`;
    } catch (err) {
      console.error(`[artifact-tracker] persist failed: ${err}`);
    }

    if (kind === "doc" && ext === "md") {
      await captureVersion(pi, db, sessionId, absPath, relPath, call.toolName, callId, now, id);
    }
  });

  pi.on("session_shutdown", async () => {
    const sessionId = (globalThis as any).__piLastEvent?.sessionId ?? null;
    const db = await ensureDb();
    if (sessionId && db) await cleanupArtifacts(db, sessionId);
    pending.clear();
    clearVersionState();
    await closeDb();
  });

  pi.registerCommand("artifacts", {
    description: "List, restore, or view history of archived .md artifacts",
    handler: async (args, ctx) => {
      const db = await ensureDb();
      if (!db) { ctx.ui.notify("XTDB not available", "error"); return; }
      const sessionId = (globalThis as any).__piLastEvent?.sessionId ?? null;
      const parts = (args ?? "").trim().split(/\s+/);
      const sub = parts[0] || "list";
      if (sub === "list") await cmdList(db, sessionId, ctx);
      else if (sub === "restore") await cmdRestore(db, sessionId, parts.slice(1), ctx);
      else if (sub === "history") await cmdHistory(db, sessionId, parts.slice(1), ctx);
      else if (sub === "export-provenance") await cmdExportProvenance(db, sessionId, parts.slice(1), ctx);
      else ctx.ui.notify("Usage: /artifacts [list | restore <file> | history <file> | export-provenance]", "info");
    },
  });
}

function inferKind(ext: string): string {
  if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h"].includes(ext)) return "code";
  if (["md", "txt", "rst"].includes(ext)) return "doc";
  if (["json", "yaml", "yml", "toml", "env"].includes(ext)) return "config";
  if (["css", "html", "svg"].includes(ext)) return "asset";
  return "other";
}
