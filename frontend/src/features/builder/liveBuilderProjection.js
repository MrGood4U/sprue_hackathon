import {projectGraph} from "./graphView.js";
import {migrateLegacyBuilderDraft} from "./legacyBuilderMigration.js";

function emptyOutputSchema(fields = []) {
  return {type: "array", items: {type: "object"}, fields: structuredClone(fields)};
}

const scalarTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date"]);
const integerPattern = /^-?(?:0|[1-9]\d*)$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)\.\d+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeLegacyQueryPlan(queryPlan) {
  if (!queryPlan) return null;
  const normalized = structuredClone(queryPlan);
  if (normalized.pagination?.pageSize === 500) normalized.pagination.pageSize = 1_000;
  return normalized;
}

function normalizeScalarType(value) {
  if (value === "count") return "integer";
  return scalarTypes.has(value) ? value : null;
}

function literalType(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value !== "string") return null;
  if (datePattern.test(value)) return "date";
  if (decimalPattern.test(value)) return "decimal";
  if (integerPattern.test(value)) return "integer";
  return "string";
}

function addLegacyField(fields, candidate) {
  const name = candidate?.name;
  if (typeof name !== "string" || !name) return;
  const type = normalizeScalarType(candidate.type);
  const existing = fields.get(name);
  if (!existing) {
    fields.set(name, {
      name,
      type,
      nullable: Boolean(candidate.nullable),
      unit: candidate.unit ?? null,
    });
    return;
  }
  if (!existing.type && type) existing.type = type;
  if (candidate.nullable === true) existing.nullable = true;
  if (existing.unit === null && candidate.unit != null) existing.unit = candidate.unit;
}

function constrainLegacyField(fields, name, type) {
  const normalized = normalizeScalarType(type);
  const field = fields.get(name);
  if (!field || !normalized) return;
  if (!field.type) field.type = normalized;
}

function knownExpressionType(expression, fields) {
  if (!expression || typeof expression !== "object") return null;
  if (expression.op === "field") return fields.get(expression.field)?.type ?? null;
  if (expression.op === "literal") return normalizeScalarType(expression.valueType) ?? literalType(expression.value);
  if (expression.op === "utc_date") return "date";
  if (["to_timestamp", "epoch_seconds_to_timestamp", "epoch_milliseconds_to_timestamp"].includes(expression.op)) return "timestamp";
  if (["to_integer", "round", "floor", "ceil"].includes(expression.op)) return "integer";
  if (expression.op === "to_decimal") return "decimal";
  if (["trim", "lower", "upper", "concat"].includes(expression.op)) return "string";
  if (expression.op === "abs" || expression.op === "coalesce") return knownExpressionType(expression.inputs?.[0], fields);
  if (["eq", "ne", "lt", "lte", "gt", "gte", "and", "or", "not"].includes(expression.op)) return "boolean";
  if (["add", "subtract", "multiply", "safe_divide"].includes(expression.op)) return "decimal";
  return null;
}

function collectExpressionConstraints(expression, fields, expectedType = null) {
  if (!expression || typeof expression !== "object") return null;
  const inputs = Array.isArray(expression.inputs) ? expression.inputs : [];
  if (expression.op === "field") {
    constrainLegacyField(fields, expression.field, expectedType);
    return fields.get(expression.field)?.type ?? normalizeScalarType(expectedType);
  }
  if (expression.op === "literal") return normalizeScalarType(expression.valueType) ?? literalType(expression.value);
  if (expression.op === "utc_date") {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "timestamp"));
    return "date";
  }
  if (expression.op === "to_integer") {
    inputs.forEach((input) => collectExpressionConstraints(input, fields));
    return "integer";
  }
  if (expression.op === "to_decimal") {
    inputs.forEach((input) => collectExpressionConstraints(input, fields));
    return "decimal";
  }
  if (expression.op === "to_timestamp") {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "string"));
    return "timestamp";
  }
  if (["epoch_seconds_to_timestamp", "epoch_milliseconds_to_timestamp"].includes(expression.op)) {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "integer"));
    return "timestamp";
  }
  if (["trim", "lower", "upper", "concat"].includes(expression.op)) {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "string"));
    return "string";
  }
  if (["abs", "round", "floor", "ceil"].includes(expression.op)) {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "decimal"));
    return expression.op === "abs" ? knownExpressionType(inputs[0], fields) ?? "decimal" : "integer";
  }
  if (expression.op === "coalesce") {
    const resultType = inputs.map((input) => knownExpressionType(input, fields)).find(Boolean) ?? expectedType;
    inputs.forEach((input) => collectExpressionConstraints(input, fields, resultType));
    return normalizeScalarType(resultType);
  }
  if (["add", "subtract", "multiply", "safe_divide"].includes(expression.op)) {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "decimal"));
    return "decimal";
  }
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(expression.op)) {
    const left = inputs[0];
    const right = inputs[1];
    const leftType = knownExpressionType(left, fields);
    const rightType = knownExpressionType(right, fields);
    collectExpressionConstraints(left, fields, rightType);
    collectExpressionConstraints(right, fields, leftType);
    return "boolean";
  }
  if (["and", "or", "not"].includes(expression.op)) {
    inputs.forEach((input) => collectExpressionConstraints(input, fields, "boolean"));
    return "boolean";
  }
  if (expression.op === "if") {
    collectExpressionConstraints(inputs[0], fields, "boolean");
    const branchType = knownExpressionType(inputs[1], fields) ?? knownExpressionType(inputs[2], fields) ?? expectedType;
    collectExpressionConstraints(inputs[1], fields, branchType);
    collectExpressionConstraints(inputs[2], fields, branchType);
    return normalizeScalarType(branchType);
  }
  inputs.forEach((input) => collectExpressionConstraints(input, fields, expectedType));
  return knownExpressionType(expression, fields);
}

