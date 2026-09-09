import {executeCrossChainTraderFootprint} from "../../dag/runtime.js";
import {
  graphNetworkAliases,
  type GraphFieldRequirement,
  type GraphInspectedField,
  type GraphSchemaEntityInspection,
  type GraphSemanticValueType,
  type GraphSourceDiscoveryPort,
  type GraphSourceDiscoveryRequest,
  type GraphSourceDiscoveryResult,
} from "../../graph/index.js";
import {
  assembleSpecification,
  buildCandidateSummaries,
  canonicalFieldContract,
  compileQueryPlans,
  deriveSourceNeeds,
  sourceDataNetwork,
  sourceRole,
  validateCompositionForSourceNeeds,
  validateSourceSelections,
  HarnessCompileError,
} from "./compiler.js";
import {
  deriveDiscoverySourceNeeds,
  flexibleOperatorRegistry,
  type SourceRoleAuxiliaryFieldShape,
  validateFlexibleComposition,
} from "./flexible-planning.js";
import {operatorRegistry} from "./registry.js";
import {
  entityEmbeddingLimits,
  type EntityEmbeddingInput,
  type EntityEmbeddingRankerPort,
} from "./entity-embedding.js";
import {
  HarnessSchemaError,
  parseCompositionIntent,
  parseSourceDiscoveryPlanning,
  parseSourceEntitySelection,
  parseSourceFeasibility,
  parseSemanticPass,
  parseSourceSelection,
} from "./schemas.js";
import type {
  AgentModelPort,
  AgentModelRequest,
  AgentModelResponse,
  AgentDebugEvent,
  AgentDebugSink,
  AgentTraceSink,
  HarnessExplorationRequest,
  HarnessExplorationResult,
  HarnessPlanResult,
  HarnessRequest,
  HarnessResult,
  HarnessTraceEvent,
  DiscoverySemanticPlan,
  DiscoverySourceNeed,
  ModelRepairDirective,
  PlannerClarification,
  PlannerUnsupported,
  SemanticPlan,
  SourceDiscoveryPlan,
  SourceDiscoveryPlanningModelRequest,
  SourceEntitySelectionCandidate,
  SourceEntitySelectionModelRequest,
  SourceEntitySelectionPlan,
  SourceFeasibilityCandidate,
  SourceFeasibilityModelRequest,
  SourceFeasibilityPlan,
  SourceNeed,
  ValidatedHarnessProposal,
} from "./types.js";

export class HarnessValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "AGENT_HARNESS_VALIDATION_ERROR") {
    super(message);
    this.name = "HarnessValidationError";
    this.code = code;
  }
}

function fail(message: string, code?: string): never {
  throw new HarnessValidationError(message, code);
}

function safeDiagnosticToken(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,160}$/.test(value)
    ? value
    : fallback;
}

function diagnosticErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unexpected";
  const candidate = error as {code?: unknown; name?: unknown};
  return safeDiagnosticToken(candidate.code, safeDiagnosticToken(candidate.name, "unexpected"));
}

function diagnosticErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return typeof error === "string" && error.trim() ? error : "Unknown planning error";
}

function modelOutputShape(output: unknown): {
  outputKind: string | null;
  schemaVersion: number | null;
  unresolvedCount: number;
  sourceRequirementCount: number;
  searchCount: number;
  selectionCount: number;
  compositionNodeCount: number;
} {
  const record = output && typeof output === "object" && !Array.isArray(output)
    ? output as Record<string, unknown>
    : {};
  const semanticPlan = record.semanticPlan && typeof record.semanticPlan === "object" && !Array.isArray(record.semanticPlan)
    ? record.semanticPlan as Record<string, unknown>
    : record;
  const composition = record.composition && typeof record.composition === "object" && !Array.isArray(record.composition)
    ? record.composition as Record<string, unknown>
    : {};
  return {
    outputKind: typeof record.kind === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(record.kind) ? record.kind : null,
    schemaVersion: typeof record.schemaVersion === "number" && Number.isSafeInteger(record.schemaVersion)
      ? record.schemaVersion
      : null,
    unresolvedCount: Array.isArray(semanticPlan.unresolved) ? semanticPlan.unresolved.length : 0,
    sourceRequirementCount: Array.isArray(semanticPlan.sourceRequirements) ? semanticPlan.sourceRequirements.length : 0,
    searchCount: Array.isArray(record.searches) ? record.searches.length : 0,
    selectionCount: Array.isArray(record.selections) ? record.selections.length : 0,
    compositionNodeCount: Array.isArray(composition.nodes) ? composition.nodes.length : 0,
  };
}

function addTrace(
  trace: HarnessTraceEvent[],
  stage: HarnessTraceEvent["stage"],
  status: HarnessTraceEvent["status"],
  summary: string,
): void {
  trace.push({sequenceNo: trace.length + 1, stage, status, summary});
}

function validateSemanticPlan(plan: SemanticPlan): void {
  const expectedFacts = new Set(["wallet", "trade_id", "timestamp", "volume_usd"]);
  const facts = new Set(plan.facts.map((fact) => fact.id));
  if (facts.size !== expectedFacts.size || [...expectedFacts].some((fact) => !facts.has(fact as never))) {
    fail("Semantic plan must include exactly the first-runtime canonical facts", "SEMANTIC_FACTS_INVALID");
  }
  if (new Set(plan.networks).size !== plan.networks.length) {
    fail("Semantic plan contains duplicate networks", "SEMANTIC_NETWORKS_INVALID");
  }
  if (plan.unresolved.length > 0) {
    fail("Semantic plan cannot remain unresolved", "SEMANTIC_PLAN_UNRESOLVED");
  }
  if (plan.combination.kind === "intersection" && plan.networks.length !== 2) {
    fail("The first intersection compiler requires exactly two networks", "SEMANTIC_NETWORK_COUNT_UNSUPPORTED");
  }
  if (plan.combination.kind === "append" && plan.networks.length !== 2) {
    fail("The first append compiler requires exactly two networks", "SEMANTIC_NETWORK_COUNT_UNSUPPORTED");
  }
}

function validateExplorationRequest(
  request: HarnessExplorationRequest,
  limits: {maxNetworkCatalogEntries: number; maxIntentLength: number},
): string {
  const intent = request.intent.trim();
  if (intent.length === 0 || intent.length > limits.maxIntentLength) {
    fail("Intent length is outside harness limits", "INTENT_LIMIT_EXCEEDED");
  }
  if (request.availableNetworks.length === 0 || request.availableNetworks.length > limits.maxNetworkCatalogEntries) {
    fail("Available network catalog size is outside harness limits", "NETWORK_CATALOG_LIMIT_EXCEEDED");
  }
  const networks = new Set<string>();
  for (const network of request.availableNetworks) {
    if (!/^[a-z0-9]+:[A-Za-z0-9._-]+$/.test(network.dataNetwork) || network.dataNetwork.length > 100) {
      fail("Available network identifier is invalid", "AVAILABLE_NETWORK_INVALID");
    }
    if (!/^[A-Za-z0-9 _.-]{1,80}$/.test(network.label)) {
      fail("Available network label is invalid", "AVAILABLE_NETWORK_INVALID");
    }
    if (networks.has(network.dataNetwork)) {
      fail("Available network catalog contains duplicates", "AVAILABLE_NETWORK_DUPLICATE");
    }
    networks.add(network.dataNetwork);
  }
  return intent;
}

