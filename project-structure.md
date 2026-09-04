# Sprue Project Structure

## Status

This document records the completed project-structure conception and the selected technical/deployment boundaries. Data-model definition is complete, and MVP implementation is the current stage. Detailed entities, fields, relationships, constraints, indexes, and migration order are approved in [data-model.md](data-model.md) as the implementation baseline.

## Product Model

Sprue is a hosted web platform for creating and operating derived onchain data products.

The customer describes a desired data product in natural language. Sprue provides the managed service chain:

```text
Creator account wallet funding and bounded spending authorization
    -> natural-language analysis
    -> The Graph source discovery and data access
    -> Data Product Spec and transformation DAG
    -> Sprue-managed Graph payment, validation, and execution
    -> hosted data API
    -> optional Sprue-hosted x402 access with Hedera/Blocky402 settlement
    -> creator revenue and any disclosed platform fee
```

The platform should hide the operational complexity of agent execution, data transformation, scheduling, API hosting, caching, and payment verification from the customer.

Sprue has two connected product surfaces:

1. **Creator Console**: the web application where a customer describes, inspects, builds, deploys, edits, and monetizes a data product.
2. **Hosted Product API**: a stable HTTP endpoint operated by Sprue and consumed by applications or agents. The endpoint may be private, authenticated, or x402-gated.

The platform itself is the managed hosting service. A customer does not need to deploy a separate server for every data product.

For a public hackathon demo, the first hosted target should be one shared Sprue runtime. The platform should route requests by product identity and configuration rather than provisioning a new server for every product.

## Sponsor Integration Strategy

The selected sponsor integrations are The Graph, Hedera, and Privy. The user replaced Bazantic with Hedera on 2026-09-05. Bazantic and Recipe work are no longer active implementation requirements.

### The Graph: Onchain Data Foundation

- Discover and inspect indexed onchain data sources.
- Query the raw facts needed by a product.
- Receive data payments initiated by Sprue from the creator's funded account wallet, within authorized limits.
- Reuse existing subgraphs whenever they satisfy the data requirement.
- Generate a new subgraph only when the required facts are not already indexed and the hackathon scope allows it.

### Hedera and Blocky402: Optional Paid API Access

Sprue enables an x402 payment gate on its own hosted endpoint when the creator opts into paid access. Hedera is the settlement network; Blocky402 is the facilitator for payment verification and settlement. Creating, refreshing, hosting, and privately using an API must not depend on that publication step. Blocky402 is not assumed to provide an API hosting service, a publishing dashboard, or marketplace discovery. Sprue implements product pricing, recipient configuration, request gating, and payment-to-response correlation behind an adapter.

The intended product role is:

```text
Sprue Data Product
    -> working private hosted API
    -> creator enables the Sprue x402 payment gate
    -> external buyer authorizes a Hedera payment
    -> Blocky402 verifies and settles the payment
    -> Sprue returns the paid API response
    -> creator revenue and any agreed Sprue fee
```

See [the Hedera reference](sponsor/Hedera.md) for official award rules and proposed integration gates. The target is a real paid data service with a working consumer, not a Recipe. SDK versions, payment asset, account mapping, creator access to receipts, and service-fee settlement remain unverified.

### Privy: Creator Account Wallet Layer

Each creator account needs a Privy-backed wallet for top-ups and authorized Graph spending. Creator-controlled receipts from published APIs remain the intended product model, but mapping the Privy wallet to a usable Hedera receiving account is a validation gate. Sprue executes upstream purchases on the creator's behalf; external buyers are not required to use Privy. Keep account-level ownership and per-product accounting rather than creating a wallet for every product. Do not assume a shared account identity means one network balance or one compatible signer.

Bounded automatic Graph payments are core scope. The proposed authorization design keeps the creator as owner and gives Sprue a revocable, policy-limited signer; exact ownership and policy configuration must be validated. General-purpose autonomous treasury management remains outside the MVP.

### x402: Payment Protocol

x402 has two distinct uses in the plan: upstream Graph data purchases and downstream API sales settled on Hedera through Blocky402. These are separate requests, payment obligations, adapters, and accounting records. Blocky402 is not required on the upstream Graph path. Each adapter must validate its actual network, payment asset, scheme, and signing method independently.

## Account Wallet and Money Flows

The user confirmed the creator-wallet model and subsequently selected Hedera for downstream x402 on 2026-09-05. Provider-specific interoperability remains unverified.

```text
Creator top-up -> Privy-backed creator wallet on Base / Base Sepolia
                     -> authorized Graph purchases -> build/refresh data

External buyer -> Sprue x402 gate -> Blocky402 -> Hedera API sale
                     |
                     +-> validated creator-controlled Hedera recipient
                     +-> Sprue service fee, only if enabled and validated
```

