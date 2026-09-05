export const nodeLabels = {
  activity: "dag.graphSource",
  normalize_day: "dag.normalizeDay",
  wallet_activity: "dag.walletActivity",
  classify_repeat_wallet: "dag.classifyRepeat",
  protocol_activity: "dag.protocolActivity",
  compute_ratio: "dag.computeRatio",
  result: "dag.output",
};

const typeLabels = {
  source: "dag.graphSource",
  filter: "dag.filter",
  map: "dag.map",
  aggregate: "dag.aggregate",
  union: "dag.union",
  join: "dag.join",
  output: "dag.output",
  template: "dag.template",
};

export function getNodeLabelKey(node) {
  return node?.labelKey ?? nodeLabels[node?.id] ?? typeLabels[node?.type] ?? "dag.node";
}
