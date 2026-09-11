import {createHash, timingSafeEqual} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";

const expectedSpecHash = "__SPRUE_EXPECTED_SPEC_HASH__";
const plan = JSON.parse(await readFile(new URL("./dag.json", import.meta.url), "utf8"));
const privateApiKey = process.env.SPRUE_PRIVATE_API_KEY ?? "";
const graphApiKey = process.env.THE_GRAPH_API_KEY ?? "";
const endpointTemplate = process.env.SPRUE_GRAPH_ENDPOINT_TEMPLATE
  ?? "https://gateway.thegraph.com/api/{api-key}/subgraphs/id/{manifest-cid}";
const endpointOverrides = JSON.parse(process.env.SPRUE_GRAPH_ENDPOINTS_JSON ?? "{}");
const port = Number(process.env.PORT ?? "8787");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

if (plan.runtimeVersion !== "dag-live-v1" || contentHash(plan) !== expectedSpecHash) {
  throw new Error("The exported DAG does not match its immutable specification hash");
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a valid TCP port");
if (privateApiKey.length < 24) throw new Error("SPRUE_PRIVATE_API_KEY must contain at least 24 characters");
if (!graphApiKey && Object.keys(endpointOverrides).length === 0) {
  throw new Error("THE_GRAPH_API_KEY or SPRUE_GRAPH_ENDPOINTS_JSON is required");
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (!record(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error(`A live Graph row is missing compiled field ${path}`);
    }
    return current[segment];
  }, value);
}

function writePath(row, path, value) {
  const segments = path.split(".");
  let current = row;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (current[segment] === undefined) current[segment] = {};
    if (!record(current[segment])) throw new Error(`Compiled source output path ${path} conflicts with another field`);
    current = current[segment];
  }
  current[segments.at(-1)] = value;
}

function projectionsFor(source) {
  if (Array.isArray(source.projections)) return source.projections;
  return [
    ...(source.fieldBindings ?? []).map((binding) => ({
      fieldPath: binding.fieldPath,
      outputPath: binding.requirementId,
    })),
    ...(source.auxiliaryFieldBindings ?? []).map((binding) => ({
      fieldPath: binding.fieldPath,
      outputPath: binding.requirementId ?? binding.name ?? binding.fieldPath,
    })),
  ];
}

function endpointFor(source) {
  const override = endpointOverrides[source.id] ?? endpointOverrides[source.manifestIpfsCid];
  const value = override ?? endpointTemplate;
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) throw new Error(`No valid Graph endpoint is configured for ${source.id}`);
  return value
    .replaceAll("{api-key}", encodeURIComponent(graphApiKey))
    .replaceAll("{manifest-cid}", encodeURIComponent(source.manifestIpfsCid));
}

async function fetchSource(source, signal) {
  const rows = [];
  let cursor = source.initialCursor;
  let requests = 0;
  let finalBatchWasFull = false;
  const rowCeiling = Math.min(source.rowLimit ?? source.maxRows, source.maxRows);
  while (requests < source.maxRequests && rows.length < rowCeiling) {
    const first = Math.min(source.pageSize, rowCeiling - rows.length);
    const response = await fetch(endpointFor(source), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({query: source.queryDocument, variables: {first, cursor}}),
      signal,
    });
    requests += 1;
    if (!response.ok) throw new Error(`The Graph returned HTTP ${response.status}`);
    const payload = await response.json();
    if (!record(payload) || !record(payload.data)) throw new Error("The Graph returned an invalid response");
    if (Array.isArray(payload.errors) && payload.errors.length > 0) throw new Error("The Graph rejected the compiled query");
    const batch = payload.data[source.queryEntity];
    if (!Array.isArray(batch)) throw new Error(`The Graph response is missing ${source.queryEntity}`);
    finalBatchWasFull = batch.length === first;
    for (const item of batch) {
      if (!record(item) || typeof item.id !== "string") throw new Error("The Graph row is missing its compiled cursor");
      const projected = {data_network: source.dataNetwork};
      for (const projection of projectionsFor(source)) {
        writePath(projected, projection.outputPath, readPath(item, projection.fieldPath));
      }
      rows.push(projected);
    }
    if (batch.length < first) break;
    const next = batch.at(-1)?.id;
    if (typeof next !== "string" || next <= cursor) throw new Error("The Graph cursor did not advance");
    cursor = next;
  }
  if (source.rowLimit == null && rows.length >= source.maxRows && finalBatchWasFull) {
    throw new Error(`Live source ${source.id} exceeded the compiled row limit`);
  }
  if (requests >= source.maxRequests && rows.length < rowCeiling && finalBatchWasFull) {
    throw new Error(`Live source ${source.id} exceeded the compiled request limit`);
  }
  return {rows, requests};
}

