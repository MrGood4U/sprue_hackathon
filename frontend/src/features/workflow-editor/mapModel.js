const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;
const scalarTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]);
const textualTypes = new Set(["string", "id", "address", "bytes"]);
const numericTypes = new Set(["integer", "decimal"]);
const unaryOperations = new Set([
  "not",
  "utc_date",
  "to_integer",
  "to_decimal",
  "to_timestamp",
  "epoch_seconds_to_timestamp",
  "epoch_milliseconds_to_timestamp",
  "trim",
  "lower",
  "upper",
  "abs",
  "round",
  "floor",
  "ceil",
]);
const binaryOperations = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]);
const variadicOperations = new Set(["and", "or", "concat", "coalesce"]);
const editorUnaryOperations = new Set([...unaryOperations].filter((operation) => operation !== "not"));

const transformDefinitions = [
  {kind: "field", group: "basic", accepts: () => true},
  {kind: "to_integer", group: "type", accepts: (type) => ["string", "integer", "decimal"].includes(type)},
  {kind: "to_decimal", group: "type", accepts: (type) => ["string", "integer", "decimal"].includes(type)},
  {kind: "to_timestamp", group: "type", accepts: (type) => type === "string"},
  {kind: "epoch_seconds_to_timestamp", group: "time", accepts: (type) => ["string", "integer"].includes(type)},
  {kind: "epoch_milliseconds_to_timestamp", group: "time", accepts: (type) => ["string", "integer"].includes(type)},
  {kind: "utc_date", group: "time", accepts: (type) => ["timestamp", "integer", "string"].includes(type)},
  {kind: "trim", group: "text", accepts: (type) => textualTypes.has(type)},
  {kind: "lower", group: "text", accepts: (type) => textualTypes.has(type)},
  {kind: "upper", group: "text", accepts: (type) => textualTypes.has(type)},
  {kind: "concat", group: "text", accepts: (type) => textualTypes.has(type)},
  {kind: "coalesce", group: "null", accepts: (type) => type !== "json"},
  {kind: "abs", group: "numeric", accepts: (type) => numericTypes.has(type)},
  {kind: "round", group: "numeric", accepts: (type) => numericTypes.has(type)},
  {kind: "floor", group: "numeric", accepts: (type) => numericTypes.has(type)},
  {kind: "ceil", group: "numeric", accepts: (type) => numericTypes.has(type)},
];

function normalizeType(type) {
  if (type === "count") return "integer";
  return scalarTypes.has(type) ? type : null;
}

function compatible(left, right) {
  if (left === right) return true;
  return (textualTypes.has(left) && textualTypes.has(right)) || (numericTypes.has(left) && numericTypes.has(right));
}

function promotedType(left, right) {
  if (left === right) return left;
  if (numericTypes.has(left) && numericTypes.has(right)) return "decimal";
  if (textualTypes.has(left) && textualTypes.has(right)) return "string";
  return null;
}

