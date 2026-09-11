import type {StructuredDagField, StructuredDagNode} from "../dag/compiler.js";
import {filterRows, compareSemanticValues} from "../dag/filter.js";
import {inferMapExpressionField, mapRows, type MapConfig} from "../dag/map.js";
import {sortRows, type SortConfig} from "../dag/sort.js";
import type {GraphRuntimeQueryPort} from "../graph/types.js";
import type {ImmutableLivePlan, CompiledLiveSource} from "./live-plan.js";

type Row = Record<string, unknown>;
type Shape = readonly StructuredDagField[];

export interface LiveExecutionResult {
  rows: readonly Row[];
  sourceRequests: number;
  sourceRows: number;
  queriedAt: string;
}

function object(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathValue(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!object(value) || !Object.prototype.hasOwnProperty.call(value, segment)) {
      throw new Error(`Graph row is missing compiled field ${path}`);
    }
    return value[segment];
  }, row);
}

function setPath(row: Row, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = row;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    if (current[segment] === undefined) current[segment] = {};
    if (!object(current[segment])) throw new Error(`Compiled source output path ${path} conflicts with another field`);
    current = current[segment] as Row;
  }
  current[segments.at(-1)!] = value;
}

function projectionsFor(source: CompiledLiveSource): readonly {fieldPath: string; outputPath: string}[] {
  if (Array.isArray(source.projections)) return source.projections;
  return [
    ...source.fieldBindings.map((binding) => ({
      fieldPath: binding.fieldPath,
      outputPath: binding.requirementId,
    })),
    ...source.auxiliaryFieldBindings.map((binding) => ({
      fieldPath: binding.fieldPath,
      outputPath: binding.requirementId ?? binding.name ?? binding.fieldPath,
    })),
  ];
}

export function resolveCompleteUtcWindow(
  days: number,
  anchor: Date,
): {start: string; end: string} {
  if (!Number.isInteger(days) || days < 1 || days > 365 || Number.isNaN(anchor.getTime())) {
    throw new Error("Compiled complete UTC-day window is invalid");
  }
  const endMilliseconds = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const startMilliseconds = endMilliseconds - days * 86_400_000;
  return {
    start: String(Math.floor(startMilliseconds / 1_000)),
    end: String(Math.floor(endMilliseconds / 1_000)),
  };
}

function sourceVariables(source: CompiledLiveSource, first: number, cursor: string, anchor: Date): Record<string, unknown> {
  const variables: Record<string, unknown> = {first, cursor};
  if (!source.runtimeWindow) return variables;
  if (!source.runtimeWindowVariableType) throw new Error("Compiled Source runtime window has no variable type");
  const window = resolveCompleteUtcWindow(source.runtimeWindow.days, anchor);
  const encode = (value: string): string | number => source.runtimeWindowVariableType === "Int" ? Number(value) : value;
  variables[source.runtimeWindow.startVariable] = encode(window.start);
  variables[source.runtimeWindow.endVariable] = encode(window.end);
  return variables;
}

async function fetchLiveSource(
  source: CompiledLiveSource,
  graph: GraphRuntimeQueryPort,
  executionAnchor: Date,
  signal?: AbortSignal,
): Promise<{rows: Row[]; requests: number}> {
  const rows: Row[] = [];
  let cursor = source.initialCursor;
  let requests = 0;
  let finalBatchWasFull = false;
  const rowCeiling = Math.min(source.rowLimit ?? source.maxRows, source.maxRows);
  while (requests < source.maxRequests && rows.length < rowCeiling) {
    const first = Math.min(source.pageSize, rowCeiling - rows.length);
    const response = await graph.executeStaticQuery(
      source.manifestIpfsCid,
      source.queryDocument,
      sourceVariables(source, first, cursor, executionAnchor),
      signal,
    );
    requests += 1;
    if (response.errors.length > 0) throw new Error(response.errors[0]!.message);
    const batch = response.data[source.queryEntity];
    if (!Array.isArray(batch)) throw new Error(`Graph response does not contain ${source.queryEntity} rows`);
    finalBatchWasFull = batch.length === first;
    for (const item of batch) {
      if (!object(item) || typeof item.id !== "string") throw new Error("Graph row does not expose the compiled cursor field id");
      const projected: Row = {data_network: source.dataNetwork};
      for (const projection of projectionsFor(source)) {
        setPath(projected, projection.outputPath, pathValue(item, projection.fieldPath));
      }
      rows.push(projected);
    }
    if (batch.length < first) break;
    const next = (batch.at(-1) as Row).id;
    if (typeof next !== "string" || next === cursor) throw new Error("Graph cursor did not advance");
    cursor = next;
  }
  if (source.rowLimit == null && rows.length >= source.maxRows && finalBatchWasFull) {
    throw new Error(`Graph source ${source.id} exceeded the compiled row limit`);
  }
  if (requests >= source.maxRequests && rows.length < rowCeiling && finalBatchWasFull) {
    throw new Error(`Graph source ${source.id} exceeded the compiled request limit`);
  }
  return {rows, requests};
}

