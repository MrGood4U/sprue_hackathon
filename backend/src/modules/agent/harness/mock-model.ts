import type {
  AgentModelConfig,
  AgentModelPort,
  AgentModelRequest,
  AgentModelResponse,
  MockAgentProposal,
} from "./types.js";

export const MVP_ETHEREUM_SOURCE_KEY = "uniswap-v3-ethereum";
export const MVP_ARBITRUM_SOURCE_KEY = "uniswap-v3-arbitrum";

const swapMapping = {
  wallet: "account.id",
  tradeId: "id",
  pool: "pool.id",
  timestamp: "timestamp",
  amountInUsd: "amountInUSD",
  amountOutUsd: "amountOutUSD",
  tokenIn: "tokenIn.id",
  tokenOut: "tokenOut.id",
} as const;

function sourceNode(id: string, sourceKey: string): {id: string; type: "source"; operatorVersion: "1"; config: Record<string, unknown>} {
  return {id, type: "source", operatorVersion: "1", config: {sourceKey}};
}

function mapNode(id: string, sourceKey: string): {id: string; type: "map"; operatorVersion: "1"; config: Record<string, unknown>} {
  return {id, type: "map", operatorVersion: "1", config: {sourceKey, mapping: swapMapping}};
}

function filterNode(id: string, sourceKey: string): {id: string; type: "filter"; operatorVersion: "1"; config: Record<string, unknown>} {
  return {id, type: "filter", operatorVersion: "1", config: {sourceKey, window: "run.window.completeUtcDays"}};
}

function aggregateNode(id: string, sourceKey: string): {id: string; type: "aggregate"; operatorVersion: "1"; config: Record<string, unknown>} {
  return {id, type: "aggregate", operatorVersion: "1", config: {sourceKey, groupBy: ["wallet"], measures: ["tradeCount", "volumeUsd", "firstSeenAt", "lastSeenAt"]}};
}

export function createMockMvpProposal(intent: string): MockAgentProposal {
  const ethereumSource = sourceNode("source-ethereum", MVP_ETHEREUM_SOURCE_KEY);
  const ethereumMap = mapNode("map-ethereum", MVP_ETHEREUM_SOURCE_KEY);
  const ethereumFilter = filterNode("filter-ethereum", MVP_ETHEREUM_SOURCE_KEY);
  const ethereumAggregate = aggregateNode("aggregate-ethereum", MVP_ETHEREUM_SOURCE_KEY);
  const arbitrumSource = sourceNode("source-arbitrum", MVP_ARBITRUM_SOURCE_KEY);
  const arbitrumMap = mapNode("map-arbitrum", MVP_ARBITRUM_SOURCE_KEY);
  const arbitrumFilter = filterNode("filter-arbitrum", MVP_ARBITRUM_SOURCE_KEY);
  const arbitrumAggregate = aggregateNode("aggregate-arbitrum", MVP_ARBITRUM_SOURCE_KEY);

  return {
    schemaVersion: 1,
    kind: "proposal",
    intentSummary: intent.trim(),
    window: {kind: "complete_utc_days", days: 30},
    sources: [
      {sourceKey: MVP_ETHEREUM_SOURCE_KEY, chain: "ethereum", mapping: swapMapping},
      {sourceKey: MVP_ARBITRUM_SOURCE_KEY, chain: "arbitrum", mapping: swapMapping},
    ],
    dag: {
      nodes: [
        ethereumSource,
        ethereumMap,
        ethereumFilter,
        ethereumAggregate,
        arbitrumSource,
        arbitrumMap,
        arbitrumFilter,
        arbitrumAggregate,
        {id: "union-activity", type: "union", operatorVersion: "1", config: {schema: "canonical_swap", outputView: "allActivity"}},
        {id: "join-wallets", type: "join", operatorVersion: "1", config: {keys: ["wallet"], type: "inner", cardinality: "one_to_one_after_aggregate"}},
        {id: "output-footprint", type: "output", operatorVersion: "1", config: {views: ["crossChain", "allActivity"]}},
      ],
      edges: [
        {fromNode: ethereumSource.id, fromPort: "rows", toNode: ethereumMap.id, toPort: "rows"},
        {fromNode: ethereumMap.id, fromPort: "rows", toNode: ethereumFilter.id, toPort: "rows"},
        {fromNode: ethereumFilter.id, fromPort: "rows", toNode: ethereumAggregate.id, toPort: "rows"},
        {fromNode: ethereumMap.id, fromPort: "rows", toNode: "union-activity", toPort: "left"},
        {fromNode: arbitrumSource.id, fromPort: "rows", toNode: arbitrumMap.id, toPort: "rows"},
        {fromNode: arbitrumMap.id, fromPort: "rows", toNode: arbitrumFilter.id, toPort: "rows"},
        {fromNode: arbitrumFilter.id, fromPort: "rows", toNode: arbitrumAggregate.id, toPort: "rows"},
        {fromNode: arbitrumMap.id, fromPort: "rows", toNode: "union-activity", toPort: "right"},
        {fromNode: ethereumAggregate.id, fromPort: "rows", toNode: "join-wallets", toPort: "left"},
        {fromNode: arbitrumAggregate.id, fromPort: "rows", toNode: "join-wallets", toPort: "right"},
        {fromNode: "join-wallets", fromPort: "rows", toNode: "output-footprint", toPort: "crossChain"},
        {fromNode: "union-activity", fromPort: "rows", toNode: "output-footprint", toPort: "allActivity"},
      ],
    },
    outputSchema: {
      fields: [
        {name: "wallet", type: "address"},
        {name: "ethereum", type: "wallet_chain_summary"},
        {name: "arbitrum", type: "wallet_chain_summary"},
        {name: "combinedTradeCount", type: "count"},
        {name: "combinedVolumeUsd", type: "decimal"},
        {name: "firstSeenAt", type: "timestamp"},
        {name: "lastSeenAt", type: "timestamp"},
      ],
    },
    assumptions: [
      "The two source schemas expose a compatible Swap-shaped field mapping.",
      "Volume prefers amountInUsd and falls back to amountOutUsd when the input-side value is unavailable.",
      "The cross-chain Join is an inner Join on normalized wallet addresses after per-chain aggregation.",
    ],
    blockers: [],
  };
}

export class MockAgentModel implements AgentModelPort {
  constructor(private readonly config: AgentModelConfig) {}

  async complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    signal?.throwIfAborted();
    return {
      provider: "mock",
      model: this.config.model,
      output: createMockMvpProposal(request.intent),
    };
  }
}
