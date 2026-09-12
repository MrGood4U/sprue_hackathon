import {createHash} from "node:crypto";
import {
  validateSourceMapping,
  type CanonicalSwapField,
  type SourceInput,
} from "../../dag/runtime.js";
import {maximumDagEdges, maximumDagNodes} from "../../dag/limits.js";
import {operatorRegistry, registryEntry, validateCompositionNode} from "./registry.js";
import type {
  BuilderProjection,
  CanonicalDagEdge,
  CanonicalDagNode,
  CanonicalDataProductSpec,
  CompositionIntent,
  QueryPlan,
  SemanticPlan,
  SourceAccessSelection,
  CanonicalSourceAccess,
  SourceCandidateSummary,
  SourceNeed,
  SourceSelectionOutput,
} from "./types.js";

const canonicalFields: readonly CanonicalSwapField[] = [
  "wallet",
  "tradeId",
  "pool",
  "timestamp",
  "amountInUsd",
  "amountOutUsd",
  "tokenIn",
  "tokenOut",
];

export const canonicalFieldContract: Readonly<Record<CanonicalSwapField, string>> = {
  wallet: "address or ID",
  tradeId: "ID or string",
  pool: "address or ID",
  timestamp: "timestamp or integer",
  amountInUsd: "decimal or string",
  amountOutUsd: "decimal or string",
  tokenIn: "address or ID",
  tokenOut: "address or ID",
};

export class HarnessCompileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HarnessCompileError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new HarnessCompileError(code, message);
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized.length === 0) fail("INVALID_IDENTIFIER", "A stable identifier could not be derived");
  return normalized.slice(0, 100);
}

export function sourceDataNetwork(source: SourceInput): string {
  if (source.schema.dataNetwork) return source.schema.dataNetwork;
  const inferred: Record<string, string> = {
    ethereum: "eip155:1",
    arbitrum: "eip155:42161",
    base: "eip155:8453",
  };
  return inferred[source.schema.chain.toLowerCase()] ?? fail(
    "SOURCE_NETWORK_UNKNOWN",
    `Source ${source.schema.sourceKey} does not declare a data network`,
  );
}

export function sourceRole(sourceNeedId: string): string {
  return `source__${slug(sourceNeedId)}`;
}

export function deriveSourceNeeds(plan: SemanticPlan): readonly SourceNeed[] {
  const uniqueNetworks = [...new Set(plan.networks)];
  if (uniqueNetworks.length !== plan.networks.length) {
    fail("DUPLICATE_NETWORK", "Semantic plan contains a duplicate network");
  }
  return uniqueNetworks.map((network, index) => ({
    id: `${slug(network)}_swap_events`,
    dataNetwork: network,
    requiredFacts: ["wallet", "trade_id", "timestamp", "volume_usd"],
    requiredGrain: "swap_event",
    requiredWindow: plan.window,
    joinRole: {
      kind: uniqueNetworks.length === 1 ? "single" : index === 0 ? "left" : "right",
      keys: ["wallet"],
    },
    optionalFacts: ["pool", "token_in", "token_out"],
  }));
}

export function buildCandidateSummaries(
  needs: readonly SourceNeed[],
  sources: readonly SourceInput[],
): readonly SourceCandidateSummary[] {
  const candidates: SourceCandidateSummary[] = [];
  for (const source of sources) {
    const network = sourceDataNetwork(source);
    const need = needs.find((candidate) => candidate.dataNetwork === network);
    if (!need) continue;
    if (!source.schema.deploymentId) {
      fail("SOURCE_DEPLOYMENT_UNPINNED", `Source ${source.schema.sourceKey} has no immutable deployment ID`);
    }
    if (!source.schema.queryEntity) {
      fail("SOURCE_QUERY_ENTITY_UNKNOWN", `Source ${source.schema.sourceKey} has no inspected query entity`);
    }
    candidates.push({
      candidateRef: `candidate:${source.schema.sourceKey}`,
      sourceKey: source.schema.sourceKey,
      sourceNeedId: need.id,
      chain: source.schema.chain,
      dataNetwork: network,
      subgraphId: source.schema.subgraphId,
      deploymentId: source.schema.deploymentId,
      schemaHash: source.schema.schemaHash,
      queryEntity: source.schema.queryEntity,
      fields: source.schema.fieldTypes,
    });
  }
  return candidates;
}

