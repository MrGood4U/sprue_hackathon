import type { AppConfig } from "../../app/config.js";
import { createAgentModel } from "../agent/harness/factory.js";
import { AgentHarness } from "../agent/harness/controller.js";
import {
  testOpenAICompatibleModel,
  type AgentModelConnectionTestResult,
} from "../agent/harness/remote-model.js";
import {
  MVP_ARBITRUM_SOURCE_KEY,
  MVP_ETHEREUM_SOURCE_KEY,
} from "../agent/harness/mock-model.js";
import type { AgentModelConfig, AgentModelPort, HarnessResult } from "../agent/harness/types.js";
import type {
  ProviderFieldType,
  SourceInput,
} from "../dag/runtime.js";

export const DEMO_PRODUCT_SLUG = "cross-chain-dex-trader-footprint";
export const DEMO_PRODUCT_NAME = "Cross-chain DEX Trader Footprint";
export const DEMO_INTENT =
  "Find wallets that traded on both Ethereum and Arbitrum DEX sources during the last 30 complete UTC days, and return per-chain activity plus combined volume.";

const startInclusive = String(Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000));
const endExclusive = String(Math.floor(Date.parse("2026-08-31T00:00:00Z") / 1000));
const commonWallet = "0x1111111111111111111111111111111111111111";
const ethereumOnlyWallet = "0x2222222222222222222222222222222222222222";
const arbitrumOnlyWallet = "0x3333333333333333333333333333333333333333";
const ethereumPool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const arbitrumPool = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const usdc = "0xcccccccccccccccccccccccccccccccccccccccc";
const weth = "0xdddddddddddddddddddddddddddddddddddddddd";

const dataApiRequestParameters = [
  {
    name: "limit",
    location: "query",
    type: "integer",
    required: false,
    default: 100,
    minimum: 1,
    maximum: 1000,
    example: 100,
  },
] as const;

const dataApiResponseFields = [
  {path: "data", type: "array<result>", required: true},
  {path: "data[].wallet", type: "address", required: true},
  {path: "data[].chains", type: "array<string>", required: true},
  {path: "data[].byChain", type: "object<string, wallet_chain_summary>", required: true},
  {path: "data[].combinedTradeCount", type: "count", required: true},
  {path: "data[].combinedVolumeUsd", type: "decimal", required: true},
  {path: "data[].firstSeenAt", type: "timestamp", required: true},
  {path: "data[].lastSeenAt", type: "timestamp", required: true},
  {path: "meta", type: "delivery_metadata", required: true},
] as const;

const swapFieldTypes: Readonly<Record<string, ProviderFieldType>> = {
  "account.id": "address",
  id: "id",
  "pool.id": "address",
  timestamp: "integer",
  amountInUSD: "decimal",
  amountOutUSD: "decimal",
  "tokenIn.id": "address",
  "tokenOut.id": "address",
};

function source(
  sourceKey: string,
  chain: string,
  subgraphId: string,
  deploymentId: string,
  rows: readonly Record<string, unknown>[],
): SourceInput {
  return {
    schema: {
      sourceKey,
      chain,
      subgraphId,
      deploymentId,
      schemaHash: `sha256:demo-${chain}-swap-schema`,
      fieldTypes: swapFieldTypes,
    },
    mapping: {
      sourceKey,
      chain,
      fields: {
        wallet: "account.id",
        tradeId: "id",
        pool: "pool.id",
        timestamp: "timestamp",
        amountInUsd: "amountInUSD",
        amountOutUsd: "amountOutUSD",
        tokenIn: "tokenIn.id",
        tokenOut: "tokenOut.id",
      },
    },
    rows,
  };
}

function swap(
  id: string,
  wallet: string,
  pool: string,
  timestamp: string,
  amountInUSD: string,
  amountOutUSD: string,
): Record<string, unknown> {
  return {
    account: { id: wallet },
    id,
    pool: { id: pool },
    timestamp,
    amountInUSD,
    amountOutUSD,
    tokenIn: { id: usdc },
    tokenOut: { id: weth },
  };
}

