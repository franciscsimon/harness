import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: match[2] };
}

export function discoverAgents(): AgentConfig[] {
  const agentsDir = join(process.env.HOME ?? "~", ".pi", "agent", "agents");
  if (!existsSync(agentsDir)) return [];

  const agents: AgentConfig[] = [];
  for (const entry of readdirSync(agentsDir)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = join(agentsDir, entry);
    try {
      if (!statSync(filePath).isFile()) continue;
      const content = readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);
      if (!frontmatter.name || !frontmatter.description) continue;

      agents.push({
        name: frontmatter.name,
        description: frontmatter.description,
        tools: frontmatter.tools?.split(",").map((t) => t.trim()).filter(Boolean),
        model: frontmatter.model,
        systemPrompt: body,
      });
    } catch {}
  }
  return agents;
}

export function formatAgentList(agents: AgentConfig[]): string {
  if (agents.length === 0) return "No agents found in ~/.pi/agent/agents/";
  return agents.map((a) => `  ${a.name}: ${a.description}`).join("\n");
}
