export const productSlug = "base-dex-stickiness";

export const product = {
  name: "Base DEX Stickiness",
  intent: "Measure DEX stickiness on Base over 30 days. Exclude one-time wallets and group by protocol.",
  endpoint: "https://api.sprue.dev/v1/base-dex-stickiness",
};

export const dagNodes = [
  {
    icon: "database",
    title: "Graph Source",
    type: "SOURCE",
    accent: "cyan",
    detail: ["The Graph", "Base DEX Events", "base-dex@v1.4.2"],
  },
  {
    icon: "funnel",
    title: "Filter Repeat Wallets",
    type: "TRANSFORM",
    accent: "cyan",
    detail: ["Logic", "wallet interactions > 1", "COUNT(DISTINCT tx)"],
  },
  {
    icon: "calendar",
    title: "30d Window",
    type: "TRANSFORM",
    accent: "cyan",
    detail: ["Last 30 days", "UTC anchored", "Inclusive bound"],
  },
  {
    icon: "user",
    title: "Group by Protocol",
    type: "TRANSFORM",
    accent: "cyan",
    detail: ["Key: protocol", "Estimated < 200", "Stable ordering"],
  },
  {
    icon: "chart",
    title: "Aggregate Stickiness",
    type: "TRANSFORM",
    accent: "cyan",
    detail: ["stickiness_score", "unique_wallets", "total_wallets"],
  },
  {
    icon: "code",
    title: "API Output",
    type: "MATERIALIZE",
    accent: "violet",
    detail: ["API (x402)", "JSON", "5 min cache"],
  },
];
