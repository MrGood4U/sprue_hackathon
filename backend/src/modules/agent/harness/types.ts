import type {CanonicalSwapField, CrossChainTraderFootprintResult, SourceInput} from "../../dag/runtime.js";
import type {
  GraphDiscoveredSourceCandidate,
  GraphFieldRequirement,
  GraphInspectedField,
  GraphSemanticValueType,
  GraphSourceDiscoveryResult,
} from "../../graph/index.js";

export interface AgentModelConfig {
  mode: "mock" | "remote";
  apiUrl: string | null;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}

/**
 * Local diagnostics emitted only when the server-side Agent debug switch is
 * enabled. This deliberately contains planning metadata, never prompts,
 * provider response bodies, credentials, or user/workspace identifiers.
 */
export type AgentDebugEvent =
  | {
      stage: "source_discovery_planning";
      networks: readonly string[];
      searches: readonly SourceDiscoverySearch[];
    }
  | {
      stage: "graph_source_discovery";
      searchCalls: number;
      candidateCount: number;
      inspectedSchemas: number;
      candidates: readonly GraphDiscoveredSourceCandidate[];
    }
  | {
      stage: "source_feasibility";
      outcome: "feasibility" | "clarification" | "unsupported" | "repair";
      code?: string;
      selectionCount?: number;
      contradictionCount?: number;
    };

export type AgentDebugSink = (event: AgentDebugEvent) => void;

export type PlannerStage =
  | "source_discovery_planning"
  | "source_feasibility"
  | "semantic_interpretation"
  | "source_selection"
  | "dag_composition";

export interface SemanticFact {
  id: "wallet" | "trade_id" | "timestamp" | "volume_usd";
  type: "address" | "string" | "timestamp" | "decimal";
  unit?: "USD";
  required: true;
}

export interface SemanticPlan {
  schemaVersion: 1;
  kind: "semantic_plan";
  summary: string;
  population: {
    entity: "wallet";
    inclusion: string;
    exclusion: readonly string[];
  };
  facts: readonly SemanticFact[];
  networks: readonly string[];
  grain: "swap_event";
  window: {kind: "complete_utc_days"; days: number};
  metrics: readonly ("trade_count" | "volume_usd" | "first_seen_at" | "last_seen_at")[];
  combination: {kind: "intersection" | "append"; keys: readonly ["wallet"]};
  output: {shape: "wallet_rows"; orderBy: readonly ["wallet"]};
  refresh: {mode: "manual" | "scheduled"; timezone: "UTC"};
  assumptions: readonly string[];
  unresolved: readonly string[];
}

/**
 * Schema-driven exploration semantics. Unlike the legacy fixture compiler,
 * this contract does not prescribe an entity, field vocabulary, grain, metric,
 * grouping key, or output shape.
 */
export interface DiscoverySourceRequirement {
  id: string;
  dataNetwork: string;
  description: string;
  grain: string;
  fields: readonly GraphFieldRequirement[];
  constraints: readonly string[];
}

export interface DiscoveryOutputField {
  name: string;
  description: string;
  type: GraphSemanticValueType;
  unit: string | null;
  nullable: boolean;
}

export interface DiscoverySemanticPlan {
  schemaVersion: 2;
  kind: "semantic_plan";
  summary: string;
  sourceRequirements: readonly DiscoverySourceRequirement[];
  result: {
    description: string;
    grain: string;
    fields: readonly DiscoveryOutputField[];
    orderBy: readonly {field: string; direction: "asc" | "desc"}[];
  };
  refresh: {mode: "manual" | "scheduled"; timezone: "UTC"};
  assumptions: readonly string[];
  unresolved: readonly string[];
}

export interface PlannerClarification {
  schemaVersion: 1;
  kind: "clarification";
  questions: readonly {code: string; question: string}[];
}

export interface PlannerUnsupported {
  schemaVersion: 1;
  kind: "unsupported";
  code: string;
  reason: string;
  missingFacts: readonly string[];
}

export type SemanticPassOutput = SemanticPlan | PlannerClarification | PlannerUnsupported;

export interface SourceDiscoverySearch {
  sourceNeedId: string;
  keywords: readonly string[];
}

