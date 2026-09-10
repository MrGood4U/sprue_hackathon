import type {
  AgentModelConfig,
  AgentModelPort,
  AgentModelRequest,
  AgentModelResponse,
  CompositionIntent,
  DiscoverySemanticPlan,
  FlexibleCompositionIntent,
  SemanticPlan,
  SourceDiscoveryPlan,
  SourceEntitySelectionOutput,
  SourceFeasibilityOutput,
  SourceFeasibilitySelection,
  SourceSelectionOutput,
} from "./types.js";

export const MVP_ETHEREUM_SOURCE_KEY = "uniswap-v3-ethereum";
export const MVP_ARBITRUM_SOURCE_KEY = "uniswap-v3-arbitrum";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70);
}

function semanticPlan(
  intent: string,
  availableNetworks: readonly {dataNetwork: string; label: string}[],
): SemanticPlan {
  return {
    schemaVersion: 1,
    kind: "semantic_plan",
    summary: intent.trim(),
    population: {
      entity: "wallet",
      inclusion: "At least one qualifying swap on every requested network.",
      exclusion: [],
    },
    facts: [
      {id: "wallet", type: "address", required: true},
      {id: "trade_id", type: "string", required: true},
      {id: "timestamp", type: "timestamp", required: true},
      {id: "volume_usd", type: "decimal", unit: "USD", required: true},
    ],
    networks: availableNetworks.map((network) => network.dataNetwork),
    grain: "swap_event",
    window: {kind: "complete_utc_days", days: 30},
    metrics: ["trade_count", "volume_usd", "first_seen_at", "last_seen_at"],
    combination: {kind: "intersection", keys: ["wallet"]},
    output: {shape: "wallet_rows", orderBy: ["wallet"]},
    refresh: {mode: "scheduled", timezone: "UTC"},
    assumptions: [
      "Volume uses the input-side USD amount and falls back to the output-side USD amount when needed.",
    ],
    unresolved: [],
  };
}

function semanticOutput(request: Extract<AgentModelRequest, {stage: "semantic_interpretation"}>): SemanticPlan {
  return semanticPlan(request.intent, request.availableNetworks);
}

function searchKeywords(intent: string): readonly string[] {
  const normalized = intent.toLowerCase();
  if (normalized.includes("uniswap v3")) return ["Uniswap V3"];
  for (const protocol of ["Uniswap", "SushiSwap", "PancakeSwap", "Curve", "Aave"]) {
    if (normalized.includes(protocol.toLowerCase())) return [protocol];
  }
  return ["DEX swaps"];
}

function mockProtocol(intent: string): {name: string; version: string | null} | null {
  const normalized = intent.toLowerCase();
  if (normalized.includes("uniswap v3")) return {name: "Uniswap", version: "V3"};
  for (const protocol of ["Uniswap", "SushiSwap", "PancakeSwap", "Curve", "Aave"]) {
    if (normalized.includes(protocol.toLowerCase())) return {name: protocol, version: null};
  }
  return null;
}

function sourceDiscoveryPlanningOutput(
  request: Extract<AgentModelRequest, {stage: "source_discovery_planning"}>,
): SourceDiscoveryPlan {
  const sourceRequirements = request.availableNetworks.map((network, index) => ({
    id: `source_${index + 1}`,
    dataNetwork: network.dataNetwork,
    protocol: mockProtocol(request.intent),
    assets: [],
    description: `Existing indexed records relevant to the stated intent on ${network.label}.`,
    grain: "provider_defined_record",
    fields: [{
      id: "record_id",
      description: "Stable identifier for one returned record.",
      expectedType: "id" as const,
      unit: null,
      required: true,
      allowNullable: false,
      hints: ["id"],
    }],
    constraints: [],
  }));
  const plan: DiscoverySemanticPlan = {
    schemaVersion: 3,
    kind: "semantic_plan",
    summary: request.intent.trim(),
    sourceRequirements,
    result: {
      description: "Bounded records from the selected existing Subgraphs.",
      grain: "provider_defined_record",
      fields: [
        {name: "record_id", description: "Stable source record identifier.", type: "id", unit: null, nullable: false},
        {name: "data_network", description: "CAIP-2 network of the source record.", type: "string", unit: null, nullable: false},
      ],
      orderBy: [{field: "record_id", direction: "asc"}],
    },
    refresh: {mode: "manual", timezone: "UTC"},
    assumptions: ["This deterministic mock output validates harness plumbing only; remote model planning is schema-driven."],
    unresolved: [],
  };
  const keywords = searchKeywords(request.intent).slice(0, request.limits.maxKeywordsPerNetwork);
  return {
    schemaVersion: 3,
    kind: "source_discovery_plan",
    semanticPlan: plan,
    searches: plan.sourceRequirements.map((need) => ({sourceNeedId: need.id, keywords})),
  };
}

