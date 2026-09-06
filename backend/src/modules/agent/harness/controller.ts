import {z} from "zod";
import {executeCrossChainTraderFootprint, type CanonicalSwapField, type SourceInput} from "../../dag/runtime.js";
import type {
  AgentModelPort,
  AgentModelResponse,
  HarnessRequest,
  HarnessResult,
  HarnessTraceEvent,
  MockAgentProposal,
} from "./types.js";
import {MVP_ARBITRUM_SOURCE_KEY, MVP_ETHEREUM_SOURCE_KEY} from "./mock-model.js";

const canonicalFields = ["wallet", "tradeId", "pool", "timestamp", "amountInUsd", "amountOutUsd", "tokenIn", "tokenOut"] as const;
const sourceSelectionSchema = z.object({
  sourceKey: z.string().min(1).max(200),
  chain: z.string().min(1).max(100),
  mapping: z.record(z.string(), z.string().min(1).max(200)),
}).strict();
const proposalSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("proposal"),
  intentSummary: z.string().min(1).max(8000),
  window: z.object({kind: z.literal("complete_utc_days"), days: z.literal(30)}).strict(),
  sources: z.array(sourceSelectionSchema).length(2),
  dag: z.object({
    nodes: z.array(z.object({
      id: z.string().min(1).max(100),
      type: z.enum(["source", "filter", "map", "aggregate", "union", "join", "output"]),
      operatorVersion: z.literal("1"),
      config: z.record(z.string(), z.unknown()),
    }).strict()).min(1).max(32),
    edges: z.array(z.object({
      fromNode: z.string().min(1).max(100),
      fromPort: z.string().min(1).max(100),
      toNode: z.string().min(1).max(100),
      toPort: z.string().min(1).max(100),
    }).strict()).max(64),
  }).strict(),
  outputSchema: z.object({
    fields: z.array(z.object({name: z.string().min(1).max(100), type: z.string().min(1).max(100)}).strict()).min(1).max(32),
  }).strict(),
  assumptions: z.array(z.string().min(1).max(1000)).max(16),
  blockers: z.array(z.string().min(1).max(1000)).max(16),
}).strict();

export class HarnessValidationError extends Error {
  readonly code = "AGENT_HARNESS_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "HarnessValidationError";
  }
}

function fail(message: string): never {
  throw new HarnessValidationError(message);
}

function addTrace(trace: HarnessTraceEvent[], stage: HarnessTraceEvent["stage"], status: HarnessTraceEvent["status"], summary: string): void {
  trace.push({sequenceNo: trace.length + 1, stage, status, summary});
}

function validateProposal(output: unknown): MockAgentProposal {
  const result = proposalSchema.safeParse(output);
  if (!result.success) fail(`Agent response failed schema validation: ${result.error.issues[0]?.message ?? "invalid proposal"}`);
  const proposal = result.data;
  const sourceKeys = new Set(proposal.sources.map((source) => source.sourceKey));
  if (sourceKeys.size !== proposal.sources.length) fail("proposal contains duplicate source keys");
  for (const source of proposal.sources) {
    for (const field of canonicalFields) {
      if (typeof source.mapping[field] !== "string") fail(`proposal mapping is missing canonical field ${field}`);
    }
    if (Object.keys(source.mapping).length !== canonicalFields.length) fail(`proposal mapping for ${source.sourceKey} contains unknown fields`);
  }
  const nodeIds = new Set(proposal.dag.nodes.map((node) => node.id));
  if (nodeIds.size !== proposal.dag.nodes.length) fail("proposal contains duplicate DAG node IDs");
  if (proposal.dag.nodes.filter((node) => node.type === "output").length !== 1) fail("proposal must contain exactly one output node");
  for (const edge of proposal.dag.edges) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) fail("proposal edge references an unknown node");
  }
  return proposal as unknown as MockAgentProposal;
}

function selectSources(proposal: MockAgentProposal, available: readonly SourceInput[]): readonly SourceInput[] {
  const availableByKey = new Map(available.map((source) => [source.schema.sourceKey, source]));
  const selected: SourceInput[] = [];
  for (const source of proposal.sources) {
    const input = availableByKey.get(source.sourceKey);
    if (!input) fail(`proposal selected unavailable source ${source.sourceKey}`);
    if (input.schema.chain !== source.chain) fail(`proposal chain does not match source ${source.sourceKey}`);
    selected.push({
      ...input,
      mapping: {
        sourceKey: source.sourceKey,
        chain: source.chain,
        fields: source.mapping as Record<CanonicalSwapField, string>,
      },
    });
  }
  return selected;
}

export class AgentHarness {
  constructor(
    private readonly model: AgentModelPort,
    private readonly limits: {maxSources: number; maxModelCalls: number; maxIntentLength: number; maxProposalBytes: number} = {
      maxSources: 4,
      maxModelCalls: 1,
      maxIntentLength: 8000,
      maxProposalBytes: 1_048_576,
    },
  ) {}

  async run(request: HarnessRequest, signal?: AbortSignal): Promise<HarnessResult> {
    const trace: HarnessTraceEvent[] = [];
    const intent = request.intent.trim();
    if (intent.length === 0 || intent.length > this.limits.maxIntentLength) fail("intent length is outside harness limits");
    if (request.sources.length < 2 || request.sources.length > this.limits.maxSources) fail("source count is outside harness limits");
    addTrace(trace, "admit", "passed", "intent and source count accepted within harness limits");

    const modelRequest = {
      intent,
      sourceSummaries: request.sources.map((source) => ({
        sourceKey: source.schema.sourceKey,
        chain: source.schema.chain,
        schemaHash: source.schema.schemaHash,
        fields: source.schema.fieldTypes,
      })),
    };
    addTrace(trace, "model", "started", "planner invoked with intent and bounded schema summaries");
    const response: AgentModelResponse = await this.model.complete(modelRequest, signal);
    const responseBytes = new TextEncoder().encode(JSON.stringify(response.output)).byteLength;
    if (responseBytes > this.limits.maxProposalBytes) fail("Agent proposal exceeds harness output limit");
    addTrace(trace, "model", "passed", `${response.provider} planner returned one bounded ${response.model} response`);

    const proposal = validateProposal(response.output);
    addTrace(trace, "proposal_validation", "passed", "proposal schema, source keys, node IDs, edges, and output cardinality validated");
    const selected = selectSources(proposal, request.sources);
    addTrace(trace, "source_mapping", "started", "proposal mappings applied to the supplied source schema snapshots");
    const expectedKeys = new Set([MVP_ETHEREUM_SOURCE_KEY, MVP_ARBITRUM_SOURCE_KEY]);
    if (new Set(selected.map((source) => source.schema.sourceKey)).size !== 2 || selected.some((source) => !expectedKeys.has(source.schema.sourceKey))) {
      fail("mock MVP harness requires the Ethereum and Arbitrum source pair");
    }
    addTrace(trace, "source_mapping", "passed", "source mappings accepted without provider field names in runtime logic");

    addTrace(trace, "dag_execution", "started", "deterministic Union, Aggregate, Join, and Output path started");
    const execution = executeCrossChainTraderFootprint(selected, {
      leftChain: "ethereum",
      rightChain: "arbitrum",
      ...request.executionWindow,
    });
    addTrace(trace, "dag_execution", "passed", `processed ${execution.unionRows.length} canonical rows into ${execution.crossChain.length} cross-chain wallet rows`);
    addTrace(trace, "output", "passed", "materialization-shaped output is available to the caller; no external side effect was performed");
    return {proposal, execution, trace, model: {provider: response.provider, model: response.model}};
  }
}
