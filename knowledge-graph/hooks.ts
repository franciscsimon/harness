/**
 * Knowledge Graph — pi Extension Hooks
 *
 * Registers tools and commands that the pi agent can invoke:
 * - graph:search — search entities by name/type
 * - graph:impact — analyze impact of a change
 * - graph:timeline — get chronological view
 * - graph:traverse — find paths between entities
 *
 * Phase E: pi Extension Hooks (5 items)
 */

import { searchEntities } from "./search.ts";
import { analyzeImpact } from "./impact-analysis.ts";
import { getTimeline } from "./timeline.ts";
import { findPath } from "./traversal.ts";
import { resolveEntity } from "./entity-resolver.ts";

export interface HookContext {
  sql: ReturnType<typeof import("postgres").default>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

/** Register all knowledge graph tools for pi agent integration. */
export function registerGraphTools(ctx: HookContext) {
  return {
    "graph:search": async (args: { query: string; type?: string; limit?: number }): Promise<ToolResult> => {
      try {
        const results = await searchEntities(ctx.sql, args.query, {
          entityType: args.type,
          limit: args.limit ?? 10,
        });
        return { success: true, data: results };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "graph:impact": async (args: { entityId: string; depth?: number }): Promise<ToolResult> => {
      try {
        const impact = await analyzeImpact(ctx.sql, args.entityId, { maxDepth: args.depth ?? 3 });
        return { success: true, data: impact };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "graph:timeline": async (args: { entityId?: string; limit?: number }): Promise<ToolResult> => {
      try {
        const timeline = await getTimeline(ctx.sql, { entityId: args.entityId, limit: args.limit ?? 20 });
        return { success: true, data: timeline };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "graph:traverse": async (args: { from: string; to: string; maxDepth?: number }): Promise<ToolResult> => {
      try {
        const path = await findPath(ctx.sql, args.from, args.to, args.maxDepth ?? 5);
        return { success: true, data: path };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },

    "graph:resolve": async (args: { name: string; type: string }): Promise<ToolResult> => {
      try {
        const entity = await resolveEntity(ctx.sql, args.name, args.type);
        return { success: true, data: entity };
      } catch (e: any) {
        return { success: false, data: null, error: e.message };
      }
    },
  };
}
