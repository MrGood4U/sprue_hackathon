const identifierPattern = /^[a-z][a-z0-9_]{0,99}$/;
const scalarTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]);
const textualTypes = new Set(["string", "id", "address", "bytes"]);
const numericTypes = new Set(["integer", "decimal"]);

function normalizeType(type) {
  if (type === "count") return "integer";
  return scalarTypes.has(type) ? type : null;
}

function compatible(left, right) {
  if (left === right) return true;
  return (textualTypes.has(left) && textualTypes.has(right)) || (numericTypes.has(left) && numericTypes.has(right));
}

function expressionResult(expression, inputByName, depth = 0) {
  if (!expression || typeof expression !== "object" || depth > 8) return {error: "MAP_EXPRESSION_INVALID"};
  if (expression.op === "field") {
    const field = inputByName.get(expression.field);
    return field ? {field} : {error: "MAP_SOURCE_FIELD_UNKNOWN"};
  }
  if (expression.op === "literal") {
    const type = normalizeType(expression.valueType);
    if (!type || (expression.value !== null && !["string", "number", "boolean"].includes(typeof expression.value))) {
      return {error: "MAP_EXPRESSION_INVALID"};
    }
    return {field: {name: "expression", type, nullable: expression.value === null, unit: null}};
  }
  const inputs = Array.isArray(expression.inputs) ? expression.inputs : [];
  const unary = new Set(["not", "utc_date"]);
  const binary = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "add", "subtract", "multiply", "safe_divide"]);
  if ((unary.has(expression.op) && inputs.length !== 1)
    || (binary.has(expression.op) && inputs.length !== 2)
    || (["and", "or"].includes(expression.op) && (inputs.length < 2 || inputs.length > 8))
    || (expression.op === "if" && inputs.length !== 3)
    || (!unary.has(expression.op) && !binary.has(expression.op) && !["and", "or", "if"].includes(expression.op))) {
    return {error: "MAP_EXPRESSION_INVALID"};
  }
  const inferred = inputs.map((input) => expressionResult(input, inputByName, depth + 1));
  const failure = inferred.find((item) => item.error);
  if (failure) return failure;
  const fields = inferred.map((item) => item.field);
  if (["not", "and", "or"].includes(expression.op)) {
    if (fields.some((field) => field.type !== "boolean")) return {error: "MAP_EXPRESSION_TYPE_INVALID"};
    return {field: {name: "expression", type: "boolean", nullable: fields.some((field) => field.nullable), unit: null}};
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
      type: fields[1].type,
      nullable: fields[1].nullable || fields[2].nullable,
      unit: fields[1].unit === fields[2].unit ? fields[1].unit : null,
    },
  };
}

export function inferMapExpressionField(expression, inputFields) {
  return expressionResult(expression, new Map(inputFields.map((field) => [field.name, field]))).field ?? null;
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
    return {kind: "field", sourceField: expression.field};
  }
  if (expression?.op === "utc_date" && expression.inputs?.[0]?.op === "field" && typeof expression.inputs[0].field === "string") {
    return {kind: "utc_date", sourceField: expression.inputs[0].field};
  }
  return {kind: "advanced", sourceField: null};
}

export function mapExpressionForEditor(kind, sourceField) {
  if (kind === "utc_date") return {op: "utc_date", inputs: [{op: "field", field: sourceField}]};
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