export interface SourceDiscoveryPlan {
  schemaVersion: 2;
  kind: "source_discovery_plan";
  semanticPlan: DiscoverySemanticPlan;
  searches: readonly SourceDiscoverySearch[];
}

export type SourceDiscoveryPlanningOutput = SourceDiscoveryPlan | PlannerClarification | PlannerUnsupported;

export interface SourceNeed {
  id: string;
  dataNetwork: string;
  requiredFacts: readonly SemanticFact["id"][];
  requiredGrain: "swap_event";
  requiredWindow: SemanticPlan["window"];
  joinRole: {kind: "left" | "right" | "single"; keys: readonly ["wallet"]};
  optionalFacts: readonly ("pool" | "token_in" | "token_out")[];
}

export interface DiscoverySourceNeed extends DiscoverySourceRequirement {}

export interface SourceCandidateSummary {
  candidateRef: string;
  sourceKey: string;
  sourceNeedId: string;
  chain: string;
  dataNetwork: string;
  subgraphId: string;
  deploymentId: string;
  schemaHash: string;
  queryEntity: string;
  fields: Readonly<Record<string, string>>;
}

export interface SourceSelection {
  sourceNeedId: string;
  candidateRef: string;
  mapping: Readonly<Record<CanonicalSwapField, string>>;
  rationale: string;
}

export interface SourceSelectionOutput {
  schemaVersion: 1;
  kind: "source_selection";
  selections: readonly SourceSelection[];
  assumptions: readonly string[];
}

export interface CompositionNode {
  role: string;
  operator: "filter" | "map" | "aggregate" | "union" | "join" | "output";
  operatorVersion: "1";
  config: Readonly<Record<string, unknown>>;
}

export interface CompositionConnection {
  fromRole: string;
  toRole: string;
  inputRole: "rows" | "left" | "right";
}

export interface CompositionIntent {
  schemaVersion: 1;
  kind: "composition_intent";
  nodes: readonly CompositionNode[];
  connections: readonly CompositionConnection[];
  templateInstances: readonly [];
}

export interface SourceFeasibilityCandidate {
  candidateRef: string;
  sourceNeedId: string;
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  networkEvidence: "contract_filter" | "display_name" | "unknown" | "conflict";
  totalQueryCount30d: number | null;
  queryActivityEvidence: "observed" | "missing";
  schemaHash: string | null;
  status: "suitable" | "needs_verification" | "incompatible";
  entities: readonly {
    queryEntity: string;
    entityType: string;
    fields: readonly GraphInspectedField[];
    suggestedBindings: readonly {requirementId: string; fieldPaths: readonly string[]}[];
    matchedRequirements: readonly string[];
  }[];
}

export interface SourceFieldBinding {
  requirementId: string;
  fieldPath: string;
}

export interface SourceFeasibilitySelection {
  sourceNeedId: string;
  candidateRef: string;
  queryEntity: string;
  fieldBindings: readonly SourceFieldBinding[];
  rationale: string;
}

export interface FlexibleCompositionNode {
  role: string;
  operator: "filter" | "map" | "aggregate" | "union" | "join" | "output";
  operatorVersion: "2";
  config: Readonly<Record<string, unknown>>;
}

export interface FlexibleCompositionIntent {
  schemaVersion: 2;
  kind: "composition_intent";
  nodes: readonly FlexibleCompositionNode[];
  connections: readonly CompositionConnection[];
  templateInstances: readonly [];
}

export interface SourceFeasibilityPlan {
  schemaVersion: 2;
  kind: "source_feasibility";
  selections: readonly SourceFeasibilitySelection[];
  composition: FlexibleCompositionIntent;
  assumptions: readonly string[];
}

export type SourceFeasibilityOutput = SourceFeasibilityPlan | PlannerClarification | PlannerUnsupported;

export interface SourceDiscoveryPlanningModelRequest {
  stage: "source_discovery_planning";
  promptVersion: "3";
  intent: string;
  availableNetworks: readonly {dataNetwork: string; label: string}[];
  limits: {maxNetworks: number; maxUniqueKeywordsPerNetwork: number; maxKeywordsPerNetwork: number};
  repair?: ModelRepairDirective;
}

