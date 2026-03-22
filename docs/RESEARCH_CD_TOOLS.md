# CD Tool Research — Comprehensive Survey

## Current Setup
- **CI**: Custom runner → Soft Serve git clone → Docker steps → XTDB recording
- **Orchestration**: process-compose (5 host TS services, REST API on :8080)
- **Infrastructure**: Docker Compose (7 containers: Redpanda, XTDB×2, Garage, Keycloak, QLever, Soft Serve)
- **Deploy script**: `scripts/deploy.ts` — git pull → npm install → rolling restart via process-compose API → health check → XTDB record
- **Gaps**: No rollback, no auto-trigger from CI, no deployment history UI

---

## Category 1: Infrastructure as Code (IaC)

| Tool | Language | Binary | macOS | Local-capable | Docker | Host Processes | Complexity | Stars | Status |
|------|----------|--------|-------|---------------|--------|----------------|------------|-------|--------|
| **OpenTofu** | Go | ✅ | ✅ | ⚠️ Designed for cloud providers | ✅ (docker provider) | ❌ No native concept | High — HCL, state files, providers | 24K+ | Active (CNCF) |
| **Terraform** | Go | ✅ | ✅ | ⚠️ Same as OpenTofu | ✅ (docker provider) | ❌ | High | 43K+ | Active (BSL) |
| **Pulumi** | Go + TS/Py/Go SDKs | ✅ | ✅ | ⚠️ Cloud-first | ✅ (docker provider) | ❌ | Medium-High — real code, state management | 22K+ | Active |
| **Ansible** | Python | ❌ (pip) | ✅ | ✅ localhost target | ✅ (docker modules) | ✅ (systemd, shell, service modules) | Medium — YAML playbooks | 64K+ | Active (Red Hat) |
| **SaltStack** | Python | ❌ (pip) | ⚠️ | ✅ salt-call local | ✅ | ✅ | High — master/minion or masterless | 14K+ | Active |
| **mgmt** | Go | ✅ | ⚠️ Linux-focused | ✅ | ⚠️ | ⚠️ | High — reactive graph model | 3.5K | Slow development |
| **CDKTF** | TS/Py | ❌ (npm) | ✅ | ⚠️ Cloud-first | ✅ | ❌ | High — wraps Terraform | 5K+ | Active |

**Assessment**: OpenTofu/Terraform are excellent for cloud infrastructure but awkward for "restart a host process." They manage resource lifecycle (create/update/destroy), not deployment workflows. You'd need the docker provider for containers but there's no "process-compose process" provider. **Ansible** is the standout here — it's designed exactly for "run these steps on this host," handles both Docker and host services, and works locally with `ansible-playbook -c local`.

**Pulumi** is interesting because you already write TypeScript. You could define your infrastructure in `.ts` files. But it's still cloud-first — managing a process-compose restart via Pulumi is like using a crane to hang a picture.

## Category 2: Configuration Management

| Tool | Language | Agent | macOS | Fit for Deploy | Complexity | Stars | Status |
|------|----------|-------|-------|----------------|------------|-------|--------|
| **Puppet** | Ruby | Yes (daemon) | ⚠️ | ❌ Config drift, not deploy | Very High — DSL, agent, server | 7.5K | Active (Perforce) |
| **Chef** | Ruby | Yes (client) | ⚠️ | ❌ Convergence model | Very High — cookbooks, knife | 7.5K | Active (Progress) |
| **CFEngine** | C | Yes (daemon) | ⚠️ | ❌ Promise theory | Very High | 500 | Active but niche |

**Assessment**: Configuration management tools (Puppet, Chef, CFEngine) solve a different problem: "ensure this server stays in desired state." They run continuously, detecting and fixing drift. They're designed for fleets of servers, not single-host app deploys. Massive overkill — you'd spend more time configuring Chef than writing deploy.ts.

## Category 3: Container/App Deployment Platforms

| Tool | Language | Type | macOS | Docker-only | Git Push | Rollback | Complexity | Stars | Status |
|------|----------|------|-------|-------------|----------|----------|------------|-------|--------|
| **Kamal** | Ruby | SSH + Docker | ✅ | Yes (containers) | ❌ | ✅ | Medium — deploy.yml | 12K+ | Active (37signals) |
| **Dokku** | Shell | Mini-PaaS | ❌ Linux | Yes | ✅ | ✅ | Low | 29K+ | Active |
| **CapRover** | Node | PaaS | ❌ Linux | Yes | ✅ | ✅ | Medium | 13K+ | Active |
| **Coolify** | PHP | PaaS | ❌ Linux | Yes | ✅ | ✅ | Medium | 35K+ | Very Active |
| **Piku** | Python | Git-push deploy | ✅ | No (uwsgi/systemd) | ✅ | ✅ (git) | Low | 5.5K+ | Active |

