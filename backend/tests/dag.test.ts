import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {filterRows, validateFilterPredicate} from "../src/modules/dag/filter.js";
import {inferMapExpressionField, mapRows, validateMapConfig} from "../src/modules/dag/map.js";
import {sortRows, validateSortConfig} from "../src/modules/dag/sort.js";
import {
  type CanonicalSwapField,
  type SourceInput,
  aggregateByWalletAndChain,
  deriveVolumeUsd,
  executeCrossChainTraderFootprint,
  filterTimestampWindow,
  joinCrossChainSummaries,
  normalizeSourceRows,
  sumDecimals,
  unionRows,
  validateSourceMapping,
} from "../src/modules/dag/runtime.js";

interface Fixture {
  fixtureVersion: number;
  capturedSample: boolean;
  sourceKey: string;
  chain: string;
  subgraphId: string;
  deploymentId: string | null;
  schemaHash: string;
  fieldTypes: Record<string, "id" | "address" | "decimal" | "timestamp" | "integer" | "string">;
  mapping: Record<CanonicalSwapField, string>;
  rows: unknown[];
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as Fixture;
}

function sourceFromFixture(fixture: Fixture): SourceInput {
  return {
    schema: {
      sourceKey: fixture.sourceKey,
      chain: fixture.chain,
      subgraphId: fixture.subgraphId,
      deploymentId: fixture.deploymentId,
      schemaHash: fixture.schemaHash,
      fieldTypes: fixture.fieldTypes,
    },
    mapping: {sourceKey: fixture.sourceKey, chain: fixture.chain, fields: fixture.mapping},
    rows: fixture.rows,
  };
}

const dynamicMapping: Record<CanonicalSwapField, string> = {
  wallet: "trader.address",
  tradeId: "swapId",
  pool: "market.address",
  timestamp: "blockTime",
  amountInUsd: "inputUsd",
  amountOutUsd: "outputUsd",
  tokenIn: "inputToken.address",
  tokenOut: "outputToken.address",
};

function dynamicSource(sourceKey: string, chain: string, rows: unknown[]): SourceInput {
  return {
    schema: {
      sourceKey,
      chain,
      subgraphId: `${sourceKey}-subgraph`,
      schemaHash: `${sourceKey}-schema-v1`,
      fieldTypes: {
        "trader.address": "address",
        swapId: "id",
        "market.address": "address",
        blockTime: "timestamp",
        inputUsd: "decimal",
        outputUsd: "decimal",
        "inputToken.address": "address",
        "outputToken.address": "address",
      },
    },
    mapping: {sourceKey, chain, fields: dynamicMapping},
    rows,
  };
}

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherWallet = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const pool = "0xcccccccccccccccccccccccccccccccccccccccc";
const tokenIn = "0xdddddddddddddddddddddddddddddddddddddddd";
const tokenOut = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function swap(id: string, actor: string, timestamp: string, inputUsd: string, outputUsd = "0"): unknown {
  return {
    trader: {address: actor},
    swapId: id,
    market: {address: pool},
    blockTime: timestamp,
    inputUsd,
    outputUsd,
    inputToken: {address: tokenIn},
    outputToken: {address: tokenOut},
  };
}

test("live Graph samples normalize through declared mappings", () => {
  const ethereum = sourceFromFixture(loadFixture("uniswap-v3-ethereum"));
  const arbitrum = sourceFromFixture(loadFixture("uniswap-v3-arbitrum"));
  const rows = [...normalizeSourceRows(ethereum), ...normalizeSourceRows(arbitrum)];

  assert.equal(rows.length, 6);
  assert.equal(rows[0]!.sourceKey, "uniswap-v3-ethereum");
  assert.equal(rows[0]!.chain, "ethereum");
  assert.match(rows[0]!.tradeId, /^uniswap-v3-ethereum:/);
  assert.equal(rows[0]!.wallet, rows[0]!.wallet.toLowerCase());
  assert.equal(rows[0]!.amountInUsd, "3337.057401");
  assert.deepEqual(Object.keys(rows[0]!).sort(), [
    "amountInUsd", "amountOutUsd", "chain", "pool", "providerTradeId", "sourceKey", "timestamp", "tokenIn", "tokenOut", "tradeId", "wallet",
  ].sort());
});