export interface SourceFeasibilityModelRequest {
  stage: "source_feasibility";
  promptVersion: "3";
  semanticPlan: DiscoverySemanticPlan;
  sourceNeeds: readonly DiscoverySourceNeed[];
  candidates: readonly SourceFeasibilityCandidate[];
  sourceRoles: readonly {
    role: string;
    sourceNeedId: string;
    fields: readonly {name: string; type: GraphSemanticValueType; nullable: boolean; unit: string | null}[];
  }[];
  operatorRegistry: readonly OperatorSignature[];
  limits: {maxNodes: number; maxEdges: number};
  repair?: ModelRepairDirective;
}

export interface ModelRepairDirective {
  attempt: 1;
  reason: "schema_validation_failed" | "unsupported_evidence_conflict";
  path: string;
  issueCode: string;
  counterEvidence?: readonly {
    sourceNeedId: string;
    candidateRef: string;
    queryEntity: string;
    matchedRequiredFields: readonly string[];
  }[];
}

export interface SemanticModelRequest {
  stage: "semantic_interpretation";
  promptVersion: "1";
  intent: string;
  availableNetworks: readonly {dataNetwork: string; label: string}[];
}

export interface SourceSelectionModelRequest {
  stage: "source_selection";
  promptVersion: "1";
  semanticPlan: SemanticPlan;
  sourceNeeds: readonly SourceNeed[];
  candidates: readonly SourceCandidateSummary[];
  canonicalFieldContract: Readonly<Record<CanonicalSwapField, string>>;
}

export interface DagCompositionModelRequest {
  stage: "dag_composition";
  promptVersion: "1";
  semanticPlan: SemanticPlan;
  sourceRoles: readonly {role: string; sourceNeedId: string; rowSchema: string}[];
  operatorRegistry: readonly OperatorSignature[];
  limits: {maxNodes: number; maxEdges: number};
}

export type AgentModelRequest =
  | SourceDiscoveryPlanningModelRequest
  | SourceFeasibilityModelRequest
  | SemanticModelRequest
  | SourceSelectionModelRequest
  | DagCompositionModelRequest;

export interface AgentModelResponse {
  provider: "mock" | "remote";
  model: string;
  output: unknown;
}

export interface AgentModelPort {
  complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse>;
}

export interface OperatorSignature {
  type: "source" | "filter" | "map" | "aggregate" | "union" | "join" | "output";
  operatorVersion: "1" | "2";
  inputPorts: readonly string[];
  outputPorts: readonly string[];
  configContract: string;
}

export interface QueryPlan {
  sourceNeedId: string;
  sourceKey: string;
  document: string;
  documentHash: string;
  variables: {
    startInclusive: {type: "BigInt!"; binding: "run.window.startInclusive"};
    endExclusive: {type: "BigInt!"; binding: "run.window.endExclusive"};
    first: {type: "Int!"; value: number};
    cursor: {type: "ID!"; initialValue: string};
  };
  extractionPath: readonly string[];
  rowSchema: Readonly<Record<CanonicalSwapField, string>>;
  pagination: {kind: "id_cursor"; pageSize: number; maxPages: number};
}

export interface CanonicalDagNode {
  id: string;
  type: OperatorSignature["type"];
  operatorVersion: "1";
  config: Readonly<Record<string, unknown>>;
}