The branches represent economic allocation, not a claim that Blocky402 supports an atomic split. The creator account remains the intended ownership identity. Validate network-specific account references and control of proceeds; any separate account or settlement address must be justified explicitly. Never silently change to platform custody or export a user key to fit a sample integration.

The [Graph payment documentation](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/) specifies USDC on Base or Base Sepolia. Downstream settlement follows the selected Hedera path. Keep asset/network balances separate: API revenue does not automatically refill the Graph budget. No bridge, conversion, or cross-chain treasury automation is included in the MVP. This distinction concerns payment networks, not the chain whose data a product analyzes.

- Top-ups remain creator funds, not Sprue sales. Keep upstream Graph costs separate from downstream revenue.
- Record network, asset identifier, units, and recipient on balances and payments; never sum unlike balances into an immediately spendable budget.
- Record gross sale amount, provider/network deductions, creator proceeds, and any platform fee independently. Account-level balances and per-product profitability are different views.
- No fee rate or nonzero default is selected. Confirm its basis, rounding, minimums, recipient, timing, and refund handling before enabling collection; do not silently charge top-ups or data purchases.
- Evaluate native splitting versus an explicitly authorized later settlement step. An accounting entry alone is not evidence that a fee or creator payout settled.
- Reserve budget before concurrent paid jobs, enforce spend/recipient/network limits, and stop on insufficient funds, exhaustion, or revoked authorization. Reconcile uncertain payment outcomes before retrying.
- Funding alone is not permission for unlimited spending. Once a bounded recurring policy is approved, routine queries should not need individual manual payment.

## Actors

### Product Creator

The customer who defines and owns a data product. They fund the account wallet, authorize bounded Graph spending, and control the specification, visibility, refresh policy, price, budget, and acceptance of any service-fee terms.

### Builder Agent

The agent that interprets natural-language intent, discovers appropriate sources, proposes a specification, creates or modifies the transformation DAG, estimates execution requirements, and reports build progress.

### Sprue Platform

The control plane and managed runtime that stores product definitions, validates changes, executes transformations, hosts endpoints, schedules refreshes, enforces resource limits, and records usage and payment events.

### Consumer Agent or Application

An external client that requests data from a hosted product API. If the product is monetized, the client completes the x402 payment flow before receiving the response.

## Product Lifecycle

```text
Draft
  -> Planned
  -> Awaiting confirmation
  -> Building
  -> Validating
  -> Deployed
  -> Live
  -> Published / Monetized
  -> Observed and iterated
```

Any stage may enter `Failed` or `Suspended` when validation, deployment, budget, payment, or upstream data requirements are not satisfied.

An edit should create a new product version or an auditable revision. The endpoint identity may remain stable while its active definition changes.

## Logical Architecture

```text
                         Creator
                           |
                           v
                  +-------------------+
                  |   Creator Console |
                  |  Web Application  |
                  +---------+---------+
                            |
                            v
                  +-------------------+
                  |    Control Plane  |
                  |                   |
                  | Agent Orchestrator|
                  | Product Registry  |
                  | Spec/DAG Validator|
                  | Version Manager   |
                  | Deploy Controller |
                  | Policy and Budget |
                  +---------+---------+
                            |
                            v
                  +-------------------+
                  |     Data Plane    |
                  |                   |
                  | Graph Data Adapter|
                  | DAG Runtime       |
                  | Scheduler/Worker  |
                  | Materializer/Cache|
                  | API Gateway       |
                  | Payment Adapters  |
                  +---------+---------+
                            |
                            v
                    Hosted Product APIs
                            |
                            v
                    Consumer Agents
```

## Control Plane

The control plane manages intent, configuration, and lifecycle rather than serving every data request directly.

### Builder Agent Orchestrator

- Accept natural-language product requests.
- Discover and inspect The Graph sources.
- Produce a structured Data Product Spec.
- Propose a transformation DAG and output schema.
- Explain assumptions and estimated costs.
- Apply conversational edits to an existing product.
- Emit a structured build trace.

### Product Registry

Stores the durable definition of each product, including:

- product identity and owner;
- description and natural-language intent;
- source references and schema assumptions;
- transformation DAG;
- output schema;
- refresh and materialization policy;
- visibility and authentication policy;
- x402 price and recipient configuration;
- creator account-wallet reference and any accepted service-fee policy version;
- resource and spending limits;
- active version and deployment status.

### Validation and Versioning