export interface ValidatedSourceBinding {
  need: SourceNeed;
  candidate: SourceCandidateSummary;
  input: SourceInput;
  mapping: Readonly<Record<CanonicalSwapField, string>>;
}

export function validateSourceSelections(
  output: SourceSelectionOutput,
  needs: readonly SourceNeed[],
  candidates: readonly SourceCandidateSummary[],
  sources: readonly SourceInput[],
): readonly ValidatedSourceBinding[] {
  if (output.selections.length !== needs.length) {
    fail("SOURCE_NEED_UNSATISFIED", "Source selection must satisfy every source need exactly once");
  }
  const candidateByRef = new Map(candidates.map((candidate) => [candidate.candidateRef, candidate]));
  const sourceByKey = new Map(sources.map((source) => [source.schema.sourceKey, source]));
  const seenNeeds = new Set<string>();
  const bindings: ValidatedSourceBinding[] = [];
  for (const selection of output.selections) {
    const need = needs.find((candidate) => candidate.id === selection.sourceNeedId);
    if (!need || seenNeeds.has(need.id)) {
      fail("SOURCE_NEED_REFERENCE_INVALID", `Unknown or duplicate source need ${selection.sourceNeedId}`);
    }
    const candidate = candidateByRef.get(selection.candidateRef);
    if (!candidate || candidate.sourceNeedId !== need.id) {
      fail("SOURCE_CANDIDATE_REFERENCE_INVALID", `Candidate ${selection.candidateRef} was not admitted for ${need.id}`);
    }
    const input = sourceByKey.get(candidate.sourceKey);
    if (!input) fail("SOURCE_CANDIDATE_MISSING", `Selected source ${candidate.sourceKey} is unavailable`);
    const mappedInput: SourceInput = {
      ...input,
      mapping: {
        sourceKey: input.schema.sourceKey,
        chain: input.schema.chain,
        fields: selection.mapping,
      },
    };
    validateSourceMapping(mappedInput);
    for (const field of canonicalFields) {
      const path = selection.mapping[field];
      if (!Object.prototype.hasOwnProperty.call(candidate.fields, path)) {
        fail("SOURCE_FIELD_NOT_INSPECTED", `Mapping ${field} references uninspected field ${path}`);
      }
    }
    seenNeeds.add(need.id);
    bindings.push({need, candidate, input: mappedInput, mapping: selection.mapping});
  }
  return bindings.sort((left, right) => needs.indexOf(left.need) - needs.indexOf(right.need));
}

interface SelectionTree {
  [field: string]: SelectionTree;
}

function selectionTree(paths: readonly string[]): SelectionTree {
  const root: SelectionTree = {};
  for (const path of paths) {
    let current = root;
    for (const segment of path.split(".")) {
      current[segment] ??= {};
      current = current[segment]!;
    }
  }
  return root;
}

function renderSelections(tree: SelectionTree, indentation = 6): string {
  const spaces = " ".repeat(indentation);
  return Object.entries(tree).sort(([left], [right]) => left.localeCompare(right)).map(([field, nested]) => {
    if (Object.keys(nested).length === 0) return `${spaces}${field}`;
    return `${spaces}${field} {\n${renderSelections(nested, indentation + 2)}\n${spaces}}`;
  }).join("\n");
}

