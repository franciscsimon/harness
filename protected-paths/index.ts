import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Protected Paths Extension ────────────────────────────────────
// Block writes to sensitive files/directories.

const PROTECTED = [
  /\.env$/,
  /\.env\.\w+$/,
  /node_modules\//,
  /\.git\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.ssh\//,
  /\.aws\//,
  /id_rsa|id_ed25519/,
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const path = String(event.input?.path ?? "");

    for (const re of PROTECTED) {
      if (re.test(path)) {
        const ok = await ctx.ui.confirm("🛡️ Protected path", `Writing to "${path}" is restricted. Allow?`);
        if (!ok) return { block: true, reason: `Blocked: ${path} is protected` };
        break;
      }
    }
  });
}