- Validate node types, parameters, graph connectivity, and output schema.
- Reject unsupported or unsafe execution plans before deployment.
- Preserve previous working versions when a new version fails.
- Keep source-to-output lineage and reproducible build metadata.

### Job Dispatch and Queue

- Accept Build, Backfill, and Refresh requests in the web process.
- Store durable jobs with status, ownership, retry count, and idempotency information.
- Let the private worker claim and execute jobs outside the public request lifecycle.
- Update `BuildRun` records so the Creator Console can stream or poll progress.
- Use a database-backed job table for the MVP; introduce a dedicated queue only when the workload requires it.

### Deployment Controller

The deployment controller turns an approved product definition into a hosted runtime configuration. For the MVP, all products may run on one shared backend with routes such as:

```text
/products/{product_id}
```

The product definition changes; the platform infrastructure does not need to be reprovisioned for every product.

The controller should depend on a runtime adapter rather than on provider-specific behavior. The first runtime target is one shared Sprue backend; a future adapter could support a dedicated customer deployment without changing the Creator Console or product model.

## Confirmed Deployment and Portability Model

On 2026-09-05, the user selected Vercel plus Railway for temporary evaluator access and required Docker self-hosting from the same source without application-code changes. Provider configuration may differ, but product behavior and service contracts must remain identical.

### Evaluator Cloud Profile

```text
Vercel
└── Creator Console
        |
        v
Railway project
├── API (public HTTP)
│   ├── Control API
│   ├── Hosted Product API
│   └── x402 payment gate and Blocky402 adapter
├── Worker (private)
│   ├── product builds and validation
│   ├── backfills
│   └── scheduled refreshes
└── PostgreSQL (private source of truth)
```

Use platform-provided domains for the hackathon. Only the Creator Console and API receive public traffic. The worker and database stay private. Keeping long-running builds and refreshes outside the API request lifecycle prevents evaluator requests from depending on long HTTP timeouts.

The control API and Hosted Product API may run in the same Railway API service for the MVP. All products share that service and stable routes such as `/products/{id}`; creating a product does not provision a new service. Hedera changes the payment adapter, not the deployment topology, and Blocky402 is not treated as an application host.

### Docker Self-Hosted Profile

```text
Docker Compose
├── frontend
├── api
├── worker
└── postgres
```

The Docker profile must run the same frontend, API, worker, migrations, and data model as the evaluator profile. It may use separate frontend and backend images, and the API and worker may use different start commands from the same backend image. Switching profiles may change environment values, image/build commands, networking, and secret injection, but must not require a source patch or provider-specific branch.

Keep provider manifests thin and isolated under `infrastructure/`. Domain, DAG, Agent, Graph, wallet, and payment modules must not import Vercel or Railway deployment APIs. If future product provisioning needs provider APIs, place them behind deployment adapters.

### Persistence Requirement

The product registry, versions, policies, account-wallet references, budget reservations, build metadata, usage events, and payment/ledger events are source-of-truth data and must not depend on an ephemeral filesystem.

Both deployment profiles use PostgreSQL through a standard connection string. Railway supplies PostgreSQL for the evaluator profile; Docker Compose supplies it for self-hosting. Large artifacts may later use an object-store adapter, but local container or service storage must not become an undeclared source of truth.

### Health and Deployment Contract

The API process should expose at least:

- `/healthz`: the process is running;
- `/readyz`: required dependencies are reachable and the process can serve traffic;
- `/products/{id}`: the hosted product endpoint;
- a lightweight smoke-test route for deployment verification.

The portable deployment contract also requires:

- documented, validated environment variables, including the public API origin and allowed frontend origins;
- an explicit API start command and worker start command;
- repeatable schema migration and smoke-test commands;
- graceful API shutdown and safe worker job handoff or retry;
- no dependency on a specific working directory, writable application image, or local persistent filesystem;
- equivalent readiness behavior in Railway and Docker Compose.

### Secrets and Public Access

LLM credentials, The Graph credentials, x402 facilitator credentials, database credentials, and signing material must remain server-side. Railway secrets or Docker runtime secrets/environment files inject them into backend processes. They must never be included in frontend build output, container images, or repository history.

The public deployment exposes the Creator Console and demo product API, but expensive Builder execution remains authenticated, quota-bounded, or owner-controlled. A public evaluator-facing URL is not an unrestricted build sandbox.

### Managed Hosting Boundary

The hosted-service promise remains a product-level deployment target rather than a provider name:

```text
Data Product
    -> Deployment Target: shared-hosted
    -> Runtime Status: live
    -> Endpoint: /products/{id}
```

Vercel plus Railway and Docker Compose are two ways to run the shared Sprue platform. This leaves room for future `dedicated-hosted` or customer-managed targets without coupling product definitions to infrastructure vendors.