function decimal(value) {
  const text = typeof value === "bigint" || typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error("Value is not an exact decimal");
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return {coefficient: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), scale: fraction.length};
}

function decimalText(value) {
  if (value.coefficient === 0n) return "0";
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const fraction = digits.slice(-value.scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${digits.slice(0, -value.scale)}${fraction ? `.${fraction}` : ""}`;
}

function align(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * 10n ** BigInt(scale - left.scale),
    right: right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function compare(type, left, right) {
  if (type === "integer") return BigInt(String(left)) < BigInt(String(right)) ? -1 : BigInt(String(left)) > BigInt(String(right)) ? 1 : 0;
  if (type === "decimal") {
    const values = align(decimal(left), decimal(right));
    return values.left < values.right ? -1 : values.left > values.right ? 1 : 0;
  }
  if (type === "timestamp") {
    const normalize = (value) => /^-?\d+$/.test(String(value)) ? BigInt(String(value)) : Date.parse(String(value));
    const a = normalize(left); const b = normalize(right);
    if (typeof a !== typeof b) throw new Error("Timestamp representations are incompatible");
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (type === "boolean") return left === right ? 0 : left ? 1 : -1;
  const a = type === "address" ? String(left).toLowerCase() : String(left);
  const b = type === "address" ? String(right).toLowerCase() : String(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

function fieldType(shape, name) {
  return shape.find((field) => field.name === name)?.type ?? "json";
}

function expressionType(expression, shape) {
  if (expression.op === "field") return fieldType(shape, expression.field);
  if (expression.op === "literal") return expression.valueType;
  if (["not", "and", "or", "eq", "ne", "lt", "lte", "gt", "gte"].includes(expression.op)) return "boolean";
  if (expression.op === "utc_date") return "date";
  if (["to_timestamp", "epoch_seconds_to_timestamp", "epoch_milliseconds_to_timestamp"].includes(expression.op)) return "timestamp";
  if (expression.op === "to_integer" || ["round", "floor", "ceil"].includes(expression.op)) return "integer";
  if (expression.op === "to_decimal" || expression.op === "safe_divide") return "decimal";
  if (["trim", "lower", "upper", "concat"].includes(expression.op)) return "string";
  if (expression.op === "if") return expressionType(expression.inputs[1], shape);
  if (expression.op === "coalesce") return expressionType(expression.inputs[0], shape);
  if (["add", "subtract", "multiply", "abs"].includes(expression.op)) return expression.inputs.some((input) => expressionType(input, shape) === "decimal") ? "decimal" : "integer";
  throw new Error(`Unsupported compiled map operator ${expression.op}`);
}

function evaluate(expression, row, shape) {
  if (expression.op === "field") return readPath(row, expression.field);
  if (expression.op === "literal") return expression.value;
  const inputs = expression.inputs ?? [];
  if (expression.op === "coalesce") {
    for (const input of inputs) {
      const value = evaluate(input, row, shape);
      if (value !== null && value !== undefined) return value;
    }
    return null;
  }
  if (expression.op === "and" || expression.op === "or") {
    const values = inputs.map((input) => evaluate(input, row, shape));
    return expression.op === "and" ? values.every((value) => value === true) : values.some((value) => value === true);
  }
  if (expression.op === "if") return evaluate(inputs[0], row, shape) ? evaluate(inputs[1], row, shape) : evaluate(inputs[2], row, shape);
  const values = inputs.map((input) => evaluate(input, row, shape));
  if (expression.op === "not") return !values[0];
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(expression.op)) {
    if (values[0] === null || values[1] === null) return null;
    const type = inputs[0]?.op === "field" ? fieldType(shape, inputs[0].field) : inputs[0]?.valueType ?? "string";
    const result = compare(type, values[0], values[1]);
    return expression.op === "eq" ? result === 0 : expression.op === "ne" ? result !== 0 : expression.op === "lt" ? result < 0 : expression.op === "lte" ? result <= 0 : expression.op === "gt" ? result > 0 : result >= 0;
  }
  if (expression.op === "trim") return String(values[0]).trim();
  if (expression.op === "lower") return String(values[0]).toLowerCase();
  if (expression.op === "upper") return String(values[0]).toUpperCase();
  if (expression.op === "concat") return values.map(String).join("");
  if (expression.op === "utc_date") {
    const value = /^-?\d+$/.test(String(values[0])) ? new Date(Number(values[0]) * 1000) : new Date(String(values[0]));
    return value.toISOString().slice(0, 10);
  }
  if (expression.op === "to_timestamp") return new Date(String(values[0])).toISOString();
  if (expression.op === "epoch_seconds_to_timestamp") return new Date(Number(BigInt(String(values[0])) * 1000n)).toISOString();
  if (expression.op === "epoch_milliseconds_to_timestamp") return new Date(Number(BigInt(String(values[0])))).toISOString();
  if (expression.op === "to_decimal") return decimalText(decimal(values[0]));
  if (expression.op === "to_integer") {
    const value = decimal(values[0]); const factor = 10n ** BigInt(value.scale);
    if (value.coefficient % factor !== 0n) throw new Error("A fractional value requires explicit rounding");
    return String(value.coefficient / factor);
  }
  if (["abs", "round", "floor", "ceil"].includes(expression.op)) {
    const value = decimal(values[0]); const factor = 10n ** BigInt(value.scale);
    if (expression.op === "abs") return decimalText({...value, coefficient: value.coefficient < 0n ? -value.coefficient : value.coefficient});
    let quotient = value.coefficient / factor; const remainder = value.coefficient % factor;
    if (expression.op === "floor" && remainder !== 0n && value.coefficient < 0n) quotient -= 1n;
    if (expression.op === "ceil" && remainder !== 0n && value.coefficient > 0n) quotient += 1n;
    if (expression.op === "round" && (remainder < 0n ? -remainder : remainder) * 2n >= factor) quotient += value.coefficient < 0n ? -1n : 1n;
    return String(quotient);
  }
  if (["add", "subtract", "multiply", "safe_divide"].includes(expression.op)) {
    const left = decimal(values[0]); const right = decimal(values[1]);
    if (expression.op === "multiply") return decimalText({coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale});
    if (expression.op === "safe_divide") {
      if (right.coefficient === 0n) return null;
      const scale = 12;
      return decimalText({coefficient: left.coefficient * 10n ** BigInt(right.scale + scale) / right.coefficient, scale: left.scale + scale});
    }
    const values = align(left, right);
    return decimalText({coefficient: expression.op === "add" ? values.left + values.right : values.left - values.right, scale: values.scale});
  }
  throw new Error(`Unsupported compiled map operator ${expression.op}`);
}

function filterRows(rows, predicate, shape) {
  const apply = (row, condition) => {
    const actual = row[condition.field];
    if (condition.operator === "is_null") return actual === null || actual === undefined;
    if (condition.operator === "is_not_null") return actual !== null && actual !== undefined;
    if (actual === null || actual === undefined) return false;
    const type = fieldType(shape, condition.field);
    if (condition.operator === "in" || condition.operator === "not_in") {
      const found = condition.values.some((value) => compare(type, actual, value) === 0);
      return condition.operator === "in" ? found : !found;
    }
    if (condition.operator === "between") return compare(type, actual, condition.values[0]) >= 0 && compare(type, actual, condition.values[1]) <= 0;
    const result = compare(type, actual, condition.value);
    return condition.operator === "eq" ? result === 0 : condition.operator === "ne" ? result !== 0 : condition.operator === "lt" ? result < 0 : condition.operator === "lte" ? result <= 0 : condition.operator === "gt" ? result > 0 : result >= 0;
  };
  return rows.filter((row) => {
    const results = predicate.conditions.map((condition) => apply(row, condition));
    return predicate.combinator === "and" ? results.every(Boolean) : results.some(Boolean);
  });
}

function aggregate(rows, config, shape) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(config.groupBy.map((field) => row[field]));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const outputShape = config.groupBy.map((name) => shape.find((field) => field.name === name));
  for (const measure of config.measures) {
    const input = shape.find((field) => field.name === measure.field);
    outputShape.push({name: measure.name, type: measure.op.startsWith("count") ? "integer" : measure.op === "average" ? "decimal" : input.type, nullable: false, unit: input?.unit ?? null});
  }
  const output = [...groups.values()].map((group) => {
    const row = Object.fromEntries(config.groupBy.map((name) => [name, group[0][name]]));
    for (const measure of config.measures) {
      const values = measure.field === null ? [] : group.map((item) => item[measure.field]).filter((value) => value !== null && value !== undefined);
      if (measure.op === "count_rows") row[measure.name] = String(group.length);
      else if (measure.op === "count_distinct") row[measure.name] = String(new Set(values.map(JSON.stringify)).size);
      else if (measure.op === "sum" || measure.op === "average") {
        let sum = {coefficient: 0n, scale: 0};
        for (const value of values) { const next = align(sum, decimal(value)); sum = {coefficient: next.left + next.right, scale: next.scale}; }
        row[measure.name] = measure.op === "sum" ? decimalText(sum) : values.length === 0 ? null : decimalText({coefficient: sum.coefficient * 1_000_000n / BigInt(values.length), scale: sum.scale + 6});
      } else if (values.length === 0) row[measure.name] = null;
      else row[measure.name] = values.reduce((selected, value) => {
        const result = compare(fieldType(shape, measure.field), value, selected);
        return measure.op === "min" ? result < 0 ? value : selected : result > 0 ? value : selected;
      });
    }
    return row;
  });
  return {rows: output, shape: outputShape};
}

function sortRows(rows, config, shape) {
  const sorted = rows.map((row, index) => ({row, index})).sort((left, right) => {
    for (const ordering of config.orderBy) {
      const a = left.row[ordering.field]; const b = right.row[ordering.field];
      if (a === null || a === undefined || b === null || b === undefined) {
        if ((a === null || a === undefined) && (b === null || b === undefined)) continue;
        return (a === null || a === undefined) === (ordering.nulls === "first") ? -1 : 1;
      }
      const result = compare(fieldType(shape, ordering.field), a, b);
      if (result !== 0) return ordering.direction === "asc" ? result : -result;
    }
    return left.index - right.index;
  }).map(({row}) => row);
  return config.limit === null ? sorted : sorted.slice(0, config.limit);
}

async function execute(signal) {
  const rowsByNode = new Map(); const shapes = new Map();
  const pending = new Set(plan.dag.nodes.map((node) => node.id));
  let sourceRequests = 0; let sourceRows = 0;
  while (pending.size > 0) {
    let progressed = false;
    for (const node of plan.dag.nodes) {
      if (!pending.has(node.id)) continue;
      const incoming = new Map(plan.dag.edges.filter((edge) => edge.toNode === node.id).map((edge) => [edge.toPort, edge.fromNode]));
      if ([...incoming.values()].some((id) => !rowsByNode.has(id))) continue;
      const input = (portName) => rowsByNode.get(incoming.get(portName));
      const shape = (portName) => shapes.get(incoming.get(portName));
      if (node.type === "source") {
        const source = plan.sources.find((item) => item.id === (node.config.sourceId ?? node.config.sourceKey));
        const fetched = await fetchSource(source, signal);
        rowsByNode.set(node.id, fetched.rows); shapes.set(node.id, node.outputSchema.fields);
        sourceRequests += fetched.requests; sourceRows += fetched.rows.length;
      } else if (node.type === "filter") {
        const rows = Object.prototype.hasOwnProperty.call(node.config, "predicate")
          ? filterRows(input("rows"), node.config.predicate, shape("rows"))
          : input("rows").filter((row) => evaluate(node.config.expression, row, shape("rows")) === true);
        rowsByNode.set(node.id, rows); shapes.set(node.id, shape("rows"));
      } else if (node.type === "map") {
        const rows = input("rows").map((row) => {
          const result = node.config.mode === "extend" ? {...row} : {};
          for (const field of node.config.fields) result[field.name] = evaluate(field.expression, row, shape("rows"));
          return result;
        });
        const outputShape = node.config.mode === "extend" ? shape("rows").map((field) => ({...field})) : [];
        for (const definition of node.config.fields) {
          const field = {
            name: definition.name,
            type: expressionType(definition.expression, shape("rows")),
            nullable: true,
            unit: definition.unit ?? null,
          };
          const index = outputShape.findIndex((item) => item.name === definition.name);
          if (index < 0) outputShape.push(field); else outputShape[index] = field;
        }
        rowsByNode.set(node.id, rows); shapes.set(node.id, outputShape);
      } else if (node.type === "aggregate") {
        const result = aggregate(input("rows"), node.config, shape("rows")); rowsByNode.set(node.id, result.rows); shapes.set(node.id, result.shape);
      } else if (node.type === "sort") {
        rowsByNode.set(node.id, sortRows(input("rows"), node.config, shape("rows"))); shapes.set(node.id, shape("rows"));
      } else if (node.type === "union") {
        const discriminator = node.config.sourceDiscriminator;
        rowsByNode.set(node.id, discriminator === null
          ? [...input("left"), ...input("right")]
          : [...input("left").map((row) => ({...row, [discriminator]: "left"})), ...input("right").map((row) => ({...row, [discriminator]: "right"}))]);
        shapes.set(node.id, discriminator === null ? shape("left") : [...shape("left"), {name: discriminator, type: "string", nullable: false, unit: null}]);
      } else if (node.type === "join") {
        const right = input("right"); const index = new Map(right.map((row) => [JSON.stringify(node.config.keys.map((key) => row[key.right])), row]));
        const rows = input("left").flatMap((left) => {
          const found = index.get(JSON.stringify(node.config.keys.map((key) => left[key.left])));
          if (!found && node.config.type === "inner") return [];
          return [{...left, ...Object.fromEntries(Object.entries(found ?? {}).map(([name, value]) => [`${node.config.rightPrefix}${name}`, value]))}];
        });
        const rightKeys = new Set(node.config.keys.map((key) => key.right));
        const outputShape = [...shape("left"), ...shape("right")
          .filter((field) => !(rightKeys.has(field.name) && shape("left").some((item) => item.name === field.name)))
          .map((field) => ({...field, name: `${node.config.rightPrefix}${field.name}`, nullable: node.config.type === "left" || field.nullable}))];
        rowsByNode.set(node.id, rows); shapes.set(node.id, outputShape);
      } else if (node.type === "output") {
        rowsByNode.set(node.id, input("rows").map((row) => Object.fromEntries(node.config.fields.map((field) => [field, row[field]])))); shapes.set(node.id, plan.outputSchema.fields);
      }
      pending.delete(node.id); progressed = true;
    }
    if (!progressed) throw new Error("The immutable DAG could not be scheduled");
  }
  const output = plan.dag.nodes.find((node) => node.type === "output");
  return {rows: rowsByNode.get(output.id), sourceRequests, sourceRows, queriedAt: new Date().toISOString()};
}

function authorized(request) {
  const supplied = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const left = Buffer.from(supplied); const right = Buffer.from(privateApiKey);
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {"content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store"});
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") return json(response, 200, {status: "ok"});
  if (request.method !== "GET") return json(response, 405, {error: {code: "METHOD_NOT_ALLOWED"}});
  if (!authorized(request)) return json(response, 401, {error: {code: "API_KEY_INVALID"}});
  try {
    const url = new URL(request.url, "http://private.sprue");
    const limit = Math.min(10_000, Math.max(1, Number(url.searchParams.get("limit") ?? "1000")));
    if (!Number.isInteger(limit)) return json(response, 400, {error: {code: "LIMIT_INVALID"}});
    const result = await execute(AbortSignal.timeout(30_000));
    return json(response, 200, {data: result.rows.slice(0, limit), meta: {serveMode: "live", specHash: expectedSpecHash, queriedAt: result.queriedAt, sourceRequests: result.sourceRequests, sourceRows: result.sourceRows, returnedRows: Math.min(limit, result.rows.length)}});
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Private execution failed");
    return json(response, 502, {error: {code: "LIVE_EXECUTION_FAILED", message: "The live data request could not be completed"}});
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Sprue private live API listening on :${server.address().port}`));
