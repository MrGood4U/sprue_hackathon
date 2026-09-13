# Sprue MVP End-to-End Flow

Status: implemented hackathon flow, updated 2026-09-13.

Sprue turns a natural-language onchain data requirement into a reusable live API and can optionally sell each call through Hedera x402. It discovers and queries existing The Graph Subgraphs; it never creates or deploys a new Subgraph or Subgraph Composition.

The demonstrated multi-source product compares the seven-day Uniswap V3 trading volume on Ethereum and Arbitrum and aggregates each network into one result row. The date interval is resolved from the last seven complete UTC days at execution time rather than being fixed in the generated API.

## 1. Demonstrated Sequence

```text
Privy creator login
  -> workspace and creator wallet bootstrap
  -> Graph credential and model configuration
  -> natural-language product intent
  -> bounded Subgraph discovery and schema inspection
  -> semantic ranking and structured DAG proposal
  -> creator reviews or edits the Builder canvas
  -> durable draft save
  -> backend compilation into an immutable version
  -> explicit private API deployment
  -> live multi-Subgraph execution
  -> optional Hedera testnet HBAR price and x402 publication
  -> independent hx402-cli payment and protected response
  -> persisted transaction and creator-revenue evidence
```

The browser owns presentation state. The backend owns identity, authorization, durable product definitions, provider calls, deployments, payment state, and financial evidence. The browser never receives PostgreSQL credentials, model or Graph API keys, a creator wallet private key, or the internal API credential used after a paid request settles.

## 2. Identity, Wallet, and Access

Google and GitHub login use one Privy application. The backend verifies the Privy access token, resolves the provider identity to a stable Sprue user, and idempotently creates or reuses the default owner workspace. It also ensures one user-owned Privy EVM wallet and reconciles its fixed testnet profiles:

- Base Sepolia USDC for Graph access funds;
- Hedera testnet HBAR for API-sale receipts.

These balances are separate and are never presented as interchangeable. The creator can use an encrypted Graph API credential or select the bounded wallet-funded x402 access mode. The demonstrated live Graph path uses the creator-supplied credential. The wallet page also persists a daily Graph-spending ceiling, while production additional-signer binding and provider-policy enforcement remain separate from the completed downstream payment flow.

## 3. Agent Planning

The Agent Harness uses the creator's saved OpenAI-compatible model profile and a restricted Graph adapter. It performs three bounded stages:

1. Interpret the requested semantics, networks, period, grouping, and output fields.
2. Search existing Subgraphs, inspect immutable schemas in bounded chunks, and rank actual aggregation/entity/field candidates. Optional embeddings add advisory cosine-similarity scores; they never select a source by themselves.
3. Bind verified fields and compose only registered Sprue operators into a structured proposal.

The planning cards expose real source candidates, schema counts, similarity scores, reasons, selected entities and fields, operator counts, and deterministic validation results. They do not expose hidden chain-of-thought or invented evidence.

## 4. Builder Draft and Compilation

The Builder supports Source, Filter, Map, Aggregate, Union, Join, Sort/Top K, and Output. Aggregate measures remain structured as `{name, op, field}`. The compiler validates:

- the operator and version allowlist;
- node and edge limits, references, ports, and input cardinality;
- acyclicity and reachability to exactly one Output;
- predecessor-derived schemas and type-compatible configuration;
- the mandatory Source-to-Map normalization boundary;
- the declared final output contract and runtime resource bounds.

`Save draft` persists the current layout-free DAG to PostgreSQL. It does not build, deploy, redeploy, or modify a currently serving API or x402 publication. Unsaved navigation prompts are suppressed after a successful save or backend build.

`Run backend build` first saves the exact current draft, then compiles it into a new immutable version or reuses an identical version. A successful build opens the API page. An already active API continues serving its pinned version until the creator explicitly deploys or redeploys from the API page.

## 5. Live Graph Execution

Each Source contains a statically validated GraphQL document derived from its inspected schema. At request time Sprue resolves dynamic date variables, invokes the approved existing Subgraph, normalizes provider fields through the explicit Map boundary, and executes the immutable DAG.

Graph retrieval is bounded at two levels:

- each provider page requests at most 1,000 rows;
- a Source collects at most 10,000 rows for one API execution.

When the product bound is reached, Sprue stops requesting further pages and executes the DAG with the rows already collected. Reaching the bound does not turn an otherwise valid API call into `LIVE_EXECUTION_FAILED`.

Multi-source results are combined only through explicit Union or Join nodes. Exact decimal operations avoid binary floating-point arithmetic, and the runtime preserves source lineage and request metadata.