## Data Plane

The data plane executes and serves the product.

### Graph Data Adapter

- Connect to The Graph and selected MCP or API interfaces.
- Resolve source and schema references from the product definition.
- Fetch raw indexed onchain facts.
- Execute paid Graph requests through the creator-wallet authorization adapter; link expense and payment status to the corresponding build/refresh job.
- Normalize source-specific fields into the runtime input model.

### Background Worker

- Run product builds, validation jobs, historical backfills, and scheduled refreshes outside the public request process.
- Report progress and failure details through `BuildRun` records.
- Enforce per-build and per-product resource limits.

### DAG Runtime

The user confirmed Option A on 2026-09-05: the Agent dynamically composes predefined, developer-implemented operators. Candidate operator types include:

```text
Source, Filter, Map, Join, GroupBy, Window, Aggregate, Score, Output
```

This list is an operator catalog, not a required sequence. Different requests may use different supported nodes and connections. Implement only the subset needed for one convincing MVP product flow.

- Accept a versioned execution definition containing node types, validated configuration, typed inputs/outputs, and dependency edges; keep visual positions separate.
- Reject unsupported operators, incompatible connections, cycles, invalid configuration, or requests outside permission and resource budgets before execution.
- Execute implemented handlers in dependency order and record per-node progress, results, and failures against the pinned product version.
- Do not execute arbitrary Agent-generated JavaScript or Python. Generated Graph query configuration must also pass validation and query/data-volume limits.
- Report unsupported transformations explicitly instead of adding unrestricted code execution as a fallback.
- Keep the job queue separate from the DAG executor. A queue retry does not guarantee exactly-once payment or other business side effects; reconcile paid work before retrying it.

Refresh timing and materialization remain separate product policies. This execution boundary does not select a framework, queue library, or execution implementation, and it must remain portable across the confirmed deployment profiles.

### Scheduler, Materializer, and Cache

- Refresh products according to their declared policy.
- Materialize expensive derived results when appropriate.
- Serve repeated requests from cached results where possible.
- Track freshness and last successful update.

### API Gateway

- Resolve a product endpoint to its active version.
- Enforce visibility and authentication policy.
- Return a documented output schema.
- Expose health, freshness, and error status.
- Apply rate, query, storage, and spending limits.

### Publication and Payment Adapters

- Have Sprue advertise each monetized product's Hedera payment requirement, including price, asset, and validated creator recipient.
- Use the Blocky402 adapter for downstream payment verification and settlement; do not assume its Hedera signing scheme is interchangeable with Graph's EVM scheme.
- Enable the gate through Sprue's publish action. Reject unpaid or invalid public access without exposing the underlying result; keep explicitly authorized private access separate.
- Prevent duplicate independent charges across middleware and runtime. Persist request/settlement correlation and reconcile uncertain outcomes before retrying.
- Record upstream expenses separately from downstream sales, creator proceeds, and any enabled service-fee settlement.
- Return the data response only after the payment requirement is satisfied.

## Core Domain Objects

The initial domain model should include these logical objects:

- `Workspace`: customer or project boundary.
- `AccountWallet`: creator's logical wallet identity, ownership, network-specific account/address references, and delegated authorization scopes. Funding and receipt roles must be validated separately.
- `SpendingPolicy`: approved Graph purchase limits, allowed destinations, revocation state, and budget reservations.
- `DataProduct`: durable product identity and current status.
- `DataProductVersion`: immutable or auditable specification revision.
- `SourceReference`: The Graph source, schema, and network metadata.
- `TransformationGraph`: validated nodes and edges.
- `Deployment`: runtime and endpoint status for a version.
- `MonetizationPolicy`: opt-in access, x402 price, Hedera network/asset, Blocky402 configuration reference, validated creator recipient, and any accepted service-fee terms/version.
- `BuildRun`: execution state, logs, trace, and validation results.
- `UsageEvent`: request, cost, freshness, and resource information.
- `PaymentEvent`: upstream or downstream payment identity, network, asset, amount, payer/recipient, status, request correlation, and settlement reference.
- `WalletLedgerEntry`: network/asset-specific funding, Graph expense, gross API sale, creator proceeds, provider charge, or platform fee linked to account/product/payment identifiers. A ledger entry is not a cross-chain transfer.

## Main User Flows

### Creator Build Flow

```text
Open Creator Console
    -> set up/fund account wallet and authorize bounded data spending
    -> describe a data product
    -> review source, schema, DAG, output, and estimated cost
    -> confirm Build
    -> Sprue pays Graph within the approved budget
    -> observe build trace
    -> inspect live result and API
    -> keep using the private API or configure Hedera paid access and disclosed fee terms
    -> validate creator recipient control before enabling the public payment gate
```

