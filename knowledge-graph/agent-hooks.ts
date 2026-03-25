/**
 * Knowledge Graph — Agent Start Hooks
 *
 * Hooks that run before/during agent sessions to inject context:
 * - before_agent_start: inject related entities when working on a ticket
 * - on_error: auto-query provenance chain for failed operations
 *
 * Phase L: Knowledge Graph Sprint 5 — Integration & Polish
 */

import { searchEntities } from "./search.ts";
import { getProvenanceChain } from "./provenance-chain.ts";
import { analyzeImpact } from "./impact-analysis.ts";

type Sql = ReturnType<typeof import("postgres").default>;

export interface AgentContext {
  ticketId?: string;
  projectId?: string;
  sessionId?: string;
  filePaths?: string[];
}

export interface InjectedContext {
  relatedEntities: any[];
  recentActivity: any[];
  impactAnalysis?: any;
  provenanceChain?: any[];
}

/**
 * Before agent starts working on a ticket — inject related entities,
 * recent activity, and impact analysis into the agent's context.
 */
export async function beforeAgentStart(sql: Sql, ctx: AgentContext): Promise<InjectedContext> {
  const result: InjectedContext = { relatedEntities: [], recentActivity: [] };

  try {
    // If working on a ticket, find related entities
    if (ctx.ticketId) {
      const ticketEdges = await sql`
        SELECT * FROM graph_edges
        WHERE source_id = ${ctx.ticketId} OR target_id = ${ctx.ticketId}
        ORDER BY ts DESC LIMIT 20`;
      result.relatedEntities.push(...ticketEdges);

      // Get ticket's project context
      const projectEdge = ticketEdges.find((e: any) => e.target_type === "project" || e.source_type === "project");
      if (projectEdge) {
        const projectId = projectEdge.target_type === "project" ? projectEdge.target_id : projectEdge.source_id;
        const projectEntities = await sql`
          SELECT * FROM graph_edges
          WHERE (source_id = ${projectId} OR target_id = ${projectId})
          AND ts > ${Date.now() - 7 * 24 * 60 * 60 * 1000}
          ORDER BY ts DESC LIMIT 10`;
        result.recentActivity.push(...projectEntities);
      }
    }

    // If working on specific files, find their entity connections
    if (ctx.filePaths && ctx.filePaths.length > 0) {
      for (const fp of ctx.filePaths.slice(0, 5)) {
        const fileEntities = await searchEntities(sql, fp, { entityType: "file", limit: 3 });
        result.relatedEntities.push(...fileEntities);
      }
    }

    // Impact analysis for the current ticket
    if (ctx.ticketId) {
      try {
        result.impactAnalysis = await analyzeImpact(sql, ctx.ticketId, { maxDepth: 2 });
      } catch { /* non-critical */ }
    }
  } catch {
    // Context injection is best-effort
  }

  return result;
}

/**
 * On error during agent work — auto-query provenance chain
 * to help understand what led to the failure.
 */
export async function onAgentError(
  sql: Sql,
  errorId: string,
  component: string,
): Promise<{ provenanceChain: any[]; relatedErrors: any[] }> {
  const result = { provenanceChain: [] as any[], relatedErrors: [] as any[] };

  try {
    // Get provenance chain for the error
    result.provenanceChain = await getProvenanceChain(sql, errorId, { maxDepth: 5 });

    // Find related errors in the same component
    const recentErrors = await sql`
      SELECT * FROM error_groups
      WHERE component = ${component} AND status != 'resolved'
      ORDER BY last_seen DESC LIMIT 5`;
    result.relatedErrors = recentErrors;
  } catch {
    // Best-effort
  }

  return result;
}