function validateSourceDiscoveryPlan(
  output: SourceDiscoveryPlan,
  availableNetworks: HarnessExplorationRequest["availableNetworks"],
  maxUniqueKeywordsPerNeed: number,
): void {
  const plan = output.semanticPlan;
  const available = new Set(availableNetworks.map((network) => network.dataNetwork));
  if (plan.sourceRequirements.some((need) => !available.has(need.dataNetwork))) {
    fail("Discovery plan selected a network outside the supplied catalog", "SEMANTIC_NETWORK_NOT_AVAILABLE");
  }
  if (new Set(plan.sourceRequirements.map((need) => need.id)).size !== plan.sourceRequirements.length) {
    fail("Discovery plan contains duplicate source requirement IDs", "SOURCE_NEED_DUPLICATE");
  }
  if (plan.unresolved.length > 0) fail("Discovery plan cannot retain unresolved semantics", "SEMANTIC_PLAN_UNRESOLVED");
  for (const need of plan.sourceRequirements) {
    if (new Set(need.fields.map((field) => field.id)).size !== need.fields.length) {
      fail(`Source requirement ${need.id} contains duplicate field IDs`, "SEMANTIC_FIELDS_INVALID");
    }
    if (!need.fields.some((field) => field.required)) {
      fail(`Source requirement ${need.id} must identify at least one required field`, "SEMANTIC_FIELDS_INVALID");
    }
    const assetKeys = need.assets.map((asset) => `${asset.symbol.toLowerCase()}\u0000${asset.networkAssetId?.toLowerCase() ?? ""}`);
    if (new Set(assetKeys).size !== assetKeys.length) {
      fail(`Source requirement ${need.id} contains duplicate network-scoped assets`, "SEMANTIC_ASSETS_INVALID");
    }
  }
  const resultFields = new Set(plan.result.fields.map((field) => field.name));
  if (resultFields.size !== plan.result.fields.length || plan.result.orderBy.some((item) => !resultFields.has(item.field))) {
    fail("Semantic result fields or ordering are invalid", "SEMANTIC_OUTPUT_INVALID");
  }
  if (output.searches.length !== plan.sourceRequirements.length) {
    fail("Discovery plan requires exactly one search entry per source requirement", "SOURCE_SEARCH_COVERAGE_INVALID");
  }
  const needs = new Set(plan.sourceRequirements.map((need) => need.id));
  const searchesByNeed = new Map<string, SourceDiscoveryPlan["searches"][number]>();
  for (const search of output.searches) {
    if (searchesByNeed.has(search.sourceNeedId) || !needs.has(search.sourceNeedId)) {
      fail("Discovery plan contains an unknown or duplicate source requirement search", "SOURCE_SEARCH_NEED_INVALID");
    }
    const normalizedKeywords = search.keywords.map((keyword) => keyword.trim().toLowerCase());
    if (new Set(normalizedKeywords).size !== normalizedKeywords.length) {
      fail("Discovery plan contains duplicate keywords for one network", "SOURCE_SEARCH_KEYWORD_DUPLICATE");
    }
    if (new Set(normalizedKeywords).size > maxUniqueKeywordsPerNeed) {
      fail("Discovery plan exceeds the per-requirement unique-keyword limit", "SOURCE_SEARCH_LIMIT_EXCEEDED");
    }
    searchesByNeed.set(search.sourceNeedId, search);
  }
}

const maximumSearchKeywordLength = 80;

