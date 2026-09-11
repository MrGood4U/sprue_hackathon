export const graphMcpPlanningTools = [
  "search_subgraphs_by_keyword",
  "get_deployment_30day_query_counts",
  "get_schema_by_deployment_id",
  "get_schema_by_subgraph_id",
  "get_schema_by_ipfs_hash",
  "get_top_subgraph_deployments",
] as const;

export type GraphMcpPlanningTool = typeof graphMcpPlanningTools[number];
export type GraphMcpRuntimeSchemaTool = "execute_query_by_ipfs_hash";
export type GraphMcpTool = GraphMcpPlanningTool | GraphMcpRuntimeSchemaTool;

export type GraphSemanticValueType =
  | "boolean"
  | "string"
  | "id"
  | "address"
  | "bytes"
  | "integer"
  | "decimal"
  | "timestamp"
  | "date"
  | "json";

/**
 * A source requirement describes meaning, not a provider field name. Name
 * hints are bounded ranking hints only. A later planning pass must bind the
 * requirement to an exact path from an inspected schema.
 */
export interface GraphFieldRequirement {
  id: string;
  description: string;
  expectedType: GraphSemanticValueType;
  unit: string | null;
  required: boolean;
  allowNullable: boolean;
  hints: readonly string[];
}

export type GraphSourceReference =
  | {type: "deployment_id"; id: string}
  | {type: "subgraph_id"; id: string}
  | {type: "ipfs_hash"; id: string};

export interface GraphSearchResult {
  subgraphs: readonly {
    subgraphId: string;
    displayName: string;
    manifestIpfsCid: string;
  }[];
  total: number;
  returned: number;
}

export interface GraphDeploymentActivity {
  manifestIpfsCid: string;
  totalQueryCount30d: number;
  dataPointsCount: number;
}

export interface GraphContractDeployment {
  manifestIpfsCid: string;
  network: string;
  queryFeesAmount: string | null;
}

export interface GraphPlanningMcpPort {
  searchSubgraphsByKeyword(keyword: string, signal?: AbortSignal): Promise<GraphSearchResult>;
  getDeploymentActivity(manifestIpfsCids: readonly string[], signal?: AbortSignal): Promise<readonly GraphDeploymentActivity[]>;
  getSchema(reference: GraphSourceReference, signal?: AbortSignal): Promise<string>;
  getTopDeploymentsForContract(
    request: {contractAddress: string; chain: string},
    signal?: AbortSignal,
  ): Promise<readonly GraphContractDeployment[]>;
  close(): Promise<void>;
}

export interface GraphRuntimeQueryField {
  name: string;
  entityType: string;
  list: boolean;
}

/**
 * Narrow controller-owned runtime-schema capability. Callers cannot supply a
 * GraphQL document or variables; the adapter executes Sprue's fixed Query-root
 * introspection document against one immutable manifest CID.
 */
export interface GraphRuntimeSchemaPort {
  getRuntimeQueryFields(manifestIpfsCid: string, signal?: AbortSignal): Promise<readonly GraphRuntimeQueryField[]>;
}

export interface GraphRuntimeQueryResult {
  data: Readonly<Record<string, unknown>>;
  errors: readonly {message: string}[];
}

/**
 * Executes only a server-owned, immutable GraphQL document from a compiled product
 * version. HTTP callers never supply this document or its variables.
 */
