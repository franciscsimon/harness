# Temporal Integration — Remaining Gaps

Machine-verified audit of what's missing or broken.

---

## A. Broken / Must Fix (7 items)

- [ ] **`@temporalio/client` missing from root `package.json`** — All 3 extensions (`agent-spawner`, `workflow-engine`, `orchestrator`) do `import("@temporalio/client")` but it's only in `temporal-worker/package.json`, not the root. Extensions run in the pi process which uses root deps.
- [ ] **`temporal-worker/.dockerignore` missing** — Docker build copies `node_modules/` into the image. Needs `.dockerignore` with `node_modules`, `dist`, `*.md`.
- [ ] **OTEL Collector healthcheck endpoint not configured** — `docker-compose.yml` checks `:13133` but the collector config doesn't define a `health_check` extension. Healthcheck will always fail.
- [ ] **`/orchestrate` commands don't use `temporalClient`** — `temporalClient` is connected on `session_start` but the `/orchestrate` command handler still uses the old in-memory `tasks[]` array. Needs dual-mode: Temporal when available, local fallback.
- [ ] **`/workflow start` command doesn't start Temporal workflow** — Same issue: `temporalClient` is connected but `/workflow start` still uses local `state` object. Needs to call `temporalClient.workflow.start("agentWorkflow", ...)`.
- [ ] **`before_agent_start` in workflow-engine doesn't query Temporal** — Per the architecture doc, it should query `currentStep` from Temporal when `temporalWorkflowId` is set. Currently only reads local `state`.
- [ ] **CI pipeline: `DEFAULT_STEPS` hardcoded, no `.ci.jsonld` resolution** — The `ci-pipeline.ts` workflow has a TODO comment but no activity to resolve pipeline steps from the repo's `.ci.jsonld` file.

## B. Missing Files (3 items)

- [ ] **`temporal-worker/src/activities/workflow-loader.ts`** — Referenced in barrel comment. Needs: parse JSON-LD workflow definitions, return `WorkflowStep[]`. Used by `agentWorkflow` to load steps from file.
- [ ] **`temporal-worker/.dockerignore`** — Standard Node.js dockerignore.
- [ ] **`observability/otel-collector-config.yaml` health_check extension** — Add `health_check` extension block so `:13133` responds.

## C. Incomplete Wiring (4 items)

- [ ] **`Prometheus remote_write_receiver`** — `prometheus.yaml` has `remote_write_receiver: enabled: true` but this is not valid Prometheus config syntax. Should be `--web.enable-remote-write-receiver` flag (already in docker-compose `command`) and the `remote_write_receiver` key removed from YAML.
- [ ] **`orchestrator/index.ts` `activeOrchWorkflowId` never written** — Connected and restored from `appendEntry` but `/orchestrate plan` never calls `pi.appendEntry("orchestrator-temporal", { workflowId })`.
- [ ] **`workflow-engine/index.ts` `temporalWorkflowId` never written** — Same: restored from `appendEntry` but `/workflow start` never writes it.
- [ ] **Two unused types in `shared/types.ts`** — `CIStepDef` and `OrchestrationInput` are exported but never used. Minor, but should be either used or removed.

## D. Nice-to-Have (3 items)

- [ ] **Grafana dashboards don't provision on first boot** — Dashboard JSON files are mounted but the provisioning YAML `path` must match the mount path. Verify `/var/lib/grafana/dashboards` matches.
- [ ] **No `task temporal:up` / `task temporal:down`** — Taskfile.yml has no targets for starting/stopping just the Temporal + OTEL stack.
- [ ] **No QUICKSTART section for Temporal** — `QUICKSTART.md` doesn't mention Temporal setup, `docker compose up temporal temporal-db temporal-ui temporal-worker`, or Grafana at `:3001`.

---

**Summary: 7 broken, 3 missing files, 4 incomplete wiring, 3 nice-to-have = 17 total items.**
