/**
 * Deterministic runtime primitives for the cross-chain DEX footprint MVP.
 *
 * Provider field names are supplied by a validated source mapping. The runtime
 * only executes the canonical swap contract and never evaluates generated code.
 */

export type ProviderFieldType = "id" | "address" | "decimal" | "timestamp" | "integer" | "string";

export type CanonicalSwapField =
  | "wallet"
  | "tradeId"
  | "pool"
  | "timestamp"
  | "amountInUsd"
  | "amountOutUsd"
  | "tokenIn"
  | "tokenOut";

export interface SourceSchemaSnapshot {
  sourceKey: string;
  chain: string;
  subgraphId: string;
  deploymentId?: string | null;
  schemaHash: string;
  fieldTypes: Readonly<Record<string, ProviderFieldType>>;
}

export interface SourceFieldMapping {
  sourceKey: string;
  chain: string;
  fields: Readonly<Record<CanonicalSwapField, string>>;
}

export interface SourceInput {
  schema: SourceSchemaSnapshot;
  mapping: SourceFieldMapping;
  rows: readonly unknown[];
}

export interface CanonicalSwapRow {
  sourceKey: string;
  chain: string;
  providerTradeId: string;
  tradeId: string;
  wallet: string;
  pool: string;
  timestamp: string;
  amountInUsd: string | null;
  amountOutUsd: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
}

export interface WalletChainSummary {
  sourceKeys: readonly string[];
  chain: string;
  wallet: string;
  tradeCount: number;
  volumeUsd: string;
  amountInUsd: string;
  amountOutUsd: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JoinedCrossChainRow {
  wallet: string;
  chains: readonly [string, string];
  byChain: Readonly<Record<string, WalletChainSummary>>;
  combinedTradeCount: number;
  combinedVolumeUsd: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CrossChainTraderFootprintResult {
  unionRows: readonly CanonicalSwapRow[];
  perChain: readonly WalletChainSummary[];
  crossChain: readonly JoinedCrossChainRow[];
}

export class DagValidationError extends Error {
  readonly code = "DAG_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "DagValidationError";
  }
}

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

const expectedProviderTypes: Readonly<Record<CanonicalSwapField, readonly ProviderFieldType[]>> = {
  wallet: ["address", "id"],
  tradeId: ["id", "string"],
  pool: ["address", "id"],
  timestamp: ["timestamp", "integer"],
  amountInUsd: ["decimal", "string"],
  amountOutUsd: ["decimal", "string"],
  tokenIn: ["address", "id"],
  tokenOut: ["address", "id"],
};

const pathPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function fail(message: string): never {
  throw new DagValidationError(message);
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) fail(`${label} must not be empty`);
}

function assertAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !addressPattern.test(value)) {
    fail(`${label} must be a 20-byte hexadecimal address`);
  }
  return value.toLowerCase();
}

function assertIntegerString(value: unknown, label: string): string {
  const text = typeof value === "bigint" ? value.toString() : typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+$/.test(text)) fail(`${label} must be a non-negative integer timestamp`);
  return BigInt(text).toString();
}

function normalizeDecimal(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" || typeof value === "bigint" ? String(value) : value;
  if (typeof text !== "string" || !decimalPattern.test(text)) fail(`${label} must be a decimal string`);

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const decimalParts = unsigned.split(".");
  const integerPart = decimalParts[0] ?? "0";
  const fractionPart = decimalParts[1] ?? "";
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const fraction = fractionPart.replace(/0+$/, "");
  const normalized = fraction.length > 0 ? `${integer}.${fraction}` : integer;
  if (normalized === "0") return "0";
  return negative ? `-${normalized}` : normalized;
}

function readPath(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null || !Object.prototype.hasOwnProperty.call(current, segment)) {
      fail(`row is missing mapped field ${path}`);
    }
    return (current as Record<string, unknown>)[segment];
  }, row);
}

function readRequiredString(row: unknown, path: string, label: string): string {
  const value = readPath(row, path);
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") fail(`${label} must be scalar`);
  const text = String(value);
  assertNonEmpty(text, label);
  return text;
}

