/**
 * Normalize a git remote URL to a stable canonical form.
 *
 * Rules:
 *   1. git@host:path       → host/path
 *   2. ssh://git@host/path → host/path
 *   3. https://host/path   → host/path
 *   4. git://host/path     → host/path
 *   5. Strip .git suffix
 *   6. Strip trailing slashes
 *   7. Lowercase host only (path preserves case)
 */
export function normalizeGitUrl(raw: string): string {
  let url = raw.trim();

  // SSH shorthand: git@host:path (no protocol prefix)
  const sshShorthand = url.match(/^[\w.-]+@([\w.-]+):(.+)$/);
  if (sshShorthand) {
    const host = sshShorthand[1].toLowerCase();
    const path = stripSuffix(sshShorthand[2]);
    return `${host}/${path}`;
  }

  // Protocol-based URLs: ssh://, https://, http://, git://
  const protocolMatch = url.match(/^(?:ssh|https?|git):\/\/(?:[\w.-]+@)?([\w.-]+)(?::\d+)?\/(.+)$/);
  if (protocolMatch) {
    const host = protocolMatch[1].toLowerCase();
    const path = stripSuffix(protocolMatch[2]);
    return `${host}/${path}`;
  }

  // Fallback: return as-is (not a recognized URL pattern)
  return stripSuffix(url);
}

function stripSuffix(s: string): string {
  return s.replace(/\.git$/, "").replace(/\/+$/, "");
}