export function compileQueryPlans(bindings: readonly ValidatedSourceBinding[]): readonly QueryPlan[] {
  return bindings.map(({need, candidate, mapping}) => {
    if (mapping.tradeId.includes(".") || mapping.timestamp.includes(".")) {
      fail("QUERY_RECIPE_UNSUPPORTED", `Source ${candidate.sourceKey} requires top-level trade ID and timestamp fields for bounded pagination`);
    }
    const fields = [...new Set(Object.values(mapping))];
    const selections = renderSelections(selectionTree(fields));
    const document = [
      "query SprueSource($startInclusive: BigInt!, $endExclusive: BigInt!, $first: Int!, $cursor: ID!) {",
      `  ${candidate.queryEntity}(`,
      "    first: $first",
      `    orderBy: ${mapping.tradeId}`,
      "    orderDirection: asc",
      `    where: {${mapping.tradeId}_gt: $cursor, ${mapping.timestamp}_gte: $startInclusive, ${mapping.timestamp}_lt: $endExclusive}`,
      "  ) {",
      selections,
      "  }",
      "}",
    ].join("\n");
    return {
      sourceNeedId: need.id,
      sourceKey: candidate.sourceKey,
      document,
      documentHash: `sha256:${createHash("sha256").update(document).digest("hex")}`,
      variables: {
        startInclusive: {type: "BigInt!", binding: "run.window.startInclusive"},
        endExclusive: {type: "BigInt!", binding: "run.window.endExclusive"},
        first: {type: "Int!", value: 1000},
        cursor: {type: "ID!", initialValue: ""},
      },
      extractionPath: [candidate.queryEntity],
      rowSchema: Object.fromEntries(canonicalFields.map((field) => [field, candidate.fields[mapping[field]]!] as const)) as Record<CanonicalSwapField, string>,
      pagination: {kind: "id_cursor", pageSize: 1000, maxPages: 50},
    } satisfies QueryPlan;
  });
}

function validateAccessSelection(sourceKey: string, selections: readonly SourceAccessSelection[]): CanonicalSourceAccess {
  const matches = selections.filter((selection) => selection.sourceKey === sourceKey);
  if (matches.length !== 1) fail("SOURCE_ACCESS_REQUIRED", `Source ${sourceKey} requires exactly one creator-selected access mode`);
  const selection = matches[0]!;
  if (selection.mode === "customer_api_key" && !selection.providerCredentialId) {
    fail("SOURCE_CREDENTIAL_REQUIRED", `Source ${sourceKey} requires a provider credential reference`);
  }
  if (selection.mode === "x402" && !selection.spendingPolicyId) {
    fail("SOURCE_SPENDING_POLICY_REQUIRED", `Source ${sourceKey} requires a spending policy reference`);
  }
  const {sourceKey: _sourceKey, ...access} = selection;
  return access;
}

function canonicalSourceId(binding: ValidatedSourceBinding): string {
  return `source_${slug(binding.candidate.sourceKey)}`;
}