function requiredPath(fields: Readonly<Record<string, string>>, preferred: readonly string[], label: string): string {
  const match = preferred.find((path) => Object.prototype.hasOwnProperty.call(fields, path));
  if (!match) throw new Error(`Mock planner could not map ${label}`);
  return match;
}

function sourceSelectionOutput(request: Extract<AgentModelRequest, {stage: "source_selection"}>): SourceSelectionOutput {
  return {
    schemaVersion: 1,
    kind: "source_selection",
    selections: request.sourceNeeds.map((need) => {
      const candidate = request.candidates.find((value) => value.sourceNeedId === need.id);
      if (!candidate) throw new Error(`Mock planner found no candidate for ${need.id}`);
      return {
        sourceNeedId: need.id,
        candidateRef: candidate.candidateRef,
        mapping: {
          wallet: requiredPath(candidate.fields, ["account.id", "sender.id", "wallet.id", "wallet"], "wallet"),
          tradeId: requiredPath(candidate.fields, ["id", "transaction.id", "tradeId"], "tradeId"),
          pool: requiredPath(candidate.fields, ["pool.id", "pool"], "pool"),
          timestamp: requiredPath(candidate.fields, ["timestamp", "blockTimestamp"], "timestamp"),
          amountInUsd: requiredPath(candidate.fields, ["amountInUSD", "amountInUsd"], "amountInUsd"),
          amountOutUsd: requiredPath(candidate.fields, ["amountOutUSD", "amountOutUsd"], "amountOutUsd"),
          tokenIn: requiredPath(candidate.fields, ["tokenIn.id", "tokenIn"], "tokenIn"),
          tokenOut: requiredPath(candidate.fields, ["tokenOut.id", "tokenOut"], "tokenOut"),
        },
        rationale: `The admitted candidate matches ${need.dataNetwork} and exposes the required swap-event fields.`,
      };
    }),
    assumptions: ["Historical coverage and freshness remain unverified until an authorized build."],
  };
}

function compositionFor(
  semanticPlanValue: SemanticPlan,
  sourceRoles: readonly {role: string; sourceNeedId: string; rowSchema: string}[],
): CompositionIntent {
  const branches = sourceRoles.map((source, index) => ({
    source,
    normalizeRole: `normalize_${slug(source.sourceNeedId)}`,
    aggregateRole: `aggregate_${slug(source.sourceNeedId)}_wallet`,
    inputRole: index === 0 ? "left" as const : "right" as const,
  }));
  if (branches.length !== 2) {
    return {
      schemaVersion: 1,
      kind: "composition_intent",
      nodes: [],
      connections: [],
      templateInstances: [],
    };
  }
  if (semanticPlanValue.combination.kind === "append") {
    return {
      schemaVersion: 1,
      kind: "composition_intent",
      nodes: [
        ...branches.map((branch) => ({
          role: branch.normalizeRole,
          operator: "map" as const,
          operatorVersion: "1" as const,
          config: {sourceNeedId: branch.source.sourceNeedId},
        })),
        {role: "union_activity", operator: "union", operatorVersion: "1", config: {mode: "append_compatible_rows"}},
        {role: "sort_activity", operator: "sort", operatorVersion: "1", config: {orderBy: [{field: "wallet", direction: "asc", nulls: "last"}], limit: null}},
        {role: "output_activity", operator: "output", operatorVersion: "1", config: {}},
      ],
      connections: [
        ...branches.flatMap((branch) => [
          {fromRole: branch.source.role, toRole: branch.normalizeRole, inputRole: "rows" as const},
          {fromRole: branch.normalizeRole, toRole: "union_activity", inputRole: branch.inputRole},
        ]),
        {fromRole: "union_activity", toRole: "sort_activity", inputRole: "rows"},
        {fromRole: "sort_activity", toRole: "output_activity", inputRole: "rows"},
      ],
      templateInstances: [],
    };
  }
  return {
    schemaVersion: 1,
    kind: "composition_intent",
    nodes: [
      ...branches.flatMap((branch) => [
        {
          role: branch.normalizeRole,
          operator: "map" as const,
          operatorVersion: "1" as const,
          config: {sourceNeedId: branch.source.sourceNeedId},
        },
        {
          role: branch.aggregateRole,
          operator: "aggregate" as const,
          operatorVersion: "1" as const,
          config: {
            groupBy: ["wallet"],
            measures: ["tradeCount", "volumeUsd", "firstSeenAt", "lastSeenAt"],
          },
        },
      ]),
      {
        role: "join_wallets",
        operator: "join",
        operatorVersion: "1",
        config: {
          type: "inner",
          keys: [{left: "wallet", right: "wallet"}],
          cardinality: "one_to_one",
        },
      },
      {
        role: "compute_combined_fields",
        operator: "map",
        operatorVersion: "1",
        config: {recipe: "cross_chain_wallet_summary_v1"},
      },
      {
        role: "sort_footprint",
        operator: "sort",
        operatorVersion: "1",
        config: {orderBy: [{field: "wallet", direction: "asc", nulls: "last"}], limit: null},
      },
      {
        role: "output_footprint",
        operator: "output",
        operatorVersion: "1",
        config: {},
      },
    ],
    connections: [
      ...branches.flatMap((branch) => [
        {fromRole: branch.source.role, toRole: branch.normalizeRole, inputRole: "rows" as const},
        {fromRole: branch.normalizeRole, toRole: branch.aggregateRole, inputRole: "rows" as const},
        {fromRole: branch.aggregateRole, toRole: "join_wallets", inputRole: branch.inputRole},
      ]),
      {fromRole: "join_wallets", toRole: "compute_combined_fields", inputRole: "rows"},
      {fromRole: "compute_combined_fields", toRole: "sort_footprint", inputRole: "rows"},
      {fromRole: "sort_footprint", toRole: "output_footprint", inputRole: "rows"},
    ],
    templateInstances: [],
  };
}