test("provider-specific field names are accepted only through a schema mapping", () => {
  const source = dynamicSource("dynamic-source", "ethereum", [swap("s-1", wallet.replace("aa", "AA"), "100", "0.10", "0.20")]);
  validateSourceMapping(source);
  const [row] = normalizeSourceRows(source);
  assert.equal(row!.wallet, wallet);
  assert.equal(row!.pool, pool);
  assert.equal(row!.timestamp, "100");

  const missingField = {...source, mapping: {...source.mapping, fields: {...dynamicMapping, pool: "market.missing"}}};
  assert.throws(() => validateSourceMapping(missingField), /schema does not expose mapped field market\.missing/);
  const incompatibleSchema = {...source.schema, fieldTypes: {...source.schema.fieldTypes, inputUsd: "address" as const}};
  assert.throws(() => validateSourceMapping({...source, schema: incompatibleSchema}), /incompatible with canonical field amountInUsd/);
});

test("decimal arithmetic and volume policy remain exact and deterministic", () => {
  assert.equal(sumDecimals(["0.1", "0.20", "1000000000000000000.000000000000000001"]), "1000000000000000000.300000000000000001");
  assert.equal(sumDecimals(["1.2300", null, "0.000"]), "1.23");
  assert.equal(deriveVolumeUsd({amountInUsd: "0", amountOutUsd: "12.50"}), "12.5");
  assert.equal(deriveVolumeUsd({amountInUsd: null, amountOutUsd: null}), "0");
});

test("generic Filter evaluates typed conditions without business-field assumptions", () => {
  const fields = [
    {name: "amount", type: "decimal" as const, nullable: false},
    {name: "active", type: "boolean" as const, nullable: false},
    {name: "label", type: "string" as const, nullable: true},
  ];
  const rows = [
    {amount: "9.99", active: true, label: "alpha"},
    {amount: "10.00", active: true, label: null},
    {amount: "1000000000000000000.01", active: false, label: "omega"},
  ];
  const filtered = filterRows(rows, {
    combinator: "and",
    conditions: [
      {field: "amount", operator: "gte", value: "10"},
      {field: "active", operator: "eq", value: true},
      {field: "label", operator: "is_null"},
    ],
  }, fields);
  assert.deepEqual(filtered, [rows[1]]);

  assert.deepEqual(filterRows(rows, {
    combinator: "or",
    conditions: [
      {field: "label", operator: "in", values: ["alpha", "beta"]},
      {field: "amount", operator: "between", values: ["1000000000000000000", "1000000000000000001"]},
    ],
  }, fields), [rows[0], rows[2]]);
});

test("generic Filter rejects missing fields and type-incompatible operators before execution", () => {
  const fields = [{name: "active", type: "boolean" as const, nullable: false}];
  assert.equal(validateFilterPredicate({
    combinator: "and",
    conditions: [{field: "missing", operator: "eq", value: "x"}],
  }, fields)[0]?.code, "FILTER_FIELD_UNKNOWN");
  assert.equal(validateFilterPredicate({
    combinator: "and",
    conditions: [{field: "active", operator: "gt", value: true}],
  }, fields)[0]?.code, "FILTER_OPERATOR_INVALID");
});

test("generic Map executes explicit type, time, text, null, and numeric transforms", () => {
  const fields = [
    {name: "integer_text", type: "string" as const, nullable: false, unit: null},
    {name: "iso_time", type: "string" as const, nullable: false, unit: null},
    {name: "epoch_seconds", type: "integer" as const, nullable: false, unit: "seconds"},
    {name: "epoch_milliseconds", type: "integer" as const, nullable: false, unit: "milliseconds"},
    {name: "label", type: "string" as const, nullable: false, unit: null},
    {name: "suffix", type: "id" as const, nullable: false, unit: null},
    {name: "missing_label", type: "string" as const, nullable: true, unit: null},
    {name: "amount", type: "decimal" as const, nullable: false, unit: "USD"},
  ];
  const config = {
    mode: "project" as const,
    fields: [
      {name: "count", expression: {op: "to_integer", inputs: [{op: "field", field: "integer_text"}]}},
      {name: "decimal_count", expression: {op: "to_decimal", inputs: [{op: "field", field: "integer_text"}]}},
      {name: "parsed_time", expression: {op: "to_timestamp", inputs: [{op: "field", field: "iso_time"}]}},
      {name: "seconds_time", expression: {op: "epoch_seconds_to_timestamp", inputs: [{op: "field", field: "epoch_seconds"}]}},
      {name: "milliseconds_time", expression: {op: "epoch_milliseconds_to_timestamp", inputs: [{op: "field", field: "epoch_milliseconds"}]}},
      {name: "display", expression: {op: "concat", inputs: [
        {op: "trim", inputs: [{op: "field", field: "label"}]},
        {op: "upper", inputs: [{op: "field", field: "suffix"}]},
      ]}},
      {name: "normalized", expression: {op: "lower", inputs: [{op: "field", field: "suffix"}]}},
      {name: "fallback", expression: {op: "coalesce", inputs: [
        {op: "field", field: "missing_label"},
        {op: "literal", valueType: "string", value: "unknown"},
      ]}},
      {name: "absolute", expression: {op: "abs", inputs: [{op: "field", field: "amount"}]}},
      {name: "rounded", expression: {op: "round", inputs: [{op: "field", field: "amount"}]}},
      {name: "floored", expression: {op: "floor", inputs: [{op: "field", field: "amount"}]}},
      {name: "ceiled", expression: {op: "ceil", inputs: [{op: "field", field: "amount"}]}},
    ],
  };
  assert.deepEqual(validateMapConfig(config, fields), []);
  assert.deepEqual(mapRows([{
    integer_text: "42",
    iso_time: "2024-01-01T08:00:00+08:00",
    epoch_seconds: "1704067200",
    epoch_milliseconds: "1704067200000",
    label: "  Alpha ",
    suffix: "beta",
    missing_label: null,
    amount: "-2.5",
  }], config, fields), [{
    count: "42",
    decimal_count: "42",
    parsed_time: "2024-01-01T00:00:00.000Z",
    seconds_time: "2024-01-01T00:00:00.000Z",
    milliseconds_time: "2024-01-01T00:00:00.000Z",
    display: "AlphaBETA",
    normalized: "beta",
    fallback: "unknown",
    absolute: "2.5",
    rounded: "-2",
    floored: "-3",
    ceiled: "-2",
  }]);
  assert.deepEqual(inferMapExpressionField(config.fields[7]!.expression, fields), {
    name: "expression",
    type: "string",
    nullable: false,
    unit: null,
  });
});