function assertCompatibleProviderType(field: CanonicalSwapField, path: string, actual: ProviderFieldType | undefined): void {
  if (actual === undefined) fail(`schema does not expose mapped field ${path}`);
  if (!expectedProviderTypes[field].includes(actual)) {
    fail(`mapped field ${path} has provider type ${actual}, incompatible with canonical field ${field}`);
  }
}

export function validateSourceMapping(source: SourceInput): void {
  const {schema, mapping} = source;
  assertNonEmpty(schema.sourceKey, "schema.sourceKey");
  assertNonEmpty(schema.chain, "schema.chain");
  assertNonEmpty(schema.subgraphId, "schema.subgraphId");
  assertNonEmpty(schema.schemaHash, "schema.schemaHash");
  if (mapping.sourceKey !== schema.sourceKey) fail("mapping.sourceKey must match schema.sourceKey");
  if (mapping.chain !== schema.chain) fail("mapping.chain must match schema.chain");

  const paths = new Set<string>();
  for (const field of canonicalFields) {
    const path = mapping.fields[field];
    if (typeof path !== "string" || !pathPattern.test(path)) fail(`mapping for ${field} must be a valid provider field path`);
    if (paths.has(path)) fail(`provider field path ${path} is mapped more than once`);
    paths.add(path);
    assertCompatibleProviderType(field, path, schema.fieldTypes[path]);
  }
}

export function normalizeSourceRows(source: SourceInput): readonly CanonicalSwapRow[] {
  validateSourceMapping(source);
  const output: CanonicalSwapRow[] = [];
  const tradeIds = new Set<string>();
  for (const [index, row] of source.rows.entries()) {
    const fields = source.mapping.fields;
    const providerTradeId = readRequiredString(row, fields.tradeId, `row ${index} trade id`);
    const tradeId = `${source.schema.sourceKey}:${providerTradeId}`;
    if (tradeIds.has(tradeId)) fail(`source ${source.schema.sourceKey} contains duplicate trade id ${providerTradeId}`);
    tradeIds.add(tradeId);

    const wallet = assertAddress(readPath(row, fields.wallet), `row ${index} wallet`);
    const pool = assertAddress(readPath(row, fields.pool), `row ${index} pool`);
    const timestamp = assertIntegerString(readPath(row, fields.timestamp), `row ${index} timestamp`);
    const tokenInValue = readPath(row, fields.tokenIn);
    const tokenOutValue = readPath(row, fields.tokenOut);

    output.push({
      sourceKey: source.schema.sourceKey,
      chain: source.schema.chain,
      providerTradeId,
      tradeId,
      wallet,
      pool,
      timestamp,
      amountInUsd: normalizeDecimal(readPath(row, fields.amountInUsd), `row ${index} amountInUsd`),
      amountOutUsd: normalizeDecimal(readPath(row, fields.amountOutUsd), `row ${index} amountOutUsd`),
      tokenIn: tokenInValue === null || tokenInValue === undefined ? null : assertAddress(tokenInValue, `row ${index} tokenIn`),
      tokenOut: tokenOutValue === null || tokenOutValue === undefined ? null : assertAddress(tokenOutValue, `row ${index} tokenOut`),
    });
  }
  return output;
}

interface DecimalValue {
  integer: bigint;
  scale: number;
}

function parseDecimal(value: string): DecimalValue {
  const normalized = normalizeDecimal(value, "decimal")!;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const decimalParts = unsigned.split(".");
  const integerPart = decimalParts[0] ?? "0";
  const fractionPart = decimalParts[1] ?? "";
  const digits = BigInt(`${integerPart}${fractionPart}`) * (negative ? -1n : 1n);
  return {integer: digits, scale: fractionPart.length};
}

