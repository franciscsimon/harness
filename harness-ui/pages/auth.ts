import { layout } from "../components/layout.ts";

export async function renderAuth(): Promise<string> {
  // Check current status
  let status: { configured: boolean; providers?: string[]; error?: string } = { configured: false };
  try {
    const CHAT_AUTH_DIR = process.env.CHAT_AUTH_DIR ?? "/app/chat-auth";
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const authPath = join(CHAT_AUTH_DIR, "auth.json");
    if (existsSync(authPath)) {
      const data = JSON.parse(readFileSync(authPath, "utf-8"));
      const providers = Object.keys(data).filter((k) => data[k]?.type);
      status = { configured: true, providers };
    }
  } catch (e) {
    status = { configured: false, error: (e as Error).message };
  }

  const statusIcon = status.configured ? "✅" : "⚠️";
  const statusText = status.configured
    ? `Authenticated — ${status.providers?.join(", ") ?? "unknown provider"}`
    : "Not configured — upload auth.json to enable the coding agent";

  const content = `
    <h1>🔐 LLM Authentication</h1>
    <p style="color:#8b949e;margin-bottom:1.5rem">
      The coding agent needs API credentials to talk to LLM providers (Anthropic, OpenAI, etc.).<br>
      Run <code>pi login</code> on any machine with a browser, then upload the resulting <code>auth.json</code> here.
    </p>

    <div class="card" style="margin-bottom:1.5rem;padding:1rem">
      <h3>Status</h3>
      <p style="font-size:1.1rem">${statusIcon} ${statusText}</p>
      ${status.providers?.length ? `<p style="color:#8b949e">Providers: ${status.providers.map((p) => `<code>${p}</code>`).join(", ")}</p>` : ""}
    </div>

    <div class="card" style="margin-bottom:1.5rem;padding:1rem">
      <h3>Upload auth.json</h3>
      <p style="color:#8b949e;margin-bottom:1rem">
        Paste the contents of <code>~/.pi/agent/auth.json</code> from your host machine:
      </p>
      <form id="auth-form">
        <textarea id="auth-input" rows="8" style="width:100%;font-family:monospace;font-size:0.85rem;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:0.75rem;resize:vertical" placeholder='{"anthropic":{"type":"oauth","access":"...","refresh":"...","expires":...}}'></textarea>
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem">
          <button type="submit" class="btn" style="background:#238636">📤 Upload</button>
          <label class="btn" style="cursor:pointer">📁 Load from file
            <input type="file" id="auth-file" accept=".json" style="display:none">
          </label>
          ${status.configured ? '<button type="button" id="btn-delete" class="btn" style="background:#da3633">🗑️ Remove</button>' : ""}
        </div>
      </form>
      <div id="auth-msg" style="margin-top:0.75rem"></div>
    </div>

    <div class="card" style="padding:1rem">
      <h3>How to get auth.json</h3>
      <ol style="color:#8b949e;line-height:1.8">
        <li>Install pi on any machine: <code>npm i -g @mariozechner/pi-coding-agent</code></li>
        <li>Run <code>pi login</code> — complete the browser OAuth flow</li>
        <li>Copy <code>~/.pi/agent/auth.json</code></li>
        <li>Paste it above or use the file picker</li>
      </ol>
      <p style="color:#8b949e;margin-top:0.5rem">
        Tokens refresh automatically. You only need to re-upload if the refresh token expires.
      </p>
    </div>

    <script>
    const form = document.getElementById("auth-form");
    const input = document.getElementById("auth-input");
    const fileInput = document.getElementById("auth-file");
    const msg = document.getElementById("auth-msg");
    const btnDelete = document.getElementById("btn-delete");

    function showMsg(text, ok) {
      msg.innerHTML = '<span style="color:' + (ok ? '#3fb950' : '#f85149') + '">' + text + '</span>';
    }

    fileInput?.addEventListener("change", function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function() { input.value = reader.result; };
      reader.readAsText(file);
    });

    form.addEventListener("submit", async function(e) {
      e.preventDefault();
      try {
        const auth = JSON.parse(input.value.trim());
        const r = await fetch("/api/auth/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth })
        });
        const d = await r.json();
        if (d.success) {
          showMsg("✅ Uploaded — providers: " + (d.providers?.join(", ") || "none"), true);
          setTimeout(() => location.reload(), 1500);
        } else {
          showMsg("❌ " + (d.error || "Upload failed"), false);
        }
      } catch (err) {
        showMsg("❌ Invalid JSON: " + err.message, false);
      }
    });

    btnDelete?.addEventListener("click", async function() {
      if (!confirm("Remove auth credentials?")) return;
      const r = await fetch("/api/auth/delete", { method: "POST" });
      const d = await r.json();
      if (d.success) {
        showMsg("🗑️ Removed", true);
        setTimeout(() => location.reload(), 1000);
      } else {
        showMsg("❌ " + (d.error || "Delete failed"), false);
      }
    });
    </script>
  `;

  return layout(content, { title: "Auth", activePath: "/auth" });
}