function collectPredicateConstraints(predicate, fields) {
  for (const condition of predicate?.conditions ?? []) {
    if (!condition || typeof condition !== "object") continue;
    const values = "value" in condition ? [condition.value] : condition.values ?? [];
    const inferred = values.map(literalType).find(Boolean) ?? null;
    constrainLegacyField(fields, condition.field, inferred);
  }
}

function inferLegacySourceFields(builder, source) {
  const sourceNode = builder.nodes.find((node) => node.type === "source" && (node.config?.sourceId ?? node.config?.sourceKey) === source.id);
  const fields = new Map();
  for (const field of [...(source.outputSchema?.fields ?? []), ...(sourceNode?.outputSchema?.fields ?? [])]) addLegacyField(fields, field);
  for (const binding of source.fieldBindings ?? sourceNode?.config?.fieldBindings ?? []) {
    addLegacyField(fields, {name: binding.requirementId, type: null, nullable: false, unit: null});
  }
  for (const binding of source.auxiliaryFieldBindings ?? sourceNode?.config?.auxiliaryFieldBindings ?? []) {
    addLegacyField(fields, {name: binding.name, type: null, nullable: false, unit: null});
  }
  addLegacyField(fields, {name: "data_network", type: "string", nullable: false, unit: null});
  if (!sourceNode) return [...fields.values()].map((field) => ({...field, type: field.type ?? "string"}));

  const nodeById = new Map(builder.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of builder.edges) {
    const targets = outgoing.get(edge.fromNode) ?? [];
    targets.push(edge.toNode);
    outgoing.set(edge.fromNode, targets);
  }
  const queue = [sourceNode.id];
  const visited = new Set();
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    for (const targetId of outgoing.get(currentId) ?? []) {
      const node = nodeById.get(targetId);
      if (!node) continue;
      if (node.type === "filter") {
        if (node.config?.predicate) collectPredicateConstraints(node.config.predicate, fields);
        if (node.config?.expression) collectExpressionConstraints(node.config.expression, fields);
        queue.push(node.id);
      } else if (node.type === "sort" || node.type === "union") {
        queue.push(node.id);
      } else if (node.type === "map") {
        for (const definition of node.config?.fields ?? []) collectExpressionConstraints(definition.expression, fields);
        if (node.config?.mode === "extend") queue.push(node.id);
      } else if (node.type === "aggregate") {
        for (const measure of node.config?.measures ?? []) {
          if (["sum", "average"].includes(measure.op)) constrainLegacyField(fields, measure.field, "decimal");
        }
      }
    }
  }
  const bindings = [
    ...(source.fieldBindings ?? sourceNode?.config?.fieldBindings ?? []).map((binding) => ({
      semanticName: binding.requirementId,
      fieldPath: binding.fieldPath,
    })),
    ...(source.auxiliaryFieldBindings ?? sourceNode?.config?.auxiliaryFieldBindings ?? []).map((binding) => ({
      semanticName: binding.name,
      fieldPath: binding.fieldPath,
    })),
  ].filter((binding) => typeof binding.semanticName === "string" && typeof binding.fieldPath === "string");
  const semanticNames = new Set(bindings.map((binding) => binding.semanticName));
  const providerFields = new Map();
  for (const binding of bindings) {
    const inferred = fields.get(binding.fieldPath) ?? fields.get(binding.semanticName);
    addLegacyField(providerFields, {
      ...(inferred ?? {type: null, nullable: false}),
      name: binding.fieldPath,
      unit: null,
    });
  }
  for (const field of fields.values()) {
    if (!semanticNames.has(field.name)) addLegacyField(providerFields, field);
  }
  addLegacyField(providerFields, {name: "data_network", type: "string", nullable: false, unit: null});
  return [...providerFields.values()].map((field) => ({...field, type: field.type ?? "string"}));
}

