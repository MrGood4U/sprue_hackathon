import type {CanonicalSwapField, CrossChainTraderFootprintResult, SourceInput} from "../../dag/runtime.js";

export interface AgentModelConfig {
  mode: "mock" | "remote";
  apiUrl: string | null;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}

export interface AgentModelRequest {
  intent: string;
  sourceSummaries: readonly {
    sourceKey: string;
    chain: string;
    schemaHash: string;
  }[];
}

export interface AgentModelResponse {
  provider: "mock" | "remote";
  model: string;
  output: unknown;
}

export interface AgentModelPort {
  complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse>;
}

export interface MockSourceSelection {
  sourceKey: string;
  chain: string;
  mapping: Readonly<Record<CanonicalSwapField, string>>;
}

export interface MockDagNode {
  id: string;
  type: "source" | "filter" | "map" | "aggregate" | "union" | "join" | "output";
  operatorVersion: "1";
  config: Readonly<Record<string, unknown>>;
}

export interface MockDagEdge {
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface MockAgentProposal {
  schemaVersion: 1;
  kind: "proposal";
  intentSummary: string;
  window: {kind: "complete_utc_days"; days: 30};
  sources: readonly MockSourceSelection[];
  dag: {nodes: readonly MockDagNode[]; edges: readonly MockDagEdge[]};
  outputSchema: {
    fields: readonly {name: string; type: string}[];
  };
  assumptions: readonly string[];
  blockers: readonly string[];
}

export interface HarnessRequest {
  intent: string;
  sources: readonly SourceInput[];
  executionWindow?: {startInclusive: string; endExclusive: string};
}

export interface HarnessTraceEvent {
  sequenceNo: number;
  stage: "admit" | "model" | "proposal_validation" | "source_mapping" | "dag_execution" | "output";
  status: "started" | "passed" | "failed";
  summary: string;
}

export interface HarnessResult {
  proposal: MockAgentProposal;
  execution: CrossChainTraderFootprintResult;
  trace: readonly HarnessTraceEvent[];
  model: {provider: AgentModelResponse["provider"]; model: string};
}