export interface CanonicalDagEdge {
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface SourceAccessSelection {
  sourceKey: string;
  mode: "customer_api_key" | "x402";
  providerCredentialId?: string | null;
  spendingPolicyId?: string | null;
  gatewayEnvironment: "mainnet" | "testnet";
}

export type CanonicalSourceAccess = Omit<SourceAccessSelection, "sourceKey">;

export interface CanonicalSourceSpec {
  id: string;
  sourceSnapshotId: string;
  provider: "the_graph";
  kind: "subgraph";
  adapterVersion: "1";
  dataNetwork: string;
  target: {
    type: "deployment_id";
    id: string;
    logicalSubgraphId: string;
    manifestIpfsCid: null;
  };
  schemaHash: string;
  access: CanonicalSourceAccess;
  consistency: {mode: "pinned_block"; indexingErrorPolicy: "deny"};
  mapping: Readonly<Record<CanonicalSwapField, string>>;
}

export interface CanonicalDataProductSpec {
  schemaVersion: 2;
  runtimeVersion: "1";
  intent: {summary: string};
  sources: readonly CanonicalSourceSpec[];
  dag: {nodes: readonly CanonicalDagNode[]; edges: readonly CanonicalDagEdge[]};
  outputSchema: {fields: readonly {name: string; type: string}[]};
  refreshPolicy: {
    mode: "manual" | "scheduled";
    cronExpression: string | null;
    timezone: "UTC";
  };
  resourcePolicy: {
    maxNodes: number;
    maxSourceRows: number;
    maxSourceRequests: number;
    maxOutputRows: number;
    maxOutputBytes: number;
    maxStoredBytes: number;
    maxRuntimeMs: number;
  };
}

export interface BuilderProjection {
  schemaVersion: 2;
  runtimeVersion: "1";
  nodes: readonly CanonicalDagNode[];
  edges: readonly (CanonicalDagEdge & {id: string})[];
  operatorRegistry: readonly OperatorSignature[];
}

export interface ValidatedHarnessProposal {
  schemaVersion: 1;
  kind: "proposal";
  intentSummary: string;
  specification: CanonicalDataProductSpec;
  builder: BuilderProjection;
  queryPlans: readonly QueryPlan[];
  assumptions: readonly string[];
  blockers: readonly [];
}

export interface HarnessRequest {
  intent: string;
  sources: readonly SourceInput[];
  accessSelections: readonly SourceAccessSelection[];
  executionWindow?: {startInclusive: string; endExclusive: string};
}

export interface HarnessExplorationRequest {
  intent: string;
  availableNetworks: readonly {dataNetwork: string; label: string}[];
}

export interface HarnessTraceEvent {
  sequenceNo: number;
  stage:
    | "admit"
    | PlannerStage
    | "source_needs"
    | "graph_source_discovery"
    | "feasibility_validation"
    | "query_compilation"
    | "spec_assembly"
    | "spec_validation"
    | "dag_execution"
    | "output";
  status: "started" | "passed" | "failed";
  summary: string;
}

interface HarnessPlanBase {
  trace: readonly HarnessTraceEvent[];
  model: {provider: AgentModelResponse["provider"]; model: string; calls: number};
}

export interface HarnessProposalPlan extends HarnessPlanBase {
  kind: "proposal";
  proposal: ValidatedHarnessProposal;
  selectedSources: readonly SourceInput[];
}

export interface HarnessClarificationPlan extends HarnessPlanBase {
  kind: "clarification";
  clarification: PlannerClarification;
}

export interface HarnessUnsupportedPlan extends HarnessPlanBase {
  kind: "unsupported";
  unsupported: PlannerUnsupported;
}

export type HarnessPlanResult = HarnessProposalPlan | HarnessClarificationPlan | HarnessUnsupportedPlan;

interface HarnessExplorationBase {
  trace: readonly HarnessTraceEvent[];
  model: {provider: AgentModelResponse["provider"]; model: string; calls: number};
}

export interface HarnessFeasibilityExploration extends HarnessExplorationBase {
  kind: "feasibility";
  readyForCompilation: false;
  discoveryPlan: SourceDiscoveryPlan;
  sourceNeeds: readonly DiscoverySourceNeed[];
  discovery: GraphSourceDiscoveryResult;
  feasibility: SourceFeasibilityPlan;
  blockers: readonly string[];
}

export interface HarnessExplorationClarification extends HarnessExplorationBase {
  kind: "clarification";
  clarification: PlannerClarification;
}

export interface HarnessExplorationUnsupported extends HarnessExplorationBase {
  kind: "unsupported";
  unsupported: PlannerUnsupported;
  discovery?: GraphSourceDiscoveryResult;
}

export type HarnessExplorationResult =
  | HarnessFeasibilityExploration
  | HarnessExplorationClarification
  | HarnessExplorationUnsupported;

export interface HarnessResult extends HarnessProposalPlan {
  execution: CrossChainTraderFootprintResult;
}
