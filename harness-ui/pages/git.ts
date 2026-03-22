import { layout } from "../components/layout.ts";
import { execSync } from "node:child_process";

export async function renderGitRepos(projectId?: string): Promise<string> {
  let repos: { name: string; description: string; isPrivate: boolean; defaultBranch: string }[] = [];

  try {
    const output = execSync("ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -p 23231 localhost repo list", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const names = output.split("\n").filter(Boolean);

    for (const name of names) {
      try {
        const info = execSync(`ssh -o StrictHostKeyChecking=no -p 23231 localhost repo info ${name}`, {
          encoding: "utf-8",
          timeout: 5000,
        });
        const desc = info.match(/Description:\s*(.*)/)?.[1]?.trim() ?? "";
        const priv = info.includes("Private: true");
        const branch = info.match(/Default Branch:\s*(.*)/)?.[1]?.trim() ?? "main";
        repos.push({ name, description: desc, isPrivate: priv, defaultBranch: branch });
      } catch {
        repos.push({ name, description: "", isPrivate: false, defaultBranch: "main" });
      }
    }
  } catch (e) {
    // Soft Serve unreachable
  }

  const rows = repos.map(r => `
    <tr>
      <td><strong>${r.name}</strong></td>
      <td>${r.description || "<span style='color:#484f58'>—</span>"}</td>
      <td><code>${r.defaultBranch}</code></td>
      <td>${r.isPrivate ? "🔒 Private" : "🌐 Public"}</td>
      <td>
        <code style="font-size:0.8rem">ssh://localhost:23231/${r.name}</code><br>
        <code style="font-size:0.8rem">http://localhost:23232/${r.name}</code>
      </td>
    </tr>
  `).join("");

  const content = `
    <main class="container">
      <h1>🐙 Git Repositories</h1>
      <p style="color:#8b949e">Hosted on Soft Serve (SSH :23231, HTTP :23232)</p>
      ${repos.length === 0
        ? `<p class="empty-msg">No repositories found. Is Soft Serve running?</p>`
        : `<table class="data-table">
            <thead><tr>
              <th>Repository</th><th>Description</th><th>Branch</th><th>Visibility</th><th>Clone URL</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`
      }
    </main>`;

  return layout(content, { title: "Git Repos", activePath: projectId ? `/projects/${projectId}/git` : "/git", projectId, activeSection: "git" });
}
