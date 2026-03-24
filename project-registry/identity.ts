import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { normalizeGitUrl } from "./normalize.ts";
import type { ExecFn, ProjectIdentity } from "./types.ts";

/**
 * Resolve project identity from a working directory.
 *
 * Resolution order:
 *   1. Git repo with origin remote → canonical URL
 *   2. Git repo, no remote → first commit hash
 *   3. Git repo, no commits → path fallback
 *   4. Not a git repo → path fallback
 */
export async function resolveProject(cwd: string, exec: ExecFn): Promise<ProjectIdentity> {
  // 1. Is this a git repo?
  let gitRoot: string;
  try {
    const r = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    gitRoot = r.stdout.trim();
  } catch {
    // Not a git repo
    const abs = resolve(cwd);
    return {
      canonicalId: `path:${abs}`,
      name: basename(abs),
      identityType: "path",
      gitRemoteUrl: null,
      gitRootPath: null,
    };
  }

  // 2. Has origin remote?
  try {
    const r = await exec("git", ["-C", gitRoot, "remote", "get-url", "origin"]);
    const rawUrl = r.stdout.trim();
    const normalized = normalizeGitUrl(rawUrl);
    return {
      canonicalId: `git:${normalized}`,
      name: normalized.split("/").pop() || basename(gitRoot),
      identityType: "git-remote",
      gitRemoteUrl: rawUrl,
      gitRootPath: gitRoot,
    };
  } catch {
    // No origin remote
  }

  // 3. Has commits? Use first commit hash
  try {
    const r = await exec("git", ["-C", gitRoot, "rev-list", "--max-parents=0", "HEAD"]);
    const firstCommit = r.stdout.trim().split("\n")[0];
    return {
      canonicalId: `git-local:${firstCommit}`,
      name: basename(gitRoot),
      identityType: "git-local",
      gitRemoteUrl: null,
      gitRootPath: gitRoot,
    };
  } catch {
    // No commits yet
  }

  // 4. Git repo with no commits
  return {
    canonicalId: `path:${gitRoot}`,
    name: basename(gitRoot),
    identityType: "path",
    gitRemoteUrl: null,
    gitRootPath: gitRoot,
  };
}

/**
 * Deterministic project ID from canonical identity.
 * "proj:" + first 12 hex chars of SHA-256.
 */
export function projectId(canonicalId: string): string {
  const hash = createHash("sha256").update(canonicalId).digest("hex");
  return `proj:${hash.slice(0, 12)}`;
}