function createSources(): readonly SourceInput[] {
  return [
    source(
      MVP_ETHEREUM_SOURCE_KEY,
      "ethereum",
      "subgraph-demo-uniswap-v3-ethereum",
      "deployment-demo-uniswap-v3-ethereum",
      [
        swap("eth-001", commonWallet, ethereumPool, "1785585600", "120.50", "120.48"),
        swap("eth-002", commonWallet, ethereumPool, "1786881600", "80.25", "80.30"),
        swap("eth-003", ethereumOnlyWallet, ethereumPool, "1787486400", "42.00", "41.98"),
      ],
    ),
    source(
      MVP_ARBITRUM_SOURCE_KEY,
      "arbitrum",
      "subgraph-demo-uniswap-v3-arbitrum",
      "deployment-demo-uniswap-v3-arbitrum",
      [
        swap("arb-001", commonWallet, arbitrumPool, "1785844800", "200.00", "199.92"),
        swap("arb-002", commonWallet, arbitrumPool, "1787313600", "55.75", "55.79"),
        swap("arb-003", arbitrumOnlyWallet, arbitrumPool, "1787659200", "17.50", "17.48"),
      ],
    ),
  ];
}

function isoTimestamp(value: string): string {
  return new Date(Number(value) * 1000).toISOString();
}

function serializeOutput(result: HarnessResult["execution"]): readonly Record<string, unknown>[] {
  return result.crossChain.map((row) => ({
    wallet: row.wallet,
    chains: [...row.chains],
    byChain: row.byChain,
    combinedTradeCount: row.combinedTradeCount,
    combinedVolumeUsd: row.combinedVolumeUsd,
    firstSeenAt: isoTimestamp(row.firstSeenAt),
    lastSeenAt: isoTimestamp(row.lastSeenAt),
  }));
}

function serializeDataResponse(
  output: readonly Record<string, unknown>[],
  limit: number = dataApiRequestParameters[0].default,
): Record<string, unknown> {
  const data = output.slice(0, limit);
  return {
    data,
    meta: {
      correlationId: "req_demo_api_preview",
      version: {
        id: "40000000-0000-4000-8000-000000000001",
        versionNo: 1,
        specHash: "sha256:demo-product-version-v1",
      },
      materializationId: "40000000-0000-4000-8000-000000000002",
      sourceFreshnessAt: "2026-08-31T00:00:00.000Z",
      materializedAt: "2026-08-31T00:05:00.000Z",
      returnedRows: String(data.length),
      totalRows: String(output.length),
      truncated: data.length < output.length,
      freshness: "demo",
      authorizationMode: "creator_preview",
      dataSource: "backend_demo",
    },
  };
}

function sourceSnapshots(result: HarnessResult): readonly Record<string, unknown>[] {
  return result.proposal.sources.map((selected) => {
    const input = createSources().find((candidate) => candidate.schema.sourceKey === selected.sourceKey)!;
    return {
      id: selected.sourceKey,
      sourceSnapshotId: `demo-snapshot-${selected.chain}`,
      provider: "the_graph",
      kind: "subgraph",
      adapterVersion: "1",
      dataNetwork: selected.chain === "ethereum" ? "eip155:1" : "eip155:42161",
      target: {
        type: "deployment_id",
        id: input.schema.deploymentId,
        logicalSubgraphId: input.schema.subgraphId,
        manifestIpfsCid: null,
      },
      schemaHash: input.schema.schemaHash,
      access: {
        mode: "x402",
        gatewayEnvironment: "testnet",
        providerCredentialId: null,
        spendingPolicyId: "demo-policy",
      },
      consistency: { mode: "pinned_block", indexingErrorPolicy: "deny" },
      mapping: selected.mapping,
    };
  });
}

