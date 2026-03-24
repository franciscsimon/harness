// ─── Git Repository Detail Page ───────────────────────────────
// Shows last 100 commits for a Soft Serve repository.

import { execSync } from "node:child_process";
import { layout } from "../components/layout.ts";
import { escapeHtml } from "../lib/format.ts";

interface Commit {
  hash: string;
  short: string;
  message: string;
  author: string;
  date: string;
}

export async function renderGitDetail(repoName: string, projectId?: string): Promise<string> {
  let commits: Commit[] = [];

  try {
    const output = execSync(
      `docker exec soft-serve git -C /soft-serve/repos/${repoName}.git log --format='%H|%h|%s|%an|%ai' -100`,
      { encoding: "utf-8", timeout: 10000 },
    );
    commits = output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, short, message, author, date] = line.split("|");
        return { hash, short, message, author, date };
      });
  } catch {
    /* empty — repo may not exist */
  }

  const rows = commits
    .map(
      (c) => `
    <tr>
      <td><code style="font-size:0.8rem">${escapeHtml(c.short)}</code></td>
      <td>${escapeHtml(c.message)}</td>
      <td style="color:#8b949e">${escapeHtml(c.author)}</td>
      <td style="color:#8b949e;white-space:nowrap">${escapeHtml(c.date?.split(" ").slice(0, 2).join(" ") ?? "")}</td>
    </tr>
  `,
    )
    .join("\n");

  const content = `
    <main>
      <div class="page-header">
        <h1>📂 ${escapeHtml(repoName)}</h1>
        <div>
          <code style="font-size:0.8rem;color:#8b949e">ssh://soft-serve:23231/${escapeHtml(repoName)}</code> <span style="font-size:0.7rem;color:#8b949e">(Docker internal)</span>
        </div>
      </div>

      <p style="color:#8b949e">${commits.length} commits</p>

      ${
        commits.length === 0
          ? '<p class="empty-msg">No commits found.</p>'
          : `
      <div class="card" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr><th>SHA</th><th>Message</th><th>Author</th><th>Date</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      `
      }
    </main>
  `;

  return layout(content, {
    title: `${repoName} — Git`,
    activePath: projectId ? `/projects/${projectId}/git` : "/git",
    projectId,
    activeSection: "git",
  });
}
