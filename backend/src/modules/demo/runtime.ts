import type { AppConfig } from "../../app/config.js";
import { createAgentModel } from "../agent/harness/factory.js";
import { AgentHarness } from "../agent/harness/controller.js";
import {
  MVP_ARBITRUM_SOURCE_KEY,
  MVP_ETHEREUM_SOURCE_KEY,
} from "../agent/harness/mock-model.js";
import type { HarnessResult } from "../agent/harness/types.js";
import type {
  ProviderFieldType,
  SourceInput,
} from "../dag/runtime.js";

export const DEMO_PRODUCT_SLUG = "cross-chain-dex-trader-footprint";
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

function buildState(config: AppConfig, result: HarnessResult): DemoState {
  const output = serializeOutput(result.execution);
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
    product: {
      slug: DEMO_PRODUCT_SLUG,
      name: "Cross-chain DEX Trader Footprint",
      description: "Wallet activity observed on both Ethereum and Arbitrum DEX sources, with per-chain summaries and combined volume.",
      intent: DEMO_INTENT,
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
        name: "Cross-chain DEX Trader Footprint",
        description: "Ethereum + Arbitrum wallet overlap",
        sourceLabel: "2 The Graph sources",
        version: "v1",
        apiStatus: "Ready",
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
      displayAddress: "0x71F2…9C84",
      balance: { amount: "3.12", asset: "USDC", network: "base-sepolia" },
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
      responseExample: { data: output },
      deployment: { artifactDigest: "sha256:demo-backend-runtime", region: "evaluator-local", lastDeployed: "Generated on request", sourceVersion: "Pinned v1" },
    },
    monetization: {
      published: true,
      price: "0.20",
      asset: "HBAR",
      network: "hedera:testnet",
      feePercent: "5",
      creatorReceives: "0.190",
      serviceFee: "0.010",
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
  dashboard: Record<string, unknown>;
  wallet: Record<string, unknown>;
  api: Record<string, unknown>;
  monetization: Record<string, unknown>;
  public: Record<string, unknown>;
}

export interface DemoAction {
  action: "build" | "api_request" | "consumer_request";
  parameters?: {windowDays: 30; minimumActiveDays: 2};
}

export class DemoRuntime {
  private readonly sources = createSources();
  private readonly harness: AgentHarness;

  constructor(private readonly config: AppConfig) {
    this.harness = new AgentHarness(createAgentModel(config.agent));
  }

  private async runHarness(): Promise<HarnessResult> {
    return this.harness.run({
      intent: DEMO_INTENT,
      sources: this.sources,
      executionWindow: {startInclusive, endExclusive},
    });
  }

  async getState(): Promise<DemoState> {
    return buildState(this.config, await this.runHarness());
  }

  async run(action: DemoAction): Promise<{state: DemoState; result: Record<string, unknown>}> {
    const harness = await this.runHarness();
    const state = buildState(this.config, harness);
    const responseData = serializeOutput(harness.execution);
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
      return {state, result: {data: responseData}};
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