function compositionOutput(request: Extract<AgentModelRequest, {stage: "dag_composition"}>): CompositionIntent {
  return compositionFor(request.semanticPlan, request.sourceRoles);
}

function sourceEntitySelectionOutput(
  request: Extract<AgentModelRequest, {stage: "source_entity_selection"}>,
): SourceEntitySelectionOutput {
  const selections = request.sourceNeeds.map((need) => {
    const required = need.fields.filter((field) => field.required).map((field) => field.id);
    const candidate = request.candidates
      .filter((value) => value.sourceNeedId === need.id && value.status === "suitable" && value.entities.length > 0)
      .sort((left, right) => (right.totalQueryCount30d ?? -1) - (left.totalQueryCount30d ?? -1))[0];
    const entity = candidate?.entities.find((item) => required.every((id) => item.matchedRequirements.includes(id)))
      ?? candidate?.entities[0];
    return candidate && entity ? {
      sourceNeedId: need.id,
      candidateRef: candidate.candidateRef,
      queryEntity: entity.queryEntity,
      rationale: `The compact inspected evidence best matches the requested ${need.grain} grain.`,
    } : null;
  });
  if (selections.some((selection) => selection === null)) {
    return {
      schemaVersion: 1,
      kind: "unsupported",
      code: "source_entity_unavailable",
      reason: "No suitable inspected query entity is available for every source need.",
      missingFacts: request.sourceNeeds
        .filter((_need, index) => selections[index] === null)
        .map((need) => `${need.dataNetwork}:query_entity`),
    };
  }
  return {
    schemaVersion: 1,
    kind: "source_entity_selection",
    selections: selections.filter((selection) => selection !== null),
    assumptions: [],
  };
}