function boundedSearchKeyword(parts: readonly string[]): string | null {
  const phrase = parts.map((part) => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  if (phrase.length < 2) return null;
  return phrase.length <= maximumSearchKeywordLength
    ? phrase
    : phrase.slice(0, maximumSearchKeywordLength).trimEnd();
}

function humanSearchAlias(value: string): string | null {
  const alias = value
    .replace(/[-_]+/g, " ")
    .replace(/\b(?:mainnet|testnet)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    alias.length < 2
    || /^(?:eip155|evm)\s+\d+$/i.test(alias)
    || /^(?:mainnet|testnet)$/i.test(alias)
  ) return null;
  return alias;
}

function networkSearchAliases(networkLabel: string, dataNetwork: string): readonly string[] {
  const aliases = [networkLabel, ...(graphNetworkAliases[dataNetwork] ?? [])];
  const unique = new Map<string, string>();
  for (const value of aliases) {
    const alias = humanSearchAlias(value);
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (!unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
}

/**
 * Build a broad-recall search ladder for one network-scoped requirement.
 * The provider keyword search indexes Subgraph metadata, where protocol-wide
 * sources rarely enumerate every asset pair and network names often omit
 * environment suffixes such as "Mainnet". Keep the semantic topic broad here,
 * then let inspected schema and deterministic network evidence decide fit.
 */
function deriveNetworkScopedSearchKeywords(
  need: DiscoverySourceNeed,
  networkLabel: string,
  modelKeywords: readonly string[],
  limit = 3,
): readonly string[] {
  const protocol = need.protocol
    ? [need.protocol.name, need.protocol.version ?? ""].filter(Boolean).join(" ")
    : "";
  const semanticSeeds = [protocol, ...modelKeywords]
    .map((value) => boundedSearchKeyword([value]))
    .filter((value): value is string => value !== null);
  const primarySeed = semanticSeeds[0] ?? null;
  const phrases: (string | null)[] = [];
  if (primarySeed) {
    phrases.push(primarySeed);
    phrases.push(...networkSearchAliases(networkLabel, need.dataNetwork)
      .map((alias) => boundedSearchKeyword([primarySeed, alias])));
  } else {
    phrases.push(...networkSearchAliases(networkLabel, need.dataNetwork));
  }
  phrases.push(...semanticSeeds.slice(1));

  const unique = new Map<string, string>();
  for (const phrase of phrases) {
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (!unique.has(key)) unique.set(key, phrase);
  }
  return [...unique.values()].slice(0, limit);
}

const maxFeasibilityEntitiesPerNeed = 16;

function compactFeasibilityEntity(
  entity: GraphSchemaEntityInspection,
): SourceFeasibilityCandidate["entities"][number] {
  const suggested = new Set(entity.suggestedBindings.flatMap((binding) => binding.fieldPaths));
  const fields = entity.fields.slice()
    .sort((left, right) =>
      Number(suggested.has(right.path)) - Number(suggested.has(left.path))
      || Number(!right.path.includes(".")) - Number(!left.path.includes("."))
      || left.path.localeCompare(right.path));
  const included = new Set(fields.map((field) => field.path));
  return {
    queryEntity: entity.queryEntity,
    entityType: entity.entityType,
    fields,
    suggestedBindings: entity.suggestedBindings.map((binding) => ({
      requirementId: binding.requirementId,
      fieldPaths: binding.fieldPaths.filter((path) => included.has(path)),
    })),
    matchedRequirements: entity.matchedRequirements,
    grainHint: entity.grainHint ?? "unknown",
  };
}

function compareRelevantEntities(
  need: DiscoverySourceNeed,
  left: GraphSchemaEntityInspection,
  right: GraphSchemaEntityInspection,
): number {
  const required = new Set(need.fields.filter((field) => field.required).map((field) => field.id));
  const requiredMatches = (entity: GraphSchemaEntityInspection) => entity.matchedRequirements.filter((id) => required.has(id)).length;
  const directBindings = (entity: GraphSchemaEntityInspection) => entity.suggestedBindings.reduce(
    (count, binding) => count + binding.fieldPaths.filter((path) => !path.includes(".")).length,
    0,
  );
  return requiredMatches(right) - requiredMatches(left)
    || Number(right.grainHint === "matched") - Number(left.grainHint === "matched")
    || directBindings(right) - directBindings(left)
    || right.matchedRequirements.length - left.matchedRequirements.length
    || left.queryEntity.localeCompare(right.queryEntity);
}

function fairEmbeddingInputs(
  candidates: readonly {
    candidateRef: string;
    displayName: string;
    entities: readonly GraphSchemaEntityInspection[];
  }[],
): readonly EntityEmbeddingInput[] {
  const inputs: EntityEmbeddingInput[] = [];
  for (let entityRank = 0; inputs.length < entityEmbeddingLimits.maxEntitiesPerNeed; entityRank += 1) {
    let addedAtThisRank = false;
    for (const candidate of candidates) {
      if (inputs.length === entityEmbeddingLimits.maxEntitiesPerNeed) break;
      const entity = candidate.entities[entityRank];
      if (!entity) continue;
      inputs.push({candidateRef: candidate.candidateRef, displayName: candidate.displayName, entity});
      addedAtThisRank = true;
    }
    if (!addedAtThisRank) break;
  }
  return inputs;
}

function entityScoreKey(candidateRef: string, queryEntity: string): string {
  return `${candidateRef}\u0000${queryEntity}`;
}

async function entitySelectionCandidates(
  discovery: GraphSourceDiscoveryResult,
  needs: readonly DiscoverySourceNeed[],
  embeddingRanker?: EntityEmbeddingRankerPort,
  signal?: AbortSignal,
  emitDebug?: (event: AgentDebugEvent) => void,
): Promise<readonly SourceEntitySelectionCandidate[]> {
  const output: SourceEntitySelectionCandidate[] = [];
  for (const need of needs) {
    const inspected = discovery.candidates.filter((candidate) => candidate.sourceNeedId === need.id && candidate.entities.length > 0);
    const selectable = inspected.filter((candidate) => candidate.status === "suitable");
    const candidatePool = selectable.length > 0 ? selectable : inspected;
    const deterministicCandidates = candidatePool.map((candidate) => ({
      candidate,
      entities: candidate.entities.slice().sort((left, right) => compareRelevantEntities(need, left, right)),
      selected: [] as GraphSchemaEntityInspection[],
    }));
    const embeddingInputs = embeddingRanker
      ? fairEmbeddingInputs(deterministicCandidates.map(({candidate, entities}) => ({
          candidateRef: candidate.candidateRef,
          displayName: candidate.displayName,
          entities,
        })))
      : [];
    const semanticScores = new Map<string, number>();
    if (embeddingRanker && embeddingInputs.length > 0) {
      const startedAt = Date.now();
      emitDebug?.({
        stage: "source_entity_selection",
        phase: "embedding_request_started",
        sourceNeedId: need.id,
        entityCount: embeddingInputs.length,
      });
      try {
        for (const score of await embeddingRanker.rank(need, embeddingInputs, signal)) {
          semanticScores.set(entityScoreKey(score.candidateRef, score.queryEntity), score.similarity);
        }
        emitDebug?.({
          stage: "source_entity_selection",
          phase: "embedding_response_received",
          sourceNeedId: need.id,
          entityCount: semanticScores.size,
          durationMs: Math.max(0, Date.now() - startedAt),
        });
      } catch (error) {
        emitDebug?.({
          stage: "source_entity_selection",
          phase: "embedding_request_failed",
          sourceNeedId: need.id,
          entityCount: embeddingInputs.length,
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: diagnosticErrorCode(error),
        });
        throw error;
      }
    }
    const rankedByCandidate = deterministicCandidates.map((item) => ({
      ...item,
      entities: item.entities.slice().sort((left, right) => {
        const leftScore = semanticScores.get(entityScoreKey(item.candidate.candidateRef, left.queryEntity));
        const rightScore = semanticScores.get(entityScoreKey(item.candidate.candidateRef, right.queryEntity));
        return Number(rightScore !== undefined) - Number(leftScore !== undefined)
          || (rightScore ?? 0) - (leftScore ?? 0)
          || compareRelevantEntities(need, left, right);
      }),
    }));
    let remainingEntities = maxFeasibilityEntitiesPerNeed;
    for (let entityRank = 0; remainingEntities > 0; entityRank += 1) {
      let addedAtThisRank = false;
      for (const item of rankedByCandidate) {
        if (remainingEntities === 0) break;
        const entity = item.entities[entityRank];
        if (!entity) continue;
        item.selected.push(entity);
        remainingEntities -= 1;
        addedAtThisRank = true;
      }
      if (!addedAtThisRank) break;
    }
    for (const {candidate, selected: selectedEntities} of rankedByCandidate) {
      if (selectedEntities.length === 0) continue;
      output.push({
        candidateRef: candidate.candidateRef,
        sourceNeedId: candidate.sourceNeedId,
        logicalSubgraphId: candidate.logicalSubgraphId,
        manifestIpfsCid: candidate.manifestIpfsCid,
        displayName: candidate.displayName,
        networkEvidence: candidate.networkEvidence,
        totalQueryCount30d: candidate.totalQueryCount30d,
        queryActivityEvidence: candidate.queryActivityEvidence,
        schemaHash: candidate.schemaHash,
        status: candidate.status,
        entities: selectedEntities.map((entity) => ({
          queryEntity: entity.queryEntity,
          entityType: entity.entityType,
          fieldCount: entity.fields.length,
          semanticSimilarity: semanticScores.has(entityScoreKey(candidate.candidateRef, entity.queryEntity))
            ? Number(semanticScores.get(entityScoreKey(candidate.candidateRef, entity.queryEntity))!.toFixed(6))
            : null,
          rankingEvidence: semanticScores.has(entityScoreKey(candidate.candidateRef, entity.queryEntity))
            ? "embedding" as const
            : "deterministic" as const,
          suggestedBindings: entity.suggestedBindings,
          matchedRequirements: entity.matchedRequirements,
          grainHint: entity.grainHint ?? "unknown",
        })),
      });
    }
  }
  return output;
}

function validateSourceEntitySelection(
  output: SourceEntitySelectionPlan,
  needs: readonly DiscoverySourceNeed[],
  candidates: readonly SourceEntitySelectionCandidate[],
): void {
  if (output.selections.length !== needs.length) {
    fail("Entity selection must satisfy every source need exactly once", "ENTITY_SELECTION_SOURCE_NEED_UNSATISFIED");
  }
  const needsById = new Map(needs.map((need) => [need.id, need]));
  const candidatesByRef = new Map(candidates.map((candidate) => [candidate.candidateRef, candidate]));
  const seenNeeds = new Set<string>();
  for (const selection of output.selections) {
    const need = needsById.get(selection.sourceNeedId);
    const candidate = candidatesByRef.get(selection.candidateRef);
    if (!need || seenNeeds.has(need.id)) {
      fail("Entity selection contains an unknown or duplicate source need", "ENTITY_SELECTION_SOURCE_NEED_INVALID");
    }
    if (!candidate || candidate.sourceNeedId !== need.id) {
      fail("Entity selection referenced a candidate outside the bounded evidence", "ENTITY_SELECTION_CANDIDATE_INVALID");
    }
    if (candidate.status !== "suitable") {
      fail("Entity selection referenced a candidate without suitable evidence", "ENTITY_SELECTION_CANDIDATE_INCOMPATIBLE");
    }
    if (!candidate.entities.some((entity) => entity.queryEntity === selection.queryEntity)) {
      fail("Entity selection referenced an uninspected query entity", "ENTITY_SELECTION_QUERY_ENTITY_INVALID");
    }
    seenNeeds.add(need.id);
  }
}

function expandSelectedEntities(
  discovery: GraphSourceDiscoveryResult,
  selections: SourceEntitySelectionPlan["selections"],
): readonly SourceFeasibilityCandidate[] {
  const discoveredByRef = new Map(discovery.candidates.map((candidate) => [candidate.candidateRef, candidate]));
  return selections.map((selection) => {
    const candidate = discoveredByRef.get(selection.candidateRef);
    const entity = candidate?.entities.find((value) => value.queryEntity === selection.queryEntity);
    if (!candidate || !entity || candidate.sourceNeedId !== selection.sourceNeedId) {
      fail("Selected entity could not be expanded from trusted discovery evidence", "ENTITY_SELECTION_EXPANSION_INVALID");
    }
    return {
      candidateRef: candidate.candidateRef,
      sourceNeedId: candidate.sourceNeedId,
      logicalSubgraphId: candidate.logicalSubgraphId,
      manifestIpfsCid: candidate.manifestIpfsCid,
      networkEvidence: candidate.networkEvidence,
      totalQueryCount30d: candidate.totalQueryCount30d,
      queryActivityEvidence: candidate.queryActivityEvidence,
      schemaHash: candidate.schemaHash,
      status: candidate.status,
      entities: [compactFeasibilityEntity(entity)],
    };
  });
}

function graphTypeCompatible(requirement: GraphFieldRequirement, field: GraphInspectedField): boolean {
  if (field.list && requirement.expectedType !== "json") return false;
  if (!requirement.allowNullable && field.nullable) return false;
  if (requirement.expectedType === "json" || requirement.expectedType === field.valueType) return true;
  const textual = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
  if (textual.has(requirement.expectedType) && textual.has(field.valueType)) return true;
  if (requirement.expectedType === "timestamp") return field.valueType === "integer" || field.valueType === "string";
  if (requirement.expectedType === "date") return field.valueType === "integer" || field.valueType === "string";
  return requirement.expectedType === "decimal" && field.valueType === "integer";
}

function unsupportedSourceEvidenceConflict(
  output: PlannerUnsupported,
  needs: readonly DiscoverySourceNeed[],
  candidates: readonly SourceFeasibilityCandidate[],
): NonNullable<ModelRepairDirective["counterEvidence"]> {
  const claim = `${output.code} ${output.reason} ${output.missingFacts.join(" ")}`.toLowerCase();
  const concernsSourceEvidence = output.missingFacts.length > 0
    || /source|subgraph|candidate|schema|entity|field|fact/.test(claim);
  if (!concernsSourceEvidence) return [];
  const evidence = needs.flatMap((need) => {
    const required = need.fields.filter((field) => field.required).map((field) => field.id);
    const complete = candidates
      .filter((candidate) => candidate.sourceNeedId === need.id && candidate.status === "suitable")
      .flatMap((candidate) => candidate.entities.map((entity) => ({candidate, entity})))
      .find(({entity}) => entity.grainHint === "matched" && required.every((id) => entity.matchedRequirements.includes(id)));
    return complete ? [{
      sourceNeedId: need.id,
      candidateRef: complete.candidate.candidateRef,
      queryEntity: complete.entity.queryEntity,
      matchedRequiredFields: required,
    }] : [];
  });
  return evidence.length === needs.length ? evidence : [];
}

function validateSourceFeasibility(
  output: SourceFeasibilityPlan,
  plan: DiscoverySemanticPlan,
  needs: readonly DiscoverySourceNeed[],
  discovery: GraphSourceDiscoveryResult,
  evidenceCandidates: readonly SourceFeasibilityCandidate[],
  limits: {maxNodes: number; maxEdges: number},
): readonly string[] {
  if (output.selections.length !== needs.length) {
    fail("Feasibility selection must satisfy every source need exactly once", "FEASIBILITY_SOURCE_NEED_UNSATISFIED");
  }
  const candidates = new Map(evidenceCandidates.map((candidate) => [candidate.candidateRef, candidate]));
  const discoveredCandidates = new Map(discovery.candidates.map((candidate) => [candidate.candidateRef, candidate]));
  const seenNeeds = new Set<string>();
  const auxiliaryFieldsByNeed = new Map<string, readonly SourceRoleAuxiliaryFieldShape[]>();
  const selected = output.selections.map((selection) => {
    const need = needs.find((candidate) => candidate.id === selection.sourceNeedId);
    const candidate = candidates.get(selection.candidateRef);
    const discoveredCandidate = discoveredCandidates.get(selection.candidateRef);
    if (!need || seenNeeds.has(need.id)) {
      fail("Feasibility output contains an unknown or duplicate source need", "FEASIBILITY_SOURCE_NEED_INVALID");
    }
    if (!candidate || !discoveredCandidate || candidate.sourceNeedId !== need.id) {
      fail("Feasibility output selected a candidate outside the discovered set", "FEASIBILITY_CANDIDATE_INVALID");
    }
    if (candidate.status !== "suitable") {
      fail("Feasibility output selected a candidate without complete network, activity, and schema evidence", "FEASIBILITY_CANDIDATE_INCOMPATIBLE");
    }
    const entity = candidate.entities.find((value) => value.queryEntity === selection.queryEntity);
    if (!entity) fail("Feasibility output selected an uninspected query entity", "FEASIBILITY_SCHEMA_EVIDENCE_INVALID");
    const requirements = new Map(need.fields.map((requirement) => [requirement.id, requirement]));
    const fields = new Map(entity.fields.map((field) => [field.path, field]));
    const bound = new Set<string>();
    const boundPaths = new Set<string>();
    for (const binding of selection.fieldBindings) {
      const requirement = requirements.get(binding.requirementId);
      const inspectedField = fields.get(binding.fieldPath);
      if (!requirement || bound.has(requirement.id) || !inspectedField || !graphTypeCompatible(requirement, inspectedField)) {
        fail("Feasibility field binding is not supported by inspected schema evidence", "FEASIBILITY_FIELD_BINDING_INVALID");
      }
      bound.add(requirement.id);
      boundPaths.add(binding.fieldPath);
    }
    const missing = need.fields.filter((requirement) => requirement.required && !bound.has(requirement.id));
    if (missing.length > 0) {
      fail(`Feasibility output omitted required fields for ${need.id}`, "FEASIBILITY_FIELD_BINDING_MISSING");
    }
    const auxiliaryNames = new Set<string>();
    const auxiliaryPaths = new Set<string>();
    const reservedNames = new Set([...requirements.keys(), "data_network"]);
    const auxiliaryFields: SourceRoleAuxiliaryFieldShape[] = [];
    for (const binding of selection.auxiliaryFieldBindings) {
      const inspectedField = fields.get(binding.fieldPath);
      if (
        reservedNames.has(binding.name)
        || auxiliaryNames.has(binding.name)
        || auxiliaryPaths.has(binding.fieldPath)
        || boundPaths.has(binding.fieldPath)
        || !inspectedField
        || inspectedField.list
      ) {
        fail(
          "Feasibility auxiliary field binding is not supported by inspected scalar schema evidence",
          "FEASIBILITY_AUXILIARY_FIELD_BINDING_INVALID",
        );
      }
      auxiliaryNames.add(binding.name);
      auxiliaryPaths.add(binding.fieldPath);
      auxiliaryFields.push({
        name: binding.name,
        type: inspectedField.valueType,
        nullable: inspectedField.nullable,
        unit: null,
      });
    }
    auxiliaryFieldsByNeed.set(need.id, auxiliaryFields);
    seenNeeds.add(need.id);
    return discoveredCandidate;
  });
  validateFlexibleComposition(plan, output.composition, needs, output.selections, limits, auxiliaryFieldsByNeed);
  return [...new Set(selected.flatMap((candidate) => candidate.limitations))];
}

function sourceGap(missingNetworks: readonly string[]): PlannerUnsupported {
  return {
    schemaVersion: 1,
    kind: "unsupported",
    code: "source_facts_unavailable",
    reason: `No inspected existing Subgraph candidate satisfies: ${missingNetworks.join(", ")}`,
    missingFacts: missingNetworks.map((network) => `${network}:wallet,trade_id,timestamp,volume_usd`),
  };
}

function accessClarification(sourceKeys: readonly string[]): PlannerClarification {
  return {
    schemaVersion: 1,
    kind: "clarification",
    questions: [{
      code: "source_access_required",
      question: `Select customer API key or bounded x402 access for: ${sourceKeys.join(", ")}`,
    }],
  };
}

export class AgentHarness {
  constructor(
    private readonly model: AgentModelPort,
    private readonly limits: {
      maxSources: number;
      maxNetworkCatalogEntries: number;
      maxModelCalls: number;
      maxIntentLength: number;
      maxProposalBytes: number;
      maxNodes: number;
      maxEdges: number;
    } = {
      maxSources: 4,
      maxNetworkCatalogEntries: 128,
      maxModelCalls: 4,
      maxIntentLength: 8000,
      maxProposalBytes: 1_048_576,
      maxNodes: 12,
      maxEdges: 24,
    },
    private readonly sourceDiscovery?: GraphSourceDiscoveryPort,
    private readonly debugSink?: AgentDebugSink,
    private readonly embeddingRanker?: EntityEmbeddingRankerPort,
  ) {}

  private emitDebug(event: AgentDebugEvent): void {
    try {
      this.debugSink?.(event);
    } catch {
      // Diagnostics must never change planning behavior.
    }
  }

  async discoverGraphSources(
    request: GraphSourceDiscoveryRequest,
    signal?: AbortSignal,
  ): Promise<GraphSourceDiscoveryResult> {
    if (!this.sourceDiscovery) {
      fail("Graph source discovery is not configured", "GRAPH_SOURCE_DISCOVERY_UNAVAILABLE");
    }
    return this.sourceDiscovery.discover(request, signal);
  }

  async explore(
    request: HarnessExplorationRequest,
    signal?: AbortSignal,
    traceSink?: AgentTraceSink,
  ): Promise<HarnessExplorationResult> {
    if (!this.sourceDiscovery) {
      fail("Graph source discovery is not configured", "GRAPH_SOURCE_DISCOVERY_UNAVAILABLE");
    }
    const trace: HarnessTraceEvent[] = [];
    const emitTrace = (
      stage: HarnessTraceEvent["stage"],
      status: HarnessTraceEvent["status"],
      summary: string,
    ) => {
      addTrace(trace, stage, status, summary);
      try {
        traceSink?.(trace.at(-1)!);
      } catch {
        // User-visible progress persistence must not change planning behavior.
      }
    };
    const intent = validateExplorationRequest(request, this.limits);
    emitTrace("admit", "passed", "Intent and network catalog accepted within harness limits");

    let modelCalls = 0;
    let repairCalls = 0;
    let modelIdentity: {provider: AgentModelResponse["provider"]; model: string} | undefined;
    const invoke = async (modelRequest: AgentModelRequest): Promise<AgentModelResponse> => {
      if (modelCalls >= this.limits.maxModelCalls) fail("Model call limit exceeded", "MODEL_CALL_LIMIT_EXCEEDED");
      const callNumber = modelCalls + 1;
      const startedAt = Date.now();
      const repair = "repair" in modelRequest ? modelRequest.repair : undefined;
      this.emitDebug({
        stage: modelRequest.stage,
        phase: "model_request_started",
        callNumber,
        repairAttempt: repair?.attempt ?? 0,
        repairReason: repair?.reason ?? null,
      });
      let response: AgentModelResponse;
      try {
        response = await this.model.complete(modelRequest, signal);
      } catch (error) {
        this.emitDebug({
          stage: modelRequest.stage,
          phase: "model_request_failed",
          callNumber,
          durationMs: Math.max(0, Date.now() - startedAt),
          repairAttempt: repair?.attempt ?? 0,
          repairReason: repair?.reason ?? null,
          validationCode: diagnosticErrorCode(error),
          validationMessage: diagnosticErrorMessage(error),
        });
        throw error;
      }
      const responseBytes = new TextEncoder().encode(JSON.stringify(response.output)).byteLength;
      this.emitDebug({
        stage: modelRequest.stage,
        phase: "model_response_received",
        callNumber,
        durationMs: Math.max(0, Date.now() - startedAt),
        repairAttempt: repair?.attempt ?? 0,
        repairReason: repair?.reason ?? null,
        provider: response.provider,
        model: response.model,
        outputBytes: responseBytes,
        modelOutput: response.output,
        ...modelOutputShape(response.output),
      });
      if (responseBytes > this.limits.maxProposalBytes) fail("Model stage output exceeds harness size limit", "MODEL_OUTPUT_LIMIT_EXCEEDED");
      modelCalls += 1;
      if (modelIdentity && (modelIdentity.provider !== response.provider || modelIdentity.model !== response.model)) {
        fail("Model identity changed during one planning run", "MODEL_IDENTITY_CHANGED");
      }
      modelIdentity ??= {provider: response.provider, model: response.model};
      return response;
    };
    const modelResult = () => ({...modelIdentity!, calls: modelCalls});
    const parseWithRepair = async <T>(
      modelRequest: SourceDiscoveryPlanningModelRequest | SourceEntitySelectionModelRequest | SourceFeasibilityModelRequest,
      response: AgentModelResponse,
      parser: (output: unknown) => T,
      reservedModelCalls: number,
    ): Promise<T> => {
      try {
        return parser(response.output);
      } catch (error) {
        const willRepair = error instanceof HarnessSchemaError
          && repairCalls === 0
          && modelCalls + 1 + reservedModelCalls <= this.limits.maxModelCalls;
        if (error instanceof HarnessSchemaError) {
          this.emitDebug({
            stage: modelRequest.stage,
            phase: "schema_validation_failed",
            callNumber: modelCalls,
            repairAttempt: "repair" in modelRequest ? modelRequest.repair?.attempt ?? 0 : 0,
            repairReason: "repair" in modelRequest ? modelRequest.repair?.reason ?? null : null,
            validationCode: "AGENT_HARNESS_SCHEMA_ERROR",
            validationMessage: error.message,
            schemaPath: error.path,
            schemaIssueCode: error.issueCode,
            schemaIssueMessage: error.issueMessage,
            willRepair,
            ...modelOutputShape(response.output),
          });
        }
        if (!(error instanceof HarnessSchemaError) || !willRepair) throw error;
        repairCalls += 1;
        emitTrace(modelRequest.stage, "failed", "Model output did not match the strict planning-stage contract");
        emitTrace(modelRequest.stage, "started", "Requesting one bounded schema repair from the configured model");
        const repaired = await invoke({
          ...modelRequest,
          repair: {
            attempt: 1,
            reason: "schema_validation_failed",
            path: error.path,
            issueCode: error.issueCode,
          },
        });
        try {
          return parser(repaired.output);
        } catch (repairError) {
          if (repairError instanceof HarnessSchemaError) {
            this.emitDebug({
              stage: modelRequest.stage,
              phase: "schema_validation_failed",
              callNumber: modelCalls,
              repairAttempt: 1,
              repairReason: "schema_validation_failed",
              validationCode: "AGENT_HARNESS_SCHEMA_ERROR",
              validationMessage: repairError.message,
              schemaPath: repairError.path,
              schemaIssueCode: repairError.issueCode,
              schemaIssueMessage: repairError.issueMessage,
              willRepair: false,
              ...modelOutputShape(repaired.output),
            });
          }
          throw repairError;
        }
      }
    };

    emitTrace("source_discovery_planning", "started", "Model is deriving bounded semantic requirements and Subgraph search keywords");
    const discoveryPlanningRequest: SourceDiscoveryPlanningModelRequest = {
      stage: "source_discovery_planning",
      promptVersion: "4",
      intent,
      availableNetworks: request.availableNetworks,
      limits: {maxNetworks: this.limits.maxSources, maxUniqueKeywordsPerNetwork: 3, maxKeywordsPerNetwork: 3},
    };
    const discoveryPlanningResponse = await invoke(discoveryPlanningRequest);
    const discoveryPlanningOutput = await parseWithRepair(
      discoveryPlanningRequest,
      discoveryPlanningResponse,
      parseSourceDiscoveryPlanning,
      2,
    );
    if (discoveryPlanningOutput.kind === "clarification") {
      emitTrace("source_discovery_planning", "passed", "Search planning requires creator clarification");
      return {kind: "clarification", clarification: discoveryPlanningOutput, trace, model: modelResult()};
    }
    if (discoveryPlanningOutput.kind === "unsupported") {
      emitTrace("source_discovery_planning", "passed", "Intent is outside the registered operators or supplied network catalog");
      return {kind: "unsupported", unsupported: discoveryPlanningOutput, trace, model: modelResult()};
    }
    try {
      validateSourceDiscoveryPlan(discoveryPlanningOutput, request.availableNetworks, 3);
    } catch (error) {
      this.emitDebug({
        stage: "source_discovery_planning",
        phase: "semantic_validation_failed",
        callNumber: modelCalls,
        validationCode: diagnosticErrorCode(error),
        validationMessage: diagnosticErrorMessage(error),
        ...modelOutputShape(discoveryPlanningOutput),
      });
      throw error;
    }
    emitTrace("source_discovery_planning", "passed", "Search keywords and semantic requirements passed strict validation");
    this.emitDebug({
      stage: "source_discovery_planning",
      networks: [...new Set(discoveryPlanningOutput.semanticPlan.sourceRequirements.map((need) => need.dataNetwork))],
      searches: discoveryPlanningOutput.searches,
    });

    const sourceNeeds = deriveDiscoverySourceNeeds(discoveryPlanningOutput.semanticPlan);
    emitTrace("source_needs", "passed", `Derived ${sourceNeeds.length} compiler-owned source needs`);
    const labels = new Map(request.availableNetworks.map((network) => [network.dataNetwork, network.label]));
    const modelSearches = new Map(discoveryPlanningOutput.searches.map((search) => [search.sourceNeedId, search.keywords]));
    const searches = new Map(sourceNeeds.map((need) => [
      need.id,
      deriveNetworkScopedSearchKeywords(need, labels.get(need.dataNetwork)!, modelSearches.get(need.id)!, 3),
    ]));
    emitTrace("graph_source_discovery", "started", "Controller is invoking the restricted Graph metadata adapter with validated keywords");
    const discoveryStartedAt = Date.now();
    this.emitDebug({
      stage: "graph_source_discovery",
      phase: "request_started",
      sourceNeedCount: sourceNeeds.length,
      searches: sourceNeeds.map((need) => ({sourceNeedId: need.id, keywords: searches.get(need.id)!})),
    });
    let discovery: GraphSourceDiscoveryResult;
    try {
      discovery = await this.sourceDiscovery.discover({
        needs: sourceNeeds.map((need) => ({
          id: need.id,
          dataNetwork: need.dataNetwork,
          networkLabel: labels.get(need.dataNetwork)!,
          keywords: searches.get(need.id)!,
          description: need.description,
          grain: need.grain,
          fields: need.fields,
          constraints: need.constraints,
        })),
      }, signal);
    } catch (error) {
      this.emitDebug({
        stage: "graph_source_discovery",
        phase: "request_failed",
        sourceNeedCount: sourceNeeds.length,
        durationMs: Math.max(0, Date.now() - discoveryStartedAt),
        errorCode: diagnosticErrorCode(error),
      });
      throw error;
    }
    emitTrace("graph_source_discovery", "passed", `Discovered ${discovery.candidates.length} candidates and inspected ${discovery.inspectedSchemas} schemas`);
    this.emitDebug({
      stage: "graph_source_discovery",
      searchCalls: discovery.searchCalls,
      candidateCount: discovery.candidates.length,
      inspectedSchemas: discovery.inspectedSchemas,
      candidates: discovery.candidates,
    });

    emitTrace(
      "source_entity_selection",
      "started",
      this.embeddingRanker
        ? "Embedding retrieval is ranking inspected schema entities before bounded model selection"
        : "Model is selecting one inspected entity for each source need from compact evidence",
    );
    const selectionCandidates = await entitySelectionCandidates(
      discovery,
      sourceNeeds,
      this.embeddingRanker,
      signal,
      (event) => this.emitDebug(event),
    );
    const entitySelectionRequest: SourceEntitySelectionModelRequest = {
      stage: "source_entity_selection",
      promptVersion: "2",
      semanticPlan: discoveryPlanningOutput.semanticPlan,
      sourceNeeds,
      candidates: selectionCandidates,
    };
    const entitySelectionResponse = await invoke(entitySelectionRequest);
    const entitySelectionOutput = await parseWithRepair(
      entitySelectionRequest,
      entitySelectionResponse,
      parseSourceEntitySelection,
      1,
    );
    if (entitySelectionOutput.kind === "clarification") {
      this.emitDebug({stage: "source_entity_selection", outcome: "clarification"});
      emitTrace("source_entity_selection", "passed", "Entity selection requires creator clarification");
      return {kind: "clarification", clarification: entitySelectionOutput, trace, model: modelResult()};
    }
    if (entitySelectionOutput.kind === "unsupported") {
      this.emitDebug({stage: "source_entity_selection", outcome: "unsupported", code: entitySelectionOutput.code});
      emitTrace("source_entity_selection", "passed", "No supplied existing Subgraph entity satisfies every source need");
      return {kind: "unsupported", unsupported: entitySelectionOutput, discovery, trace, model: modelResult()};
    }
    try {
      validateSourceEntitySelection(entitySelectionOutput, sourceNeeds, selectionCandidates);
    } catch (error) {
      this.emitDebug({
        stage: "source_entity_selection",
        phase: "semantic_validation_failed",
        callNumber: modelCalls,
        validationCode: diagnosticErrorCode(error),
        validationMessage: diagnosticErrorMessage(error),
        ...modelOutputShape(entitySelectionOutput),
      });
      throw error;
    }
    this.emitDebug({stage: "source_entity_selection", outcome: "selection", selectionCount: entitySelectionOutput.selections.length});
    emitTrace("source_entity_selection", "passed", `Selected ${entitySelectionOutput.selections.length} query entities from compact schema evidence`);

    emitTrace("source_feasibility", "started", "Harness expanded selected entity fields; the model is binding fields and composing registered operators");
    const sourceRoles = sourceNeeds.map((need) => ({
      role: sourceRole(need.id),
      sourceNeedId: need.id,
      fields: [
        ...need.fields.map((field) => ({
          name: field.id,
          type: field.expectedType,
          nullable: field.allowNullable,
          unit: field.unit,
        })),
        {name: "data_network", type: "string" as const, nullable: false, unit: null},
      ],
    }));
    const candidateEvidence = expandSelectedEntities(discovery, entitySelectionOutput.selections);
    const feasibilityRequest: SourceFeasibilityModelRequest = {
      stage: "source_feasibility",
      promptVersion: "5",
      semanticPlan: discoveryPlanningOutput.semanticPlan,
      sourceNeeds,
      candidates: candidateEvidence,
      sourceRoles,
      operatorRegistry: flexibleOperatorRegistry,
      limits: {maxNodes: this.limits.maxNodes, maxEdges: this.limits.maxEdges},
    };
    const feasibilityResponse = await invoke(feasibilityRequest);
    let feasibilityOutput = await parseWithRepair(feasibilityRequest, feasibilityResponse, parseSourceFeasibility, 0);
    if (feasibilityOutput.kind === "unsupported") {
      const counterEvidence = unsupportedSourceEvidenceConflict(feasibilityOutput, sourceNeeds, candidateEvidence);
      if (counterEvidence.length > 0) {
        if (repairCalls > 0 || modelCalls >= this.limits.maxModelCalls) {
          fail("Model unsupported claim conflicts with inspected source evidence", "FEASIBILITY_UNSUPPORTED_EVIDENCE_CONFLICT");
        }
        emitTrace("source_feasibility", "failed", "Model unsupported claim conflicted with inspected source evidence");
        emitTrace("source_feasibility", "started", "Requesting one bounded feasibility repair with inspected counter-evidence");
        this.emitDebug({stage: "source_feasibility", outcome: "repair", contradictionCount: counterEvidence.length});
        repairCalls += 1;
        const repaired = await invoke({
          ...feasibilityRequest,
          repair: {
            attempt: 1,
            reason: "unsupported_evidence_conflict",
            path: "result",
            issueCode: "unsupported_evidence_conflict",
            counterEvidence,
          },
        });
        feasibilityOutput = parseSourceFeasibility(repaired.output);
        if (feasibilityOutput.kind === "unsupported"
          && unsupportedSourceEvidenceConflict(feasibilityOutput, sourceNeeds, candidateEvidence).length > 0) {
          fail("Model repeated an unsupported claim that conflicts with inspected source evidence", "FEASIBILITY_UNSUPPORTED_EVIDENCE_CONFLICT");
        }
      }
    }
    if (feasibilityOutput.kind === "clarification") {
      this.emitDebug({stage: "source_feasibility", outcome: "clarification"});
      emitTrace("source_feasibility", "passed", "Candidate evidence requires creator clarification");
      return {kind: "clarification", clarification: feasibilityOutput, trace, model: modelResult()};
    }
    if (feasibilityOutput.kind === "unsupported") {
      this.emitDebug({stage: "source_feasibility", outcome: "unsupported", code: feasibilityOutput.code});
      emitTrace("source_feasibility", "passed", "No supported source and operator composition satisfies the request");
      return {kind: "unsupported", unsupported: feasibilityOutput, discovery, trace, model: modelResult()};
    }
    this.emitDebug({stage: "source_feasibility", outcome: "feasibility", selectionCount: feasibilityOutput.selections.length});
    emitTrace("source_feasibility", "passed", "Model proposed discovered source choices and a registered operator composition");

    let blockers: readonly string[];
    try {
      blockers = validateSourceFeasibility(
        feasibilityOutput,
        discoveryPlanningOutput.semanticPlan,
        sourceNeeds,
        discovery,
        candidateEvidence,
        {maxNodes: this.limits.maxNodes, maxEdges: this.limits.maxEdges},
      );
    } catch (error) {
      this.emitDebug({
        stage: "source_feasibility",
        phase: "semantic_validation_failed",
        callNumber: modelCalls,
        validationCode: diagnosticErrorCode(error),
        validationMessage: diagnosticErrorMessage(error),
        ...modelOutputShape(feasibilityOutput),
      });
      if (error instanceof HarnessCompileError) throw new HarnessValidationError(error.message, error.code);
      throw error;
    }
    emitTrace("feasibility_validation", "passed", "Source references, schema evidence, operator configs, ports, connectivity, acyclicity, and limits passed deterministic checks");
    return {
      kind: "feasibility",
      readyForCompilation: false,
      discoveryPlan: discoveryPlanningOutput,
      sourceNeeds,
      discovery,
      entitySelection: entitySelectionOutput,
      feasibility: feasibilityOutput,
      blockers,
      trace,
      model: modelResult(),
    };
  }

  async plan(request: HarnessRequest, signal?: AbortSignal): Promise<HarnessPlanResult> {
    const trace: HarnessTraceEvent[] = [];
    const intent = request.intent.trim();
    if (intent.length === 0 || intent.length > this.limits.maxIntentLength) {
      fail("Intent length is outside harness limits", "INTENT_LIMIT_EXCEEDED");
    }
    if (request.sources.length === 0 || request.sources.length > this.limits.maxSources) {
      fail("Source count is outside harness limits", "SOURCE_LIMIT_EXCEEDED");
    }
    addTrace(trace, "admit", "passed", "Intent and inspected source candidates accepted within harness limits");

    let modelCalls = 0;
    let modelIdentity: {provider: AgentModelResponse["provider"]; model: string} | undefined;
    const invoke = async (modelRequest: AgentModelRequest): Promise<AgentModelResponse> => {
      if (modelCalls >= this.limits.maxModelCalls) fail("Model call limit exceeded", "MODEL_CALL_LIMIT_EXCEEDED");
      const response = await this.model.complete(modelRequest, signal);
      const responseBytes = new TextEncoder().encode(JSON.stringify(response.output)).byteLength;
      if (responseBytes > this.limits.maxProposalBytes) fail("Model stage output exceeds harness size limit", "MODEL_OUTPUT_LIMIT_EXCEEDED");
      modelCalls += 1;
      if (modelIdentity && (modelIdentity.provider !== response.provider || modelIdentity.model !== response.model)) {
        fail("Model identity changed during one planning run", "MODEL_IDENTITY_CHANGED");
      }
      modelIdentity ??= {provider: response.provider, model: response.model};
      return response;
    };
    const modelResult = () => ({...modelIdentity!, calls: modelCalls});

    addTrace(trace, "semantic_interpretation", "started", "Semantic interpreter invoked without source IDs or execution authority");
    const semanticResponse = await invoke({
      stage: "semantic_interpretation",
      promptVersion: "1",
      intent,
      availableNetworks: [...new Map(request.sources.map((source) => [
        sourceDataNetwork(source),
        {dataNetwork: sourceDataNetwork(source), label: source.schema.chain},
      ])).values()],
    });
    const semanticOutput = parseSemanticPass(semanticResponse.output);
    if (semanticOutput.kind === "clarification") {
      addTrace(trace, "semantic_interpretation", "passed", "Semantic ambiguity requires creator clarification");
      return {kind: "clarification", clarification: semanticOutput, trace, model: modelResult()};
    }
    if (semanticOutput.kind === "unsupported") {
      addTrace(trace, "semantic_interpretation", "passed", "Intent is outside the bounded first-runtime semantics");
      return {kind: "unsupported", unsupported: semanticOutput, trace, model: modelResult()};
    }
    validateSemanticPlan(semanticOutput);
    addTrace(trace, "semantic_interpretation", "passed", "Semantic plan passed the strict first-runtime contract");

    const sourceNeeds = deriveSourceNeeds(semanticOutput);
    addTrace(trace, "source_needs", "passed", `Derived ${sourceNeeds.length} network-specific source needs without model-selected identifiers`);
    const candidates = buildCandidateSummaries(sourceNeeds, request.sources);
    const missingNetworks = sourceNeeds
      .filter((need) => !candidates.some((candidate) => candidate.sourceNeedId === need.id))
      .map((need) => need.dataNetwork);
    if (missingNetworks.length > 0) {
      return {kind: "unsupported", unsupported: sourceGap(missingNetworks), trace, model: modelResult()};
    }

    addTrace(trace, "source_selection", "started", "Source selector invoked with bounded inspected candidates and field evidence only");
    const selectionResponse = await invoke({
      stage: "source_selection",
      promptVersion: "1",
      semanticPlan: semanticOutput,
      sourceNeeds,
      candidates,
      canonicalFieldContract,
    });
    const selectionOutput = parseSourceSelection(selectionResponse.output);
    const bindings = validateSourceSelections(selectionOutput, sourceNeeds, candidates, request.sources);
    addTrace(trace, "source_selection", "passed", "Every selected source and field path matched admitted inspection evidence");

    const missingAccess = bindings
      .map((binding) => binding.candidate.sourceKey)
      .filter((sourceKey) => !request.accessSelections.some((selection) => selection.sourceKey === sourceKey));
    if (missingAccess.length > 0) {
      return {kind: "clarification", clarification: accessClarification(missingAccess), trace, model: modelResult()};
    }

    const queryPlans = compileQueryPlans(bindings);
    addTrace(trace, "query_compilation", "passed", "Static cursor-paginated GraphQL plans compiled without issuing provider requests");

    addTrace(trace, "dag_composition", "started", "DAG composer invoked with validated row schemas and the fixed operator registry");
    const compositionResponse = await invoke({
      stage: "dag_composition",
      promptVersion: "1",
      semanticPlan: semanticOutput,
      sourceRoles: bindings.map((binding) => ({
        role: sourceRole(binding.need.id),
        sourceNeedId: binding.need.id,
        rowSchema: "canonical_swap_v1",
      })),
      operatorRegistry,
      limits: {maxNodes: this.limits.maxNodes, maxEdges: this.limits.maxEdges},
    });
    const composition = parseCompositionIntent(compositionResponse.output);
    addTrace(trace, "dag_composition", "passed", "Composition uses only registered operators and compiler-owned source roles");

    addTrace(trace, "spec_assembly", "started", "Stable node IDs, query plans, access bindings, and resource ceilings are being assembled");
    let compiled: ReturnType<typeof assembleSpecification>;
    try {
      compiled = assembleSpecification(semanticOutput, bindings, queryPlans, composition, request.accessSelections);
    } catch (error) {
      if (error instanceof HarnessCompileError) throw new HarnessValidationError(error.message, error.code);
      throw error;
    }
    addTrace(trace, "spec_assembly", "passed", "Canonical schemaVersion 2 specification and Builder projection assembled");
    addTrace(trace, "spec_validation", "passed", "DAG ports, input cardinality, connectivity, acyclicity, and limits validated");

    const proposal: ValidatedHarnessProposal = {
      schemaVersion: 1,
      kind: "proposal",
      intentSummary: semanticOutput.summary,
      specification: compiled.specification,
      builder: compiled.builder,
      queryPlans,
      assumptions: [...semanticOutput.assumptions, ...selectionOutput.assumptions],
      blockers: [],
    };
    return {
      kind: "proposal",
      proposal,
      selectedSources: bindings.map((binding) => binding.input),
      trace,
      model: modelResult(),
    };
  }

  async run(request: HarnessRequest, signal?: AbortSignal): Promise<HarnessResult> {
    const planned = await this.plan(request, signal);
    if (planned.kind === "clarification") {
      fail(planned.clarification.questions[0]?.question ?? "Planning requires clarification", "PLANNING_REQUIRES_CLARIFICATION");
    }
    if (planned.kind === "unsupported") {
      fail(planned.unsupported.reason, planned.unsupported.code.toUpperCase());
    }
    const sourceNetworks = planned.proposal.specification.sources.map((source) => source.dataNetwork);
    if (sourceNetworks.length !== 2 || planned.proposal.specification.dag.nodes.filter((node) => node.type === "join").length !== 1) {
      fail("The evaluator execution adapter currently supports one two-source intersection plan", "EXECUTION_SHAPE_UNSUPPORTED");
    }
    const trace = [...planned.trace];
    addTrace(trace, "dag_execution", "started", "Deterministic fixture-backed execution started; no live Graph request is made during planning");
    const execution = executeCrossChainTraderFootprint(planned.selectedSources, {
      leftChain: planned.selectedSources[0]!.schema.chain,
      rightChain: planned.selectedSources[1]!.schema.chain,
      ...request.executionWindow,
    });
    addTrace(trace, "dag_execution", "passed", `Processed ${execution.unionRows.length} canonical rows into ${execution.crossChain.length} cross-chain wallet rows`);
    addTrace(trace, "output", "passed", "Fixture-backed output is available; no provider, payment, deployment, or persistence side effect occurred");
    return {...planned, trace, execution};
  }
}