## 6. Private API Lifecycle

A compiled version is not automatically public. The creator explicitly deploys it from the API page and receives the API credential once. The managed endpoint executes the pinned immutable DAG against current Graph data, applies the contract's bounded `limit`, and returns JSON data plus request/version/source metadata.

Saving or compiling a later draft does not change the active deployment. Only an explicit deploy or redeploy moves the serving pointer. Stopping a deployment revokes its active credential and also retires the related paid gate.

## 7. Hedera x402 Publication

The creator selects a per-call HBAR price on the X402 page. Sprue validates the mapped Hedera testnet recipient and Blocky402 capability before publishing a separate paid endpoint. The hackathon profile sends the entire buyer price to the creator and charges no Sprue service fee.

For a paid request:

1. An unauthenticated request receives HTTP 402 and a pinned x402 v2 `exact` HBAR requirement.
2. The buyer validates the network, asset, recipient, price, fee payer, and local maximum.
3. The buyer signs locally and retries with `PAYMENT-SIGNATURE`.
4. Sprue verifies and settles through Blocky402.
5. After settlement, Sprue invokes the same immutable live DAG with a server-derived internal credential.
6. The protected response includes payment response evidence; Sprue persists the paid request, creator proceeds, and Hedera transaction reference.

Payment proofs are replay-protected. A paid delivery failure remains auditable and does not authorize a duplicate settlement.

## 8. Independent Buyer

[`x402-cli/`](x402-cli/) is intentionally independent of Sprue application modules. `hx402-cli` supports native HBAR with explicit Hedera testnet or mainnet selection, encrypted local ECDSA key storage, Mirror Node account resolution, caller-authorized testnet faucet funding, and an exact per-request ceiling. It never accepts a private key as a command argument or exports decrypted key material.

The hackathon demo used a funded Hedera testnet buyer to call a Sprue x402 endpoint and receive the protected multi-Subgraph result after settlement.

## 9. Current Support Matrix

| Capability | Status | Current boundary |
|---|---|---|
| Creator Console and seven locales | Implemented | English fallback; Simplified Chinese, Spanish, French, German, Korean, and Japanese are explicitly selectable |
| Privy creator authentication and workspace bootstrap | Implemented | Google/GitHub through Privy; missing or partial server configuration fails closed |
| Creator wallet and testnet balances | Implemented | User-owned Privy EVM wallet, Base Sepolia USDC, mapped Hedera testnet HBAR |
| Encrypted model and Graph credentials | Implemented | Server-side AES-256-GCM keyring, redacted reads, explicit validation and revocation |
| Agent planning and existing-Subgraph discovery | Implemented | Restricted Graph adapter, bounded schema inspection, optional embedding rank, durable trace cards |
| Durable Builder drafts and immutable compilation | Implemented | Draft save has no deployment side effects; exact structured DAG is validated by the backend |
| Live multi-Subgraph DAG execution | Implemented | Fresh bounded Graph requests, explicit normalization, Union/Join, aggregation, sorting, and output |
| Private API deploy/redeploy/stop | Implemented | One-time credential issuance; active version changes only through explicit deployment commands |
| Hedera testnet x402 publication | Implemented | Creator-selected HBAR price, Blocky402 verification/settlement, replay protection |
| Independent funded buyer request | Implemented and demonstrated | `hx402-cli` paid a Sprue endpoint and received its protected live result |
| Revenue and transaction evidence | Implemented | Creator proceeds, paid requests, pagination, and HashScan links from durable records |
| Scheduled materialization queue | Not part of the demonstrated slice | API delivery executes the immutable DAG against fresh sources |
| Privy-delegated Graph x402 purchasing | Partially implemented | Wallet and daily budget exist; production signer/policy enforcement remains open |
| Docker local profile | Implemented and verified | Frontend, API, worker, PostgreSQL, Redis, migrations, seeds, readiness, and CORS |
| Vercel/Railway profile | Configuration provided | Local verification does not claim a currently deployed public cloud environment |

## 10. Security and Product Boundaries

- Existing Subgraphs only; no upstream Subgraph creation or deployment.
- Structured allowlisted operators only; no arbitrary model-generated code execution.
- Testnet funds and explicit user approval for the demonstrated payment path.
- Server-side secrets, workspace authorization, immutable versions, bounded provider access, and idempotent side effects.
- No automatic bridge or conversion between Graph access funds and Hedera revenue.
- Public pages omit creator credentials, private traces, wallet authorization material, and internal deployment credentials.
