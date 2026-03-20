# TODO: Per-Project Sub-Pages in Harness UI

## Problem
The old xtdb-event-logger-ui spec called for separate routes per data type:
- `/projects/:id/requirements`
- `/projects/:id/releases`
- `/projects/:id/deployments`
- `/projects/:id/tests`
- `/projects/:id/incidents`
- `/projects/:id/workflows`

Currently all project data is on a single `/projects/:id` page.

## Current state
The project detail page (`harness-ui/pages/projects.ts`) already shows:
- Project info (ID, name, type, git, phase, timestamps)
- Sessions list
- Tags
- Dependencies
- Lifecycle events
- Decommission records
- JSON-LD

Missing from the page: requirements, releases, deployments, test runs, incidents, workflows.

## Question for user
The current single-page approach works for small projects. Two options:

**Option A: Add missing data to existing page**
Add requirements, releases, deployments, incidents, and workflows sections to the existing `/projects/:id` page. Each as a collapsible section. No new routes.

**Option B: Tab-based sub-pages**
Keep a project overview page at `/projects/:id`, add tab navigation to sub-pages. More structured but more pages to build and maintain.

Which approach do you prefer?

## Effort: Large (3+ hours for full sub-pages, ~1 hour for adding sections to existing page)
