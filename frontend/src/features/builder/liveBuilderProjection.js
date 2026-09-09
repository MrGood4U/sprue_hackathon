import {projectGraph} from "./graphView.js";

function emptyOutputSchema(fields = []) {
  return {type: "array", items: {type: "object"}, fields: structuredClone(fields)};
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
        fieldBindings: structuredClone(source.fieldBindings),
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
        nodes: structuredClone(builder.nodes),
        edges: structuredClone(builder.edges),
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
  return `sprue.builder-draft.v1:${workspaceId}:${productId}`;
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
    return value.draft;
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

function isEditorDraft(value) {
  return typeof value?.origin?.originKey === "string"
    && Array.isArray(value?.specification?.sources)
    && Array.isArray(value?.specification?.dag?.nodes)
    && Array.isArray(value?.specification?.dag?.edges)
    && Array.isArray(value?.specification?.outputSchema?.fields);
}