test("generic Map rejects implicit lossy casts and type-incompatible transforms", () => {
  const fields = [
    {name: "amount", type: "decimal" as const, nullable: false, unit: null},
    {name: "active", type: "boolean" as const, nullable: false, unit: null},
  ];
  const lossy = {
    mode: "project" as const,
    fields: [{name: "count", expression: {op: "to_integer", inputs: [{op: "field", field: "amount"}]}}],
  };
  assert.throws(() => mapRows([{amount: "1.5", active: true}], lossy, fields), /explicit rounding operation/);
  assert.equal(validateMapConfig({
    mode: "project",
    fields: [{name: "label", expression: {op: "upper", inputs: [{op: "field", field: "active"}]}}],
  }, fields)[0]?.code, "MAP_EXPRESSION_INVALID");
});

test("Sort / Top K applies stable typed ordering without mutating upstream rows", () => {
  const fields = [
    {name: "score", type: "decimal" as const, nullable: true},
    {name: "label", type: "string" as const, nullable: false},
  ];
  const rows = [
    {label: "alpha", score: "2"},
    {label: "empty", score: null},
    {label: "first-tie", score: "1000000000000000000.01"},
    {label: "second-tie", score: "1000000000000000000.01"},
    {label: "middle", score: "3"},
  ];
  const snapshot = structuredClone(rows);
  const config = {orderBy: [{field: "score", direction: "desc" as const, nulls: "last" as const}], limit: null};

  assert.deepEqual(sortRows(rows, config, fields).map(({label}) => label), ["first-tie", "second-tie", "middle", "alpha", "empty"]);
  assert.deepEqual(rows, snapshot);
  assert.deepEqual(sortRows(rows, {...config, limit: 2}, fields).map(({label}) => label), ["first-tie", "second-tie"]);
  assert.deepEqual(sortRows(rows, {
    orderBy: [{field: "score", direction: "asc", nulls: "first"}],
    limit: null,
  }, fields).map(({label}) => label), ["empty", "alpha", "middle", "first-tie", "second-tie"]);
  assert.deepEqual(sortRows(rows, {
    orderBy: [
      {field: "score", direction: "desc", nulls: "last"},
      {field: "label", direction: "desc", nulls: "last"},
    ],
    limit: null,
  }, fields).map(({label}) => label), ["second-tie", "first-tie", "middle", "alpha", "empty"]);

  const largerRows = Array.from({length: 100}, (_, index) => ({
    label: `row-${index}`,
    score: index % 13 === 0 ? null : String((index * 17) % 29),
  }));
  const multiKeyConfig = {
    orderBy: [
      {field: "score", direction: "desc" as const, nulls: "last" as const},
      {field: "label", direction: "asc" as const, nulls: "last" as const},
    ],
    limit: null,
  };
  assert.deepEqual(
    sortRows(largerRows, {...multiKeyConfig, limit: 17}, fields),
    sortRows(largerRows, multiKeyConfig, fields).slice(0, 17),
  );
});