function manualDraft(product, intent, originKey, resultKind) {
  return {
    origin: {kind: "manual", originKey, resultKind},
    parameters: {},
    specification: {
      schemaVersion: 2,
      runtimeVersion: "planning",
      intent: {summary: intent},
      sources: [],
      dag: {nodes: [], edges: []},
      outputSchema: emptyOutputSchema(),
      refreshPolicy: {mode: "manual", timezone: "UTC"},
      resourcePolicy: {},
    },
    groups: [],
    referenceResult: [],
  };
}

export function isBuilderDraft(value) {
  return value?.schemaVersion === 1
    && value.status === "requires_source_admission"
    && Array.isArray(value.sources)
    && Array.isArray(value.nodes)
    && Array.isArray(value.edges)
    && Array.isArray(value.outputSchema?.fields);
}

export function projectAgentBuilderDraft(product, messages) {
  const userMessage = [...messages].reverse().find((message) => message.role === "user") ?? null;
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const content = assistantMessage?.contentJson;
  const intent = userMessage?.contentText?.trim() || product.originalIntent?.trim() || "";
  const originKey = assistantMessage?.id ?? `${product.id}:manual:${intent}`;
  const resultKind = content?.kind ?? (assistantMessage ? "unknown" : "none");
  if (content?.kind !== "proposal" || !isBuilderDraft(content.builderDraft)) {
    return manualDraft(product, intent, originKey, resultKind);
  }

  const builder = content.builderDraft;
  const sourceFieldsById = new Map(builder.sources.map((source) => [source.id, inferLegacySourceFields(builder, source)]));
  const sourceById = new Map(builder.sources.map((source) => [source.id, source]));
  const projectedNodes = builder.nodes.map((node) => {
    const sourceId = node.config?.sourceId ?? node.config?.sourceKey;
    const sourceFields = node.type === "source" ? sourceFieldsById.get(sourceId) : null;
    const source = sourceById.get(sourceId);
    return structuredClone(sourceFields ? {
      ...node,
      config: {
        ...node.config,
        limit: node.config?.limit ?? 1_000,
        ...(node.config?.queryPlan ? {queryPlan: normalizeLegacyQueryPlan(node.config.queryPlan)} : {}),
        fieldBindings: source?.fieldBindings ?? node.config?.fieldBindings ?? [],
        auxiliaryFieldBindings: source?.auxiliaryFieldBindings ?? node.config?.auxiliaryFieldBindings ?? [],
      },
      outputSchema: {fields: sourceFields},
    } : node);
  });
  const migratedGraph = migrateLegacyBuilderDraft(projectedNodes, builder.edges, builder.outputSchema.fields);
  const draft = {
    origin: {kind: "agent", originKey, resultKind},
    parameters: {},
    specification: {
      schemaVersion: 2,
      runtimeVersion: "planning",
      intent: {summary: intent || content.intentSummary || ""},
      sources: builder.sources.map((source) => ({
        id: source.id,
        provider: "the_graph",
        kind: "subgraph",
        adapterVersion: "planning",
        dataNetwork: source.dataNetwork,
        queryEntity: source.queryEntity,
        queryPlan: normalizeLegacyQueryPlan(source.queryPlan),
        fieldBindings: structuredClone(source.fieldBindings),
        auxiliaryFieldBindings: structuredClone(source.auxiliaryFieldBindings ?? []),
        outputSchema: emptyOutputSchema(sourceFieldsById.get(source.id)),
        evidenceStatus: source.evidenceStatus,
        displayName: source.displayName,
        target: {
          type: "manifest_ipfs_cid",
          id: source.manifestIpfsCid,
          logicalSubgraphId: source.logicalSubgraphId,
          manifestIpfsCid: source.manifestIpfsCid,
        },
      })),
      dag: {
        nodes: migratedGraph.nodes,
        edges: migratedGraph.edges,
      },
      outputSchema: emptyOutputSchema(builder.outputSchema.fields),
      refreshPolicy: structuredClone(builder.refreshPolicy),
      resourcePolicy: {},
    },
    groups: [],
    referenceResult: [],
  };
  try {
    projectGraph(draft.specification.dag);
    return draft;
  } catch {
    return manualDraft(product, intent, originKey, "invalid_proposal");
  }
}

export function builderDraftCacheKey(workspaceId, productId) {
  return `sprue.builder-draft.v10:${workspaceId}:${productId}`;
}

