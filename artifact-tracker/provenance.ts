import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Sql } from "./db.js";

const PROV_CONTEXT = {
  prov: "http://www.w3.org/ns/prov#",
  foaf: "http://xmlns.com/foaf/0.1/",
  ev: "https://pi.dev/events/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

async function collectSessionIds(db: Sql, rootSessionId: string): Promise<string[]> {
  const ids = [rootSessionId];
  const visited = new Set<string>([rootSessionId]);
  const queue = [rootSessionId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    try {
      const rows = await db`SELECT child_session_id FROM delegations WHERE parent_session_id = ${current}`;
      for (const r of rows) {
        const childId = r.child_session_id;
        if (childId && !visited.has(childId)) {
          visited.add(childId);
          ids.push(childId);
          queue.push(childId);
        }
      }
    } catch {
      break;
    }
  }
  return ids;
}

async function collectProvenanceGraph(db: Sql, sessionIds: string[]): Promise<any[]> {
  const graph: any[] = [];

  for (const sid of sessionIds) {
    try {
      const avRows =
        await db`SELECT jsonld FROM artifact_versions WHERE session_id = ${sid} AND jsonld != '' ORDER BY ts`;
      for (const r of avRows) {
        if (r.jsonld) graph.push(JSON.parse(r.jsonld));
      }
    } catch {
      /* parse fallback — use default */
    }

    try {
      const artRows = await db`SELECT jsonld FROM artifacts WHERE session_id = ${sid} AND jsonld != '' ORDER BY ts`;
      for (const r of artRows) {
        if (r.jsonld) graph.push(JSON.parse(r.jsonld));
      }
    } catch {
      /* parse fallback — use default */
    }

    try {
      const decRows = await db`SELECT jsonld FROM decisions WHERE session_id = ${sid} AND jsonld != '' ORDER BY ts`;
      for (const r of decRows) {
        if (r.jsonld) graph.push(JSON.parse(r.jsonld));
      }
    } catch {
      /* parse fallback — use default */
    }

    try {
      const delRows =
        await db`SELECT jsonld FROM delegations WHERE (parent_session_id = ${sid} OR child_session_id = ${sid}) AND jsonld != '' ORDER BY ts`;
      for (const r of delRows) {
        if (r.jsonld) graph.push(JSON.parse(r.jsonld));
      }
    } catch {
      /* parse fallback — use default */
    }

    try {
      const pmRows =
        await db`SELECT jsonld FROM session_postmortems WHERE session_id = ${sid} AND jsonld != '' ORDER BY ts`;
      for (const r of pmRows) {
        if (r.jsonld) graph.push(JSON.parse(r.jsonld));
      }
    } catch {
      /* parse fallback — use default */
    }
  }

  return deduplicateById(graph);
}

function deduplicateById(graph: any[]): any[] {
  const seen = new Set<string>();
  return graph.filter((node) => {
    const id = node["@id"];
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function cmdExportProvenance(db: Sql, sessionId: string | null, _args: string[], ctx: any) {
  if (!sessionId) {
    ctx.ui.notify("No active session", "error");
    return;
  }

  const sessionIds = await collectSessionIds(db, sessionId);
  const graph = await collectProvenanceGraph(db, sessionIds);

  if (graph.length === 0) {
    ctx.ui.notify("No provenance data found for this session", "info");
    return;
  }

  for (const node of graph) {
    delete node["@context"];
  }

  const bundle = {
    "@context": PROV_CONTEXT,
    "@id": `urn:pi:pipeline:${sessionId.slice(0, 40)}`,
    "@type": "prov:Bundle",
    "@graph": graph,
  };

  const slug = sessionId.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 60);
  const outPath = resolve(process.cwd(), `provenance-${slug}.jsonld`);
  await writeFile(outPath, JSON.stringify(bundle, null, 2), "utf-8");
  ctx.ui.notify(`Exported ${graph.length} provenance nodes to provenance-${slug}.jsonld`, "success");
}
