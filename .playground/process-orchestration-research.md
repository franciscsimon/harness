# Process Orchestration Research — macOS Single-Host

**Date:** 2026-03-22  
**Context:** Harness project needs a process supervisor for ~5 host services (harness-ui, xtdb-event-logger-ui, xtdb-ops-api, web-chat, ci-runner) alongside Docker Compose infrastructure (Redpanda, XTDB, Garage, Keycloak, QLever, Soft Serve).

---

## Comparison Table

| Tool | macOS | Lang-Agnostic | Health Checks | Rolling Restart | Config Format | Self-Restart | Complexity | Active | Container+Host |
|------|-------|--------------|---------------|-----------------|---------------|-------------|------------|--------|----------------|
| **process-compose** | ✅ Native | ✅ Any | ✅ Liveness+Readiness (exec, HTTP) | ⚠️ Manual via API | YAML (docker-compose style) | ⚠️ Not built-in | Low | ✅ Very active (v1.100, Mar 2026) | ✅ Can wrap docker commands |
| **supervisord** | ✅ Tested on macOS | ✅ Any | ⚠️ Basic (xmlrpc events) | ❌ No native | INI (.conf) | ⚠️ Separate supervisorctl | Low-Med | ✅ Mature (v4.3) | ❌ Host processes only |
| **monit** | ✅ Homebrew | ✅ Any | ✅ TCP/HTTP/exec probes | ❌ No native | Custom DSL | ✅ Built for it | Med | ✅ Mature (v5.35) | ⚠️ Can monitor via pidfile |
| **launchd** | ✅ Native (macOS only) | ✅ Any | ⚠️ KeepAlive only | ❌ No | XML plist | ✅ OS-level | Med-High | ✅ Apple-maintained | ❌ Host processes only |
| **pm2** | ✅ Cross-platform | ⚠️ Node-centric* | ✅ HTTP health | ⚠️ pm2 reload (Node only) | JSON/JS/YAML ecosystem.config | ✅ pm2 update | Low | ✅ Active (43K stars) | ❌ Host processes only |
| **immortal** | ✅ macOS/BSD focused | ✅ Any | ❌ No built-in | ❌ No | YAML | ⚠️ immortalctl | Low | ⚠️ Stale (2024) | ❌ Host processes only |
| **overmind** | ✅ Go binary | ✅ Any | ❌ No | ❌ No | Procfile | ❌ No | Very Low | ⚠️ Low activity | ❌ Host processes only |
| **hivemind** | ✅ Go binary | ✅ Any | ❌ No | ❌ No | Procfile | ❌ No | Very Low | ❌ Stale (2023) | ❌ Host processes only |
| **mprocs** | ✅ Rust binary | ✅ Any | ❌ No | ❌ No | YAML | ❌ No | Very Low | ✅ Active (Mar 2026) | ❌ Host processes only |
| **circus** | ✅ Python | ✅ Any | ✅ Hooks/checks | ⚠️ Manual via circusctl | INI-like | ⚠️ circusctl | Med | ⚠️ Low activity | ❌ Host processes only |
| **systemd** | ❌ Linux only | ✅ Any | ✅ Full | ✅ Native | Unit files | ✅ | Med | ✅ | ✅ |
| **s6** | ⚠️ Homebrew (niche) | ✅ Any | ⚠️ Via s6-rc | ❌ No | Directory-based | ✅ | High | ✅ Active | ❌ |
| **Docker Compose** | ✅ Already in use | ✅ Any (containerized) | ✅ healthcheck | ⚠️ `--no-deps` per service | YAML | ⚠️ Complex | Low (already know it) | ✅ | ✅ Containers only |
| **Podman pods** | ✅ macOS (podman machine) | ✅ Any (containerized) | ✅ healthcheck | ⚠️ Similar to Docker | YAML/CLI | ⚠️ Complex | Med-High | ✅ | ✅ Containers only |
| **Nix/home-manager** | ✅ macOS via nix-darwin | ✅ Any | ❌ No native | ❌ No | Nix lang | ✅ Declarative | Very High | ✅ | ⚠️ Wraps launchd |

\* pm2 can manage non-Node processes but its reload/cluster features are Node-specific.

---

## Detailed Analysis of Top 3 Candidates

### 1. 🏆 process-compose (RECOMMENDED)

**What:** Go binary, docker-compose-like YAML for host processes. Single binary, zero dependencies.  
**Stars:** 2,220 ⭐ | **Last push:** Mar 20, 2026 | **Version:** 1.100.0

**Strengths:**
- Docker-compose mental model — you already know the config syntax
- Liveness AND readiness probes (exec command or HTTP GET) — exactly what you need
- Graceful shutdown: configurable signal (default SIGTERM), timeout, then SIGKILL
- Dependency ordering with conditions (`process_started`, `process_healthy`, `process_completed_successfully`)
- REST API for programmatic control (restart, scale, status)
- TUI for interactive monitoring
- Multiple replicas per process
- Environment variable support with .env files
- Config file merging (base + override, like docker-compose)
- Can manage Docker containers via `docker run` commands as daemon processes
- Scheduled processes (cron-like)

**Weaknesses:**
- No built-in rolling restart command — you'd script it via the REST API
- Cannot restart itself (it IS the supervisor) — needs an external wrapper or launchd to keep it alive
- YAML only — no native JSON-LD, but trivially convertible
- Relatively new project (though very active)

**Rolling restart approach:**
```bash
# Script using process-compose REST API
for svc in harness-ui event-logger-ui ops-api web-chat ci-runner; do
  curl -X POST localhost:8080/process/restart/$svc
  sleep 2  # wait for health check
  curl localhost:8080/process/info/$svc | jq '.status'
done
```

