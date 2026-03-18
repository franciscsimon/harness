import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Sql } from "./db.js";

export async function cmdList(db: Sql, sessionId: string | null, ctx: any) {
  let rows: any[];
  try {
    rows = await db`
      SELECT av.relative_path, av.version, av.content_hash, av.size_bytes, av.operation, av.ts
      FROM artifact_versions av
      WHERE av.session_id = ${sessionId}
         OR av.session_id IN (SELECT child_session_id FROM delegations WHERE parent_session_id = ${sessionId})
      ORDER BY av.relative_path, av.version
    `;
  } catch {
    rows = await db`
      SELECT relative_path, version, content_hash, size_bytes, operation, ts
      FROM artifact_versions WHERE session_id = ${sessionId}
      ORDER BY relative_path, version
    `;
  }

  if (rows.length === 0) {
    ctx.ui.notify("No artifacts found for current session", "info");
    return;
  }

  const grouped = new Map<string, any[]>();
  for (const r of rows) {
    if (!grouped.has(r.relative_path)) grouped.set(r.relative_path, []);
    grouped.get(r.relative_path)!.push(r);
  }

  const lines = ["## Archived Artifacts\n"];
  for (const [path, versions] of grouped) {
    const latest = versions[versions.length - 1];
    const ts = new Date(Number(latest.ts)).toISOString().slice(0, 19);
    lines.push(`- **${path}** — ${versions.length} version(s), latest: ${ts}, ${latest.size_bytes}B`);
  }
  lines.push("\nUse `/artifacts restore <file>` or `/artifacts history <file>`");
  ctx.ui.notify(lines.join("\n"), "info");
}

export async function cmdRestore(db: Sql, _sessionId: string | null, args: string[], ctx: any) {
  const filePath = args[0];
  if (!filePath) { ctx.ui.notify("Usage: /artifacts restore <file> [--version N]", "info"); return; }

  let version: number | null = null;
  const vIdx = args.indexOf("--version");
  if (vIdx >= 0 && args[vIdx + 1]) version = parseInt(args[vIdx + 1], 10);

  const rows = version != null
    ? await db`SELECT content, version, relative_path FROM artifact_versions
        WHERE relative_path LIKE ${"%" + filePath + "%"} AND version = ${version}
        ORDER BY ts DESC LIMIT 1`
    : await db`SELECT content, version, relative_path FROM artifact_versions
        WHERE relative_path LIKE ${"%" + filePath + "%"}
        ORDER BY ts DESC LIMIT 1`;

  if (rows.length === 0) { ctx.ui.notify(`No artifact matching "${filePath}"`, "error"); return; }

  const row = rows[0];
  const outPath = resolve(process.cwd(), row.relative_path);
  await writeFile(outPath, row.content, "utf-8");
  ctx.ui.notify(`Restored ${row.relative_path} (v${row.version}) to disk`, "success");
}

export async function cmdHistory(db: Sql, _sessionId: string | null, args: string[], ctx: any) {
  const filePath = args[0];
  if (!filePath) { ctx.ui.notify("Usage: /artifacts history <file>", "info"); return; }

  const rows = await db`
    SELECT version, content_hash, size_bytes, operation, ts, session_id
    FROM artifact_versions WHERE relative_path LIKE ${"%" + filePath + "%"}
    ORDER BY ts ASC
  `;

  if (rows.length === 0) { ctx.ui.notify(`No history for "${filePath}"`, "info"); return; }

  const lines = [`## History: ${filePath}\n`,
    "| Version | Hash | Size | Op | Time | Session |",
    "|---------|------|------|----|------|---------|"];
  for (const r of rows) {
    const ts = new Date(Number(r.ts)).toISOString().slice(0, 19);
    lines.push(`| v${r.version} | ${r.content_hash} | ${r.size_bytes}B | ${r.operation} | ${ts} | ${String(r.session_id).slice(0, 12)}… |`);
  }
  ctx.ui.notify(lines.join("\n"), "info");
}