test("Sort / Top K rejects unknown, duplicated, structured, and unbounded configuration", () => {
  const fields = [
    {name: "score", type: "integer" as const, nullable: false},
    {name: "details", type: "json" as const, nullable: false},
  ];
  assert.equal(validateSortConfig({
    orderBy: [{field: "missing", direction: "asc", nulls: "last"}],
    limit: null,
  }, fields)[0]?.code, "SORT_FIELD_UNKNOWN");
  assert.ok(validateSortConfig({
    orderBy: [
      {field: "score", direction: "asc", nulls: "last"},
      {field: "score", direction: "desc", nulls: "first"},
    ],
    limit: 10_001,
  }, fields).some((issue) => issue.code === "SORT_FIELD_DUPLICATED"));
  assert.equal(validateSortConfig({
    orderBy: [{field: "details", direction: "asc", nulls: "last"}],
    limit: null,
  }, fields)[0]?.code, "SORT_FIELD_TYPE_INVALID");
});

test("Union preserves source lineage and rejects duplicate canonical trade ids", () => {
  const ethereum = normalizeSourceRows(dynamicSource("ethereum-source", "ethereum", [swap("s-1", wallet, "100", "1")]));
  const arbitrum = normalizeSourceRows(dynamicSource("arbitrum-source", "arbitrum", [swap("s-1", otherWallet, "200", "2")]));
  const result = unionRows([ethereum, arbitrum]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.sourceKeys, ["arbitrum-source", "ethereum-source"]);
  assert.deepEqual(result.rows.map((row) => row.sourceKey), ["ethereum-source", "arbitrum-source"]);
  assert.throws(() => unionRows([ethereum, ethereum]), /duplicate canonical trade id/);
});

test("aggregation, timestamp window, and cross-chain Join produce the MVP output", () => {
  const ethereum = dynamicSource("ethereum-source", "ethereum", [
    swap("eth-1", wallet.replace("aa", "AA"), "100", "0.10", "0.20"),
    swap("eth-2", wallet, "200", "2.30"),
    swap("eth-old", otherWallet, "10", "99"),
  ]);
  const arbitrum = dynamicSource("arbitrum-source", "arbitrum", [
    swap("arb-1", wallet, "300", "3.40"),
    swap("arb-2", otherWallet, "400", "4.50"),
  ]);
  const normalizedEth = normalizeSourceRows(ethereum);
  const windowed = filterTimestampWindow(normalizedEth, "100", "301");
  const summaries = aggregateByWalletAndChain(windowed);
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], {
    sourceKeys: ["ethereum-source"],
    chain: "ethereum",
    wallet,
    tradeCount: 2,
    volumeUsd: "2.4",
    amountInUsd: "2.4",
    amountOutUsd: "0.2",
    firstSeenAt: "100",
    lastSeenAt: "200",
  });

  const result = executeCrossChainTraderFootprint([ethereum, arbitrum], {
    leftChain: "ethereum",
    rightChain: "arbitrum",
    startInclusive: "100",
    endExclusive: "301",
  });
  assert.equal(result.unionRows.length, 3);
  assert.equal(result.perChain.length, 2);
  assert.equal(result.crossChain.length, 1);
  assert.deepEqual(result.crossChain[0], {
    wallet,
    chains: ["ethereum", "arbitrum"],
    byChain: {
      ethereum: {
        sourceKeys: ["ethereum-source"], chain: "ethereum", wallet, tradeCount: 2,
        volumeUsd: "2.4", amountInUsd: "2.4", amountOutUsd: "0.2", firstSeenAt: "100", lastSeenAt: "200",
      },
      arbitrum: {
        sourceKeys: ["arbitrum-source"], chain: "arbitrum", wallet, tradeCount: 1,
        volumeUsd: "3.4", amountInUsd: "3.4", amountOutUsd: "0", firstSeenAt: "300", lastSeenAt: "300",
      },
    },
    combinedTradeCount: 3,
    combinedVolumeUsd: "5.8",
    firstSeenAt: "100",
    lastSeenAt: "300",
  });
});

test("Join is one-to-one after per-chain aggregation", () => {
  const rows = aggregateByWalletAndChain(normalizeSourceRows(dynamicSource("ethereum-source", "ethereum", [swap("s-1", wallet, "100", "1")])));
  const duplicate = {...rows[0]!, tradeCount: 2};
  const right = {...rows[0]!, chain: "arbitrum", sourceKeys: ["arbitrum-source"]};
  assert.throws(() => joinCrossChainSummaries([rows[0]!, duplicate], [right]), /duplicate wallet/);
});