export interface GraphRuntimeQueryPort {
  executeStaticQuery(
    manifestIpfsCid: string,
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<GraphRuntimeQueryResult>;
  close(): Promise<void>;
}

export interface GraphCachedSchemaProjection {
  schemaVersion: 2;
  gatewayEnvironment: "mainnet";
  manifestIpfsCid: string;
  schemaHash: string;
  schemaBytes: number;
  queryEntitySource: "source_sdl" | "runtime_introspection";
  entities: readonly {
    queryEntity: string;
    entityType: string;
    entityKind: GraphSchemaEntityKind;
    aggregation: GraphAggregationInspection | null;
    fields: readonly GraphInspectedField[];
  }[];
}

export interface GraphSchemaCachePort {
  get(
    identity: {manifestIpfsCid: string; schemaHash: string},
    signal?: AbortSignal,
  ): Promise<GraphCachedSchemaProjection | null>;
  set(value: GraphCachedSchemaProjection, signal?: AbortSignal): Promise<void>;
}

export interface GraphSourceDiscoveryNeed {
  id: string;
  dataNetwork: string;
  networkLabel: string;
  keywords: readonly string[];
  description: string;
  grain: string;
  fields: readonly GraphFieldRequirement[];
  constraints: readonly string[];
  contract?: {address: string; chain: string};
}

export interface GraphSourceDiscoveryRequest {
  needs: readonly GraphSourceDiscoveryNeed[];
}

export interface GraphInspectedField {
  path: string;
  graphType: string;
  valueType: GraphSemanticValueType;
  nullable: boolean;
  list: boolean;
}

export interface GraphSourceQueryPlan {
  schemaVersion: 1;
  operationName: "SprueLiveSource";
  document: string;
  pagination: {
    kind: "id_cursor";
    cursorField: "id";
    pageSize: number;
    maxRequests: number;
    maxRows: number;
  };
  runtimeWindow?: {
    kind: "complete_utc_days";
    days: number;
    timezone: "UTC";
    field: string;
    startVariable: "windowStart";
    endVariable: "windowEnd";
    valueEncoding: "unix_seconds";
  } | null;
  aggregation?: {
    sourceEntity: string;
    interval: "hour" | "day";
  } | null;
  pushedOperations: readonly {
    nodeRole: string;
    operator: "map" | "filter" | "sort";
    description: string;
  }[];
}

export type GraphSchemaEntityKind = "entity" | "timeseries" | "aggregation";

export interface GraphAggregationInspection {
  sourceEntity: string;
  intervals: readonly ("hour" | "day")[];
  dimensions: readonly string[];
  measures: readonly {
    fieldPath: string;
    fn: "sum" | "count" | "min" | "max" | "first" | "last";
    arg: string | null;
    cumulative: boolean;
  }[];
}

export interface GraphSchemaEntityInspection {
  queryEntity: string;
  entityType: string;
  entityKind?: GraphSchemaEntityKind;
  aggregation?: GraphAggregationInspection | null;
  fields: readonly GraphInspectedField[];
  suggestedBindings: readonly {requirementId: string; fieldPaths: readonly string[]}[];
  matchedRequirements: readonly string[];
  grainHint?: "matched" | "unknown";
}

export interface GraphDiscoveredSourceCandidate {
  candidateRef: string;
  sourceNeedId: string;
  discoveryMethod: "keyword" | "contract";
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  displayName: string;
  reportedNetwork: string | null;
  networkEvidence: "contract_filter" | "display_name" | "unknown" | "conflict";
  totalQueryCount30d: number | null;
  queryActivityEvidence: "observed" | "missing";
  schemaHash: string | null;
  schemaBytes: number | null;
  entities: readonly GraphSchemaEntityInspection[];
  status: "suitable" | "needs_verification" | "incompatible";
  score: number;
  limitations: readonly string[];
}

export interface GraphSourceDiscoveryResult {
  schemaVersion: 1;
  provider: "the_graph";
  gatewayEnvironment: "mainnet";
  searchedNeeds: number;
  searchCalls: number;
  inspectedSchemas: number;
  candidates: readonly GraphDiscoveredSourceCandidate[];
  limits: {
    maxSearchCallsPerNeed: number;
    maxSearchResultsPerCall: number;
    maxSchemaInspectionsPerNeed: number;
  };
}

export interface GraphSourceDiscoveryPort {
  discover(request: GraphSourceDiscoveryRequest, signal?: AbortSignal): Promise<GraphSourceDiscoveryResult>;
}