function validateCompositionShape(
  plan: SemanticPlan,
  intent: CompositionIntent,
  sourceRoleToNeed: ReadonlyMap<string, string>,
): void {
  const sourceRoles = new Set(sourceRoleToNeed.keys());
  const roles = new Set<string>();
  for (const node of intent.nodes) {
    if (roles.has(node.role) || sourceRoles.has(node.role)) fail("DUPLICATE_NODE_ROLE", `Duplicate role ${node.role}`);
    roles.add(node.role);
    validateCompositionNode(node);
  }
  if (intent.nodes.filter((node) => node.operator === "output").length !== 1) {
    fail("OUTPUT_CARDINALITY_INVALID", "Composition must contain exactly one Output operator");
  }
  const output = intent.nodes.find((node) => node.operator === "output")!;
  const sortNodes = intent.nodes.filter((node) => node.operator === "sort");
  if (sortNodes.length !== 1 || !intent.connections.some((edge) => edge.fromRole === sortNodes[0]!.role && edge.toRole === output.role && edge.inputRole === "rows")) {
    fail("OUTPUT_ORDER_INVALID", "The wallet ordering must be implemented by one Sort operator immediately before Output");
  }
  if (intent.nodes.some((node) => node.operator === "filter")) {
    fail("REDUNDANT_FILTER", "The compiled source query already enforces the requested time window");
  }
  const normalizers = intent.nodes.filter((node) => node.operator === "map" && typeof node.config.sourceNeedId === "string");
  if (normalizers.length !== sourceRoles.size) {
    fail("SOURCE_NORMALIZER_CARDINALITY", "Composition requires exactly one source normalizer per source need");
  }
  for (const [source, needId] of sourceRoleToNeed) {
    const matches = normalizers.filter((node) => node.config.sourceNeedId === needId);
    if (matches.length !== 1 || !intent.connections.some((edge) => edge.fromRole === source && edge.toRole === matches[0]!.role && edge.inputRole === "rows")) {
      fail("SOURCE_NORMALIZER_BINDING", `Source role ${source} must connect to its matching normalizer`);
    }
  }
  if (plan.combination.kind === "intersection") {
    if (intent.nodes.filter((node) => node.operator === "join").length !== 1 || intent.nodes.some((node) => node.operator === "union")) {
      fail("COMBINATION_OPERATOR_INVALID", "Intersection requires one Join and no Union");
    }
    if (intent.nodes.filter((node) => node.operator === "aggregate").length !== sourceRoles.size) {
      fail("AGGREGATE_CARDINALITY_INVALID", "Intersection requires one wallet Aggregate per source");
    }
    if (intent.nodes.filter((node) => node.operator === "map" && node.config.recipe === "cross_chain_wallet_summary_v1").length !== 1) {
      fail("COMPUTE_RECIPE_CARDINALITY", "Intersection requires one bounded combined-field recipe");
    }
  } else if (intent.nodes.filter((node) => node.operator === "union").length !== 1 || intent.nodes.some((node) => node.operator === "join")) {
    fail("COMBINATION_OPERATOR_INVALID", "Append requires one Union and no Join");
  } else if (intent.nodes.some((node) => node.operator === "aggregate" || node.config.recipe === "cross_chain_wallet_summary_v1")) {
    fail("APPEND_TRANSFORM_REDUNDANT", "Append must not add wallet aggregation or cross-chain summary computation");
  }
  for (const connection of intent.connections) {
    if ((!roles.has(connection.fromRole) && !sourceRoles.has(connection.fromRole)) || !roles.has(connection.toRole)) {
      fail("CONNECTION_ROLE_UNKNOWN", `Connection references an unknown role ${connection.fromRole} -> ${connection.toRole}`);
    }
  }
}

function validateDag(nodes: readonly CanonicalDagNode[], edges: readonly CanonicalDagEdge[]): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (nodeById.size !== nodes.length) fail("DUPLICATE_NODE_ID", "DAG node IDs must be unique");
  const incoming = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const outgoing = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    const from = nodeById.get(edge.fromNode);
    const to = nodeById.get(edge.toNode);
    if (!from || !to) fail("EDGE_NODE_UNKNOWN", "DAG edge references an unknown node");
    if (!registryEntry(from.type).outputPorts.includes(edge.fromPort)) {
      fail("OUTPUT_PORT_UNKNOWN", `Operator ${from.id} has no output port ${edge.fromPort}`);
    }
    if (!registryEntry(to.type).inputPorts.includes(edge.toPort)) {
      fail("INPUT_PORT_UNKNOWN", `Operator ${to.id} has no input port ${edge.toPort}`);
    }
    if (incoming.get(to.id)!.has(edge.toPort)) fail("INPUT_PORT_MULTIPLE", `Input ${to.id}.${edge.toPort} is connected more than once`);
    incoming.get(to.id)!.add(edge.toPort);
    outgoing.get(from.id)!.add(to.id);
  }
  for (const node of nodes) {
    const expectedInputs = registryEntry(node.type).inputPorts;
    if (expectedInputs.some((port) => !incoming.get(node.id)!.has(port))) {
      fail("INPUT_PORT_MISSING", `Operator ${node.id} is missing a required input`);
    }
  }
  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)!.size]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;
    for (const next of outgoing.get(current)!) {
      const degree = indegree.get(next)! - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) fail("DAG_CYCLE", "DAG must be acyclic");

  const output = nodes.find((node) => node.type === "output")!;
  const reverse = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) reverse.get(edge.toNode)!.add(edge.fromNode);
  const reachesOutput = new Set<string>([output.id]);
  const pending = [output.id];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const previous of reverse.get(current)!) {
      if (!reachesOutput.has(previous)) {
        reachesOutput.add(previous);
        pending.push(previous);
      }
    }
  }
  if (reachesOutput.size !== nodes.length) fail("DAG_DISCONNECTED", "Every DAG node must contribute to Output");
}