interface Decimal {coefficient: bigint; scale: number}

function decimal(value: unknown): Decimal {
  const text = typeof value === "number" || typeof value === "bigint" ? String(value) : value;
  if (typeof text !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error("Aggregate value is not an exact decimal");
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return {coefficient: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length};
}

function decimalText(value: Decimal): string {
  if (value.coefficient === 0n) return "0";
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -value.scale);
  const fraction = digits.slice(-value.scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function decimalSum(values: readonly unknown[]): Decimal {
  let result: Decimal = {coefficient: 0n, scale: 0};
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const next = decimal(value);
    const scale = Math.max(result.scale, next.scale);
    result = {coefficient: result.coefficient * 10n ** BigInt(scale - result.scale) + next.coefficient * 10n ** BigInt(scale - next.scale), scale};
  }
  return result;
}

function divideDecimal(value: Decimal, divisor: bigint): string {
  if (divisor === 0n) throw new Error("Cannot average an empty group");
  const scale = 6;
  const factor = 10n ** BigInt(scale);
  const numerator = value.coefficient * factor;
  let quotient = numerator / divisor;
  const remainder = numerator % divisor;
  if ((remainder < 0n ? -remainder : remainder) * 2n >= (divisor < 0n ? -divisor : divisor)) quotient += numerator < 0n ? -1n : 1n;
  return decimalText({coefficient: quotient, scale: value.scale + scale});
}

function aggregateRows(rows: readonly Row[], node: StructuredDagNode, inputShape: Shape): {rows: Row[]; shape: Shape} {
  const config = node.config as unknown as {
    groupBy: readonly string[];
    measures: readonly {name: string; op: "count_rows" | "count_distinct" | "sum" | "min" | "max" | "average"; field: string | null}[];
  };
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = JSON.stringify(config.groupBy.map((field) => row[field]));
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const fieldByName = new Map(inputShape.map((field) => [field.name, field]));
  const shape: StructuredDagField[] = config.groupBy.map((name) => ({...fieldByName.get(name)!}));
  for (const measure of config.measures) {
    const input = measure.field ? fieldByName.get(measure.field)! : null;
    shape.push(measure.op === "count_rows" || measure.op === "count_distinct"
      ? {name: measure.name, type: "integer", nullable: false, unit: null}
      : {name: measure.name, type: measure.op === "average" ? "decimal" : input!.type, nullable: input!.nullable, unit: input!.unit});
  }
  const output = [...groups.values()].map((group) => {
    const row: Row = {};
    for (const name of config.groupBy) row[name] = group[0]![name];
    for (const measure of config.measures) {
      const values = measure.field ? group.map((item) => item[measure.field!]).filter((value) => value !== null && value !== undefined) : [];
      if (measure.op === "count_rows") row[measure.name] = String(group.length);
      else if (measure.op === "count_distinct") row[measure.name] = String(new Set(values.map((value) => JSON.stringify(value))).size);
      else if (measure.op === "sum") row[measure.name] = decimalText(decimalSum(values));
      else if (measure.op === "average") row[measure.name] = values.length === 0 ? null : divideDecimal(decimalSum(values), BigInt(values.length));
      else if (values.length === 0) row[measure.name] = null;
      else {
        const field = fieldByName.get(measure.field!)!;
        row[measure.name] = values.reduce((selected, value) => {
          const comparison = compareSemanticValues(field.type, value, selected);
          return measure.op === "min" ? comparison < 0 ? value : selected : comparison > 0 ? value : selected;
        });
      }
    }
    return row;
  });
  return {rows: output, shape};
}

function incomingFor(plan: ImmutableLivePlan, nodeId: string): Map<string, string> {
  return new Map(plan.dag.edges.filter((edge) => edge.toNode === nodeId).map((edge) => [edge.toPort, edge.fromNode]));
}

export async function executeLivePlan(
  plan: ImmutableLivePlan,
  graphForCredential: (credentialId: string) => Promise<GraphRuntimeQueryPort>,
  signal?: AbortSignal,
  clock: () => Date = () => new Date(),
): Promise<LiveExecutionResult> {
  const executionAnchor = clock();
  const nodes = new Map(plan.dag.nodes.map((node) => [node.id, node]));
  const pending = new Set(nodes.keys());
  const rowsByNode = new Map<string, Row[]>();
  const shapes = new Map<string, Shape>();
  const graphClients = new Map<string, GraphRuntimeQueryPort>();
  let sourceRequests = 0;
  let sourceRows = 0;
  try {
    while (pending.size > 0) {
      let progressed = false;
      for (const id of [...pending]) {
        const node = nodes.get(id)!;
        const incoming = incomingFor(plan, id);
        if ([...incoming.values()].some((previous) => !rowsByNode.has(previous))) continue;
        if (node.type === "source") {
          const sourceId = String(node.config.sourceId ?? node.config.sourceKey ?? "");
          const source = plan.sources.find((item) => item.id === sourceId);
          if (!source || !node.outputSchema) throw new Error(`Compiled source ${sourceId} is unavailable`);
          let graph = graphClients.get(source.providerCredentialId);
          if (!graph) {
            graph = await graphForCredential(source.providerCredentialId);
            graphClients.set(source.providerCredentialId, graph);
          }
          const fetched = await fetchLiveSource(source, graph, executionAnchor, signal);
          rowsByNode.set(id, fetched.rows);
          shapes.set(id, node.outputSchema.fields);
          sourceRequests += fetched.requests;
          sourceRows += fetched.rows.length;
        } else {
          const input = (port: string) => rowsByNode.get(incoming.get(port)!)!;
          const shape = (port: string) => shapes.get(incoming.get(port)!)!;
          if (node.type === "filter") {
            const inputRows = input("rows");
            const inputShape = shape("rows");
            const output = Object.prototype.hasOwnProperty.call(node.config, "predicate")
              ? filterRows(inputRows, node.config.predicate as never, inputShape)
              : inputRows.filter((row) => mapRows([row], {mode: "project", fields: [{name: "matches", expression: node.config.expression}]} as MapConfig, inputShape)[0]!.matches === true);
            rowsByNode.set(id, [...output]);
            shapes.set(id, inputShape);
          } else if (node.type === "map") {
            const config = node.config as unknown as MapConfig;
            const inputShape = shape("rows");
            const outputShape: StructuredDagField[] = config.mode === "extend" ? inputShape.map((field) => ({...field})) : [];
            for (const definition of config.fields) {
              const inferred = inferMapExpressionField(definition.expression, inputShape);
              const index = outputShape.findIndex((field) => field.name === definition.name);
              const field = {name: definition.name, type: inferred.type, nullable: inferred.nullable, unit: definition.unit ?? inferred.unit ?? null};
              if (index >= 0) outputShape[index] = field; else outputShape.push(field);
            }
            rowsByNode.set(id, [...mapRows(input("rows"), config, inputShape)]);
            shapes.set(id, outputShape);
          } else if (node.type === "aggregate") {
            const result = aggregateRows(input("rows"), node, shape("rows"));
            rowsByNode.set(id, result.rows); shapes.set(id, result.shape);
          } else if (node.type === "sort") {
            rowsByNode.set(id, [...sortRows(input("rows"), node.config as unknown as SortConfig, shape("rows"))]); shapes.set(id, shape("rows"));
          } else if (node.type === "union") {
            const left = input("left"); const right = input("right");
            const discriminator = node.config.sourceDiscriminator;
            rowsByNode.set(id, discriminator === null ? [...left, ...right] : [...left.map((row) => ({...row, [String(discriminator)]: "left"})), ...right.map((row) => ({...row, [String(discriminator)]: "right"}))]);
            shapes.set(id, discriminator === null ? shape("left") : [...shape("left"), {name: String(discriminator), type: "string", nullable: false, unit: null}]);
          } else if (node.type === "join") {
            const config = node.config as unknown as {type: "inner" | "left"; keys: readonly {left: string; right: string}[]; rightPrefix: string};
            const right = input("right");
            const rightIndex = new Map(right.map((row) => [JSON.stringify(config.keys.map((key) => row[key.right])), row]));
            const joined = input("left").flatMap((left) => {
              const found = rightIndex.get(JSON.stringify(config.keys.map((key) => left[key.left])));
              if (!found && config.type === "inner") return [];
              const result: Row = {...left};
              for (const [name, value] of Object.entries(found ?? {})) {
                if (config.keys.some((key) => key.right === name && Object.prototype.hasOwnProperty.call(left, name))) continue;
                result[`${config.rightPrefix}${name}`] = value;
              }
              return [result];
            });
            const rightKeys = new Set(config.keys.map((key) => key.right));
            shapes.set(id, [...shape("left"), ...shape("right").filter((field) => !(rightKeys.has(field.name) && shape("left").some((item) => item.name === field.name))).map((field) => ({...field, name: `${config.rightPrefix}${field.name}`, nullable: config.type === "left" || field.nullable}))]);
            rowsByNode.set(id, joined);
          } else if (node.type === "output") {
            const fields = node.config.fields as readonly string[];
            rowsByNode.set(id, input("rows").map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])))); shapes.set(id, shape("rows").filter((field) => fields.includes(field.name)));
          }
        }
        pending.delete(id);
        progressed = true;
      }
      if (!progressed) throw new Error("Compiled DAG could not be scheduled");
    }
    const output = plan.dag.nodes.find((node) => node.type === "output")!;
    return {rows: rowsByNode.get(output.id) ?? [], sourceRequests, sourceRows, queriedAt: executionAnchor.toISOString()};
  } finally {
    await Promise.allSettled([...graphClients.values()].map((client) => client.close()));
  }
}
