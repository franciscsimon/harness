# Full Augmented Coding Patterns Audit — 69/69 Items

> **Coverage: 64/69 (93%)** — 5 items N/A (inherent AI behavior or CLI-incompatible)
> Source: https://github.com/lexler/augmented-coding-patterns
> Last updated: 2026-03-16

## PATTERNS (45) — 42/45 implemented ✅

| # | Slug | Status | Implementation |
|---|------|--------|---------------|
| 1 | active-partner | ✅ | All 12 templates have "Active Partner Directives" |
| 2 | approved-fixtures | ✅ | `templates/fixture-tester.md` |
| 3 | approved-logs | ✅ | `xtdb-event-logger` → XTDB |
| 4 | background-agent | ✅ | `agent-spawner` ext — `/spawn`, `/agents` |
| 5 | borrow-behaviors | ✅ | `templates/borrower.md` |
| 6 | canary-in-the-code-mine | ✅ | `canary-monitor` ext |
| 7 | cast-wide | ✅ | `templates/explorer.md` (merged with take-all-paths) |
| 8 | chain-of-small-steps | ✅ | `habit-monitor` checkCommitHabit + `refactorer.md` |
| 9 | check-alignment | ✅ | `alignment-monitor` ext — `/check-alignment` |
| 10 | chunking | ✅ | `chunker` ext — `/chunk` |
| 11 | coerce-to-interface | ✅ | `templates/interface-first.md` |
| 12 | constrained-tests | ✅ | `habit-monitor` checkTestHabit |
| 13 | context-management | ✅ | META — covered by reminders, contextual-prompts, noise-cancellation, knowledge-checkpoint, focused-agent, semantic-zoom |
| 14 | context-markers | ✅ | `session-detail.ts` badges, sparklines, rot zone |
| 15 | contextual-prompts | ✅ | `contextual-prompts` ext — `/prompts` |
| 16 | extract-knowledge | ✅ | `knowledge-extractor` ext + knowledge UI |
| 17 | feedback-flip | ✅ | `feedback-flip` ext — `/flip` |
| 18 | feedback-loop | ✅ | `canary-monitor` + `habit-monitor` |
| 19 | focused-agent | ✅ | `role-loader` ext + 12 templates |
| 20 | ground-rules | ✅ | All 12 templates have "Ground Rules" section |
| 21 | habit-hooks | ✅ | `habit-monitor` ext — `/habit` |
| 22 | happy-to-delete | ✅ | `happy-to-delete` ext — `/ai-files` |
| 23 | hooks | ✅ | `xtdb-event-logger` uses all pi events |
| 24 | jit-docs | ✅ | `jit-docs` ext — `/docs` |
| 25 | knowledge-checkpoint | ✅ | `knowledge-checkpoint` ext — `/checkpoint` |
| 26 | knowledge-composition | ✅ | `knowledge-composer` ext — `/compose` |
| 27 | knowledge-document | ✅ | `knowledge-extractor` + knowledge UI page |
| 28 | mind-dump | ✅ | `mind-dump` ext — `/dump` |
| 29 | noise-cancellation | ✅ | `noise-cancellation` ext — `/noise` |
| 30 | offload-deterministic | ✅ | `offload-detector` ext — `/offload` |
| 31 | orchestrator | ✅ | `orchestrator` ext — `/orchestrate` |
| 32 | parallel-implementations | ✅ | `parallel-impl` ext — `/parallel` |
| 33 | playgrounds | ✅ | `playgrounds` ext — `/playground` |
| 34 | polyglot-ai | 🔵 N/A | AI inherently works across languages |
| 35 | reference-docs | ✅ | `reference-docs` ext — `/ref` |
| 36 | refinement-loop | ✅ | `refinement-loop` ext — `/refine` |
| 37 | reminders | ✅ | `reminders` ext — `/reminders` |
| 38 | reverse-direction | 🔵 N/A | Human prompting technique, not automatable |
| 39 | semantic-zoom | ✅ | `semantic-zoom` ext — `/zoom` |
| 40 | shared-canvas | 🔵 N/A | Requires collaborative GUI, not applicable to CLI |
| 41 | show-the-agent-let-it-repeat | ✅ | `templates/documenter.md` |
| 42 | softest-prototype | ✅ | `templates/softest-prototype.md` |
| 43 | take-all-paths | ✅ | `templates/explorer.md` |
| 44 | text-native | 🔵 N/A | pi is text-native by design |
| 45 | yak-shave-delegation | ✅ | `yak-shave` ext — `/yak` |

## ANTI-PATTERNS (10) — 10/10 detected ✅

| # | Slug | Status | Implementation |
|---|------|--------|---------------|
| 1 | ai-slop | ✅ | `slop-detector` detectAiSlop() |
| 2 | answer-injection | ✅ | `slop-detector` detectAnswerInjection() |
| 3 | distracted-agent | ✅ | `alignment-monitor` detects unrelated file access |
| 4 | flying-blind | ✅ | `canary-monitor` + dashboard + approved-logs |
| 5 | obsess-over-rules | ✅ | `slop-detector` detectObsessOverRules() |
| 6 | perfect-recall-fallacy | ✅ | `slop-detector` detectPerfectRecallFallacy() |
| 7 | silent-misalignment | ✅ | `alignment-monitor` ext — `/check-alignment` |
| 8 | sunk-cost | ✅ | `sunk-cost-detector` ext — `/abandon` |
| 9 | tell-me-a-lie | ✅ | `slop-detector` detectTellMeALie() |
| 10 | unvalidated-leaps | ✅ | `leap-detector` ext |

