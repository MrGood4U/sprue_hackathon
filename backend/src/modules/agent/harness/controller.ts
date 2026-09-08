import {executeCrossChainTraderFootprint} from "../../dag/runtime.js";
import type {
  GraphFieldRequirement,
  GraphInspectedField,
  GraphSchemaEntityInspection,
  GraphSemanticValueType,
  GraphSourceDiscoveryPort,
  GraphSourceDiscoveryRequest,
  GraphSourceDiscoveryResult,
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
  validateFlexibleComposition,
} from "./flexible-planning.js";
import {operatorRegistry} from "./registry.js";
import {
  HarnessSchemaError,
  parseCompositionIntent,
  parseSourceDiscoveryPlanning,
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

function validateExplorationRequest(request: HarnessExplorationRequest, limits: {maxSources: number; maxIntentLength: number}): string {
  const intent = request.intent.trim();
  if (intent.length === 0 || intent.length > limits.maxIntentLength) {
    fail("Intent length is outside harness limits", "INTENT_LIMIT_EXCEEDED");
  }
  if (request.availableNetworks.length === 0 || request.availableNetworks.length > limits.maxSources) {
    fail("Available network count is outside harness limits", "SOURCE_LIMIT_EXCEEDED");
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

const maxFeasibilityEntitiesPerNeed = 16;

function normalizedFieldName(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, "").trim();
}

function compactFeasibilityEntity(
  entity: GraphSchemaEntityInspection,
  need: DiscoverySourceNeed,
): SourceFeasibilityCandidate["entities"][number] {
  const suggested = new Set(entity.suggestedBindings.flatMap((binding) => binding.fieldPaths));
  const hintNames = new Set(need.fields.flatMap((requirement) => [requirement.id, ...requirement.hints]).map(normalizedFieldName));
  const fields = entity.fields
    .filter((field) => {
      const terminal = field.path.split(".").at(-1) ?? field.path;
      return !field.path.includes(".") || suggested.has(field.path) || hintNames.has(normalizedFieldName(terminal));
    })
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
    || directBindings(right) - directBindings(left)
    || right.matchedRequirements.length - left.matchedRequirements.length
    || left.queryEntity.localeCompare(right.queryEntity);
}

function feasibilityCandidates(
  discovery: GraphSourceDiscoveryResult,
  needs: readonly DiscoverySourceNeed[],
): readonly SourceFeasibilityCandidate[] {
  const output: SourceFeasibilityCandidate[] = [];
  for (const need of needs) {
    const inspected = discovery.candidates.filter((candidate) => candidate.sourceNeedId === need.id && candidate.entities.length > 0);
    const selectable = inspected.filter((candidate) => candidate.status === "suitable");
    const candidatePool = selectable.length > 0 ? selectable : inspected;
    let remainingEntities = maxFeasibilityEntitiesPerNeed;
    for (const candidate of candidatePool) {
      if (remainingEntities === 0) break;
      const ranked = candidate.entities.slice().sort((left, right) => compareRelevantEntities(need, left, right));
      const bestRequiredMatchCount = ranked[0]?.matchedRequirements.filter((id) => need.fields.some((field) => field.required && field.id === id)).length ?? 0;
      const relevant = ranked.filter((entity) =>
        entity.matchedRequirements.filter((id) => need.fields.some((field) => field.required && field.id === id)).length === bestRequiredMatchCount);
      const selectedEntities = relevant.slice(0, remainingEntities);
      if (selectedEntities.length === 0) continue;
      remainingEntities -= selectedEntities.length;
      output.push({
        candidateRef: candidate.candidateRef,
        sourceNeedId: candidate.sourceNeedId,
        logicalSubgraphId: candidate.logicalSubgraphId,
        manifestIpfsCid: candidate.manifestIpfsCid,
        networkEvidence: candidate.networkEvidence,
        totalQueryCount30d: candidate.totalQueryCount30d,
        queryActivityEvidence: candidate.queryActivityEvidence,
        schemaHash: candidate.schemaHash,
        status: candidate.status,
        entities: selectedEntities.map((entity) => compactFeasibilityEntity(entity, need)),
      });
    }
  }
  return output;
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
      .find(({entity}) => required.every((id) => entity.matchedRequirements.includes(id)));
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
    for (const binding of selection.fieldBindings) {
      const requirement = requirements.get(binding.requirementId);
      const inspectedField = fields.get(binding.fieldPath);
      if (!requirement || bound.has(requirement.id) || !inspectedField || !graphTypeCompatible(requirement, inspectedField)) {
        fail("Feasibility field binding is not supported by inspected schema evidence", "FEASIBILITY_FIELD_BINDING_INVALID");
      }
      bound.add(requirement.id);
    }
    const missing = need.fields.filter((requirement) => requirement.required && !bound.has(requirement.id));
    if (missing.length > 0) {
      fail(`Feasibility output omitted required fields for ${need.id}`, "FEASIBILITY_FIELD_BINDING_MISSING");
    }
    seenNeeds.add(need.id);
    return discoveredCandidate;
  });
  validateFlexibleComposition(plan, output.composition, needs, output.selections, limits);
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
      maxModelCalls: number;
      maxIntentLength: number;
      maxProposalBytes: number;
      maxNodes: number;
      maxEdges: number;
    } = {
      maxSources: 4,
      maxModelCalls: 4,
      maxIntentLength: 8000,
      maxProposalBytes: 1_048_576,
      maxNodes: 12,
      maxEdges: 24,
    },
    private readonly sourceDiscovery?: GraphSourceDiscoveryPort,
    private readonly debugSink?: AgentDebugSink,
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

  async explore(request: HarnessExplorationRequest, signal?: AbortSignal): Promise<HarnessExplorationResult> {
    if (!this.sourceDiscovery) {
      fail("Graph source discovery is not configured", "GRAPH_SOURCE_DISCOVERY_UNAVAILABLE");
    }
    const trace: HarnessTraceEvent[] = [];
    const intent = validateExplorationRequest(request, this.limits);
    addTrace(trace, "admit", "passed", "Intent and network catalog accepted within harness limits");

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
    const parseWithRepair = async <T>(
      modelRequest: SourceDiscoveryPlanningModelRequest | SourceFeasibilityModelRequest,
      response: AgentModelResponse,
      parser: (output: unknown) => T,
    ): Promise<T> => {
      try {
        return parser(response.output);
      } catch (error) {
        if (!(error instanceof HarnessSchemaError) || modelCalls >= this.limits.maxModelCalls) throw error;
        addTrace(trace, modelRequest.stage, "failed", "Model output did not match the strict planning-stage contract");
        addTrace(trace, modelRequest.stage, "started", "Requesting one bounded schema repair from the configured model");
        const repaired = await invoke({
          ...modelRequest,
          repair: {
            attempt: 1,
            reason: "schema_validation_failed",
            path: error.path,
            issueCode: error.issueCode,
          },
        });
        return parser(repaired.output);
      }
    };

    addTrace(trace, "source_discovery_planning", "started", "Model is deriving bounded semantic requirements and Subgraph search keywords");
    const discoveryPlanningRequest: SourceDiscoveryPlanningModelRequest = {
      stage: "source_discovery_planning",
      promptVersion: "3",
      intent,
      availableNetworks: request.availableNetworks,
      limits: {maxNetworks: this.limits.maxSources, maxUniqueKeywordsPerNetwork: 3, maxKeywordsPerNetwork: 3},
    };
    const discoveryPlanningResponse = await invoke(discoveryPlanningRequest);
    const discoveryPlanningOutput = await parseWithRepair(
      discoveryPlanningRequest,
      discoveryPlanningResponse,
      parseSourceDiscoveryPlanning,
    );
    if (discoveryPlanningOutput.kind === "clarification") {
      addTrace(trace, "source_discovery_planning", "passed", "Search planning requires creator clarification");
      return {kind: "clarification", clarification: discoveryPlanningOutput, trace, model: modelResult()};
    }
    if (discoveryPlanningOutput.kind === "unsupported") {
      addTrace(trace, "source_discovery_planning", "passed", "Intent is outside the registered operators or supplied network catalog");
      return {kind: "unsupported", unsupported: discoveryPlanningOutput, trace, model: modelResult()};
    }
    validateSourceDiscoveryPlan(discoveryPlanningOutput, request.availableNetworks, 3);
    addTrace(trace, "source_discovery_planning", "passed", "Search keywords and semantic requirements passed strict validation");
    this.emitDebug({
      stage: "source_discovery_planning",
      networks: [...new Set(discoveryPlanningOutput.semanticPlan.sourceRequirements.map((need) => need.dataNetwork))],
      searches: discoveryPlanningOutput.searches,
    });

    const sourceNeeds = deriveDiscoverySourceNeeds(discoveryPlanningOutput.semanticPlan);
    addTrace(trace, "source_needs", "passed", `Derived ${sourceNeeds.length} compiler-owned source needs`);
    const labels = new Map(request.availableNetworks.map((network) => [network.dataNetwork, network.label]));
    const searches = new Map(discoveryPlanningOutput.searches.map((search) => [search.sourceNeedId, search.keywords]));
    addTrace(trace, "graph_source_discovery", "started", "Controller is invoking the restricted Graph metadata adapter with validated keywords");
    const discovery = await this.sourceDiscovery.discover({
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
    addTrace(trace, "graph_source_discovery", "passed", `Discovered ${discovery.candidates.length} candidates and inspected ${discovery.inspectedSchemas} schemas`);
    this.emitDebug({
      stage: "graph_source_discovery",
      searchCalls: discovery.searchCalls,
      candidateCount: discovery.candidates.length,
      inspectedSchemas: discovery.inspectedSchemas,
      candidates: discovery.candidates,
    });

    addTrace(trace, "source_feasibility", "started", "Model is assessing inspected candidates and a bounded operator composition");
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
    const candidateEvidence = feasibilityCandidates(discovery, sourceNeeds);
    const feasibilityRequest: SourceFeasibilityModelRequest = {
      stage: "source_feasibility",
      promptVersion: "3",
      semanticPlan: discoveryPlanningOutput.semanticPlan,
      sourceNeeds,
      candidates: candidateEvidence,
      sourceRoles,
      operatorRegistry: flexibleOperatorRegistry,
      limits: {maxNodes: this.limits.maxNodes, maxEdges: this.limits.maxEdges},
    };
    const feasibilityResponse = await invoke(feasibilityRequest);
    let feasibilityOutput = await parseWithRepair(feasibilityRequest, feasibilityResponse, parseSourceFeasibility);
    if (feasibilityOutput.kind === "unsupported") {
      const counterEvidence = unsupportedSourceEvidenceConflict(feasibilityOutput, sourceNeeds, candidateEvidence);
      if (counterEvidence.length > 0) {
        if (modelCalls >= this.limits.maxModelCalls) {
          fail("Model unsupported claim conflicts with inspected source evidence", "FEASIBILITY_UNSUPPORTED_EVIDENCE_CONFLICT");
        }
        addTrace(trace, "source_feasibility", "failed", "Model unsupported claim conflicted with inspected source evidence");
        addTrace(trace, "source_feasibility", "started", "Requesting one bounded feasibility repair with inspected counter-evidence");
        this.emitDebug({stage: "source_feasibility", outcome: "repair", contradictionCount: counterEvidence.length});
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
      addTrace(trace, "source_feasibility", "passed", "Candidate evidence requires creator clarification");
      return {kind: "clarification", clarification: feasibilityOutput, trace, model: modelResult()};
    }
    if (feasibilityOutput.kind === "unsupported") {
      this.emitDebug({stage: "source_feasibility", outcome: "unsupported", code: feasibilityOutput.code});
      addTrace(trace, "source_feasibility", "passed", "No supported source and operator composition satisfies the request");
      return {kind: "unsupported", unsupported: feasibilityOutput, discovery, trace, model: modelResult()};
    }
    this.emitDebug({stage: "source_feasibility", outcome: "feasibility", selectionCount: feasibilityOutput.selections.length});
    addTrace(trace, "source_feasibility", "passed", "Model proposed discovered source choices and a registered operator composition");

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
      if (error instanceof HarnessCompileError) throw new HarnessValidationError(error.message, error.code);
      throw error;
    }
    addTrace(trace, "feasibility_validation", "passed", "Source references, schema evidence, operator configs, ports, connectivity, acyclicity, and limits passed deterministic checks");
    return {
      kind: "feasibility",
      readyForCompilation: false,
      discoveryPlan: discoveryPlanningOutput,
      sourceNeeds,
      discovery,
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
