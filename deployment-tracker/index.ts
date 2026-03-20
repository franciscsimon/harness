import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { connectXtdb, ensureConnected, type Sql } from "../lib/db.ts";
import { JSONLD_CONTEXT, piId, piRef } from "../lib/jsonld/context.ts";

// ─── Deployment Tracker Extension ─────────────────────────────────
// Track environments, releases, and deployments.

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

function getProjectId(): string | null {
  return (globalThis as any).__piCurrentProject?.projectId ?? null;
}

function getSessionId(): string | null {
  return (globalThis as any).__piLastEvent?.sessionId ?? null;
}

function shortId(id: string): string {
  return id.replace(/^(env|rel|depl):/, "").slice(0, 8);
}

const ENV_TYPE_ICONS: Record<string, string> = {
  dev: "🔧",
  staging: "🧪",
  prod: "🚀",
};

const STATUS_ICONS: Record<string, string> = {
  active: "🟢",
  inactive: "⚪",
  draft: "📝",
  published: "📦",
  succeeded: "✅",
  failed: "❌",
  "in-progress": "🔄",
  "rolled-back": "⏪",
};

// ── /env command ────────────────────────────────────────────────

async function handleEnvAdd(args: string, ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  if (!name) { ctx.ui.notify("Usage: /env add <name> [url]", "error"); return; }
  const url = parts[1] ?? null;

  // Infer env_type from name
  let envType = "dev";
  const lower = name.toLowerCase();
  if (lower.includes("prod") || lower.includes("production")) envType = "prod";
  else if (lower.includes("stag") || lower.includes("uat") || lower.includes("qa")) envType = "staging";

  const s = await db();
  const id = `env:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": ["schema:Place", "prov:Location"],
    "schema:name": name,
    "schema:url": url,
    "ev:envType": envType,
    "ev:status": "active",
    "ev:projectId": projectId,
  });

  try {
    await s`INSERT INTO environments (
      _id, project_id, name, url, env_type, status, ts, jsonld
    ) VALUES (
      ${t(s, id)}, ${t(s, projectId)}, ${t(s, name)}, ${t(s, url)},
      ${t(s, envType)}, ${t(s, "active")}, ${n(s, now)}, ${t(s, jsonld)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Failed to create environment: ${err}`, "error");
    return;
  }

  ctx.ui.notify(
    `${ENV_TYPE_ICONS[envType] ?? "•"} Environment created: **${name}** (${envType}) [${shortId(id)}]`,
    "success",
  );
}

async function handleEnvList(ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const s = await db();
  let rows: any[];
  try {
    rows = await s`
      SELECT _id, name, env_type, url, status
      FROM environments
      WHERE project_id = ${t(s, projectId)}
      ORDER BY env_type, name
    `;
  } catch (err) {
    ctx.ui.notify(`Failed to list environments: ${err}`, "error");
    return;
  }

  if (rows.length === 0) {
    ctx.ui.notify("No environments found. Use `/env add <name>` to create one.", "info");
    return;
  }

  const header = "| Name | Type | URL | Status |\n|------|------|-----|--------|";
  const lines = rows.map((r: any) => {
    const icon = ENV_TYPE_ICONS[r.env_type] ?? "•";
    const statusIcon = STATUS_ICONS[r.status] ?? "•";
    return `| ${icon} ${r.name} | ${r.env_type} | ${r.url ?? "—"} | ${statusIcon} ${r.status} |`;
  });

  ctx.ui.notify(`**Environments**\n\n${header}\n${lines.join("\n")}`, "info");
}

// ── /release command ────────────────────────────────────────────

async function generateChangelog(projectId: string, version: string): Promise<string | null> {
  const s = await db();
  let cutoffTs = 0;

  try {
    const relRows = await s`
      SELECT version, ts FROM releases
      WHERE project_id = ${t(s, projectId)}
      ORDER BY ts DESC LIMIT 1
    `;
    if (relRows.length > 0) {
      cutoffTs = typeof relRows[0].ts === "string" ? Number(relRows[0].ts) : relRows[0].ts;
    }
  } catch { /* no previous releases */ }

  let decisions: any[] = [];
  try {
    decisions = await s`
      SELECT task, what, outcome FROM decisions
      WHERE project_id = ${t(s, projectId)} AND ts > ${n(s, cutoffTs)}
      ORDER BY ts ASC
    `;
  } catch { /* table may not exist */ }

  let artifacts: any[] = [];
  try {
    artifacts = await s`
      SELECT path, operation FROM artifact_versions
      WHERE ts > ${n(s, cutoffTs)}
      ORDER BY ts ASC
    `;
  } catch { /* table may not exist */ }

  if (decisions.length === 0 && artifacts.length === 0) return null;

  const lines: string[] = [];
  lines.push(`## ${version}`);

  if (decisions.length > 0) {
    lines.push("");
    lines.push("### Decisions");
    for (const d of decisions) {
      const icon = d.outcome === "success" ? "✅" : d.outcome === "failure" ? "❌" : "⏸️";
      lines.push(`- ${icon} ${d.task ?? "—"}: ${d.what ?? "—"}`);
    }
  }

  if (artifacts.length > 0) {
    const uniquePaths = [...new Set(artifacts.map((a: any) => a.path))];
    lines.push("");
    lines.push(`### Files Changed (${uniquePaths.length})`);
    for (const p of uniquePaths.slice(0, 30)) {
      const short = String(p).replace(/.*harness\//, "");
      lines.push(`- ${short}`);
    }
    if (uniquePaths.length > 30) lines.push(`- ... and ${uniquePaths.length - 30} more`);
  }

  return lines.join("\n");
}

async function handleReleaseCreate(args: string, ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const parts = args.trim().split(/\s+/);
  const version = parts[0];
  if (!version) { ctx.ui.notify("Usage: /release create <version> [changelog]", "error"); return; }
  let changelog = parts.slice(1).join(" ") || null;

  // Auto-generate changelog from decisions + artifacts since last release
  if (!changelog) {
    changelog = await generateChangelog(projectId, version);
  }

  const sessionId = getSessionId();
  const s = await db();
  const id = `rel:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": ["doap:Version", "prov:Entity"],
    "doap:revision": version,
    "schema:name": version,
    "schema:description": changelog,
    "ev:status": "draft",
    "ev:projectId": projectId,
    ...(sessionId ? { "prov:wasGeneratedBy": piRef(`session:${sessionId}`) } : {}),
  });

  try {
    await s`INSERT INTO releases (
      _id, project_id, session_id, version, name, changelog,
      git_tag, git_commit, previous_release_id, status, ts, jsonld
    ) VALUES (
      ${t(s, id)}, ${t(s, projectId)}, ${t(s, sessionId)},
      ${t(s, version)}, ${t(s, version)}, ${t(s, changelog)},
      ${t(s, null)}, ${t(s, null)}, ${t(s, null)},
      ${t(s, "draft")}, ${n(s, now)}, ${t(s, jsonld)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Failed to create release: ${err}`, "error");
    return;
  }

  ctx.ui.notify(
    `📦 Release created: **${version}** (draft) [${shortId(id)}]${changelog ? `\n> ${changelog}` : ""}`,
    "success",
  );
}

async function handleReleaseChangelog(args: string, ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const version = args.trim() || null;
  const s = await db();

  let cutoffTs = 0;
  let sinceLabel = "beginning";

  try {
    if (version) {
      // Find that specific release's timestamp
      const relRows = await s`
        SELECT ts FROM releases
        WHERE project_id = ${t(s, projectId)} AND version = ${t(s, version)}
        ORDER BY ts DESC LIMIT 1
      `;
      if (relRows.length === 0) {
        ctx.ui.notify(`Release **${version}** not found.`, "error");
        return;
      }
      cutoffTs = typeof relRows[0].ts === "string" ? Number(relRows[0].ts) : relRows[0].ts;
      sinceLabel = version;
    } else {
      // Use most recent release's ts
      const relRows = await s`
        SELECT version, ts FROM releases
        WHERE project_id = ${t(s, projectId)}
        ORDER BY ts DESC LIMIT 1
      `;
      if (relRows.length > 0) {
        cutoffTs = typeof relRows[0].ts === "string" ? Number(relRows[0].ts) : relRows[0].ts;
        sinceLabel = relRows[0].version ?? "last release";
      }
    }
  } catch (err) {
    ctx.ui.notify(`Failed to look up releases: ${err}`, "error");
    return;
  }

  // Query decisions since cutoff
  let decisions: any[] = [];
  try {
    decisions = await s`
      SELECT * FROM decisions
      WHERE project_id = ${t(s, projectId)} AND ts > ${n(s, cutoffTs)}
      ORDER BY ts ASC
    `;
  } catch {
    // decisions table may not exist yet — that's fine
  }

  // Query artifact_versions since cutoff (may not have project_id column)
  let artifacts: any[] = [];
  try {
    artifacts = await s`
      SELECT * FROM artifact_versions
      WHERE project_id = ${t(s, projectId)} AND ts > ${n(s, cutoffTs)}
      ORDER BY ts ASC
    `;
  } catch {
    // artifact_versions table may not exist or lack project_id — skip
  }

  // Format markdown
  const lines: string[] = [];
  lines.push(`## Changelog (since ${sinceLabel})\n`);

  lines.push("### Decisions");
  if (decisions.length === 0) {
    lines.push("_No decisions recorded._");
  } else {
    for (const d of decisions) {
      const icon = d.outcome === "rejected" ? "❌" : "✅";
      const task = d.task ?? "—";
      const what = d.what ?? d.description ?? "—";
      const outcome = d.outcome ?? "—";
      lines.push(`- ${icon} ${task} — ${what} (${outcome})`);
    }
  }

  lines.push("");
  lines.push("### Artifacts");
  if (artifacts.length === 0) {
    lines.push("_No artifacts recorded._");
  } else {
    for (const a of artifacts) {
      const artifactId = a.artifact_id ?? a._id ?? "—";
      const desc = a.version ?? a.description ?? "—";
      lines.push(`- ${artifactId}: ${desc}`);
    }
  }

  const cutoffDate = cutoffTs > 0
    ? new Date(cutoffTs).toISOString().slice(0, 10)
    : "the beginning";

  lines.push("");
  lines.push("---");
  lines.push(`${decisions.length} decisions, ${artifacts.length} artifacts since ${cutoffDate}`);

  ctx.ui.notify(lines.join("\n"), "info");
}

// ── /deploy command ─────────────────────────────────────────────

async function handleDeploy(args: string, ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const parts = args.trim().split(/\s+/);
  const envName = parts[0];
  if (!envName) { ctx.ui.notify("Usage: /deploy <environment> [version]", "error"); return; }
  const version = parts[1] ?? null;

  const s = await db();

  // Resolve environment by name
  let envRows: any[];
  try {
    envRows = await s`
      SELECT _id, name FROM environments
      WHERE project_id = ${t(s, projectId)} AND name = ${t(s, envName)}
      LIMIT 1
    `;
  } catch (err) {
    ctx.ui.notify(`Failed to look up environment: ${err}`, "error");
    return;
  }

  if (envRows.length === 0) {
    ctx.ui.notify(`Environment **${envName}** not found. Use \`/env add ${envName}\` first.`, "error");
    return;
  }
  const environmentId = envRows[0]._id;

  // Resolve release by version (if provided)
  let releaseId: string | null = null;
  if (version) {
    let relRows: any[];
    try {
      relRows = await s`
        SELECT _id FROM releases
        WHERE project_id = ${t(s, projectId)} AND version = ${t(s, version)}
        ORDER BY ts DESC LIMIT 1
      `;
    } catch (err) {
      ctx.ui.notify(`Failed to look up release: ${err}`, "error");
      return;
    }
    if (relRows.length === 0) {
      ctx.ui.notify(`Release **${version}** not found. Use \`/release create ${version}\` first.`, "error");
      return;
    }
    releaseId = relRows[0]._id;
  }

  const sessionId = getSessionId();
  const id = `depl:${randomUUID()}`;
  const now = Date.now();

  const jsonld = JSON.stringify({
    "@context": JSONLD_CONTEXT,
    "@id": piId(id),
    "@type": ["schema:DeployAction", "prov:Activity"],
    "prov:used": releaseId ? piRef(releaseId) : null,
    "prov:atLocation": piRef(environmentId),
    "prov:wasAssociatedWith": { "@type": "prov:SoftwareAgent", "schema:name": "pi-agent" },
    "ev:status": "succeeded",
    "ev:projectId": projectId,
    "prov:startedAtTime": new Date(now).toISOString(),
    "prov:endedAtTime": new Date(now).toISOString(),
  });

  try {
    await s`INSERT INTO deployments (
      _id, project_id, environment_id, release_id, session_id,
      deployed_by, status, rollback_of_id, notes,
      started_ts, completed_ts, ts, jsonld
    ) VALUES (
      ${t(s, id)}, ${t(s, projectId)}, ${t(s, environmentId)}, ${t(s, releaseId)},
      ${t(s, sessionId)}, ${t(s, "pi-agent")}, ${t(s, "succeeded")},
      ${t(s, null)}, ${t(s, null)},
      ${n(s, now)}, ${n(s, now)}, ${n(s, now)}, ${t(s, jsonld)}
    )`;
  } catch (err) {
    ctx.ui.notify(`Failed to record deployment: ${err}`, "error");
    return;
  }

  const versionLabel = version ? ` v${version}` : "";
  ctx.ui.notify(
    `🚀 Deployed${versionLabel} → **${envName}** (succeeded) [${shortId(id)}]`,
    "success",
  );
}

async function handleDeployHistory(args: string, ctx: any): Promise<void> {
  const projectId = getProjectId();
  if (!projectId) { ctx.ui.notify("No active project.", "error"); return; }

  const envFilter = args.trim() || null;
  const s = await db();

  let rows: any[];
  try {
    if (envFilter) {
      rows = await s`
        SELECT d._id, d.status, d.completed_ts,
               e.name AS env_name,
               r.version AS rel_version
        FROM deployments d
        LEFT JOIN environments e ON d.environment_id = e._id
        LEFT JOIN releases r ON d.release_id = r._id
        WHERE d.project_id = ${t(s, projectId)}
          AND e.name = ${t(s, envFilter)}
        ORDER BY d.ts DESC
        LIMIT 20
      `;
    } else {
      rows = await s`
        SELECT d._id, d.status, d.completed_ts,
               e.name AS env_name,
               r.version AS rel_version
        FROM deployments d
        LEFT JOIN environments e ON d.environment_id = e._id
        LEFT JOIN releases r ON d.release_id = r._id
        WHERE d.project_id = ${t(s, projectId)}
        ORDER BY d.ts DESC
        LIMIT 20
      `;
    }
  } catch (err) {
    ctx.ui.notify(`Failed to fetch deployment history: ${err}`, "error");
    return;
  }

  if (rows.length === 0) {
    const suffix = envFilter ? ` for **${envFilter}**` : "";
    ctx.ui.notify(`No deployments found${suffix}.`, "info");
    return;
  }

  const header = "| ID | Environment | Version | Status | When |\n|-----|-------------|---------|--------|------|";
  const lines = rows.map((r: any) => {
    const icon = STATUS_ICONS[r.status] ?? "•";
    const ts = typeof r.completed_ts === "string" ? Number(r.completed_ts) : r.completed_ts;
    const when = Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 16).replace("T", " ") : "—";
    return `| ${shortId(r._id)} | ${r.env_name ?? "—"} | ${r.rel_version ?? "—"} | ${icon} ${r.status} | ${when} |`;
  });

  const title = envFilter ? `**Deployments — ${envFilter}**` : "**Deployment History**";
  ctx.ui.notify(`${title}\n\n${header}\n${lines.join("\n")}`, "info");
}

// ── Extension entry point ───────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // /env add <name> [url]  |  /env list
  pi.registerCommand("env", {
    description: "Manage environments — add or list",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      const parts = raw.split(/\s+/);
      const sub = parts[0] || "list";

      if (sub === "add") {
        await handleEnvAdd(parts.slice(1).join(" "), ctx);
      } else if (sub === "list") {
        await handleEnvList(ctx);
      } else {
        ctx.ui.notify("Usage: /env add <name> [url]  |  /env list", "info");
      }
    },
  });

  // /release create <version> [changelog]  |  /release changelog [version]
  pi.registerCommand("release", {
    description: "Manage releases — create or changelog",
    schema: Type.Object({ version: Type.Optional(Type.String()) }),
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      const parts = raw.split(/\s+/);
      const sub = parts[0] || "";

      if (sub === "create") {
        await handleReleaseCreate(parts.slice(1).join(" "), ctx);
      } else if (sub === "changelog") {
        await handleReleaseChangelog(parts.slice(1).join(" "), ctx);
      } else {
        ctx.ui.notify("Usage: /release create <version> [changelog]  |  /release changelog [version]", "info");
      }
    },
  });

  // /deploy <environment> [version]  |  /deploy history [environment]
  pi.registerCommand("deploy", {
    description: "Record a deployment or view history",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      const parts = raw.split(/\s+/);
      const sub = parts[0] || "";

      if (sub === "history") {
        await handleDeployHistory(parts.slice(1).join(" "), ctx);
      } else if (sub) {
        await handleDeploy(raw, ctx);
      } else {
        ctx.ui.notify("Usage: /deploy <environment> [version]  |  /deploy history [environment]", "info");
      }
    },
  });
}
