# Full Augmented Coding Patterns Audit — 69/69 Items

## PATTERNS (45)

| # | Slug | Implemented? | How / Where | Notes |
|---|------|-------------|-------------|-------|
| 1 | active-partner | ✅ | All 8 templates have "Active Partner Directives" section | |
| 2 | approved-fixtures | ✅ | `templates/fixture-tester.md` | |
| 3 | approved-logs | ✅ | `xtdb-event-logger` captures all events → XTDB | |
| 4 | background-agent | ✅ | `agent-spawner` extension, `/spawn`, `/agents` | |
| 5 | borrow-behaviors | ❌ MISSING | — | Implementable: template or `/borrow` command |
| 6 | canary-in-the-code-mine | ✅ | `canary-monitor` extension | |
| 7 | cast-wide | ❌ MISSING | — | Implementable: extension to generate N approaches |
| 8 | chain-of-small-steps | ✅ | `habit-monitor` checkCommitHabit, refactorer template | |
| 9 | check-alignment | ✅ | `alignment-monitor` extension, `/check-alignment` | |
| 10 | chunking | ✅ | `chunker` extension, `/chunk` | |
| 11 | coerce-to-interface | ❌ MISSING | — | Implementable: template "define interface first" |
| 12 | constrained-tests | ✅ | `habit-monitor` checkTestHabit | |
| 13 | context-management | ✅ | META pattern — covered by: reminders, contextual-prompts, noise-cancellation, knowledge-checkpoint, focused-agent, semantic-zoom, context-markers | Composite |
| 14 | context-markers | ✅ | `session-detail.ts` badges, sparklines, rot zone banner | |
| 15 | contextual-prompts | ✅ | `contextual-prompts` extension, `/prompts` | |
| 16 | extract-knowledge | ✅ | `knowledge-extractor` extension + `lib/knowledge.ts` | |
| 17 | feedback-flip | ❌ MISSING | — | Implementable: `/flip` command or template |
| 18 | feedback-loop | ✅ | `canary-monitor` + `habit-monitor` continuous feedback | |
| 19 | focused-agent | ✅ | `role-loader` + 8 templates | |
| 20 | ground-rules | ✅ | All 8 templates have "Ground Rules" section | |
| 21 | habit-hooks | ✅ | `habit-monitor` extension, `/habit` | |
| 22 | happy-to-delete | ✅ | `happy-to-delete` extension, `/ai-files` | |
| 23 | hooks | ✅ | `xtdb-event-logger` uses all pi events | |
| 24 | jit-docs | ❌ MISSING | — | Implementable: extension to auto-generate docs on demand |
| 25 | knowledge-checkpoint | ✅ | `knowledge-checkpoint` extension, `/checkpoint` | |
| 26 | knowledge-composition | ❌ MISSING | — | P13 in V2 plan, never built |
| 27 | knowledge-document | ✅ | `knowledge-extractor` + knowledge UI page | |
| 28 | mind-dump | ❌ MISSING | — | Implementable: `/dump` command |
| 29 | noise-cancellation | ✅ | `noise-cancellation` extension, `/noise` | |
| 30 | offload-deterministic | ❌ MISSING | — | Implementable: extension to route tasks to scripts |
| 31 | orchestrator | ❌ MISSING | — | Implementable: builds on agent-spawner |
| 32 | parallel-implementations | ❌ MISSING | — | Implementable: spawn N agents for same task |
| 33 | playgrounds | ❌ MISSING | — | Implementable: isolated temp dir sandbox |
| 34 | polyglot-ai | 🔵 INHERENT | — | AI already works across languages; no tooling needed |
| 35 | reference-docs | ❌ MISSING | — | Implementable: auto-inject relevant docs into context |
| 36 | refinement-loop | ✅ | `refinement-loop` extension, `/refine` | |
| 37 | reminders | ✅ | `reminders` extension, `/reminders` | |
| 38 | reverse-direction | 🔵 HUMAN | — | Prompting technique; not automatable |
| 39 | semantic-zoom | ❌ MISSING | — | Implementable: UI multi-level detail |
| 40 | shared-canvas | 🔵 N/A | — | Requires collaborative GUI; not applicable to CLI agent |
| 41 | show-the-agent-let-it-repeat | ✅ | `templates/documenter.md` | |
| 42 | softest-prototype | ❌ MISSING | — | Implementable: template "start with simplest" |
| 43 | take-all-paths | ❌ MISSING | — | Implementable: template/extension |
| 44 | text-native | 🔵 INHERENT | — | pi is already text-native by nature |
| 45 | yak-shave-delegation | ✅ | `yak-shave` extension, `/yak` | |

