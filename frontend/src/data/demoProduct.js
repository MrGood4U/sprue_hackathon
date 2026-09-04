export const productSlug = "base-dex-stickiness";

export const product = {
  name: "Base DEX Stickiness",
  intentKey: "product.intent",
  endpoint: "https://api.sprue.dev/v1/base-dex-stickiness",
};

export const dagNodes = [
  {
    icon: "database",
    title: "Graph Source",
    titleKey: "dag.graphSource",
    type: "SOURCE",
    typeKey: "dag.type.source",
    accent: "cyan",
    detail: ["The Graph", { key: "dag.graphSource.event" }, "base-dex@v1.4.2"],
  },
  {
    icon: "funnel",
    title: "Filter Repeat Wallets",
    titleKey: "dag.filterWallets",
    type: "TRANSFORM",
    typeKey: "dag.type.transform",
    accent: "cyan",
    detail: [{ key: "dag.filterWallets.logic" }, { key: "dag.filterWallets.rule" }, "COUNT(DISTINCT tx)"],
  },
  {
    icon: "calendar",
    title: "30d Window",
    titleKey: "dag.window",
    type: "TRANSFORM",
    typeKey: "dag.type.transform",
    accent: "cyan",
    detail: [{ key: "dag.window.range" }, { key: "dag.window.utc" }, { key: "dag.window.bound" }],
  },
  {
    icon: "user",
    title: "Group by Protocol",
    titleKey: "dag.group",
    type: "TRANSFORM",
    typeKey: "dag.type.transform",
    accent: "cyan",
    detail: [{ key: "dag.group.key" }, { key: "dag.group.estimate" }, { key: "dag.group.order" }],
  },
  {
    icon: "chart",
    title: "Aggregate Stickiness",
    titleKey: "dag.aggregate",
    type: "TRANSFORM",
    typeKey: "dag.type.transform",
    accent: "cyan",
    detail: ["stickiness_score", "unique_wallets", "total_wallets"],
  },
  {
    icon: "code",
    title: "API Output",
    titleKey: "dag.output",
    type: "MATERIALIZE",
    typeKey: "dag.type.materialize",
    accent: "violet",
    detail: ["API (x402)", "JSON", { key: "dag.output.cache" }],
  },
];
