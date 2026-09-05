# Sprue Agent Harness

## Status

Draft 0.2, 2026-09-05. This directory contains the proposed harness design, not an implemented Agent, executable scripts, or verified provider integrations. The human requested a step-by-step design and an inventory of tools to prepare before implementation.

Read the approved [data model 1.3](../../data-model.md), proposed [API contract](../../api-contract.md), [backend ownership](../README.md), and active [Graph reference](../../sponsor/graph.md) alongside this design. Existing model/API review gates remain open. This draft does not approve new database fields, Graph purchases, wallet authority, subgraph deployment, or API publication.

## What the Harness Does

The harness is the trusted software surrounding the language model: context assembly, a stage controller, typed tool dispatch, validation, limits, durable recovery, and evidence. The model proposes semantics and compositions; the harness decides which actions are permitted and verifies their results. A prompt alone is not a security boundary.

The intended compilation path is:

```text
Human natural language
  -> clarified metric and data requirements
  -> discover and inspect an existing Graph subgraph
  -> verified field mappings and bounded query plan
  -> compose predefined processing operators
  -> validate Data Product Spec + typed DAG
  -> present proposal and evidence
  -> HUMAN accepts version and starts Build
  -> deterministic worker fetches and transforms live data
  -> materialization
  -> separate HUMAN deployment/publication actions
```

"Operators" means machine-readable, versioned nodes such as source, map, filter, aggregate, and output, not decorative canvas symbols or generated executable code. Source discovery and semantic planning may iterate; accepted versions and execution do not silently change.

The source stage normally selects an existing subgraph. If the needed indexed facts are unavailable, return a source gap and a supported alternative for human review. Creating or deploying a new subgraph is an explicitly approved future workflow, not an automatic fallback.

## Reading Order

| Document | Purpose |
|---|---|
| [Workflow](workflow.md) | Every stage, inputs/outputs, transitions, approvals, persistence, and frontend mapping |
| [Tool and script catalog](tools.md) | Exact Sprue-owned tool contracts, proposed script files, permissions, and developer prerequisites |
| [Operator contract](operators.md) | Query compilation, typed operator semantics, expression restrictions, and a worked metric example |
| [Semantic templates](semantic-templates.md) | Versioned Wallet Activity/Repeat Activity expansion, provenance, editing limits and tests |
| [Constraints](constraints.md) | Enforced permissions, resource limits, payment boundaries, injection defense, and recovery |
| [Verification and delivery](verification.md) | Implementation order, golden cases, attack/retry tests, and review gates |

## Three Distinct Authorities

| Actor | May do | Must not do |
|---|---|---|
| Planner model | Interpret intent, request approved metadata tools, select supported operators, propose parameters and a version diff | Execute code, read secrets, authorize spending, accept its own proposal, or deploy |
| Trusted harness/controller | Verify caller and phase, dispatch tools, meter work, validate proposals, record sanitized evidence | Treat model claims or provider text as authorization or integration proof |
| Deterministic worker | Execute an accepted version after an authorized Build/refresh command, fetch Graph data within explicit access/budget policy, persist output | Ask an LLM to invent runtime transforms, change semantics, switch payment mode, or publish automatically |

An API-key build still consumes provider quota and requires explicit execution. "Non-paid planning" means no Graph data purchase or subscription data query during planning; LLM/provider metadata infrastructure can have a separate, platform-controlled operating cost.

## Proposed File Ownership

Only the Markdown files listed above exist in this change. The following are future implementation locations, not runnable paths yet:

```text
backend/harness/
  README.md, workflow.md, tools.md, operators.md, semantic-templates.md, constraints.md, verification.md
  schemas/       # Versioned tool, semantic-plan, expression, and checkpoint schemas
  prompts/       # Small versioned prompts per planning phase; no secrets or authority
  catalogs/      # Reviewed query recipes and metadata-adapter capability declarations
  fixtures/      # Public/synthetic test inputs with provenance and expected outputs
  scripts/       # One thin developer CLI wrapper per cataloged tool/maintenance task

backend/src/modules/agent/harness/
  controller.ts  # Phase transitions and orchestration, not route code
  context.ts     # Minimum authorized context and redaction
  dispatcher.ts  # Named tool allowlist and typed results
  limits.ts      # Budget reservation and enforcement
  checkpoints.ts # Durable progress/recovery after model review
  model-port.ts  # Provider-neutral model interface; no SDK assumed in this draft

backend/src/modules/dag/    # Operator registry, compiler, validator, interpreter
backend/src/modules/graph/  # Metadata/query adapters and source provenance
backend/src/jobs/           # Authorized execution and reconciliation dispatch
backend/tests/harness/      # Contract, orchestration, and security tests
```

Scripts import these domain implementations; they do not contain a second compiler/runtime. The production model invokes registered functions through the dispatcher, not a shell, script path, terminal, or arbitrary MCP server. Railway and Docker use the same contracts and process boundaries.

## First Implementation Target

First prove a deterministic, fixture-backed `intent requirements -> inspected schema -> static query -> operator DAG -> expected output` path without any model or network dependency. Then add bounded metadata discovery and the planner around it. Finally connect authorized live Graph execution. This order makes incorrect reasoning distinguishable from incorrect data processing.

The human approved the five-type MVP scope and semantic-template/frontend alignment on 2026-09-05. Exact configuration/numeric schemas, durable provenance, the live source/methodology and numerical operating limits remain review items. The local frontend demonstrates expansion only; no backend script or runtime is implemented. [Verification](verification.md#review-gates) identifies the decisions needed before implementing dependent behavior.
