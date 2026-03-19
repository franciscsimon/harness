import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { JSONLD_CONTEXT, piId, piRef } from "../lib/jsonld/context.ts";

// ─── Requirements Tracker Extension ───────────────────────────────
// Track project requirements and link them to artifacts/decisions.

let sql: Sql | null = null;
async function db(): Promise<Sql> {
  if (!sql) {
    sql = connectXtdb();
    if (!await ensureConnected(sql)) throw new Error("XTDB unreachable");
  }
  return sql;
}
const t = (s: Sql, v: string | null) => s.typed(v as any, 25);
const n = (s: Sql, v: number | null) => s.typed(v as any, 20);

const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
const VALID_STATUSES = ["proposed", "accepted", "implemented", "verified", "rejected"];
const VALID_ENTITY_TYPES = ["decision", "artifact", "test_run"];

const PRIORITY_ICONS: Record<string, string> = {
  low: "⬜",
  medium: "🟦",
  high: "🟧",
  critical: "🟥",
};

const STATUS_ICONS: Record<string, string> = {
  proposed: "📋",
  accepted: "✅",
  implemented: "🔨",
  verified: "✔️",
  rejected: "❌",
};

function shortId(id: string): string {
  return id.replace(/^req:/, "").slice(0, 8);
}

function getProjectId(): string | null {
  return (globalThis as any).__piCurrentProject?.projectId ?? null;
}

// ── Subcommand handlers ─────────────────────────────────────────

async function handleAdd(parts: string[], ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) {
    ctx.ui.notify("No active project. Use /project first.", "error");
    return;
  }

  if (parts.length === 0) {
    ctx.ui.notify("Usage: /req add <title> [priority] [description]", "error");
    return;
  }

  const title = parts[0];
  let priority = "medium";
  let description: string | null = null;

  if (parts.length >= 2 && VALID_PRIORITIES.includes(parts[1])) {
    priority = parts[1];
    if (parts.length >= 3) description = parts.slice(2).join(" ");
  } else if (parts.length >= 2) {
    description = parts.slice(1).join(" ");
  }

  const s = await db();
  const id = `req:${randomUUID()}`;
  const now = Date.now();
  const status = "proposed";
  const source = "manual";

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": ["schema:CreativeWork", "prov:Entity"],
    "schema:name": title,
    "schema:description": description,
    "ev:priority": priority,
    "ev:status": status,
    "ev:projectId": projectId,
  });

  try {
    await s`INSERT INTO requirements (
      _id, project_id, title, description, priority, status,
      source, linked_decision_id, linked_artifact_id, ts, jsonld
    ) VALUES (
      ${t(s, id)}, ${t(s, projectId)}, ${t(s, title)}, ${t(s, description)},
      ${t(s, priority)}, ${t(s, status)}, ${t(s, source)},
      ${t(s, null)}, ${t(s, null)}, ${n(s, now)}, ${t(s, jsonld)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Failed to save requirement: ${err}`, "error");
    return;
  }

  ctx.ui.notify(
    `${PRIORITY_ICONS[priority] ?? "•"} Requirement added: **${title}** [${shortId(id)}] (${priority})`,
    "success",
  );
}

async function handleList(parts: string[], ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) {
    ctx.ui.notify("No active project.", "error");
    return;
  }

  const s = await db();
  const statusFilter = parts[0] ?? null;

  if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
    ctx.ui.notify(`Invalid status "${statusFilter}". Use: ${VALID_STATUSES.join(", ")}`, "error");
    return;
  }

  let rows: any[];
  try {
    if (statusFilter) {
      rows = await s`
        SELECT _id, title, priority, status FROM requirements
        WHERE project_id = ${t(s, projectId)} AND status = ${t(s, statusFilter)}
        ORDER BY ts DESC
      `;
    } else {
      rows = await s`
        SELECT _id, title, priority, status FROM requirements
        WHERE project_id = ${t(s, projectId)}
        ORDER BY ts DESC
      `;
    }
  } catch (err) {
    ctx.ui.notify(`Query failed: ${err}`, "error");
    return;
  }

  if (rows.length === 0) {
    ctx.ui.notify(statusFilter
      ? `No requirements with status "${statusFilter}".`
      : "No requirements found for this project.",
      "info");
    return;
  }

  const header = "| ID | Title | Priority | Status |\n|---|---|---|---|";
  const lines = rows.map((r: any) => {
    const pIcon = PRIORITY_ICONS[r.priority] ?? "";
    const sIcon = STATUS_ICONS[r.status] ?? "";
    return `| ${shortId(r._id)} | ${r.title} | ${pIcon} ${r.priority} | ${sIcon} ${r.status} |`;
  });

  ctx.ui.notify(`**Requirements** (${rows.length})\n\n${header}\n${lines.join("\n")}`, "info");
}