function buildState(config: AppConfig, result: HarnessResult, productName = DEMO_PRODUCT_NAME): DemoState {
  const output = serializeOutput(result.execution);
  const x402Ready = true;
  const agent = {
    status: "ready_for_review" as const,
    provider: result.model.provider,
    model: result.model.model,
    intent: result.proposal.intentSummary,
    sources: result.proposal.sources.map(({sourceKey, chain}) => ({sourceKey, chain})),
    nodeCount: result.proposal.dag.nodes.length,
    edgeCount: result.proposal.dag.edges.length,
    outputFieldCount: result.proposal.outputSchema.fields.length,
    trace: result.trace,
  };
  const endpoint = `${config.dataPublicBaseUrl}/${DEMO_PRODUCT_SLUG}`;
  const draft = {
    parameters: { windowDays: 30, minimumActiveDays: 2 },
    specification: {
      schemaVersion: 1,
      runtimeVersion: "1",
      intent: { summary: result.proposal.intentSummary },
      sources: sourceSnapshots(result),
      dag: result.proposal.dag,
      outputSchema: result.proposal.outputSchema,
      refreshPolicy: { mode: "scheduled", cronExpression: "0 * * * *", timezone: "UTC" },
      resourcePolicy: {
        maxNodes: 16,
        maxSourceRows: 50000,
        maxSourceRequests: 100,
        maxOutputRows: 5000,
        maxOutputBytes: 5242880,
        maxStoredBytes: 20971520,
        maxRuntimeMs: 120000,
      },
    },
    groups: [
      {
        id: "ethereum-activity",
        templateId: "chain_activity",
        templateVersion: "1",
        labelKey: "dag.ethereumActivity",
        nodeIds: ["source-ethereum", "map-ethereum", "filter-ethereum", "aggregate-ethereum"],
      },
      {
        id: "arbitrum-activity",
        templateId: "chain_activity",
        templateVersion: "1",
        labelKey: "dag.arbitrumActivity",
        nodeIds: ["source-arbitrum", "map-arbitrum", "filter-arbitrum", "aggregate-arbitrum"],
      },
    ],
    referenceResult: output,
  };

  return {
    dataSource: "backend_demo",
    generatedAt: new Date().toISOString(),
    agent,
    product: {
      slug: DEMO_PRODUCT_SLUG,
      name: productName,
      description: "Wallet activity observed on both Ethereum and Arbitrum DEX sources, with per-chain summaries and combined volume.",
      intent: result.proposal.intentSummary,
      endpoint,
      version: "v1",
      status: "ready",
      draft,
    },
    dashboard: {
      metrics: {
        activeProducts: { value: "1", note: "1 published version" },
        requests: { value: "1,284", note: "Evaluator traffic" },
        graphSpend: { value: "$2.84", note: "Within the demo policy" },
        revenue: { value: "18.42 HBAR", note: "Demo settlement record" },
      },
      products: [{
        slug: DEMO_PRODUCT_SLUG,
        name: productName,
        description: "Ethereum + Arbitrum wallet overlap",
        sourceLabel: "2 The Graph sources",
        apiStatus: "Ready",
        x402Status: x402Ready ? "ready" : "not_ready",
        x402Network: "Hedera testnet",
        lastRun: "Generated from backend",
        rows: String(output.length),
      }],
      activities: [
        {kind: "schema", title: "Two source schemas validated", detail: "Ethereum and Arbitrum Swap mappings"},
        {kind: "snapshot", title: "Source snapshot pinned", detail: "One deployment per chain"},
        {kind: "policy", title: "Bounded spend policy available", detail: "Graph x402 branch"},
      ],
      sponsorProof: [
        {name: "The Graph", status: "Source verified"},
        {name: "Privy", status: "Wallet boundary ready"},
        {name: "Hedera", status: "x402 settlement ready"},
      ],
    },
    wallet: {
      address: "0x71F2000000000000000000000000000000009C84",
      balances: [
        {
          id: "graph-spend",
          kind: "graph_spend",
          amount: "3.12",
          asset: "USDC",
          network: "Base Sepolia",
          networkId: "eip155:84532",
          accountRef: "0x71F2000000000000000000000000000000009C84",
          liveTransferAvailable: false,
        },
        {
          id: "x402-revenue",
          kind: "x402_revenue",
          amount: "18.42",
          asset: "HBAR",
          network: "Hedera testnet",
          networkId: "hedera:testnet",
          accountRef: "0.0.7392014",
          liveTransferAvailable: false,
        },
      ],
      spendAuthority: {
        status: "Active",
        perRequest: "0.05 USDC",
        dailyCeiling: "5.00 USDC",
        allowedPayee: "The Graph x402",
        expires: "2026-09-30",
      },
      access: { defaultMode: "x402", modes: ["api", "x402"] },
      credentials: [{name: "graph-production-01", detail: "Server-side reference · existing subscription", status: "Vaulted"}],
    },
    api: {
      endpoint,
      method: "GET",
      status: "Healthy",
      contract: { version: "v1", authentication: "Optional Hedera x402", response: "application/json", cache: "5 minute cache", rateLimit: "60 requests / minute" },
      requestParameters: dataApiRequestParameters,
      responseSchema: {status: 200, mediaType: "application/json", fields: dataApiResponseFields},
      responseExample: serializeDataResponse(output),
    },
    monetization: {
      published: x402Ready,
      price: "0.20",
      asset: "HBAR",
      network: "hedera:testnet",
      recipient: "0.0.7392014",
      facilitator: "Blocky402",
    },
    public: {
      slug: DEMO_PRODUCT_SLUG,
      price: "0.20 HBAR",
      publisher: "0x71F2…9C84",
      schema: "Cross-chain wallet footprint",
      freshness: "Hourly refresh",
      provenance: "2 pinned Graph deployments",
      settlement: "Hedera x402",
    },
  };
}

