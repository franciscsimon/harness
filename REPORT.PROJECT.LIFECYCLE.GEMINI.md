# Project Lifecycle Management: Gap Analysis & Review Report

## 1. Executive Summary
The `PROJECT_LIFECYCLE_PROPOSAL.md` outlines a comprehensive strategy for managing the full lifecycle of applications within the harness—from requirements gathering through development, deployment, maintenance, and decommissioning. The core of this strategy revolves around extending the existing **JSON-LD Vocabulary & Ontology** to natively support lifecycle events using established standards (`prov:`, `schema:`, `doap:`) alongside the introduction of new custom namespaces (`req:`, `deploy:`, `ops:`).

While the infrastructure and data layers (XTDB cluster, event logging, backups, project registry) are robust and currently in production, the document identifies several critical architectural gaps in modeling requirements, deployment states, operations, and decommissioning phases.

## 2. Proposed Ontology & Vocabulary Enhancements
The proposal effectively leverages existing W3C and community ontologies to avoid reinventing the wheel:
- **Core Namespace Additions**: Three new namespaces are introduced:
  1. `req:` (`https://pi.dev/requirements/`)
  2. `deploy:` (`https://pi.dev/deployments/`)
  3. `ops:` (`https://pi.dev/ops/`)

The design enforces a strict rule to rely on standard ontology classes (e.g., `schema:CreativeWork` for requirements, `schema:DeployAction` for deployments, `doap:Version` for releases) while restricting custom (`ev:`, `req:`, `deploy:`, and `ops:`) prefixes to specific, domain-unique predicates. This ensures high interoperability, forming a cohesive **Provenance Graph** where all entities are dynamically linked via `@id` references.

## 3. Key Identified Gaps & Entity Models
The analysis uncovers major missing components, elegantly mapped to rigorous JSON-LD structures:

1. **Requirements Management (🔴 High Priority)**
   - **Identified Gaps**: Absence of a native store for requirements and their traceability links.
   - **Proposed Model**: Establish new `requirements` (`schema:CreativeWork`) and `requirement_links` (`prov:Influence`) tables to map requirements directly to decisions and artifacts.

2. **Project Lifecycle State (🔴 High Priority)**
   - **Identified Gaps**: Existing projects lack explicit lifecycle phases and configuration metadata.
   - **Proposed Model**: Extend the current `projects` table (`doap:Project`) with foundational predicates: `ev:lifecyclePhase`, `ev:configJson`, `ev:tags`, and `ev:dependsOn`.

3. **Deployment & Release Management (🔴 High Priority)**
   - **Identified Gaps**: No environment registry, structured deployment tracking, or formal release versioning mechanisms.
   - **Proposed Model**: Introduce a triad of new tables: `environments` (`schema:WebApplication`), `deployments` (`schema:DeployAction` + `prov:Activity`), and `releases` (`doap:Version` + `prov:Entity`).

4. **Maintenance & Operations (🔴 High Priority)**
   - **Identified Gaps**: Missing concrete records for scheduled backups and detailed incident logs.
   - **Proposed Model**: Implement `backup_records` (`prov:Entity`) and `incidents` (`schema:Event`), with incidents structurally linked to the deployments that triggered them via `prov:wasInfluencedBy`.

5. **Decommissioning (🟡 Medium Priority)**
   - **Identified Gaps**: No formal workflow or persistent tombstone mechanism for archiving projects.
   - **Proposed Model**: Model decommissioning as a `schema:DeleteAction` wrapped in a `prov:Activity`. This transitions the project state to "decommissioned" while persisting all historical data.

6. **Cross-Project Versioning (🟡 Medium Priority)**
   - **Identified Gaps**: Inability to systematically query multi-project version compatibility matrices.
   - **Proposed Model**: Utilize `schema:SoftwareSourceCode` to denote compatibility links (`ev:compatible`) across independently changing dependencies.

## 4. Implementation Priorities & Workflows
To operationalize these data models, the proposal incorporates the creation of seven JSON-LD workflow templates scoped as `schema:HowTo` (e.g., `new-project.jsonld`, `release.jsonld`, `maintenance.jsonld`). 

The recommended execution roadmap targets maximum immediate impact:
1. **Quick Impact**: Extend `doap:Project` with `ev:lifecyclePhase` and construct a portfolio dashboard.
2. **Operational Maturity**: Formalize scheduled backup records (`prov:Entity`).
3. **Traceability Foundation**: Stand up the requirements tracker linking to `prov:Influence`.
4. **Delivery Operations**: Finalize the deployment tracker and environment registry.

### Overall Assessment
The proposal is exceptionally structured and semantically rigorous. By leaning heavily on established ontologies like `schema.org`, PROV-O, and DOAP, the data model additions gracefully augment the existing architecture. This provides a clear, actionable, and scalable path toward deeply integrated, query-friendly full lifecycle tracking in the application harness.