export function browserSessionStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readCachedBuilderDraft(storage, workspaceId, productId, originKey) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(builderDraftCacheKey(workspaceId, productId)) ?? "null");
    if (value?.schemaVersion !== 1 || value.originKey !== originKey || !isEditorDraft(value.draft)) return null;
    return {
      ...value.draft,
      specification: {
        ...value.draft.specification,
        sources: value.draft.specification.sources.map((source) => ({
          ...source,
          queryPlan: normalizeLegacyQueryPlan(source.queryPlan),
        })),
        dag: {
          ...value.draft.specification.dag,
          nodes: value.draft.specification.dag.nodes.map((node) => node.type === "source"
            ? {
              ...node,
              config: {
                ...(node.config ?? {}),
                limit: node.config?.limit ?? 1_000,
                ...(node.config?.queryPlan ? {queryPlan: normalizeLegacyQueryPlan(node.config.queryPlan)} : {}),
              },
            }
            : node),
        },
      },
    };
  } catch {
    return null;
  }
}

export function cacheBuilderDraft(storage, workspaceId, productId, draft) {
  if (!storage || !isEditorDraft(draft)) return;
  try {
    storage.setItem(builderDraftCacheKey(workspaceId, productId), JSON.stringify({
      schemaVersion: 1,
      originKey: draft.origin.originKey,
      draft,
    }));
  } catch {
    // Storage availability must not make the live Builder unreadable.
  }
}

export function clearCachedBuilderDraft(storage, workspaceId, productId) {
  if (!storage) return;
  try {
    storage.removeItem(builderDraftCacheKey(workspaceId, productId));
  } catch {
    // Storage availability must not block an explicit navigation decision.
  }
}

export function builderDraftLayout(nodes) {
  return {
    schemaVersion: 1,
    nodes: (nodes ?? []).map((node) => ({
      id: node.id,
      x: Number(node.position?.x ?? 0),
      y: Number(node.position?.y ?? 0),
    })),
  };
}

export function applyBuilderDraftLayout(draft, layout) {
  const positions = new Map((layout?.nodes ?? []).map((node) => [node.id, node]));
  return {
    ...draft,
    specification: {
      ...draft.specification,
      dag: {
        ...draft.specification.dag,
        nodes: draft.specification.dag.nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? {...node, x: position.x, y: position.y} : node;
        }),
      },
    },
  };
}

export function draftWithBuilderLayout(draft, nodes) {
  return applyBuilderDraftLayout(draft, builderDraftLayout(nodes));
}

export function restoreDurableBuilderDraft(projectedDraft, savedPayload) {
  if (
    savedPayload?.schemaVersion !== 1 ||
    savedPayload.originKey !== projectedDraft?.origin?.originKey ||
    savedPayload?.structuredDag?.schemaVersion !== 1
  ) return null;
  const saved = savedPayload.structuredDag;
  const projectedSources = new Map((projectedDraft.specification.sources ?? []).map((source) => [source.id, source]));
  const sourceNodes = new Map((saved.dag?.nodes ?? [])
    .filter((node) => node.type === "source")
    .map((node) => [node.config?.sourceId ?? node.config?.sourceKey, node]));
  const sources = (saved.sources ?? []).map((source) => {
    const projected = projectedSources.get(source.id);
    const sourceNode = sourceNodes.get(source.id);
    return {
      ...(projected ?? {}),
      id: source.id,
      provider: "the_graph",
      kind: "subgraph",
      adapterVersion: projected?.adapterVersion ?? "planning",
      displayName: source.displayName,
      logicalSubgraphId: source.logicalSubgraphId,
      manifestIpfsCid: source.manifestIpfsCid,
      dataNetwork: source.dataNetwork,
      queryEntity: source.queryEntity,
      queryPlan: structuredClone(source.queryPlan ?? null),
      fieldBindings: structuredClone(source.fieldBindings ?? []),
      auxiliaryFieldBindings: structuredClone(source.auxiliaryFieldBindings ?? []),
      outputSchema: structuredClone(sourceNode?.outputSchema ?? projected?.outputSchema ?? emptyOutputSchema()),
      target: {
        type: "manifest_ipfs_cid",
        id: source.manifestIpfsCid,
        logicalSubgraphId: source.logicalSubgraphId,
        manifestIpfsCid: source.manifestIpfsCid,
      },
    };
  });
  return applyBuilderDraftLayout({
    ...projectedDraft,
    specification: {
      ...projectedDraft.specification,
      sources,
      dag: structuredClone(saved.dag),
      outputSchema: {
        ...projectedDraft.specification.outputSchema,
        fields: structuredClone(saved.outputSchema.fields),
      },
    },
  }, savedPayload.layout);
}

function isEditorDraft(value) {
  return typeof value?.origin?.originKey === "string"
    && Array.isArray(value?.specification?.sources)
    && Array.isArray(value?.specification?.dag?.nodes)
    && Array.isArray(value?.specification?.dag?.edges)
    && Array.isArray(value?.specification?.outputSchema?.fields);
}