export interface DemoState {
  dataSource: "backend_demo";
  generatedAt: string;
  product: {
    slug: string;
    name: string;
    description: string;
    intent: string;
    endpoint: string;
    version: string;
    status: string;
    draft: {
      parameters: {windowDays: number; minimumActiveDays: number};
      specification: {
        dag: {nodes: readonly unknown[]; edges: readonly unknown[]};
        outputSchema: {fields: readonly {name: string; type: string}[]};
        [key: string]: unknown;
      };
      groups: readonly Record<string, unknown>[];
      referenceResult: readonly Record<string, unknown>[];
    };
  };
  agent: {
    status: "ready_for_review";
    provider: "mock" | "remote";
    model: string;
    intent: string;
    sources: readonly {sourceKey: string; chain: string}[];
    nodeCount: number;
    edgeCount: number;
    outputFieldCount: number;
    trace: readonly {
      sequenceNo: number;
      stage: string;
      status: string;
      summary: string;
    }[];
  };
  dashboard: Record<string, unknown>;
  wallet: Record<string, unknown>;
  api: Record<string, unknown>;
  monetization: Record<string, unknown>;
  public: Record<string, unknown>;
}

export type DemoAction =
  | {action: "agent_plan"; intent?: string}
  | {action: "rename_product"; name: string}
  | {action: "build"; parameters?: {windowDays: 30; minimumActiveDays: 2}}
  | {action: "api_request"; parameters?: {limit: number}}
  | {action: "consumer_request"};

export interface DemoModelProfileInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
}

export interface DemoModelProfileView {
  configured: boolean;
  protocol: "openai_compatible_chat_completions";
  apiUrl: string;
  model: string;
  hasApiKey: boolean;
  updatedAt: string | null;
}

interface DemoModelProfileSecret {
  apiUrl: string;
  apiKey: string;
  model: string;
  updatedAt: string;
}

interface DemoSessionState {
  profile?: DemoModelProfileSecret;
  lastHarness?: HarnessResult;
  productName?: string;
  touchedAt: number;
}

const maxDemoSessions = 64;
type AgentModelFactory = (config: AgentModelConfig) => AgentModelPort;
type AgentModelTester = (config: AgentModelConfig) => Promise<AgentModelConnectionTestResult>;

export class DemoModelProfileInputError extends Error {
  constructor() {
    super("The model profile is invalid");
    this.name = "DemoModelProfileInputError";
  }
}

export class DemoModelConnectionError extends Error {
  constructor() {
    super("The model service is unavailable");
    this.name = "DemoModelConnectionError";
  }
}

function normalizeModelProfile(input: DemoModelProfileInput, existing?: DemoModelProfileSecret): DemoModelProfileSecret {
  let url: URL;
  try {
    url = new URL(input.apiUrl.trim());
  } catch {
    throw new DemoModelProfileInputError();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DemoModelProfileInputError();
  }
  const apiKey = input.apiKey?.trim() || existing?.apiKey;
  const model = input.model.trim();
  if (!apiKey || apiKey.length > 4096 || model.length === 0 || model.length > 200) {
    throw new DemoModelProfileInputError();
  }
  return {
    apiUrl: url.href,
    apiKey,
    model,
    updatedAt: new Date().toISOString(),
  };
}

function profileView(profile?: DemoModelProfileSecret): DemoModelProfileView {
  return {
    configured: Boolean(profile),
    protocol: "openai_compatible_chat_completions",
    apiUrl: profile?.apiUrl ?? "",
    model: profile?.model ?? "",
    hasApiKey: Boolean(profile?.apiKey),
    updatedAt: profile?.updatedAt ?? null,
  };
}