async function handleStatus(parts: string[], ctx: any): Promise<void> {
  if (parts.length < 2) {
    ctx.ui.notify("Usage: /req status <id> <status>", "error");
    return;
  }

  const s = await db();
  const newStatus = parts[1];

  if (!VALID_STATUSES.includes(newStatus)) {
    ctx.ui.notify(`Invalid status "${newStatus}". Use: ${VALID_STATUSES.join(", ")}`, "error");
    return;
  }

  const idPrefix = parts[0].startsWith("req:") ? parts[0] : `req:${parts[0]}`;

  let rows: any[];
  try {
    rows = await s`
      SELECT * FROM requirements WHERE _id LIKE ${t(s, `${idPrefix}%`)}
    `;
  } catch (err) {
    ctx.ui.notify(`Query failed: ${err}`, "error");
    return;
  }

  if (rows.length === 0) {
    ctx.ui.notify(`No requirement found matching "${parts[0]}".`, "error");
    return;
  }
  if (rows.length > 1) {
    ctx.ui.notify(`Ambiguous ID "${parts[0]}" — matches ${rows.length} requirements. Use a longer prefix.`, "error");
    return;
  }

  const row = rows[0];

  // XTDB upsert: INSERT full row with updated status
  try {
    await s`INSERT INTO requirements (
      _id, project_id, title, description, priority, status,
      source, linked_decision_id, linked_artifact_id, ts, jsonld
    ) VALUES (
      ${t(s, row._id)}, ${t(s, row.project_id)}, ${t(s, row.title)},
      ${t(s, row.description)}, ${t(s, row.priority)}, ${t(s, newStatus)},
      ${t(s, row.source)}, ${t(s, row.linked_decision_id)}, ${t(s, row.linked_artifact_id)},
      ${n(s, Date.now())}, ${t(s, row.jsonld)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Update failed: ${err}`, "error");
    return;
  }

  ctx.ui.notify(
    `${STATUS_ICONS[newStatus] ?? "•"} Requirement [${shortId(row._id)}] "${row.title}" → **${newStatus}**`,
    "success",
  );
}

async function handleLink(parts: string[], ctx: any): Promise<void> {
  if (parts.length < 3) {
    ctx.ui.notify("Usage: /req link <req_id> <entity_type> <entity_id>", "error");
    return;
  }

  const s = await db();
  const [reqIdArg, entityType, entityId] = parts;

  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    ctx.ui.notify(`Invalid entity type "${entityType}". Use: ${VALID_ENTITY_TYPES.join(", ")}`, "error");
    return;
  }

  const idPrefix = reqIdArg.startsWith("req:") ? reqIdArg : `req:${reqIdArg}`;

  let rows: any[];
  try {
    rows = await s`
      SELECT _id, title FROM requirements WHERE _id LIKE ${t(s, `${idPrefix}%`)}
    `;
  } catch (err) {
    ctx.ui.notify(`Query failed: ${err}`, "error");
    return;
  }

  if (rows.length === 0) {
    ctx.ui.notify(`No requirement found matching "${reqIdArg}".`, "error");
    return;
  }
  if (rows.length > 1) {
    ctx.ui.notify(`Ambiguous ID "${reqIdArg}" — matches ${rows.length} requirements.`, "error");
    return;
  }

  const reqRow = rows[0];
  const linkId = `reqlink:${randomUUID()}`;
  const now = Date.now();

  try {
    await s`INSERT INTO requirement_links (
      _id, requirement_id, entity_type, entity_id, ts
    ) VALUES (
      ${t(s, linkId)}, ${t(s, reqRow._id)}, ${t(s, entityType)},
      ${t(s, entityId)}, ${n(s, now)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Failed to create link: ${err}`, "error");
    return;
  }

  ctx.ui.notify(
    `🔗 Linked requirement [${shortId(reqRow._id)}] "${reqRow.title}" → ${entityType} ${entityId}`,
    "success",
  );
}

// ── Extension entry point ───────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("req", {
    description: "Track project requirements: add, list, status, link",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "add", label: "add <title> [priority] [description] — Add a requirement" },
        { value: "list", label: "list [status] — List requirements" },
        { value: "status", label: "status <id> <status> — Update requirement status" },
        { value: "link", label: "link <req_id> <entity_type> <entity_id> — Link to artifact/decision" },
      ];
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const sub = parts[0] ?? "list";
      const rest = parts.slice(1);

      switch (sub) {
        case "add":
          await handleAdd(rest, ctx);
          break;
        case "list":
          await handleList(rest, ctx);
          break;
        case "status":
          await handleStatus(rest, ctx);
          break;
        case "link":
          await handleLink(rest, ctx);
          break;
        default:
          ctx.ui.notify(
            "Usage: /req <add|list|status|link>\n" +
            "  add <title> [priority] [description]\n" +
            "  list [status]\n" +
            "  status <id> <new_status>\n" +
            "  link <req_id> <entity_type> <entity_id>",
            "info",
          );
      }
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
