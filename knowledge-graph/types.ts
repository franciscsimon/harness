// ─── Knowledge Graph Types ───────────────────────────────────

export interface GraphNode {
  id: string;
  type: string;
  table: string;
  title: string;
  summary?: string;
  ts: number;
  data?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  predicate: string;
  ts: number;
}

export interface TraversalResult {
  path: Array<{ node: GraphNode; edge?: GraphEdge }>;
  depth: number;
  complete: boolean;
}

export interface TimelineEntry {
  id: string;
  entityType: string;
  title: string;
  summary?: string;
  ts: number;
}

export interface ImpactResult {
  root: GraphNode;
  affected: Array<{ node: GraphNode; edge: GraphEdge; depth: number }>;
}

export interface SearchResult {
  id: string;
  entityType: string;
  title: string;
  excerpt: string;
  ts: number;
  relevance: number;
}

export const PREFIX_TABLE_MAP: Record<string, { table: string; type: string }> = {
  "proj:":    { table: "projects",             type: "doap:Project" },
  "sp:":      { table: "session_projects",     type: "prov:Activity" },
  "dec:":     { table: "decisions",            type: "prov:Activity" },
  "art:":     { table: "artifacts",            type: "prov:Entity" },
  "artver:":  { table: "artifact_versions",    type: "prov:Entity" },
  "aread:":   { table: "artifact_reads",       type: "prov:Usage" },
  "del:":     { table: "delegations",          type: "prov:Activity" },
  "pm:":      { table: "session_postmortems",  type: "prov:Activity" },
  "req:":     { table: "requirements",         type: "schema:CreativeWork" },
  "reqlink:": { table: "requirement_links",    type: "prov:Association" },
  "env:":     { table: "environments",         type: "schema:Place" },
  "rel:":     { table: "releases",             type: "doap:Version" },
  "depl:":    { table: "deployments",          type: "schema:DeployAction" },
  "trun:":    { table: "test_runs",            type: "schema:CheckAction" },
  "bak:":     { table: "backup_records",       type: "prov:Entity" },
  "inc:":     { table: "incidents",            type: "schema:Event" },
  "wfrun:":   { table: "workflow_runs",        type: "schema:HowTo" },
  "wfstep:":  { table: "workflow_step_runs",   type: "schema:HowToStep" },
  "decom:":   { table: "decommission_records", type: "prov:Activity" },
  "pdep:":    { table: "project_dependencies", type: "code:Dependency" },
  "ptag:":    { table: "project_tags",         type: "schema:DefinedTerm" },
  "lev:":     { table: "lifecycle_events",     type: "prov:Activity" },
  "err:":     { table: "errors",               type: "schema:Action" },
  "tkt:":     { table: "tickets",              type: "code:Ticket" },
  "tktlink:": { table: "ticket_links",         type: "prov:Association" },
  "tktev:":   { table: "ticket_events",        type: "prov:Activity" },
  "gedge:":   { table: "graph_edges",          type: "code:GraphEdge" },
};