**Assessment**: These are PaaS platforms — they want to own your entire runtime. Dokku/CapRover/Coolify are Linux-only. **Kamal** is macOS-compatible but forces Docker containers for your app services (you'd need to containerize). **Piku** is interesting — it's git-push deploy with systemd, very minimal. But it's Linux/systemd-focused and wouldn't work with process-compose.

## Category 4: Task Runners / Deploy Automation

| Tool | Language | Binary | macOS | Deploy-specific | Complexity | Stars | Status |
|------|----------|--------|-------|-----------------|------------|-------|--------|
| **Ansible** | Python | ❌ | ✅ | ✅ Playbooks | Medium | 64K | Active |
| **Fabric** | Python | ❌ | ✅ | ⚠️ SSH tasks | Low | 15K | Active |
| **Capistrano** | Ruby | ❌ | ✅ | ✅ Release dirs | Medium | 13K | Maintenance |
| **Mina** | Ruby | ❌ | ✅ | ✅ Single SSH | Low | 4.4K | Maintenance |
| **Just** | Rust | ✅ | ✅ | ❌ Command runner | Very Low | 22K+ | Very Active |
| **Task** | Go | ✅ | ✅ | ❌ Command runner | Very Low | 12K+ | Very Active |
| **Earthly** | Go | ✅ | ✅ | ⚠️ Build+deploy | Medium | 11K+ | Active |
| **Dagger** | Go | ✅ | ✅ | ✅ Pipelines | Medium-High | 12K+ | Very Active |
| **sup** | Go | ✅ | ✅ | ✅ SSH deploy | Very Low | 2.5K | Unmaintained |

**Assessment**: **Just** and **Task** are modern Make replacements — they run commands, nothing more. Good for organizing scripts but don't add deployment intelligence. **Dagger** is the most interesting here — it runs pipelines in containers with a TypeScript SDK. But it would replace your CI runner, not complement it. **Earthly** combines Dockerfiles + Makefiles — powerful for builds but not for service restarts. **Ansible** keeps appearing as the most versatile.

## Category 5: GitOps / Declarative CD

| Tool | K8s Required | Single Host | Notes |
|------|-------------|-------------|-------|
| **FluxCD** | ✅ Yes | ❌ | K8s-only GitOps operator |
| **ArgoCD** | ✅ Yes | ❌ | K8s-only, beautiful UI |
| **Helmfile** | ✅ Yes | ❌ | Helm chart orchestrator |
| **Kustomize** | ✅ Yes | ❌ | K8s manifest patching |

**Assessment**: All K8s-only. Not applicable.

## Category 6: CD Platforms / Servers

| Tool | Language | Self-hosted | macOS | Complexity | Deploy Features | Stars | Status |
|------|----------|-------------|-------|------------|-----------------|-------|--------|
| **GoCD** | Java | ✅ | ✅ | High — server + agents | Pipelines, value streams | 7K+ | Active (ThoughtWorks) |
| **Concourse** | Go | ✅ | ⚠️ Docker | High — workers, web, db | Pipelines, resources | 7.5K | Active |
| **Woodpecker** | Go | ✅ | ⚠️ Docker | Medium | Pipelines | 4.5K+ | Active |
| **Rundeck** | Java | ✅ | ✅ | Medium — web UI | Job scheduling, deployment workflows | 5.5K | Active (PagerDuty) |
| **StackStorm** | Python | ✅ | ❌ Linux | Very High | Event-driven automation | 6K | Active |
| **Spinnaker** | Java | ✅ | ⚠️ | Extremely High | Multi-cloud CD, canary | 9.5K | Active (Netflix) |
| **Octopus** | .NET | ✅ | ❌ Windows/Linux | High | Release management | N/A | Commercial |
| **Laminar** | C++ | ✅ | ⚠️ Linux | Very Low | Minimal CI/CD | 300 | Low activity |

**Assessment**: These are full CD platforms — they need servers, databases, agents. **Rundeck** is the most interesting for your use case: it's a job scheduler with a web UI that can run deployment workflows. But it requires Java and a PostgreSQL database. **GoCD** has excellent pipeline visualization but is heavy. All of these are designed for teams, not solo developers managing 5 services.

## Category 7: Lightweight / Modern / Single-Binary

| Tool | Language | Binary | macOS | Focus | Stars | Status |
|------|----------|--------|-------|-------|-------|--------|
| **Just** | Rust | ✅ | ✅ | Command runner | 22K+ | Very Active |
| **Task** | Go | ✅ | ✅ | Task runner | 12K+ | Very Active |
| **Dagger** | Go | ✅ | ✅ | CI/CD pipelines in containers | 12K+ | Very Active |
| **Hurl** | Rust | ✅ | ✅ | HTTP testing (deploy checks) | 13K+ | Very Active |
| **sup** | Go | ✅ | ✅ | SSH deploy | 2.5K | Unmaintained (2019) |
| **deploy-rs** | Rust | ✅ | ⚠️ | NixOS deploys | 1.2K | Active |

**Assessment**: No single-binary tool exists that does exactly "rolling restart host processes with health checks and rollback." The closest are **Just** or **Task** as script organizers, but they don't add deployment logic.

---

## Comparison Matrix: Top Contenders

| Criterion | Ansible | Pulumi | OpenTofu | Kamal | Dagger | Just/Task | Custom (deploy.ts) |
|-----------|---------|--------|----------|-------|--------|-----------|---------------------|
| macOS native | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Single binary | ❌ (Python) | ✅ | ✅ | ❌ (Ruby) | ✅ | ✅ | ❌ (Node) |
| Manage Docker | ✅ | ✅ | ✅ | ✅ | ✅ | Via scripts | Via scripts |
| Manage host processes | ✅ | ❌ | ❌ | ❌ | ❌ | Via scripts | ✅ |
| Rolling deploy | ✅ (serial) | ❌ | ❌ | ✅ | Via pipeline | Via scripts | ✅ |
| Rollback | ✅ (handlers) | ✅ (state) | ✅ (state) | ✅ | Via pipeline | Manual | ❌ (need to add) |
| Health checks | ✅ (wait_for) | ❌ | ❌ | ✅ | Via pipeline | Manual | ✅ |
| Deploy history | ❌ | ✅ (state) | ✅ (state) | ❌ | ❌ | ❌ | ⚠️ (partial) |
| Process-compose integration | ✅ (uri module) | ❌ | ❌ | ❌ | ❌ | Via scripts | ✅ (native) |
| Learning curve | Medium | High | High | Medium | Medium | Very Low | Zero |
| Adds over deploy.ts | Idempotency, handlers, inventory | State management | State management | Docker deploy workflow | Container pipelines | Script organization | N/A |

---

## Final Assessment

### Tier 1: Actually Fit Your Use Case

1. **Ansible** — The only established tool that naturally handles both Docker containers and host processes on localhost. YAML playbooks, `ansible-playbook -c local`, modules for docker, uri (HTTP calls to process-compose), shell, template. Has handlers for rollback. No agent needed. The downside: Python dependency, YAML playbooks are verbose.

2. **Custom deploy.ts + process-compose** — What you have. Needs ~50 lines for rollback + deploy lock. Already integrates perfectly with your stack. Zero new dependencies.

### Tier 2: Interesting but Require Architectural Change

3. **Kamal** — If you containerize your 5 app services, Kamal becomes a great fit (Docker-native, rolling deploys, rollback, zero-downtime). But that's a big architectural change.

4. **Pulumi** — If you want to define everything (Docker Compose infra + services) as TypeScript code with state tracking. Powerful but heavyweight for 5 services.

5. **Dagger** — If you want to replace your CI runner AND add CD in one tool. TypeScript SDK, container-based. But replaces, doesn't complement.

### Tier 3: Overkill / Wrong Fit

6. **OpenTofu/Terraform** — Cloud IaC, not deployment orchestration
7. **Puppet/Chef** — Configuration drift management for server fleets
8. **GoCD/Rundeck/Spinnaker** — Full CD platforms requiring servers
9. **Dokku/CapRover/Coolify** — Linux-only PaaS platforms
10. **FluxCD/ArgoCD** — Kubernetes-only GitOps

---

## Open Questions

1. **Ansible vs enhanced deploy.ts?** Ansible adds idempotency, error handlers, and is battle-tested. But it's a Python dependency and YAML verbosity for what's currently a 150-line script.

2. **Containerize app services?** If yes → Kamal becomes viable and you get zero-downtime deploys for free. If no → Ansible or custom script.

3. **How complex will deploys get?** If it stays at 5 services on 1 host, deploy.ts is fine. If you add more hosts or services, Ansible scales better.

4. **Do you value the IaC approach?** OpenTofu/Pulumi would let you define your entire infrastructure declaratively (Docker Compose services, process-compose config, etc.) but that's a paradigm shift.
