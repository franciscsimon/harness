# Exploration: Pi.dev Agent in Container

## The Problem

`chat-ws` runs the pi.dev coding agent (`@mariozechner/pi-coding-agent`) inside a Docker container. The agent needs:

1. **File system access** — `SessionManager.create(cwd)` / `.open(sessionFile)` reads/writes session files, the agent reads/edits project files via tools
2. **Tool execution** — the agent runs bash commands, reads files, writes files, delegates to sub-agents — all against the **host project directory**
3. **API keys** — `AuthStorage` reads `~/.pi/auth.json` for Anthropic/OpenAI keys
4. **Pi config** — skills, extensions, themes, agent configs from `~/.pi/agent/`
5. **Git, npm, system tools** — the agent's bash tool executes arbitrary commands

Currently chat-ws runs in a container with **none of these**. It has:
- Its own isolated filesystem (`/app/web-chat/`)
- No host project mount
- No `~/.pi` directory
- No API keys
- No git, no project files

## Why It Worked Before (Accidentally)

Before containerization, chat-ws ran on the host via process-compose. It had native access to the host filesystem, `~/.pi`, API keys, and system tools. After containerization, it was put in a minimal `node:22-slim` container with just the web-chat code — the agent can start but can't actually do anything useful.

## What Needs to Happen

The container needs access to the host environment. There are a few approaches:

### Option A: Mount host directories into chat-ws container
```yaml
chat-ws:
  image: harness/chat-ws:latest
  volumes:
    - ${HOME}/.pi:/root/.pi:ro          # Pi config, auth, skills, extensions
    - ${PWD}:/workspace                   # Project directory (read-write)
    - /var/run/docker.sock:/var/run/docker.sock  # If agent needs Docker
  environment:
    CHAT_CWD: /workspace
    HOME: /root
```

**Pros**: Simple, agent has full access to project and pi config.
**Cons**: Agent bash commands run inside the container — missing host tools (brew, system packages). Read-write mount means agent edits files on host (which is the point, but risky).

### Option B: Mount everything + install tools
Extend the Dockerfile to include common tools the agent needs:
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y git curl jq ripgrep
# ... agent toolchain
```

Mount the host directories as in Option A, plus install tools the agent typically uses.

**Pros**: Agent has tools it needs.
**Cons**: Can never match the full host environment. Agent might try to run `brew`, `cargo`, language-specific CLIs that aren't in the container.

### Option C: Run chat-ws on host, not in Docker
Keep chat-ws as the ONE service that runs on the host (outside Docker). It connects to the Docker network for communication with other services.

```yaml
# Remove chat-ws from docker-compose.yml
# Run separately: npx jiti web-chat/server.ts
```

Caddy routes `/ws` to `host.docker.internal:3334` instead of `chat-ws:3334`.

**Pros**: Full host environment — all tools, all files, all config.
**Cons**: One service outside Docker, breaks the "everything containerized" principle. Need to manage it separately.

### Option D: Docker-outside-Docker with full host mount
```yaml
chat-ws:
  volumes:
    - /:/host                              # Entire host filesystem
    - /var/run/docker.sock:/var/run/docker.sock
    - ${HOME}/.pi:/root/.pi:ro
  environment:
    CHAT_CWD: /host${PWD}
```

Agent works against `/host/Users/opunix/harness/` which maps to the real host path.

**Pros**: Full filesystem access including all tools via host paths.
**Cons**: Security nightmare — entire host FS mounted. Path translation issues (`/host/...` vs real paths).

## Recommendation

**Option A (mount project + .pi) is the pragmatic choice.** The agent primarily needs:
- Project files (read/write) — mount `${PWD}:/workspace`
- Pi config and auth — mount `${HOME}/.pi:/root/.pi`
- Basic tools (git, curl, grep) — install in Dockerfile

The agent's bash tool won't have every host tool, but it'll have the essentials. For anything missing, the user can install it in the Dockerfile or use Option C as escape hatch.

## Open Questions
1. Should the workspace mount be read-write? (Agent needs to edit files — yes)
2. Which tools should the Dockerfile include? (git, curl, ripgrep, jq minimum)
3. Should we mount Docker socket so the agent can run Docker commands?
4. How to handle API keys securely? (mount .pi read-only, or pass via env vars)