## ANTI-PATTERNS (10)

| # | Slug | Detected? | How / Where | Notes |
|---|------|-----------|-------------|-------|
| 1 | ai-slop | ❌ MISSING | — | Implementable: detect large uncommented/untested output |
| 2 | answer-injection | ❌ MISSING | — | Implementable: detect leading questions in prompts |
| 3 | distracted-agent | ✅ | `alignment-monitor` detects unrelated file access | |
| 4 | flying-blind | ✅ | `canary-monitor` + dashboard + approved-logs | |
| 5 | obsess-over-rules | ❌ MISSING | — | Implementable: warn when too many rules in context |
| 6 | perfect-recall-fallacy | ❌ MISSING | — | Implementable: warn about stale context references |
| 7 | silent-misalignment | ✅ | `alignment-monitor` extension | |
| 8 | sunk-cost | ✅ | `sunk-cost-detector` extension, `/abandon` | |
| 9 | tell-me-a-lie | ❌ MISSING | — | Hard to automate; prompting discipline |
| 10 | unvalidated-leaps | ✅ | `leap-detector` extension | |

## OBSTACLES (14)

| # | Slug | Addressed? | By Which Pattern(s) | Notes |
|---|------|-----------|---------------------|-------|
| 1 | black-box-ai | ✅ | approved-logs, context-markers, check-alignment | |
| 2 | cannot-learn | ✅ | habit-hooks, knowledge-document, extract-knowledge | |
| 3 | compliance-bias | 🔵 INHERENT | — | Inherent AI limitation; mitigated by active-partner templates |
| 4 | context-rot | ✅ | reminders, contextual-prompts, context-markers, noise-cancellation | |
| 5 | degrades-under-complexity | ✅ | chunker, focused-agent, sunk-cost-detector | |
| 6 | excess-verbosity | ✅ | noise-cancellation | semantic-zoom would add more |
| 7 | hallucinations | ✅ | approved-fixtures, approved-logs, constrained-tests | |
| 8 | keeping-up | ✅ | active-partner, feedback-loop, constrained-tests, dashboard | |
| 9 | limited-context-window | ✅ | noise-cancellation, knowledge-checkpoint, context-markers | |
| 10 | limited-focus | ✅ | focused-agent, chunker, reminders | |
| 11 | non-determinism | ⚠️ PARTIAL | constrained-tests, knowledge-checkpoint | offload-deterministic, parallel-implementations would add more |
| 12 | obedient-contractor | 🔵 INHERENT | — | Inherent AI behavior; mitigated by active-partner, refinement-loop |
| 13 | selective-hearing | ✅ | reminders, contextual-prompts, hooks | |
| 14 | solution-fixation | ✅ | sunk-cost-detector | |

## SUMMARY

| Category | Total | ✅ Implemented | ❌ Missing (implementable) | 🔵 Not applicable |
|----------|-------|---------------|--------------------------|-------------------|
| Patterns | 45 | 27 | 15 | 3 |
| Anti-patterns | 10 | 5 | 5 | 0 |
| Obstacles | 14 | 12 | 0 | 2 |
| **TOTAL** | **69** | **44** | **20** | **5** |

Coverage: 44/69 = 64% (or 44/64 implementable = 69%)

## 20 MISSING IMPLEMENTABLE ITEMS

### Patterns (15):
1. **borrow-behaviors** — Template: grab patterns from other codebases
2. **cast-wide** — Extension: generate multiple options, select best
3. **coerce-to-interface** — Template: define interface before implementing
4. **feedback-flip** — Command/template: ask AI to critique YOUR approach
5. **jit-docs** — Extension: generate docs just-in-time
6. **knowledge-composition** — Extension+UI: compose multiple knowledge docs
7. **mind-dump** — Command: dump everything known about task upfront
8. **offload-deterministic** — Extension: route deterministic tasks to scripts
9. **orchestrator** — Extension: one agent coordinates others
10. **parallel-implementations** — Extension: try N approaches in parallel
11. **playgrounds** — Extension: isolated sandbox environments
12. **reference-docs** — Extension: auto-inject relevant docs into context
13. **semantic-zoom** — UI: multi-level detail views
14. **softest-prototype** — Template: start with simplest prototype
15. **take-all-paths** — Template/extension: explore all solution paths

### Anti-patterns (5):
16. **ai-slop** — Extension: detect low-quality unreviewed output
17. **answer-injection** — Extension: detect leading/forcing prompts
18. **obsess-over-rules** — Extension: warn when context has too many rules
19. **perfect-recall-fallacy** — Extension: warn about stale context
20. **tell-me-a-lie** — Extension: detect impossible constraints