export class DemoRuntime {
  private readonly sources = createSources();
  private readonly defaultHarness: AgentHarness;
  private readonly sessions = new Map<string, DemoSessionState>();

  constructor(
    private readonly config: AppConfig,
    private readonly modelFactory: AgentModelFactory = createAgentModel,
    private readonly modelTester: AgentModelTester = testOpenAICompatibleModel,
  ) {
    this.defaultHarness = new AgentHarness(this.modelFactory(config.agent));
  }

  private touchSession(sessionId: string): DemoSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.touchedAt = Date.now();
      return existing;
    }
    if (this.sessions.size >= maxDemoSessions) {
      const oldest = [...this.sessions.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0];
      if (oldest) this.sessions.delete(oldest[0]);
    }
    const created = {touchedAt: Date.now()};
    this.sessions.set(sessionId, created);
    return created;
  }

  private async runHarness(intent = DEMO_INTENT, profile?: DemoModelProfileSecret): Promise<HarnessResult> {
    const harness = profile
      ? new AgentHarness(this.modelFactory({
          mode: "remote",
          apiUrl: profile.apiUrl,
          apiKey: profile.apiKey,
          model: profile.model,
          timeoutMs: this.config.agent.timeoutMs,
        }))
      : this.defaultHarness;
    return harness.run({
      intent,
      sources: this.sources,
      executionWindow: {startInclusive, endExclusive},
    });
  }

  getModelProfile(sessionId: string): DemoModelProfileView {
    return profileView(this.sessions.get(sessionId)?.profile);
  }

  saveModelProfile(sessionId: string, input: DemoModelProfileInput): DemoModelProfileView {
    const session = this.touchSession(sessionId);
    session.profile = normalizeModelProfile(input, session.profile);
    return profileView(session.profile);
  }

  async testModelProfile(sessionId: string, input: DemoModelProfileInput): Promise<AgentModelConnectionTestResult> {
    const session = this.touchSession(sessionId);
    const candidate = normalizeModelProfile(input, session.profile);
    try {
      return await this.modelTester({
        mode: "remote",
        apiUrl: candidate.apiUrl,
        apiKey: candidate.apiKey,
        model: candidate.model,
        timeoutMs: this.config.agent.timeoutMs,
      });
    } catch {
      throw new DemoModelConnectionError();
    }
  }

  async getState(sessionId?: string): Promise<DemoState> {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    return buildState(
      this.config,
      session?.lastHarness ?? await this.runHarness(),
      session?.productName,
    );
  }

  async run(action: DemoAction, sessionId?: string): Promise<{state: DemoState; result: Record<string, unknown>}> {
    const session = sessionId ? this.touchSession(sessionId) : undefined;
    let harness = session?.lastHarness;
    if (action.action === "agent_plan") {
      harness = await this.runHarness(action.intent, session?.profile);
      if (session) session.lastHarness = harness;
    }
    if (action.action === "rename_product" && session) {
      session.productName = action.name.trim();
    }
    harness ??= await this.runHarness();
    const productName = action.action === "rename_product"
      ? action.name.trim()
      : session?.productName;
    const state = buildState(this.config, harness, productName);
    const responseData = serializeOutput(harness.execution);
    if (action.action === "agent_plan") {
      return {
        state,
        result: {
          status: "ready_for_review",
          source: "backend_demo_runtime",
          model: harness.model,
          trace: harness.trace,
        },
      };
    }
    if (action.action === "rename_product") {
      return {
        state,
        result: {
          status: "renamed",
          source: "backend_demo_runtime",
          name: state.product.name,
        },
      };
    }
    if (action.action === "build") {
      return {
        state,
        result: {
          status: "complete",
          source: "backend_demo_runtime",
          model: harness.model,
          trace: harness.trace,
        },
      };
    }
    if (action.action === "api_request") {
      return {state, result: serializeDataResponse(responseData, action.parameters?.limit)};
    }
    return {
      state,
      result: {
        payment: {
          network: "hedera:testnet",
          asset: "HBAR",
          amount: "0.20",
          transaction_id: "0.0.7392014@1788556321.441",
        },
        data: responseData,
      },
    };
  }
}
