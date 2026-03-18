import { createHash } from "node:crypto";
import { readFile, unlink, access } from "node:fs/promises";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Sql } from "./db.js";
import { typed, typedNum } from "./db.js";

const JSONLD_CONTEXT = {
  prov: "http://www.w3.org/ns/prov#",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

const versionCounters = new Map<string, number>();

function nextVersion(sessionId: string, path: string): number {
  const key = `${sessionId}::${path}`;
  const next = (versionCounters.get(key) ?? 0) + 1;
  versionCounters.set(key, next);
  return next;
}

function buildVersionJsonLd(
  verId: string, sessionId: string, absPath: string, relPath: string,
  version: number, contentHash: string, sizeBytes: number,
  operation: string, callId: string, now: number,
  parentArtifactId: string, derivedFromId: string | null
): string {
  const doc: Record<string, unknown> = {
    "@context": JSONLD_CONTEXT,
    "@id": `urn:pi:artver:${verId}`,
    "@type": "prov:Entity",
    "prov:wasGeneratedBy": { "@id": `urn:pi:toolcall:${callId}` },
    "prov:specializationOf": { "@id": `urn:pi:${parentArtifactId}` },
    "prov:wasAttributedTo": { "@id": `urn:pi:session:${sessionId}` },
    "ev:path": absPath,
    "ev:relativePath": relPath,
    "ev:version": { "@value": String(version), "@type": "xsd:integer" },
    "ev:contentHash": contentHash,
    "ev:sizeBytes": { "@value": String(sizeBytes), "@type": "xsd:integer" },
    "ev:operation": operation,
    "ev:ts": { "@value": String(now), "@type": "xsd:long" },
  };
  if (derivedFromId) {
    doc["prov:wasDerivedFrom"] = { "@id": `urn:pi:artver:${derivedFromId}` };
  }
  return JSON.stringify(doc);
}

async function findPriorVersionId(db: Sql, absPath: string, sessionId: string): Promise<string | null> {
  try {
    const rows = await db`
      SELECT _id FROM artifact_versions
      WHERE path = ${absPath} AND session_id != ${sessionId}
      ORDER BY ts DESC LIMIT 1
    `;
    return rows.length > 0 ? rows[0]._id : null;
  } catch {
    return null;
  }
}

export async function captureVersion(
  pi: ExtensionAPI, db: Sql, sessionId: string,
  absPath: string, relPath: string,
  operation: string, callId: string, now: number,
  parentArtifactId: string
) {
  const t = (v: string | null) => typed(db, v);
  const n = (v: number | null) => typedNum(db, v);
  try {
    const content = await readFile(absPath, "utf-8");
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    const version = nextVersion(sessionId, absPath);
    const pathHash = createHash("sha256").update(absPath).digest("hex").slice(0, 12);
    const verId = `av:${sessionId.slice(0, 8)}:${pathHash}:${version}`;

    let derivedFromId: string | null = null;
    if (version > 1) {
      derivedFromId = `av:${sessionId.slice(0, 8)}:${pathHash}:${version - 1}`;
    } else {
      derivedFromId = await findPriorVersionId(db, absPath, sessionId);
    }

    const jsonld = buildVersionJsonLd(
      verId, sessionId, absPath, relPath, version, contentHash,
      content.length, operation, callId, now, parentArtifactId, derivedFromId
    );

    await db`INSERT INTO artifact_versions (
      _id, session_id, path, relative_path, version, content_hash, content, size_bytes, operation, tool_call_id, ts, jsonld
    ) VALUES (
      ${t(verId)}, ${t(sessionId)}, ${t(absPath)}, ${t(relPath)},
      ${n(version)}, ${t(contentHash)}, ${t(content)}, ${n(content.length)},
      ${t(operation)}, ${t(callId)}, ${n(now)}, ${t(jsonld)}
    )`;

    const cleanId = `aclean:${sessionId.slice(0, 8)}:${pathHash}`;
    try {
      await db`INSERT INTO artifact_cleanup (
        _id, session_id, path, relative_path, created_at
      ) VALUES (${t(cleanId)}, ${t(sessionId)}, ${t(absPath)}, ${t(relPath)}, ${n(now)})`;
    } catch { /* already tracked */ }
  } catch (err) {
    console.error(`[artifact-tracker] version capture failed for ${relPath}: ${err}`);
    try {
      const content = await readFile(absPath, "utf-8").catch(() => null);
      if (content) {
        pi.appendEntry("session-artifact", {
          path: absPath, relativePath: relPath, content,
          contentHash: createHash("sha256").update(content).digest("hex").slice(0, 16),
          operation, ts: now,
        });
      }
    } catch { /* last resort failed */ }
  }
}

export async function cleanupArtifacts(db: Sql, sessionId: string) {
  try {
    const rows = await db`SELECT path, relative_path FROM artifact_cleanup WHERE session_id = ${sessionId}`;
    for (const row of rows) {
      try { await access(row.path); await unlink(row.path); } catch { /* gone already */ }
    }
    if (rows.length > 0) {
      console.error(`[artifact-tracker] archived ${rows.length} artifact(s) — cleaned from disk`);
    }
  } catch (err) {
    console.error(`[artifact-tracker] cleanup query failed: ${err}`);
  }
}

export function clearVersionState() {
  versionCounters.clear();
}
