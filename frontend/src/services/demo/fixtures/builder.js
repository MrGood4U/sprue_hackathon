// Synthetic compiler illustration only; not the backend registry or a live source.
const field = (name) => ({ op: "field", path: [name] });
const literal = (value) => ({ op: "literal", type: "integer", value: String(value) });
const node = (id, type, config) => ({ id, type, operatorVersion: "1", config });

export const nodeLabels = {
  activity: "dag.graphSource", normalize_day: "dag.normalizeDay", wallet_activity: "dag.walletActivity",
  classify_repeat_wallet: "dag.classifyRepeat", protocol_activity: "dag.protocolActivity",
  compute_ratio: "dag.computeRatio", result: "dag.output",
};
export const defaultParameters = Object.freeze({ windowDays: 30, minimumActiveDays: 2 });
export const outputSchema = {
  type: "array", items: {
    type: "object", required: ["protocol", "activeWallets", "repeatWallets", "repeatShare"], additionalProperties: false,
    properties: {
      protocol: { type: "string" },
      activeWallets: { type: "string", pattern: "^[0-9]+$" },
      repeatWallets: { type: "string", pattern: "^[0-9]+$" },
      repeatShare: { type: ["string", "null"], pattern: "^[0-9]+\\.[0-9]{6}$" },
    },
  },
};
// Symbolic wallets/protocols, within both sample windows ending 2026-08-31T00:00:00Z.
export const activityFixture = [
  { protocol: "alpha", wallet: "wallet_a", timestamp: "2026-08-27T12:00:00Z" },
  { protocol: "alpha", wallet: "wallet_a", timestamp: "2026-08-28T12:00:00Z" },
  { protocol: "alpha", wallet: "wallet_b", timestamp: "2026-08-27T12:00:00Z" },
  { protocol: "alpha", wallet: "wallet_b", timestamp: "2026-08-27T13:00:00Z" },
  { protocol: "beta", wallet: "wallet_a", timestamp: "2026-08-29T12:00:00Z" },
];
// Reviewed oracle for this fixed fixture, not runtime execution or live-data validation.
export function referenceResult(threshold = 2) {
  return [
    { protocol: "alpha", activeWallets: "2", repeatWallets: threshold === 2 ? "1" : "0", repeatShare: threshold === 2 ? "0.500000" : "0.000000" },
    { protocol: "beta", activeWallets: "1", repeatWallets: "0", repeatShare: "0.000000" },
  ];
}
export function createDemoDraft(parameters = defaultParameters) {
  if (Object.keys(parameters).sort().join() !== "minimumActiveDays,windowDays" || ![7, 30].includes(parameters.windowDays)
    || !Number.isInteger(parameters.minimumActiveDays) || parameters.minimumActiveDays < 2 || parameters.minimumActiveDays > parameters.windowDays) {
    throw new Error("INVALID_DEMO_PARAMETERS");
  }
  const { windowDays, minimumActiveDays } = parameters;
  const nodes = [
    node("activity", "source", {
      sourceId: "source_dex_activity",
      queryDocument: "query Activity($start: Int!, $end: Int!, $first: Int!, $lastId: ID!, $block: Int!) { activities(first: $first, orderBy: id, orderDirection: asc, where: {id_gt: $lastId, timestamp_gte: $start, timestamp_lt: $end}, block: {number: $block}) { id protocol wallet timestamp } _meta(block: {number: $block}) { block { number hash } deployment hasIndexingErrors } }",
      variableBindings: { start: "run.window.start", end: "run.window.end", first: "page.size", lastId: "page.cursor", block: "run.sourceBlock" },
      pagination: { strategy: "id_cursor", cursorField: "id", pageSize: 1000 },
      window: { mode: "complete_utc_days", days: windowDays }, resultPath: ["activities"],
    }),
    node("normalize_day", "map", { fields: { protocol: field("protocol"), wallet: field("wallet"), date: { op: "utc_date", args: [field("timestamp")] } } }),
    node("wallet_activity", "aggregate", { groupBy: ["protocol", "wallet"], measures: { activeDays: { op: "count_distinct", field: "date" } } }),
    node("classify_repeat_wallet", "map", { fields: { protocol: field("protocol"), isRepeat: { op: "if", args: [{ op: "gte", args: [field("activeDays"), literal(minimumActiveDays)] }, literal(1), literal(0)] } } }),
    node("protocol_activity", "aggregate", { groupBy: ["protocol"], measures: { activeWallets: { op: "count_rows" }, repeatWallets: { op: "sum", field: "isRepeat" } } }),
    node("compute_ratio", "map", { fields: { protocol: field("protocol"), activeWallets: field("activeWallets"), repeatWallets: field("repeatWallets"), repeatShare: { op: "safe_divide", args: [field("repeatWallets"), field("activeWallets")], scale: 6, rounding: "half_even" } } }),
    node("result", "output", { orderBy: [{ field: "protocol", direction: "asc" }], nullPolicy: "reject_unexpected" }),
  ];
  const edges = nodes.slice(1).map((item, index) => ({ fromNode: nodes[index].id, fromPort: "rows", toNode: item.id, toPort: "rows" }));
  return {
    parameters: { ...parameters },
    specification: {
      schemaVersion: 2, runtimeVersion: "1",
      intent: { summary: `Measure repeat activity by protocol over ${windowDays} complete UTC days; repeat means at least ${minimumActiveDays} active dates.` },
      sources: [{ id: "source_dex_activity", sourceSnapshotId: "00000000-0000-0000-0000-000000000000", provider: "the_graph", kind: "subgraph", adapterVersion: "1", dataNetwork: "eip155:8453",
        target: { type: "deployment_id", id: "demo-not-a-live-deployment", logicalSubgraphId: null, manifestIpfsCid: null }, schemaHash: "demo-not-verified",
        access: { mode: "x402", gatewayEnvironment: "testnet", providerCredentialId: null, spendingPolicyId: "00000000-0000-0000-0000-000000000000" }, consistency: { mode: "pinned_block", indexingErrorPolicy: "deny" } }],
      dag: { nodes, edges }, outputSchema: structuredClone(outputSchema),
      refreshPolicy: { mode: "scheduled", cronExpression: "0 0 * * *", timezone: "UTC" },
      resourcePolicy: { maxNodes: 12, maxSourceRows: 50000, maxSourceRequests: 100, maxOutputRows: 5000, maxOutputBytes: 5242880, maxStoredBytes: 20971520, maxRuntimeMs: 120000 },
    },
    // Display metadata is outside the canonical spec; no durable provenance/hash claim.
    groups: [
      { id: "template_wallet", templateId: "wallet_activity", templateVersion: "1", labelKey: "dag.walletActivity", nodeIds: ["normalize_day", "wallet_activity"] },
      { id: "template_repeat", templateId: "repeat_activity", templateVersion: "1", labelKey: "dag.repeatActivity", nodeIds: ["classify_repeat_wallet", "protocol_activity", "compute_ratio"] },
    ],
    referenceResult: referenceResult(minimumActiveDays),
  };
}