### Consumer Request Flow

```text
Authorized private user requests API -> runtime returns data under its access policy

External buyer requests the Sprue-hosted paid endpoint
    -> Sprue presents the Hedera x402 payment requirement
    -> buyer retries with authorization from a compatible Hedera client
    -> Sprue uses Blocky402 for verification and settlement
    -> Sprue returns the product response after the payment gate succeeds
    -> Hedera settlement and creator receipt are reconciled
    -> any enabled service fee is allocated/settled by the validated mechanism
```

### Conversational Edit Flow

```text
Creator asks to change a definition
    -> Agent proposes a new version
    -> validator checks the revised DAG
    -> runtime rebuilds or refreshes the product
    -> endpoint keeps the stable product identity
    -> Creator reviews the updated result
```

## Planned Repository Structure

The following structure reflects the selected application boundaries and may be refined during implementation:

```text
/
├── agents.md
├── plan.md
├── project-structure.md
├── README.md
├── apps/
│   ├── web/                # Creator Console
│   ├── api/                # Control API and hosted product endpoints
│   └── worker/             # Builds, backfills, and refreshes
├── packages/
│   ├── domain/             # Product, version, policy, and event models
│   ├── dag/                # Spec types, validation, compilation, runtime
│   ├── agent/              # Planning, source discovery, and build trace
│   ├── graph/              # The Graph adapters and schema handling
│   ├── payments/           # x402 integration and payment events
│   └── shared/             # Shared types and utilities
├── infrastructure/
│   ├── vercel/             # Evaluator frontend deployment
│   ├── railway/            # Evaluator API, worker, and database deployment
│   └── docker/             # Images, Compose profile, and self-host configuration
├── tests/                  # Unit, integration, and end-to-end tests
└── docs/                   # Technical and submission documentation
```

During the hackathon, several logical services may be implemented in one deployable backend. The boundaries above are for clarity and future evolution, not a requirement to build a distributed system.

## MVP Structure Boundary

The first implementation should include:

- one Creator Console;
- one backend that combines the control plane and data plane where practical;
- one logical shared runtime across a public Creator Console, a public API process, and a private worker process;
- one Vercel plus Railway evaluator profile and one equivalent Docker Compose self-hosting profile;
- one representative Graph-backed data product;
- one funded creator account wallet with bounded, Sprue-managed Graph payments;
- fixed, validated transformation node types;
- one stable product endpoint;
- one real x402-gated request from a separate consumer agent/client, settled on Hedera through Blocky402;
- validated creator control of the Hedera recipient and separate network/asset balances for Graph expenses and sales;
- enough persistence to show product state, version, build trace, funding, Graph expenses, sales, and any enabled service-fee settlement.

The first implementation should not require:

- a separate server or container for every product;
- a product registry stored only on an ephemeral service or container filesystem;
- a public Builder Agent with unlimited execution;
- a full marketplace;
- general-purpose autonomous treasury management beyond bounded data purchases;
- automatic bridging or conversion between Hedera revenue and Base Graph-spending funds;
- production-grade multi-region infrastructure;
- broad support for arbitrary user code.

## Design Constraints

- The customer must explicitly approve expensive Build, Backfill, Deploy, and Monetize actions.
- Builder planning and runtime execution must be separate permission domains.
- Product definitions must be inspectable, versioned, and reproducible.
- Products should be private by default and bounded by resource policies.
- Hosted APIs must expose freshness, status, and useful error information.
- External integrations must be replaceable behind clear adapters.
- The remaining technical stack must preserve the confirmed Vercel, Railway, and Docker deployment contract.

## Data-Model and Implementation Details to Resolve

- Exact package versions and the initial LLM provider behind the Agent adapter.
- The Graph MCP versus direct API usage for each operation.
- DAG operator subset, execution library, and persistence schema.
- Scheduler and cache implementation.
- Exact Railway service sizing, evaluator availability window, Docker image layout, and operational runbook.
- Exact test/mainnet environment, supported Hedera payment asset, SDK versions, and Blocky402 settlement configuration; the downstream network family and facilitator are selected.
- Creator-wallet delegation, funding, budget enforcement, and Graph payment compatibility.
- Privy-to-Hedera account/recipient mapping, creator ownership and access to proceeds, and buyer signer support. Do not infer compatibility from EVM support alone.
- Blocky402 settlement evidence, failure/retry behavior, and whether the path supports the intended revenue/fee allocation; fee terms are not yet selected.
- Authentication, workspace isolation, and demo quotas.