**Config example for harness:**
```yaml
version: "0.5"
processes:
  harness-ui:
    command: "npx jiti server.ts"
    working_dir: "./harness-ui"
    readiness_probe:
      http_get:
        host: 127.0.0.1
        path: "/"
        port: 3336
      initial_delay_seconds: 3
      period_seconds: 10
    availability:
      restart: always
      max_restarts: 5
    shutdown:
      signal: 15
      timeout_seconds: 10

  ci-runner:
    command: "npx jiti server.ts"
    working_dir: "./ci-runner"
    readiness_probe:
      http_get:
        host: 127.0.0.1
        path: "/api/health"
        port: 3337
    availability:
      restart: always
    depends_on:
      harness-ui:
        condition: process_healthy
```

### 2. monit

**What:** C-based monitoring daemon. Mature, battle-tested, cross-platform.  
**Version:** 5.35.2 | Actively maintained by Tildeslash

**Strengths:**
- Extremely mature and battle-tested (20+ years)
- Rich health checking: TCP ports, HTTP content matching, process resource usage
- Can monitor processes, files, directories, filesystems, network
- Auto-restart on crash, resource limits, dependency chains
- Built to survive — monitors itself via init/launchd
- Group operations (restart all services in a group)
- Web UI for monitoring (M/Monit)
- Can alert via email

**Weaknesses:**
- Custom DSL (not YAML/JSON) — harder to generate from JSON-LD
- No rolling restart primitive — would need scripting
- No dependency ordering on startup
- Configuration is more complex than process-compose
- AGPL license
- No TUI

**Config example:**
```
check process harness-ui with pidfile /var/run/harness-ui.pid
  start program = "/usr/local/bin/start-harness-ui.sh"
  stop program = "/usr/local/bin/stop-harness-ui.sh"
  if failed host 127.0.0.1 port 3336 protocol http then restart
  if 5 restarts within 5 cycles then alert
  group harness
```

### 3. supervisord

**What:** Python process supervisor. Very well known, widely used.  
**Version:** 4.3.0

**Strengths:**
- Very mature, huge community knowledge base
- Simple INI config
- supervisorctl for process management
- Event system for custom listeners
- Group operations
- Well-documented

**Weaknesses:**
- No HTTP health checks — only monitors if process is running (PID)
- No dependency ordering
- No readiness probes
- Python dependency (needs Python installed)
- INI config is hard to generate programmatically
- No rolling restart
- Event system is complex and poorly documented

---

## Why NOT the Others

| Tool | Rejection Reason |
|------|-----------------|
| **systemd** | Linux only. Non-starter for macOS. |
| **launchd** | macOS only (fine), but XML plists are painful, no health checks beyond KeepAlive, no dependency ordering, no TUI. Would work as a wrapper FOR process-compose. |
| **pm2** | Node.js ecosystem tool. Can manage non-Node processes but reload/cluster features are Node-specific. Health checks are ecosystem-plugins. Overkill Node dependency for managing Go/Python/Rust. |
| **overmind/hivemind** | Procfile-based — too simple. No health checks, no restart policies, no dependency ordering. Good for dev, not for production supervision. |
| **mprocs** | TUI multiplexer, not a supervisor. No restart policies, no health checks. For interactive dev only. |
| **immortal** | Last meaningful commit 2024. No health checks. YAML config is nice but feature set is too limited. |
| **circus** | Low activity, Python dependency, Mozilla stopped maintaining it. |
| **s6** | Powerful but extremely steep learning curve. Directory-based config is unusual. Better for container init systems than macOS host supervision. |
| **Docker Compose** | Already used for infrastructure. Could containerize the Node services, but adds complexity (volume mounts for source, rebuild on change). Best to keep host services as host processes. |
| **Nix/home-manager** | Nuclear option. Would require adopting Nix ecosystem for everything. Extremely powerful but the learning curve is astronomical for this use case. |
| **Podman** | Adds container overhead for services that are simple Node processes. No advantage over Docker Compose which is already in use. |

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────┐
│  launchd (macOS)                                │
│  └─ Keeps process-compose alive                 │
│     └─ process-compose (YAML config)            │
│        ├─ harness-ui        :3336  (health: HTTP)│
│        ├─ event-logger-ui   :3333  (health: HTTP)│
│        ├─ ops-api           :3334  (health: HTTP)│
│        ├─ web-chat          :3335  (health: HTTP)│
│        └─ ci-runner         :3337  (health: HTTP)│
│                                                  │
│  Docker Compose (unchanged)                      │
│  ├─ redpanda                                     │
│  ├─ garage                                       │
│  ├─ xtdb-primary                                 │
│  ├─ xtdb-replica                                 │
│  ├─ keycloak                                     │
│  ├─ qlever                                       │
│  └─ soft-serve                                   │
└─────────────────────────────────────────────────┘
```

**Self-deploy safety:** launchd keeps process-compose alive. process-compose keeps services alive. Two-layer supervision.

**Rolling restart script:** Use process-compose REST API to restart services one-at-a-time, checking health between each.

**JSON-LD compatibility:** Generate `process-compose.yaml` from JSON-LD config using a simple transformer. YAML is the native format but trivially derivable.

---

## Installation

```bash
brew install process-compose
# or
curl -sL https://raw.githubusercontent.com/F1bonacc1/process-compose/main/scripts/get-pc.sh | bash
```

## Open Questions

1. **Docker Compose integration** — process-compose can also manage `docker compose up` as a daemon process, giving you a single control plane. Worth exploring?
2. **Log aggregation** — process-compose has per-process and unified logging. How does this integrate with your existing event logging?
3. **Config generation** — Do you want a script that reads a JSON-LD service manifest and generates `process-compose.yaml`?
4. **launchd plist** — Need to create a LaunchAgent plist to keep process-compose itself alive across reboots.