export function validateCompositionForSourceNeeds(
  plan: SemanticPlan,
  composition: CompositionIntent,
  sourceNeeds: readonly SourceNeed[],
  limits: {maxNodes: number; maxEdges: number} = {maxNodes: maximumDagNodes, maxEdges: maximumDagEdges},
): void {
  const sourceRoleToNeed = new Map(sourceNeeds.map((need) => [sourceRole(need.id), need.id]));
  validateCompositionShape(plan, composition, sourceRoleToNeed);

  const sourceNodes: CanonicalDagNode[] = sourceNeeds.map((need) => ({
    id: sourceRole(need.id),
    type: "source",
    operatorVersion: "1",
    config: {sourceNeedId: need.id},
  }));
  const roleToId = new Map<string, string>(sourceNodes.map((node) => [node.id, node.id]));
  const compiledNodes = composition.nodes.map((node) => {
    const id = slug(node.role);
    roleToId.set(node.role, id);
    return {id, type: node.operator, operatorVersion: "1", config: node.config} satisfies CanonicalDagNode;
  });
  const edges = composition.connections.map((connection) => ({
    fromNode: roleToId.get(connection.fromRole) ?? fail("CONNECTION_ROLE_UNKNOWN", `Unknown role ${connection.fromRole}`),
    fromPort: "rows",
    toNode: roleToId.get(connection.toRole) ?? fail("CONNECTION_ROLE_UNKNOWN", `Unknown role ${connection.toRole}`),
    toPort: connection.inputRole,
  }));
  const nodes = [...sourceNodes, ...compiledNodes];
  if (nodes.length > limits.maxNodes || edges.length > limits.maxEdges) {
    fail("DAG_LIMIT_EXCEEDED", "DAG exceeds the configured node or edge limit");
  }
  validateDag(nodes, edges);
}

