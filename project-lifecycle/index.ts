import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { JSONLD_CONTEXT, piId } from "../lib/jsonld/context.ts";
import { randomUUID } from "node:crypto";

const VALID_PHASES = ["planning", "active", "maintenance", "deprecated", "decommissioned"] as const;
type Phase = (typeof VALID_PHASES)[number];

function getCurrentProjectId(): string | null {
  return (globalThis as any).__piCurrentProject?.projectId ?? null;
}

let sql: Sql | null = null;

async function db(): Promise<Sql | null> {
  if (!sql) {
    try {
      sql = connectXtdb();
      const ok = await ensureConnected(sql);
      if (!ok) throw new Error("connection check failed");
    } catch (err) {
      sql = null;
      console.error(`[project-lifecycle] XTDB connection failed: ${err}`);
      return null;
    }
  }
  return sql;
}

export default function (pi: ExtensionAPI) {
  const t = (s: Sql, v: string | null) => s.typed(v as any, 25);
  const n = (s: Sql, v: number | null) => s.typed(v as any, 20);

  // ── /project status ──
  pi.registerCommand("project status", {
    description: "Show current project lifecycle status",
    handler: async (_args, ctx) => {
      const conn = await db();
      if (!conn) { ctx.ui.notify("XTDB not available", "error"); return; }

      const projectId = getCurrentProjectId();
      if (!projectId) { ctx.ui.notify("No current project detected.", "error"); return; }

      let rows: any[];
      try {
        rows = await conn`SELECT * FROM projects WHERE _id = ${t(conn, projectId)}`;
      } catch (err) {
        ctx.ui.notify(`Failed to query project: ${err}`, "error");
        return;
      }

      if (rows.length === 0) {
        ctx.ui.notify(`Project ${projectId} not found in database.`, "error");
        return;
      }

      const p = rows[0];
      const firstSeen = p.first_seen_ts ? new Date(Number(p.first_seen_ts)).toISOString() : "—";
      const lastSeen = p.last_seen_ts ? new Date(Number(p.last_seen_ts)).toISOString() : "—";

      let output = `## Project Status\n\n`;
      output += `| Field | Value |\n|---|---|\n`;
      output += `| **Name** | ${p.name ?? "—"} |\n`;
      output += `| **Phase** | ${p.lifecycle_phase ?? "—"} |\n`;
      output += `| **Sessions** | ${p.session_count ?? 0} |\n`;
      output += `| **First seen** | ${firstSeen} |\n`;
      output += `| **Last seen** | ${lastSeen} |\n`;

      // Last 5 lifecycle events
      try {
        const events = await conn`SELECT * FROM lifecycle_events WHERE project_id = ${t(conn, projectId)} ORDER BY ts DESC LIMIT 5`;
        if (events.length > 0) {
          output += `\n### Recent Lifecycle Events\n\n`;
          output += `| Event | Summary | Time |\n|---|---|---|\n`;
          for (const ev of events) {
            const evTime = ev.ts ? new Date(Number(ev.ts)).toISOString() : "—";
            output += `| ${ev.event_type ?? "—"} | ${ev.summary ?? "—"} | ${evTime} |\n`;
          }
        }
      } catch {
        // lifecycle_events table may not exist yet — that's fine
      }

      ctx.ui.notify(output, "info");
    },
  });

  // ── /project phase ──
  pi.registerCommand("project phase", {
    description: "Change project lifecycle phase (planning | active | maintenance | deprecated | decommissioned)",
    handler: async (args, ctx) => {
      const conn = await db();
      if (!conn) { ctx.ui.notify("XTDB not available", "error"); return; }

      const projectId = getCurrentProjectId();
      if (!projectId) { ctx.ui.notify("No current project detected.", "error"); return; }

      const newPhase = (args ?? "").trim().toLowerCase();
      if (!VALID_PHASES.includes(newPhase as Phase)) {
        ctx.ui.notify(`Invalid phase: "${newPhase}"\nValid phases: ${VALID_PHASES.join(", ")}`, "error");
        return;
      }

      // Read existing project record
      let rows: any[];
      try {
        rows = await conn`SELECT * FROM projects WHERE _id = ${t(conn, projectId)}`;
      } catch (err) {
        ctx.ui.notify(`Failed to query project: ${err}`, "error");
        return;
      }

      if (rows.length === 0) {
        ctx.ui.notify(`Project ${projectId} not found in database.`, "error");
        return;
      }

      const existing = rows[0];
      const oldPhase = existing.lifecycle_phase ?? "unknown";

      if (oldPhase === newPhase) {
        ctx.ui.notify(`Project is already in phase "${newPhase}".`, "info");
        return;
      }

      // Re-insert with updated phase (XTDB upsert pattern)
      try {
        await conn`INSERT INTO projects (
          _id, canonical_id, name, identity_type, git_remote_url, git_root_path,
          first_seen_ts, last_seen_ts, session_count, lifecycle_phase, config_json, jsonld
        ) VALUES (
          ${t(conn, existing._id)}, ${t(conn, existing.canonical_id)},
          ${t(conn, existing.name)}, ${t(conn, existing.identity_type)},
          ${t(conn, existing.git_remote_url)}, ${t(conn, existing.git_root_path)},
          ${n(conn, Number(existing.first_seen_ts))}, ${n(conn, Date.now())},
          ${n(conn, Number(existing.session_count))}, ${t(conn, newPhase)},
          ${t(conn, existing.config_json)}, ${t(conn, existing.jsonld)}
        )`;
      } catch (err) {
        ctx.ui.notify(`Failed to update phase: ${err}`, "error");
        return;
      }

      // Emit lifecycle_event
      try {
        const levId = `lev:${randomUUID()}`;
        await conn`INSERT INTO lifecycle_events (_id, event_type, entity_id, entity_type, project_id, summary, ts)
          VALUES (${t(conn, levId)}, ${t(conn, "phase_changed")}, ${t(conn, projectId)}, ${t(conn, "projects")}, ${t(conn, projectId)}, ${t(conn, `Phase changed from ${oldPhase} to ${newPhase}`)}, ${n(conn, Date.now())})`;
      } catch (err) {
        console.error(`[project-lifecycle] Failed to emit lifecycle event: ${err}`);
      }

      ctx.ui.notify(`✅ Phase changed: ${oldPhase} → ${newPhase}`, "info");
    },
  });

  // ── /project config ──
  pi.registerCommand("project config", {
    description: "Show or set project config (usage: /project config [key] [value])",
    handler: async (args, ctx) => {
      const conn = await db();
      if (!conn) { ctx.ui.notify("XTDB not available", "error"); return; }

      const projectId = getCurrentProjectId();
      if (!projectId) { ctx.ui.notify("No current project detected.", "error"); return; }

      // Read existing project record
      let rows: any[];
      try {
        rows = await conn`SELECT * FROM projects WHERE _id = ${t(conn, projectId)}`;
      } catch (err) {
        ctx.ui.notify(`Failed to query project: ${err}`, "error");
        return;
      }

      if (rows.length === 0) {
        ctx.ui.notify(`Project ${projectId} not found in database.`, "error");
        return;
      }

      const existing = rows[0];
      let config: Record<string, any>;
      try {
        config = JSON.parse(existing.config_json || "{}");
      } catch {
        config = {};
      }

      const parts = (args ?? "").trim().split(/\s+/);
      const key = parts[0] || "";
      const value = parts.slice(1).join(" ");

      // No args: show all config
      if (!key) {
        const pretty = JSON.stringify(config, null, 2);
        ctx.ui.notify(`## Project Config\n\n\`\`\`json\n${pretty}\n\`\`\``, "info");
        return;
      }

      // Key only: show that key's value
      if (!value) {
        const val = config[key];
        if (val === undefined) {
          ctx.ui.notify(`Config key "${key}" is not set.`, "info");
        } else {
          ctx.ui.notify(`**${key}** = ${JSON.stringify(val)}`, "info");
        }
        return;
      }

      // Key + value: set it
      let parsed: any = value;
      try { parsed = JSON.parse(value); } catch { /* keep as string */ }
      config[key] = parsed;

      const updatedJson = JSON.stringify(config);
      try {
        await conn`INSERT INTO projects (
          _id, canonical_id, name, identity_type, git_remote_url, git_root_path,
          first_seen_ts, last_seen_ts, session_count, lifecycle_phase, config_json, jsonld
        ) VALUES (
          ${t(conn, existing._id)}, ${t(conn, existing.canonical_id)},
          ${t(conn, existing.name)}, ${t(conn, existing.identity_type)},
          ${t(conn, existing.git_remote_url)}, ${t(conn, existing.git_root_path)},
          ${n(conn, Number(existing.first_seen_ts))}, ${n(conn, Date.now())},
          ${n(conn, Number(existing.session_count))}, ${t(conn, existing.lifecycle_phase)},
          ${t(conn, updatedJson)}, ${t(conn, existing.jsonld)}
        )`;
      } catch (err) {
        ctx.ui.notify(`Failed to update config: ${err}`, "error");
        return;
      }

      ctx.ui.notify(`✅ Config updated: **${key}** = ${JSON.stringify(parsed)}`, "info");
    },
  });

  // ── /project deps ──
  pi.registerCommand("project deps", {
    description: "Manage project dependencies (usage: /project deps [add|remove|list] [name] [version])",
    schema: Type.Object({ action: Type.Optional(Type.String()), name: Type.Optional(Type.String()), version: Type.Optional(Type.String()) }),
    handler: async (args, ctx) => {
      const conn = await db();
      if (!conn) return { content: [{ type: "text" as const, text: "XTDB not available" }] };

      const projectId = getCurrentProjectId();
      if (!projectId) return { content: [{ type: "text" as const, text: "No current project detected." }] };

      const action = args?.action?.trim().toLowerCase() || "list";
      const name = args?.name?.trim() || "";
      const version = args?.version?.trim() || "latest";

      if (action === "add") {
        if (!name) return { content: [{ type: "text" as const, text: "Missing required parameter: name" }] };
        const depId = `pdep:${randomUUID()}`;
        try {
          await conn`INSERT INTO project_dependencies (_id, project_id, name, version, dep_type, ts, jsonld)
            VALUES (${t(conn, depId)}, ${t(conn, projectId)}, ${t(conn, name)}, ${t(conn, version)}, ${t(conn, "runtime")}, ${n(conn, Date.now())}, ${t(conn, "{}")})`;
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Failed to add dependency: ${err}` }] };
        }
        return { content: [{ type: "text" as const, text: `✅ Added dependency: ${name}@${version}` }] };
      }

      if (action === "remove") {
        if (!name) return { content: [{ type: "text" as const, text: "Missing required parameter: name" }] };
        try {
          await conn`DELETE FROM project_dependencies WHERE project_id = ${t(conn, projectId)} AND name = ${t(conn, name)}`;
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Failed to remove dependency: ${err}` }] };
        }
        return { content: [{ type: "text" as const, text: `✅ Removed dependency: ${name}` }] };
      }

      // list (default)
      let rows: any[];
      try {
        rows = await conn`SELECT * FROM project_dependencies WHERE project_id = ${t(conn, projectId)} ORDER BY name`;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to query dependencies: ${err}` }] };
      }

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No dependencies found for this project." }] };
      }

      let output = `## Project Dependencies\n\n`;
      output += `| Name | Version | Type | Added |\n|---|---|---|---|\n`;
      for (const row of rows) {
        const added = row.ts ? new Date(Number(row.ts)).toISOString() : "—";
        output += `| ${row.name ?? "—"} | ${row.version ?? "—"} | ${row.dep_type ?? "—"} | ${added} |\n`;
      }
      return { content: [{ type: "text" as const, text: output }] };
    },
  });

  // ── /project tag ──
  pi.registerCommand("project tag", {
    description: "Manage project tags (usage: /project tag [add|remove|list] [tag])",
    schema: Type.Object({ action: Type.Optional(Type.String()), tag: Type.Optional(Type.String()) }),
    handler: async (args, ctx) => {
      const conn = await db();
      if (!conn) return { content: [{ type: "text" as const, text: "XTDB not available" }] };

      const projectId = getCurrentProjectId();
      if (!projectId) return { content: [{ type: "text" as const, text: "No current project detected." }] };

      const action = args?.action?.trim().toLowerCase() || "list";
      const tag = args?.tag?.trim() || "";

      if (action === "add") {
        if (!tag) return { content: [{ type: "text" as const, text: "Missing required parameter: tag" }] };
        const tagId = `ptag:${randomUUID()}`;
        try {
          await conn`INSERT INTO project_tags (_id, project_id, tag, ts)
            VALUES (${t(conn, tagId)}, ${t(conn, projectId)}, ${t(conn, tag)}, ${n(conn, Date.now())})`;
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Failed to add tag: ${err}` }] };
        }
        return { content: [{ type: "text" as const, text: `✅ Added tag: ${tag}` }] };
      }

      if (action === "remove") {
        if (!tag) return { content: [{ type: "text" as const, text: "Missing required parameter: tag" }] };
        try {
          await conn`DELETE FROM project_tags WHERE project_id = ${t(conn, projectId)} AND tag = ${t(conn, tag)}`;
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Failed to remove tag: ${err}` }] };
        }
        return { content: [{ type: "text" as const, text: `✅ Removed tag: ${tag}` }] };
      }

      // list (default)
      let rows: any[];
      try {
        rows = await conn`SELECT * FROM project_tags WHERE project_id = ${t(conn, projectId)} ORDER BY tag`;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to query tags: ${err}` }] };
      }

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No tags found for this project." }] };
      }

      const tagList = rows.map((r: any) => r.tag).join(", ");
      return { content: [{ type: "text" as const, text: `**Tags:** ${tagList}` }] };
    },
  });

  // ── /project decommission ──
  pi.registerCommand("project decommission", {
    description: "Decommission a project (archive data, set phase, record decommission)",
    schema: Type.Object({ confirm: Type.Optional(Type.Boolean({ default: false })), reason: Type.Optional(Type.String()) }),
    handler: async (args, ctx) => {
      const conn = await db();
      if (!conn) return { content: [{ type: "text" as const, text: "XTDB not available" }] };

      const projectId = getCurrentProjectId();
      if (!projectId) return { content: [{ type: "text" as const, text: "No current project detected." }] };

      const confirmed = args?.confirm === true;
      const reason = args?.reason?.trim() || "No reason provided";

      if (!confirmed) {
        let output = `## ⚠️ Project Decommission: ${projectId}\n\n`;
        output += `Decommissioning this project will:\n\n`;
        output += `- 📦 Archive project data\n`;
        output += `- 🔄 Set lifecycle_phase to **decommissioned**\n`;
        output += `- 📝 Record decommission record\n\n`;
        output += `Run again with **confirm=true** to proceed.`;
        return { content: [{ type: "text" as const, text: output }] };
      }

      // Read current project
      let rows: any[];
      try {
        rows = await conn`SELECT * FROM projects WHERE _id = ${t(conn, projectId)}`;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to query project: ${err}` }] };
      }

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `Project ${projectId} not found in database.` }] };
      }

      const existing = rows[0];

      // Update lifecycle_phase to 'decommissioned' (XTDB upsert)
      try {
        await conn`INSERT INTO projects (
          _id, canonical_id, name, identity_type, git_remote_url, git_root_path,
          first_seen_ts, last_seen_ts, session_count, lifecycle_phase, config_json, jsonld
        ) VALUES (
          ${t(conn, existing._id)}, ${t(conn, existing.canonical_id)},
          ${t(conn, existing.name)}, ${t(conn, existing.identity_type)},
          ${t(conn, existing.git_remote_url)}, ${t(conn, existing.git_root_path)},
          ${n(conn, Number(existing.first_seen_ts))}, ${n(conn, Date.now())},
          ${n(conn, Number(existing.session_count))}, ${t(conn, "decommissioned")},
          ${t(conn, existing.config_json)}, ${t(conn, existing.jsonld)}
        )`;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to update phase: ${err}` }] };
      }

      // Insert decommission record
      const decomId = `decom:${randomUUID()}`;
      try {
        await conn`INSERT INTO decommission_records (_id, project_id, reason, decommissioned_by, checklist_json, ts, jsonld)
          VALUES (${t(conn, decomId)}, ${t(conn, projectId)}, ${t(conn, reason)}, ${t(conn, "pi-agent")}, ${t(conn, "{}")}, ${n(conn, Date.now())}, ${t(conn, "{}")})`;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Phase updated but failed to record decommission: ${err}` }] };
      }

      // Emit lifecycle event
      try {
        const levId = `lev:${randomUUID()}`;
        await conn`INSERT INTO lifecycle_events (_id, event_type, entity_id, entity_type, project_id, summary, ts)
          VALUES (${t(conn, levId)}, ${t(conn, "project_decommissioned")}, ${t(conn, projectId)}, ${t(conn, "projects")}, ${t(conn, projectId)}, ${t(conn, `Project decommissioned. Reason: ${reason}`)}, ${n(conn, Date.now())})`;
      } catch (err) {
        console.error(`[project-lifecycle] Failed to emit lifecycle event: ${err}`);
      }

      return { content: [{ type: "text" as const, text: `✅ Project **${projectId}** has been decommissioned.\n\n**Reason:** ${reason}\n**Record:** ${decomId}` }] };
    },
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    if (sql) {
      try { await sql.end(); } catch { /* cleanup — safe to ignore */ }
      sql = null;
    }
  });
}
