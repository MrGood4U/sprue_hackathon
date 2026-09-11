export const operatorCatalog = [
  { type: "source", labelKey: "workflowEditor.operator.source", descriptionKey: "workflowEditor.operator.sourceDetail" },
  { type: "filter", labelKey: "workflowEditor.operator.filter", descriptionKey: "workflowEditor.operator.filterDetail" },
  { type: "map", labelKey: "workflowEditor.operator.map", descriptionKey: "workflowEditor.operator.mapDetail" },
  { type: "aggregate", labelKey: "workflowEditor.operator.aggregate", descriptionKey: "workflowEditor.operator.aggregateDetail" },
  { type: "sort", labelKey: "workflowEditor.operator.sort", descriptionKey: "workflowEditor.operator.sortDetail" },
  { type: "union", labelKey: "workflowEditor.operator.union", descriptionKey: "workflowEditor.operator.unionDetail" },
  { type: "join", labelKey: "workflowEditor.operator.join", descriptionKey: "workflowEditor.operator.joinDetail" },
  { type: "output", labelKey: "workflowEditor.operator.output", descriptionKey: "workflowEditor.operator.outputDetail" },
];

export const templateCatalog = [
  {
    id: "filter-and-aggregate",
    labelKey: "workflowEditor.template.filterAggregate",
    descriptionKey: "workflowEditor.template.filterAggregateDetail",
    nodes: [
      { localId: "filter", type: "filter", config: { predicate: {combinator: "and", conditions: []} } },
      { localId: "aggregate", type: "aggregate", config: { groupBy: [], measures: [] } },
    ],
    edges: [{ fromNode: "filter", fromPort: "rows", toNode: "aggregate", toPort: "rows" }],
  },
  {
    id: "cross-chain-union",
    labelKey: "workflowEditor.template.crossChainUnion",
    descriptionKey: "workflowEditor.template.crossChainUnionDetail",
    nodes: [
      { localId: "source-left", type: "source", config: { sourceId: "", limit: 1_000 } },
      { localId: "map-left", type: "map", config: { mode: "project", fields: [] } },
      { localId: "source-right", type: "source", config: { sourceId: "", limit: 1_000 } },
      { localId: "map-right", type: "map", config: { mode: "project", fields: [] } },
      { localId: "union", type: "union", config: { mode: "append_compatible_rows", sourceDiscriminator: null } },
    ],
    edges: [
      { fromNode: "source-left", fromPort: "rows", toNode: "map-left", toPort: "rows" },
      { fromNode: "source-right", fromPort: "rows", toNode: "map-right", toPort: "rows" },
      { fromNode: "map-left", fromPort: "rows", toNode: "union", toPort: "left" },
      { fromNode: "map-right", fromPort: "rows", toNode: "union", toPort: "right" },
    ],
  },
];

export function getOperator(type) {
  return operatorCatalog.find((item) => item.type === type) ?? operatorCatalog[1];
}

export function getTemplate(id) {
  return templateCatalog.find((item) => item.id === id);
}

export function defaultNodeConfig(type) {
  switch (type) {
    case "source": return { sourceId: "", limit: 1_000 };
    case "filter": return { predicate: {combinator: "and", conditions: []} };
    case "map": return { mode: "extend", fields: [] };
    case "aggregate": return { groupBy: [], measures: [] };
    case "sort": return { orderBy: [], limit: null };
    case "union": return { mode: "append_compatible_rows", sourceDiscriminator: null };
    case "join": return { keys: [], type: "inner", cardinality: "one_to_one", rightPrefix: "right_" };
    case "output": return { fields: [] };
    default: return {};
  }
}