function literalIsValid(type, value) {
  if (value === null) return true;
  if (type === "boolean") return typeof value === "boolean";
  if (type === "json") return ["string", "number", "boolean"].includes(typeof value);
  if (typeof value !== "string") return false;
  const text = String(value);
  if (type === "integer") return /^-?(?:0|[1-9]\d*)$/.test(text);
  if (type === "decimal") return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text);
  if (type === "timestamp") return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) && !Number.isNaN(Date.parse(text));
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parsed = new Date(`${text}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
  }
  return typeof value === "string";
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length
    && expectedKeys.slice().sort().every((key, index) => key === actualKeys[index]);
}

function expressionResult(expression, inputByName, budget = {nodes: 0}, depth = 0) {
  if (!expression || Array.isArray(expression) || typeof expression !== "object" || depth > 8 || ++budget.nodes > 128) {
    return {error: "MAP_EXPRESSION_INVALID"};
  }
  if (expression.op === "field") {
    if (!hasExactKeys(expression, ["op", "field"]) || typeof expression.field !== "string" || expression.field.length === 0) {
      return {error: "MAP_EXPRESSION_INVALID"};
    }
    const field = inputByName.get(expression.field);
    return field ? {field} : {error: "MAP_SOURCE_FIELD_UNKNOWN"};
  }
  if (expression.op === "literal") {
    if (!hasExactKeys(expression, ["op", "valueType", "value"])) return {error: "MAP_EXPRESSION_INVALID"};
    const type = normalizeType(expression.valueType);
    if (!type || !literalIsValid(type, expression.value)) {
      return {error: "MAP_EXPRESSION_INVALID"};
    }
    return {field: {name: "expression", type, nullable: expression.value === null, unit: null}};
  }
  if (!hasExactKeys(expression, ["op", "inputs"])) return {error: "MAP_EXPRESSION_INVALID"};
  const inputs = Array.isArray(expression.inputs) ? expression.inputs : [];
  if ((unaryOperations.has(expression.op) && inputs.length !== 1)
    || (binaryOperations.has(expression.op) && inputs.length !== 2)
    || (variadicOperations.has(expression.op) && (inputs.length < 2 || inputs.length > 8))
    || (expression.op === "if" && inputs.length !== 3)
    || (!unaryOperations.has(expression.op) && !binaryOperations.has(expression.op) && !variadicOperations.has(expression.op) && expression.op !== "if")) {
    return {error: "MAP_EXPRESSION_INVALID"};
  }
  const inferred = inputs.map((input) => expressionResult(input, inputByName, budget, depth + 1));
  const failure = inferred.find((item) => item.error);
  if (failure) return failure;
  const fields = inferred.map((item) => item.field);
  if (["not", "and", "or"].includes(expression.op)) {
    if (fields.some((field) => field.type !== "boolean")) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "boolean", nullable: fields.some((field) => field.nullable), unit: null}};
  }
  if (expression.op === "to_integer") {
    if (!["integer", "decimal", "string"].includes(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {...fields[0], name: "expression", type: "integer"}};
  }
  if (expression.op === "to_decimal") {
    if (!["integer", "decimal", "string"].includes(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {...fields[0], name: "expression", type: "decimal"}};
  }
  if (expression.op === "to_timestamp") {
    if (fields[0].type !== "string") return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "timestamp", nullable: fields[0].nullable, unit: null}};
  }
  if (["epoch_seconds_to_timestamp", "epoch_milliseconds_to_timestamp"].includes(expression.op)) {
    if (!["integer", "string"].includes(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "timestamp", nullable: fields[0].nullable, unit: null}};
  }
  if (["trim", "lower", "upper"].includes(expression.op)) {
    if (!textualTypes.has(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "string", nullable: fields[0].nullable, unit: null}};
  }
  if (["abs", "round", "floor", "ceil"].includes(expression.op)) {
    if (!numericTypes.has(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {
      field: {
        name: "expression",
        type: expression.op === "abs" ? fields[0].type : "integer",
        nullable: fields[0].nullable,
        unit: fields[0].unit,
      },
    };
  }
  if (expression.op === "concat") {
    if (fields.some((field) => !textualTypes.has(field.type))) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "string", nullable: fields.some((field) => field.nullable), unit: null}};
  }
  if (expression.op === "coalesce") {
    const type = fields.slice(1).reduce((current, field) => current && promotedType(current, field.type), fields[0].type);
    if (!type) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {
      field: {
        name: "expression",
        type,
        nullable: fields.every((field) => field.nullable),
        unit: fields.every((field) => field.unit === fields[0].unit) ? fields[0].unit : null,
      },
    };
  }
  if (["eq", "ne", "lt", "lte", "gt", "gte"].includes(expression.op)) {
    if (!compatible(fields[0].type, fields[1].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "boolean", nullable: fields.some((field) => field.nullable), unit: null}};
  }
  if (["add", "subtract", "multiply", "safe_divide"].includes(expression.op)) {
    if (fields.some((field) => !numericTypes.has(field.type))) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {
      field: {
        name: "expression",
        type: expression.op === "safe_divide" || fields.some((field) => field.type === "decimal") ? "decimal" : "integer",
        nullable: fields.some((field) => field.nullable) || expression.op === "safe_divide",
        unit: expression.op === "add" || expression.op === "subtract" ? fields[0].unit : null,
      },
    };
  }
  if (expression.op === "utc_date") {
    if (!["timestamp", "integer", "string"].includes(fields[0].type)) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "date", nullable: fields[0].nullable, unit: null}};
  }
  if (fields[0].type !== "boolean" || !compatible(fields[1].type, fields[2].type)) {
    return {error: "MAP_EXPRESSION_TYPE_INVALID"};
  }
  return {
    field: {
      name: "expression",
      type: promotedType(fields[1].type, fields[2].type),
      nullable: fields.some((field) => field.nullable),
      unit: fields[1].unit === fields[2].unit ? fields[1].unit : null,
    },
  };
}

export function inferMapExpressionField(expression, inputFields) {
  return inspectMapExpression(expression, inputFields).field ?? null;
}

export function inspectMapExpression(expression, inputFields) {
  return expressionResult(expression, new Map(inputFields.map((field) => [field.name, {...field, type: normalizeType(field.type)}])));
}

export function mapExpressionFieldNames(expression) {
  const names = [];
  const seen = new Set();
  const budget = {nodes: 0};
  const visit = (candidate, depth = 0) => {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object" || depth > 8 || ++budget.nodes > 128) return;
    if (candidate.op === "field" && typeof candidate.field === "string" && !seen.has(candidate.field)) {
      seen.add(candidate.field);
      names.push(candidate.field);
      return;
    }
    if (Array.isArray(candidate.inputs)) candidate.inputs.forEach((input) => visit(input, depth + 1));
  };
  visit(expression);
  return names;
}

export function formatMapExpression(expression) {
  const binarySymbols = {
    eq: "=",
    ne: "!=",
    lt: "<",
    lte: "<=",
    gt: ">",
    gte: ">=",
    add: "+",
    subtract: "-",
    multiply: "*",
    safe_divide: "/",
  };
  const budget = {nodes: 0};
  const format = (candidate, depth = 0) => {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object" || depth > 8 || ++budget.nodes > 128) return "...";
    if (candidate.op === "field") return candidate.field ?? "?";
    if (candidate.op === "literal") return candidate.value === null ? "null" : JSON.stringify(candidate.value);
    const inputs = Array.isArray(candidate.inputs) ? candidate.inputs.map((input) => format(input, depth + 1)) : [];
    if (candidate.op === "not") return `NOT (${inputs[0] ?? "?"})`;
    if (candidate.op === "and" || candidate.op === "or") return `(${inputs.join(` ${candidate.op.toUpperCase()} `)})`;
    if (binarySymbols[candidate.op]) return `(${inputs[0] ?? "?"} ${binarySymbols[candidate.op]} ${inputs[1] ?? "?"})`;
    if (candidate.op === "if") return `IF(${inputs.join(", ")})`;
    return `${candidate.op ?? "?"}(${inputs.join(", ")})`;
  };
  return format(expression);
}

export function editableMapConfig(config) {
  if (config?.recipe || (Array.isArray(config?.fields) && ["extend", "project"].includes(config.mode))) return config;
  if (config?.mapping && typeof config.mapping === "object") {
    return {
      mode: "project",
      fields: Object.entries(config.mapping).map(([name, sourceField]) => ({
        name,
        expression: {op: "field", field: sourceField},
      })),
    };
  }
  return {mode: "extend", fields: []};
}

export function mapExpressionEditor(expression) {
  if (expression?.op === "field" && typeof expression.field === "string") {
    return {kind: "field", sourceField: expression.field, secondaryField: null, fallbackValue: null};
  }
  if (editorUnaryOperations.has(expression?.op) && expression.inputs?.length === 1
    && expression.inputs[0]?.op === "field" && typeof expression.inputs[0].field === "string") {
    return {kind: expression.op, sourceField: expression.inputs[0].field, secondaryField: null, fallbackValue: null};
  }
  if (expression?.op === "concat" && expression.inputs?.length === 2
    && expression.inputs.every((input) => input?.op === "field" && typeof input.field === "string")) {
    return {
      kind: "concat",
      sourceField: expression.inputs[0].field,
      secondaryField: expression.inputs[1].field,
      fallbackValue: null,
    };
  }
  if (expression?.op === "coalesce" && expression.inputs?.length === 2
    && expression.inputs[0]?.op === "field" && typeof expression.inputs[0].field === "string"
    && expression.inputs[1]?.op === "literal") {
    return {
      kind: "coalesce",
      sourceField: expression.inputs[0].field,
      secondaryField: null,
      fallbackValue: expression.inputs[1].value,
    };
  }
  return {kind: "advanced", sourceField: null, secondaryField: null, fallbackValue: null};
}

export function defaultMapFallbackValue(type) {
  if (type === "count") type = "integer";
  if (type === "boolean") return false;
  if (type === "integer" || type === "decimal") return "0";
  if (type === "timestamp") return "1970-01-01T00:00:00.000Z";
  if (type === "date") return "1970-01-01";
  return "";
}

export function mapTransformsForField(field) {
  const type = normalizeType(field?.type);
  if (!type) return [];
  return transformDefinitions.filter((definition) => definition.accepts(type));
}

export function mapExpressionForEditor(kind, sourceField, options = {}) {
  if (editorUnaryOperations.has(kind)) return {op: kind, inputs: [{op: "field", field: sourceField}]};
  if (kind === "concat") {
    return {
      op: "concat",
      inputs: [
        {op: "field", field: sourceField},
        {op: "field", field: options.secondaryField ?? sourceField},
      ],
    };
  }
  if (kind === "coalesce") {
    const sourceType = normalizeType(options.sourceType) ?? "string";
    return {
      op: "coalesce",
      inputs: [
        {op: "field", field: sourceField},
        {op: "literal", valueType: sourceType, value: options.fallbackValue ?? defaultMapFallbackValue(sourceType)},
      ],
    };
  }
  return {op: "field", field: sourceField};
}

export function createMapDefinition(inputFields, existingNames = []) {
  const source = inputFields[0];
  if (!source) return null;
  const used = new Set(existingNames);
  const base = `${source.name}_mapped`;
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  return {name, expression: {op: "field", field: source.name}};
}

export function validateMapConfig(config, inputFields) {
  if (config?.recipe) return [];
  if (config?.mapping && typeof config.mapping === "object") return [];
  if (!config || !["extend", "project"].includes(config.mode) || !Array.isArray(config.fields)) {
    return [{fieldIndex: null, code: "MAP_CONFIG_INVALID"}];
  }
  const errors = [];
  if (config.fields.length < 1 || config.fields.length > 32) {
    errors.push({fieldIndex: null, code: "MAP_FIELD_COUNT_INVALID"});
  }
  const inputByName = new Map(inputFields.map((field) => [field.name, field]));
  const names = new Set();
  config.fields.forEach((definition, fieldIndex) => {
    if (!definition || typeof definition.name !== "string" || !identifierPattern.test(definition.name)) {
      errors.push({fieldIndex, code: "MAP_FIELD_NAME_INVALID"});
    } else if (names.has(definition.name)) {
      errors.push({fieldIndex, code: "MAP_FIELD_NAME_DUPLICATED"});
    } else {
      names.add(definition.name);
    }
    const result = expressionResult(definition?.expression, inputByName);
    if (result.error) errors.push({fieldIndex, code: result.error});
  });
  return errors;
}
