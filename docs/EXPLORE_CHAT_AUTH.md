# Exploration: Pi.dev Container Auth for LLM APIs

## How Pi.dev Auth Works

Pi uses a layered auth system (checked in order):

### 1. OAuth tokens (primary) — stored in `~/.pi/agent/auth.json`
- **Anthropic**: OAuth PKCE flow → starts local server on `:53692`, opens browser for consent, receives callback with auth code, exchanges for access/refresh tokens
- **GitHub Copilot**: Device flow → polls GitHub for approval
- **Google Gemini CLI**: OAuth browser flow  
- **OpenAI Codex**: OAuth browser flow

The tokens (access + refresh) are stored in `auth.json`. Refresh happens automatically when tokens expire — no browser needed after initial login.

### 2. Environment variables (fallback)
```
ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
GROQ_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, ...
```
If set, these bypass OAuth entirely.

### 3. Runtime overrides
`AuthStorage.setRuntimeOverride(providerId, apiKey)` — in-memory only, not persisted.

## The Container Problem

When chat-ws runs in a container:
- No `auth.json` → no OAuth tokens
- No env vars → no API keys
- OAuth login flow starts a callback server on `localhost:53692` — inside the container, the browser can't reach it

## Solutions

### Option 1: Mount auth.json read-only
```yaml
chat-ws:
  volumes:
    - ${HOME}/.pi/agent/auth.json:/root/.pi/agent/auth.json
```

**How it works**: Container reads existing OAuth tokens. Token refresh writes back to the file (needs read-write or a token refresh proxy).

**Problem**: OAuth tokens expire. Refresh needs write access. If the file is read-only, refresh fails and user needs to re-login on the host.

**Variant**: Mount `~/.pi/agent/` read-write so refresh can persist.
```yaml
    - ${HOME}/.pi/agent:/root/.pi/agent
```

### Option 2: Pass API key via environment variable
```yaml
chat-ws:
  environment:
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
```

**How it works**: `getEnvApiKey("anthropic")` returns the env var. No OAuth needed.

**Problem**: User must have an explicit API key (not all plans include one — Claude Pro/Max use OAuth, not API keys). Also: key in docker-compose.yml or .env file — less secure.

### Option 3: Mount auth + project dir (full agent capability)
```yaml
chat-ws:
  volumes:
    - ${HOME}/.pi/agent:/root/.pi/agent       # auth + config + skills
    - ${PWD}:/workspace                         # project directory
  environment:
    CHAT_CWD: /workspace
```

**How it works**: Agent has auth tokens, skills, extensions, AND project files. It can actually read/edit code and run tools.

**Problem**: Agent bash tool runs inside container — limited tools compared to host.

### Option 4: OAuth login inside container via browser proxy
The Anthropic OAuth flow starts a server on `localhost:53692`. Inside a container, the browser can't reach it. But we could:

1. Expose port 53692 temporarily during login (breaks our "only Caddy" rule)
2. OR: Caddy routes `/oauth/callback` → chat-ws:53692 
3. OR: Override the redirect URI to go through Caddy

**Problem**: The redirect URI `http://localhost:53692/callback` is hardcoded in pi-ai. Changing it requires patching the library or overriding the OAuth provider config.

### Option 5: Auth service / token broker
A small sidecar that:
1. Runs OAuth login on the HOST (has browser access)
2. Writes tokens to a shared volume
3. chat-ws reads tokens from the volume

Or: a `/login` endpoint on harness-ui that proxies the OAuth flow.

## Recommendation

**Start with Option 3** (mount auth + project dir):
- Mount `${HOME}/.pi/agent:/root/.pi/agent` (read-write for token refresh)
- Mount `${PWD}:/workspace` (read-write for agent file operations)
- Set `CHAT_CWD=/workspace`
- Install essential tools in Dockerfile (git, curl, ripgrep)
- Login happens on host first (`pi login`), container uses the tokens

This is the simplest approach that works. The user runs `pi login` once on the host, tokens get stored in `~/.pi/agent/auth.json`, and the container picks them up.

For initial login inside the container (no host `pi` installed), use **Option 2** as bootstrap: pass `ANTHROPIC_API_KEY` env var.

## Open Questions
1. Is mounting `~/.pi/agent` read-write acceptable? (needed for token refresh)
2. Should the Dockerfile include language runtimes (Python, Rust, etc.) or just basics?
3. Docker socket mount for agent's Docker commands?
