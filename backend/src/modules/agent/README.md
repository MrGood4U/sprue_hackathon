# Agent Module

Own natural-language planning, approved control commands/outbox and H2 checkpoint/call records. Follow backend/harness before implementing controller/tool dispatch. Do not make direct database fields, paid calls or arbitrary code execution from model output.

Plan queries over existing Subgraphs and only necessary supported Sprue transformations. Source gaps require explicit limitations, requirement revision, or another existing-source candidate; never generate/deploy a Subgraph or Subgraph Composition as a repair or fallback. Multi-source/cross-chain execution is enabled only through explicit source nodes and typed Union/Join operators with independent source access, provenance and bounds.

Status: a provider-neutral, fixture-backed harness slice is implemented under [harness](harness/index.ts). It accepts bounded intent and schema summaries, invokes a mock model by default, validates the untrusted proposal, applies source mappings, and runs the deterministic cross-chain runtime. The harness is not yet connected to durable Agent sessions, HTTP handlers, or the worker queue. Remote model mode is configuration-ready but fail-closed until a provider request contract is reviewed and implemented.

Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app. The model never receives API keys, signer material, database access, raw secret references, or authority to approve, pay, build, or deploy.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