function formatDecimal(value: DecimalValue): string {
  if (value.integer === 0n) return "0";
  const negative = value.integer < 0n;
  const digits = (negative ? -value.integer : value.integer).toString().padStart(value.scale + 1, "0");
  const splitAt = digits.length - value.scale;
  const text = value.scale === 0 ? digits : `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
  return negative ? `-${text}` : text;
}

function addDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  const leftInteger = left.integer * 10n ** BigInt(scale - left.scale);
  const rightInteger = right.integer * 10n ** BigInt(scale - right.scale);
  return {integer: leftInteger + rightInteger, scale};
}

function minBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) fail("cannot calculate a minimum over an empty list");
  return values.reduce((minimum, value) => value < minimum ? value : minimum, values[0]!);
}

function maxBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) fail("cannot calculate a maximum over an empty list");
  return values.reduce((maximum, value) => value > maximum ? value : maximum, values[0]!);
}

export function sumDecimals(values: readonly (string | null | undefined)[]): string {
  return formatDecimal(values.reduce<DecimalValue>((total, value) => value === null || value === undefined ? total : addDecimal(total, parseDecimal(value)), {integer: 0n, scale: 0}));
}

function isPositiveDecimal(value: string | null): boolean {
  return value !== null && parseDecimal(value).integer > 0n;
}

/**
 * The MVP volume policy uses amountInUsd and falls back to amountOutUsd when
 * the provider has not populated the input-side USD value.
 */
export function deriveVolumeUsd(row: Pick<CanonicalSwapRow, "amountInUsd" | "amountOutUsd">): string {
  if (isPositiveDecimal(row.amountInUsd)) return normalizeDecimal(row.amountInUsd, "amountInUsd")!;
  if (isPositiveDecimal(row.amountOutUsd)) return normalizeDecimal(row.amountOutUsd, "amountOutUsd")!;
  return "0";
}

export function filterTimestampWindow(rows: readonly CanonicalSwapRow[], startInclusive: string, endExclusive: string): readonly CanonicalSwapRow[] {
  const start = BigInt(assertIntegerString(startInclusive, "startInclusive"));
  const end = BigInt(assertIntegerString(endExclusive, "endExclusive"));
  if (end <= start) fail("timestamp window endExclusive must be greater than startInclusive");
  return rows.filter((row) => {
    const timestamp = BigInt(row.timestamp);
    return timestamp >= start && timestamp < end;
  });
}

export function aggregateByWalletAndChain(rows: readonly CanonicalSwapRow[]): readonly WalletChainSummary[] {
  const groups = new Map<string, {sourceKeys: Set<string>; chain: string; wallet: string; rows: CanonicalSwapRow[]}>();
  for (const row of rows) {
    const key = `${row.chain}:${row.wallet}`;
    const group = groups.get(key) ?? {sourceKeys: new Set<string>(), chain: row.chain, wallet: row.wallet, rows: []};
    group.sourceKeys.add(row.sourceKey);
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const timestamps = group.rows.map((row) => BigInt(row.timestamp));
      return {
        sourceKeys: [...group.sourceKeys].sort(),
        chain: group.chain,
        wallet: group.wallet,
        tradeCount: group.rows.length,
        volumeUsd: sumDecimals(group.rows.map(deriveVolumeUsd)),
        amountInUsd: sumDecimals(group.rows.map((row) => row.amountInUsd)),
        amountOutUsd: sumDecimals(group.rows.map((row) => row.amountOutUsd)),
        firstSeenAt: minBigInt(timestamps).toString(),
        lastSeenAt: maxBigInt(timestamps).toString(),
      } satisfies WalletChainSummary;
    })
    .sort((left, right) => left.chain.localeCompare(right.chain) || left.wallet.localeCompare(right.wallet));
}

function assertCanonicalRow(row: CanonicalSwapRow): void {
  for (const field of ["sourceKey", "chain", "providerTradeId", "tradeId", "wallet", "pool", "timestamp"] as const) {
    if (typeof row[field] !== "string" || row[field].length === 0) fail(`canonical row field ${field} is required`);
  }
  assertAddress(row.wallet, "canonical wallet");
  assertAddress(row.pool, "canonical pool");
  assertIntegerString(row.timestamp, "canonical timestamp");
  normalizeDecimal(row.amountInUsd, "canonical amountInUsd");
  normalizeDecimal(row.amountOutUsd, "canonical amountOutUsd");
  if (row.tokenIn !== null) assertAddress(row.tokenIn, "canonical tokenIn");
  if (row.tokenOut !== null) assertAddress(row.tokenOut, "canonical tokenOut");
}

export function unionRows(inputs: readonly (readonly CanonicalSwapRow[])[]): {rows: readonly CanonicalSwapRow[]; sourceKeys: readonly string[]} {
  if (inputs.length === 0) fail("Union requires at least one input");
  const rows: CanonicalSwapRow[] = [];
  const tradeIds = new Set<string>();
  const sourceKeys = new Set<string>();
  for (const input of inputs) {
    for (const row of input) {
      assertCanonicalRow(row);
      if (tradeIds.has(row.tradeId)) fail(`Union received duplicate canonical trade id ${row.tradeId}`);
      tradeIds.add(row.tradeId);
      sourceKeys.add(row.sourceKey);
      rows.push(row);
    }
  }
  return {rows, sourceKeys: [...sourceKeys].sort()};
}

export function joinCrossChainSummaries(left: readonly WalletChainSummary[], right: readonly WalletChainSummary[]): readonly JoinedCrossChainRow[] {
  if (left.length === 0 || right.length === 0) return [];
  const leftChain = left[0]!.chain;
  const rightChain = right[0]!.chain;
  if (leftChain === rightChain) fail("Join requires two distinct chains");
  if (left.some((row) => row.chain !== leftChain) || right.some((row) => row.chain !== rightChain)) fail("Join inputs must be one chain each");

  const leftByWallet = new Map<string, WalletChainSummary>();
  const rightByWallet = new Map<string, WalletChainSummary>();
  for (const row of left) {
    if (leftByWallet.has(row.wallet)) fail(`left Join input has duplicate wallet ${row.wallet}`);
    leftByWallet.set(row.wallet, row);
  }
  for (const row of right) {
    if (rightByWallet.has(row.wallet)) fail(`right Join input has duplicate wallet ${row.wallet}`);
    rightByWallet.set(row.wallet, row);
  }

  return [...leftByWallet.keys()]
    .filter((wallet) => rightByWallet.has(wallet))
    .sort()
    .map((wallet) => {
      const leftRow = leftByWallet.get(wallet)!;
      const rightRow = rightByWallet.get(wallet)!;
      return {
        wallet,
        chains: [leftChain, rightChain] as const,
        byChain: {[leftChain]: leftRow, [rightChain]: rightRow},
        combinedTradeCount: leftRow.tradeCount + rightRow.tradeCount,
        combinedVolumeUsd: sumDecimals([leftRow.volumeUsd, rightRow.volumeUsd]),
        firstSeenAt: minBigInt([BigInt(leftRow.firstSeenAt), BigInt(rightRow.firstSeenAt)]).toString(),
        lastSeenAt: maxBigInt([BigInt(leftRow.lastSeenAt), BigInt(rightRow.lastSeenAt)]).toString(),
      } satisfies JoinedCrossChainRow;
    });
}

export function executeCrossChainTraderFootprint(
  sources: readonly SourceInput[],
  options: {leftChain: string; rightChain: string; startInclusive?: string; endExclusive?: string},
): CrossChainTraderFootprintResult {
  if (sources.length < 2) fail("cross-chain footprint requires at least two sources");
  const normalized = sources.map(normalizeSourceRows);
  const union = unionRows(normalized);
  const windowed = options.startInclusive === undefined || options.endExclusive === undefined
    ? union.rows
    : filterTimestampWindow(union.rows, options.startInclusive, options.endExclusive);
  const perChain = aggregateByWalletAndChain(windowed);
  const left = perChain.filter((row) => row.chain === options.leftChain);
  const right = perChain.filter((row) => row.chain === options.rightChain);
  if (left.length === 0) fail(`no normalized rows available for left chain ${options.leftChain}`);
  if (right.length === 0) fail(`no normalized rows available for right chain ${options.rightChain}`);
  return {unionRows: windowed, perChain, crossChain: joinCrossChainSummaries(left, right)};
}
