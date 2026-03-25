/**
 * Knowledge Graph — Extension Enrichment Hooks
 *
 * Automatically enriches the knowledge graph when events occur:
 * - New session → resolve project entities + create edges
 * - New error → link to component + create error group entity
 * - New ticket → create ticket entity + link to project
 * - New deployment → link release → project → environment
 * - CI run complete → link to repo + commit
 *
 * Phase F: Enrichment (19 items)
 */

import { resolveEntity } from "./entity-resolver.ts";
import { resolveEdges, type EdgeInput } from "./edge-resolver.ts";
import { refreshMaterializedEdges } from "./materialized-edges.ts";
import type { EntityType } from "./types.ts";

type Sql = ReturnType<typeof import("postgres").default>;

export interface EnrichmentEvent {
  type: "session_start" | "error_captured" | "ticket_created" | "deployment_complete" | "ci_run_complete" | "artifact_built" | "review_complete";
  data: Record<string, unknown>;
  ts: number;
}

/** Process an enrichment event and update the knowledge graph. */
export async function enrichFromEvent(sql: Sql, event: EnrichmentEvent): Promise<{ edgesCreated: number }> {
  const edges: EdgeInput[] = [];

  switch (event.type) {
    case "session_start": {
      const { sessionId, projectId, cwd } = event.data as any;
      if (projectId) {
        edges.push({
          sourceId: sessionId, sourceType: "session",
          targetId: projectId, targetType: "project",
          relation: "works_on",
        });
      }
      if (cwd) {
        const fileEntity = await resolveEntity(sql, cwd as string, "file");
        if (fileEntity) {
          edges.push({
            sourceId: sessionId, sourceType: "session",
            targetId: fileEntity.id, targetType: "file",
            relation: "modifies",
          });
        }
      }
      break;
    }

    case "error_captured": {
      const { errorId, component, fingerprint, ticketId } = event.data as any;
      edges.push({
        sourceId: errorId, sourceType: "error",
        targetId: component, targetType: "component",
        relation: "occurs_in",
      });
      if (fingerprint) {
        edges.push({
          sourceId: errorId, sourceType: "error",
          targetId: `eg:${fingerprint}`, targetType: "error_group",
          relation: "belongs_to",
        });
      }
      if (ticketId) {
        edges.push({
          sourceId: errorId, sourceType: "error",
          targetId: ticketId, targetType: "ticket",
          relation: "tracked_by",
        });
      }
      break;
    }

    case "ticket_created": {
      const { ticketId, projectId, assignee } = event.data as any;
      if (projectId) {
        edges.push({
          sourceId: ticketId, sourceType: "ticket",
          targetId: projectId, targetType: "project",
          relation: "belongs_to",
        });
      }
      if (assignee) {
        edges.push({
          sourceId: ticketId, sourceType: "ticket",
          targetId: assignee, targetType: "person",
          relation: "assigned_to",
        });
      }
      break;
    }

    case "deployment_complete": {
      const { deploymentId, releaseId, projectId, environment } = event.data as any;
      if (releaseId) {
        edges.push({
          sourceId: deploymentId, sourceType: "deployment",
          targetId: releaseId, targetType: "release",
          relation: "deploys",
        });
      }
      if (projectId) {
        edges.push({
          sourceId: deploymentId, sourceType: "deployment",
          targetId: projectId, targetType: "project",
          relation: "targets",
        });
      }
      if (environment) {
        edges.push({
          sourceId: deploymentId, sourceType: "deployment",
          targetId: environment, targetType: "environment",
          relation: "deployed_to",
        });
      }
      break;
    }

    case "ci_run_complete": {
      const { runId, repo, commitHash, status } = event.data as any;
      edges.push({
        sourceId: runId, sourceType: "ci_run",
        targetId: repo, targetType: "repository",
        relation: "tests",
      });
      if (commitHash) {
        edges.push({
          sourceId: runId, sourceType: "ci_run",
          targetId: commitHash, targetType: "commit",
          relation: "validates",
        });
      }
      break;
    }

    case "artifact_built": {
      const { artifactId, projectId, version } = event.data as any;
      if (projectId) {
        edges.push({
          sourceId: artifactId, sourceType: "artifact",
          targetId: projectId, targetType: "project",
          relation: "produced_by",
        });
      }
      break;
    }

    case "review_complete": {
      const { reviewId, commitHash, repo, passed } = event.data as any;
      edges.push({
        sourceId: reviewId, sourceType: "review",
        targetId: repo, targetType: "repository",
        relation: "reviews",
      });
      if (commitHash) {
        edges.push({
          sourceId: reviewId, sourceType: "review",
          targetId: commitHash, targetType: "commit",
          relation: "reviews_commit",
        });
      }
      break;
    }
  }

  // Persist all edges
  let created = 0;
  if (edges.length > 0) {
    created = await resolveEdges(sql, edges);
    // Refresh materialized edges periodically (not on every event)
    if (Math.random() < 0.1) {
      await refreshMaterializedEdges(sql).catch(() => {});
    }
  }

  return { edgesCreated: created };
}

/** Batch enrichment: process multiple events. */
export async function enrichBatch(sql: Sql, events: EnrichmentEvent[]): Promise<{ totalEdges: number }> {
  let totalEdges = 0;
  for (const event of events) {
    const result = await enrichFromEvent(sql, event);
    totalEdges += result.edgesCreated;
  }
  return { totalEdges };
}
