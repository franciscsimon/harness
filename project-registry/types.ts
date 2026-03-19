// ─── Project Identity (resolved from cwd) ─────────────────────────

export interface ProjectIdentity {
  canonicalId: string;           // "git:github.com/user/repo" | "git-local:<hash>" | "path:/abs/path"
  name: string;                  // human-readable, auto-derived from repo/dir name
  identityType: "git-remote" | "git-local" | "path";
  gitRemoteUrl: string | null;   // raw origin URL, null for non-git
  gitRootPath: string | null;    // absolute path to git root, null for non-git
}

// ─── XTDB Row Shapes ──────────────────────────────────────────────

export type LifecyclePhase = "planning" | "active" | "maintenance" | "deprecated" | "decommissioned";

export interface ProjectRecord {
  _id: string;                   // "proj:<sha256-prefix>"
  canonical_id: string;
  name: string;
  identity_type: string;         // "git-remote" | "git-local" | "path"
  git_remote_url: string | null;
  git_root_path: string | null;
  first_seen_ts: number;         // epoch ms
  last_seen_ts: number;          // epoch ms
  session_count: number;
  lifecycle_phase: LifecyclePhase;
  config_json: string;           // JSON string of per-project config
  jsonld: string;
}

export interface SessionProjectRecord {
  _id: string;                   // "sp:<uuid>"
  session_id: string;            // from ctx.sessionManager.getSessionFile()
  project_id: string;            // FK → projects._id
  canonical_id: string;          // denormalized for querying
  cwd: string;                   // actual working directory (may be subdirectory)
  git_root_path: string | null;
  ts: number;                    // epoch ms
  is_first_session: boolean;
  jsonld: string;
}

// ─── Cross-Extension Communication ────────────────────────────────

export interface CurrentProject {
  projectId: string;
  canonicalId: string;
  name: string;
  isFirstSession: boolean;
  identityType: string;
}

// ─── Exec Function (injected for testability) ─────────────────────

export type ExecFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;
