export const operatorCatalog = [
  { type: "source", labelKey: "workflowEditor.operator.source", descriptionKey: "workflowEditor.operator.sourceDetail" },
  { type: "filter", labelKey: "workflowEditor.operator.filter", descriptionKey: "workflowEditor.operator.filterDetail" },
  { type: "map", labelKey: "workflowEditor.operator.map", descriptionKey: "workflowEditor.operator.mapDetail" },
  { type: "aggregate", labelKey: "workflowEditor.operator.aggregate", descriptionKey: "workflowEditor.operator.aggregateDetail" },
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
      { localId: "filter", type: "filter", config: { predicate: null } },
      { localId: "aggregate", type: "aggregate", config: { groupBy: [], measures: [] } },
    ],
    edges: [{ fromNode: "filter", fromPort: "rows", toNode: "aggregate", toPort: "rows" }],
  },
  {
    id: "cross-chain-union",
    labelKey: "workflowEditor.template.crossChainUnion",
    descriptionKey: "workflowEditor.template.crossChainUnionDetail",
    nodes: [
      { localId: "source-left", type: "source", config: { sourceKey: "" } },
      { localId: "map-left", type: "map", config: { mapping: {} } },
      { localId: "source-right", type: "source", config: { sourceKey: "" } },
      { localId: "map-right", type: "map", config: { mapping: {} } },
      { localId: "union", type: "union", config: { schema: "canonical_rows" } },
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
    case "source": return { sourceKey: "" };
    case "filter": return { predicate: null };
    case "map": return { mapping: {} };
    case "aggregate": return { groupBy: [], measures: [] };
    case "union": return { schema: "canonical_rows" };
    case "join": return { keys: ["wallet"], type: "inner", cardinality: "one_to_one" };
    case "output": return { orderBy: [] };
    default: return {};
  }
}