function sourceFeasibilityOutput(
  request: Extract<AgentModelRequest, {stage: "source_feasibility"}>,
): SourceFeasibilityOutput {
  const selections = request.sourceNeeds.map((need) => {
    const candidate = request.candidates
      .filter((value) => value.sourceNeedId === need.id && value.status === "suitable" && value.entities.length > 0)
      .sort((left, right) => {
        const leftStatus = left.status === "suitable" ? 1 : 0;
        const rightStatus = right.status === "suitable" ? 1 : 0;
        return rightStatus - leftStatus || (right.totalQueryCount30d ?? -1) - (left.totalQueryCount30d ?? -1);
      })[0];
    const entity = candidate?.entities.find((item) => need.fields.every((requirement) =>
      !requirement.required || item.suggestedBindings.some((binding) =>
        binding.requirementId === requirement.id && binding.fieldPaths.length > 0)));
    if (!candidate || !entity) return null;
    const fieldBindings = need.fields.flatMap((requirement) => {
      const fieldPath = entity.suggestedBindings.find((binding) => binding.requirementId === requirement.id)?.fieldPaths[0];
      return fieldPath ? [{requirementId: requirement.id, fieldPath}] : [];
    });
    return {
      sourceNeedId: need.id,
      candidateRef: candidate.candidateRef,
      queryEntity: entity.queryEntity,
      fieldBindings,
      auxiliaryFieldBindings: [],
      rationale: `The inspected entity binds every required semantic field for ${need.dataNetwork}.`,
    };
  });
  if (selections.some((selection) => selection === null)) {
    const missingNeeds = request.sourceNeeds
      .filter((need, index) => selections[index] === null)
      .map((need) => need.dataNetwork);
    return {
      schemaVersion: 1,
      kind: "unsupported",
      code: "source_facts_unavailable",
      reason: "No inspected existing Subgraph entity binds every required semantic field.",
      missingFacts: missingNeeds.map((network) => `${network}:required_schema_fields`),
    };
  }
  const nodes: FlexibleCompositionIntent["nodes"][number][] = [];
  const connections: FlexibleCompositionIntent["connections"][number][] = [];
  const validSelections: SourceFeasibilitySelection[] = selections.filter((selection) => selection !== null);
  const normalizedRoles = request.sourceRoles.map((source) => {
    const selection = validSelections.find((candidate) => candidate.sourceNeedId === source.sourceNeedId)!;
    const candidate = request.candidates.find((value) => value.candidateRef === selection.candidateRef)!;
    const entity = candidate.entities.find((value) => value.queryEntity === selection.queryEntity)!;
    const inspectedByPath = new Map(entity.fields.map((field) => [field.path, field]));
    const targetByName = new Map(source.normalizationTargets.map((field) => [field.name, field]));
    const role = `normalize_${source.sourceNeedId}`;
    nodes.push({
      role,
      operator: "map",
      operatorVersion: "2",
      config: {
        mode: "project",
        fields: [
          ...selection.fieldBindings.map((binding) => {
            const inspected = inspectedByPath.get(binding.fieldPath)!;
            const target = targetByName.get(binding.requirementId);
            const expression = target?.type === "date" && inspected.valueType !== "date"
              ? {op: "utc_date", inputs: [{op: "field", field: binding.fieldPath}]}
              : {op: "field", field: binding.fieldPath};
            return {name: binding.requirementId, expression, unit: target?.unit ?? null};
          }),
          ...selection.auxiliaryFieldBindings.map((binding) => ({
            name: binding.name,
            expression: {op: "field", field: binding.fieldPath},
            unit: null,
          })),
          {name: "data_network", expression: {op: "field", field: "data_network"}, unit: null},
        ],
      },
    });
    connections.push({fromRole: source.role, toRole: role, inputRole: "rows"});
    return role;
  });
  let currentRole = normalizedRoles[0]!;
  for (let index = 1; index < normalizedRoles.length; index += 1) {
    const unionRole = `union_${index + 1}`;
    nodes.push({
      role: unionRole,
      operator: "union",
      operatorVersion: "2",
      config: {mode: "append_compatible_rows", sourceDiscriminator: null},
    });
    connections.push(
      {fromRole: currentRole, toRole: unionRole, inputRole: "left"},
      {fromRole: normalizedRoles[index]!, toRole: unionRole, inputRole: "right"},
    );
    currentRole = unionRole;
  }
  if (request.semanticPlan.result.orderBy.length > 0) {
    nodes.push({
      role: "sort_records",
      operator: "sort",
      operatorVersion: "1",
      config: {
        orderBy: request.semanticPlan.result.orderBy.map((ordering) => ({...ordering, nulls: "last" as const})),
        limit: null,
      },
    });
    connections.push({fromRole: currentRole, toRole: "sort_records", inputRole: "rows"});
    currentRole = "sort_records";
  }
  nodes.push({
    role: "output_records",
    operator: "output",
    operatorVersion: "3",
    config: {fields: ["record_id", "data_network"]},
  });
  connections.push({fromRole: currentRole, toRole: "output_records", inputRole: "rows"});
  return {
    schemaVersion: 2,
    kind: "source_feasibility",
    selections: validSelections,
    composition: {
      schemaVersion: 2,
      kind: "composition_intent",
      nodes,
      connections,
      templateInstances: [],
    },
    assumptions: ["This deterministic mock composition validates generic field binding and operator wiring only."],
  };
}

export function createMockStageOutput(request: AgentModelRequest): unknown {
  if (request.stage === "source_discovery_planning") return sourceDiscoveryPlanningOutput(request);
  if (request.stage === "source_entity_selection") return sourceEntitySelectionOutput(request);
  if (request.stage === "source_feasibility") return sourceFeasibilityOutput(request);
  if (request.stage === "semantic_interpretation") return semanticOutput(request);
  if (request.stage === "source_selection") return sourceSelectionOutput(request);
  return compositionOutput(request);
}

export class MockAgentModel implements AgentModelPort {
  constructor(private readonly config: AgentModelConfig) {}

  async complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    signal?.throwIfAborted();
    return {
      provider: "mock",
      model: this.config.model,
      output: createMockStageOutput(request),
    };
  }
}
