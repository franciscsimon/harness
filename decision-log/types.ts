// ─── Decision Record (XTDB row) ────────────────────────────────

export interface DecisionRecord {
  _id: string;                   // "dec:<uuid>"
  project_id: string;            // FK → projects._id
  session_id: string;            // session that produced this decision
  ts: number;                    // epoch ms
  task: string;                  // what was the agent trying to do
  what: string;                  // what was tried or decided
  outcome: "success" | "failure" | "deferred";
  why: string;                   // reasoning / root cause
  jsonld: string;
}

// ─── Tool input shape ──────────────────────────────────────────

export interface LogDecisionInput {
  task: string;
  what: string;
  outcome: "success" | "failure" | "deferred";
  why: string;
}