export function assembleSpecification(
  plan: SemanticPlan,
  bindings: readonly ValidatedSourceBinding[],
  queryPlans: readonly QueryPlan[],
  composition: CompositionIntent,
  accessSelections: readonly SourceAccessSelection[],
): {specification: CanonicalDataProductSpec; builder: BuilderProjection} {
  const sourceRoleToBinding = new Map(bindings.map((binding) => [sourceRole(binding.need.id), binding]));
  validateCompositionShape(
    plan,
    composition,
    new Map([...sourceRoleToBinding].map(([role, binding]) => [role, binding.need.id])),
  );

  const selectedSourceKeys = new Set(bindings.map((binding) => binding.candidate.sourceKey));
  if (
    accessSelections.length !== selectedSourceKeys.size ||
    new Set(accessSelections.map((selection) => selection.sourceKey)).size !== accessSelections.length ||
    accessSelections.some((selection) => !selectedSourceKeys.has(selection.sourceKey))
  ) {
    fail("SOURCE_ACCESS_SCOPE_INVALID", "Access selections must match the selected sources exactly");
  }

  const canonicalSources = bindings.map((binding) => {
    if (!binding.input.schema.sourceSnapshotId) {
      fail("SOURCE_SNAPSHOT_REQUIRED", `Source ${binding.candidate.sourceKey} has no authorized snapshot ID`);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(binding.input.schema.sourceSnapshotId)) {
      fail("SOURCE_SNAPSHOT_INVALID", `Source ${binding.candidate.sourceKey} has an invalid snapshot ID`);
    }
    return {
      id: canonicalSourceId(binding),
      sourceSnapshotId: binding.input.schema.sourceSnapshotId,
      provider: "the_graph",
      kind: "subgraph",
      adapterVersion: "1",
      dataNetwork: binding.candidate.dataNetwork,
      target: {
        type: "deployment_id",
        id: binding.candidate.deploymentId,
        logicalSubgraphId: binding.candidate.subgraphId,
        manifestIpfsCid: null,
      },
      schemaHash: binding.candidate.schemaHash,
      access: validateAccessSelection(binding.candidate.sourceKey, accessSelections),
      consistency: {mode: "pinned_block", indexingErrorPolicy: "deny"},
      mapping: binding.mapping,
    } as const;
  });
  const sourceNodes: CanonicalDagNode[] = bindings.map((binding) => {
    const queryPlan = queryPlans.find((candidate) => candidate.sourceNeedId === binding.need.id)!;
    return {
      id: sourceRole(binding.need.id),
      type: "source",
      operatorVersion: "1",
      config: {sourceId: canonicalSourceId(binding), queryPlan},
    };
  });
  const roleToId = new Map<string, string>(sourceNodes.map((node) => [node.id, node.id]));
  const compiledNodes = composition.nodes.map((node) => {
    const id = slug(node.role);
    roleToId.set(node.role, id);
    let config = node.config;
    if (node.operator === "map" && typeof node.config.sourceNeedId === "string") {
      const binding = bindings.find((candidate) => candidate.need.id === node.config.sourceNeedId);
      if (!binding) fail("MAP_SOURCE_NEED_UNKNOWN", `Map ${node.role} references an unknown source need`);
      config = {
        kind: "normalize_swap",
        sourceId: canonicalSourceId(binding),
        mapping: binding.mapping,
      };
    }
    return {id, type: node.operator, operatorVersion: "1", config} satisfies CanonicalDagNode;
  });
  const edges = composition.connections.map((connection) => ({
    fromNode: roleToId.get(connection.fromRole) ?? fail("CONNECTION_ROLE_UNKNOWN", `Unknown role ${connection.fromRole}`),
    fromPort: "rows",
    toNode: roleToId.get(connection.toRole) ?? fail("CONNECTION_ROLE_UNKNOWN", `Unknown role ${connection.toRole}`),
    toPort: connection.inputRole,
  }));
  const nodes = [...sourceNodes, ...compiledNodes];
  if (nodes.length > maximumDagNodes || edges.length > maximumDagEdges) fail("DAG_LIMIT_EXCEEDED", "DAG exceeds the first-runtime node or edge limit");
  validateDag(nodes, edges);

  const specification: CanonicalDataProductSpec = {
    schemaVersion: 2,
    runtimeVersion: "1",
    intent: {summary: plan.summary},
    sources: canonicalSources,
    dag: {nodes, edges},
    outputSchema: plan.combination.kind === "intersection" ? {
      fields: [
        {name: "wallet", type: "address"},
        {name: "chains", type: "array<string>"},
        {name: "byChain", type: "object<string,wallet_chain_summary>"},
        {name: "combinedTradeCount", type: "count"},
        {name: "combinedVolumeUsd", type: "decimal"},
        {name: "firstSeenAt", type: "timestamp"},
        {name: "lastSeenAt", type: "timestamp"},
      ],
    } : {
      fields: [
        {name: "sourceKey", type: "string"},
        {name: "chain", type: "string"},
        {name: "tradeId", type: "string"},
        {name: "wallet", type: "address"},
        {name: "pool", type: "address"},
        {name: "timestamp", type: "timestamp"},
        {name: "amountInUsd", type: "decimal|null"},
        {name: "amountOutUsd", type: "decimal|null"},
        {name: "tokenIn", type: "address|null"},
        {name: "tokenOut", type: "address|null"},
      ],
    },
    refreshPolicy: {
      mode: plan.refresh.mode,
      cronExpression: plan.refresh.mode === "scheduled" ? "0 * * * *" : null,
      timezone: "UTC",
    },
    resourcePolicy: {
      maxNodes: maximumDagNodes,
      maxSourceRows: 50_000,
      maxSourceRequests: 100,
      maxOutputRows: 5_000,
      maxOutputBytes: 5_242_880,
      maxStoredBytes: 20_971_520,
      maxRuntimeMs: 120_000,
    },
  };
  const builder: BuilderProjection = {
    schemaVersion: 2,
    runtimeVersion: "1",
    nodes,
    edges: edges.map((edge) => ({...edge, id: `${edge.fromNode}:${edge.fromPort}->${edge.toNode}:${edge.toPort}`})),
    operatorRegistry,
  };
  return {specification, builder};
}