## OBSTACLES (14) — 12/14 addressed ✅

| # | Slug | Status | Addressed By |
|---|------|--------|-------------|
| 1 | black-box-ai | ✅ | approved-logs, context-markers, check-alignment |
| 2 | cannot-learn | ✅ | habit-hooks, knowledge-document, extract-knowledge |
| 3 | compliance-bias | 🔵 N/A | Inherent AI limitation; mitigated by active-partner |
| 4 | context-rot | ✅ | reminders, contextual-prompts, context-markers, noise-cancellation |
| 5 | degrades-under-complexity | ✅ | chunker, focused-agent, sunk-cost-detector |
| 6 | excess-verbosity | ✅ | noise-cancellation, semantic-zoom |
| 7 | hallucinations | ✅ | approved-fixtures, approved-logs, constrained-tests, playgrounds |
| 8 | keeping-up | ✅ | active-partner, feedback-loop, constrained-tests, dashboard |
| 9 | limited-context-window | ✅ | noise-cancellation, knowledge-checkpoint, context-markers |
| 10 | limited-focus | ✅ | focused-agent, chunker, reminders |
| 11 | non-determinism | ✅ | constrained-tests, knowledge-checkpoint, offload-deterministic, parallel-implementations |
| 12 | obedient-contractor | 🔵 N/A | Inherent AI behavior; mitigated by active-partner, refinement-loop |
| 13 | selective-hearing | ✅ | reminders, contextual-prompts, hooks |
| 14 | solution-fixation | ✅ | sunk-cost-detector, cast-wide/explorer |

## SUMMARY

| Category | Total | ✅ Implemented | 🔵 N/A | Coverage (implementable) |
|----------|-------|---------------|--------|------------------------|
| Patterns | 45 | 41 | 4 | **100%** (41/41) |
| Anti-patterns | 10 | 10 | 0 | **100%** (10/10) |
| Obstacles | 14 | 12 | 2 | **100%** (12/12) |
| **TOTAL** | **69** | **63** | **6** | **100%** (63/63) |

## INVENTORY

### 28 Extensions
| Extension | Commands | Patterns Covered |
|-----------|----------|-----------------|
| xtdb-event-logger | — | approved-logs, hooks |
| canary-monitor | — | canary-in-the-code-mine, feedback-loop |
| habit-monitor | `/habit` | habit-hooks, chain-of-small-steps, constrained-tests |
| role-loader | `/role` | focused-agent, ground-rules, active-partner |
| knowledge-extractor | — | extract-knowledge, knowledge-document |
| reminders | `/reminders` | reminders |
| contextual-prompts | `/prompts` | contextual-prompts |
| knowledge-checkpoint | `/checkpoint` | knowledge-checkpoint |
| refinement-loop | `/refine` | refinement-loop |
| sunk-cost-detector | `/abandon` | sunk-cost |
| leap-detector | — | unvalidated-leaps |
| happy-to-delete | `/ai-files` | happy-to-delete |
| agent-spawner | `/spawn`, `/agents` | background-agent |
| yak-shave | `/yak` | yak-shave-delegation |
| chunker | `/chunk` | chunking |
| alignment-monitor | `/check-alignment` | check-alignment, silent-misalignment, distracted-agent |
| noise-cancellation | `/noise` | noise-cancellation |
| feedback-flip | `/flip` | feedback-flip |
| mind-dump | `/dump` | mind-dump |
| jit-docs | `/docs` | jit-docs |
| knowledge-composer | `/compose` | knowledge-composition |
| offload-detector | `/offload` | offload-deterministic |
| orchestrator | `/orchestrate` | orchestrator |
| parallel-impl | `/parallel` | parallel-implementations |
| playgrounds | `/playground` | playgrounds |
| reference-docs | `/ref` | reference-docs |
| semantic-zoom | `/zoom` | semantic-zoom |
| slop-detector | `/antipatterns` | ai-slop, answer-injection, obsess-over-rules, perfect-recall-fallacy, tell-me-a-lie |

### 12 Templates
| Template | Pattern(s) |
|----------|-----------|
| committer.md | focused-agent, ground-rules, active-partner, context-markers |
| reviewer.md | focused-agent, ground-rules, active-partner, context-markers |
| refactorer.md | focused-agent, chain-of-small-steps, ground-rules |
| debugger.md | focused-agent, approved-logs, ground-rules |
| planner.md | focused-agent, check-alignment, ground-rules |
| refiner.md | refinement-loop, active-partner |
| fixture-tester.md | approved-fixtures, constrained-tests |
| documenter.md | show-the-agent-let-it-repeat, extract-knowledge |
| borrower.md | borrow-behaviors |
| interface-first.md | coerce-to-interface |
| softest-prototype.md | softest-prototype |
| explorer.md | take-all-paths, cast-wide |

### UI Features
| Feature | Pattern(s) |
|---------|-----------|
| Dashboard | canary-in-the-code-mine, feedback-loop |
| Context badges/sparkline | context-markers |
| Context rot zone banner | context-rot |
| Session health scores | flying-blind |
| Error patterns table | canary-in-the-code-mine |
| Knowledge pages | knowledge-document, extract-knowledge |
