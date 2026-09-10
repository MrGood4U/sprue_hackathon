const outputNamePattern = /^[a-z][a-z0-9_]{0,99}$/;
const maximumGroupFields = 16;
const maximumMeasures = 32;
const numericTypes = new Set(["integer", "decimal", "count"]);

const operations = [
  {op: "count_rows", requiresField: false, accepts: () => true},
  {op: "count_distinct", requiresField: true, accepts: () => true},
  {op: "sum", requiresField: true, accepts: (field) => numericTypes.has(field?.type)},
  {op: "min", requiresField: true, accepts: () => true},
  {op: "max", requiresField: true, accepts: () => true},
  {op: "average", requiresField: true, accepts: (field) => numericTypes.has(field?.type)},
];

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function operationDefinition(op) {
  return operations.find((candidate) => candidate.op === op) ?? null;
}

function uniqueName(base, usedNames) {
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  return name;
}

export function aggregateOperations() {
  return operations.map(({op, requiresField}) => ({op, requiresField}));
}

export function aggregateFieldsForOperation(fields, op) {
  const definition = operationDefinition(op);
  if (!definition?.requiresField) return [];
  return fields.filter((field) => definition.accepts(field));
}

export function createAggregateMeasure(existingNames = []) {
  return {
    name: uniqueName("row_count", new Set(existingNames)),
    op: "count_rows",
    field: null,
  };
}

export function editableAggregateConfig(config) {
  const groupBy = Array.isArray(config?.groupBy) ? [...config.groupBy] : [];
  if (Array.isArray(config?.measures)) {
    return {
      groupBy,
      measures: config.measures.map((measure) => typeof measure === "object" && measure !== null
        ? {name: measure.name, op: measure.op, field: measure.field ?? null}
        : {name: String(measure ?? ""), op: "count_rows", field: null}),
    };
  }
  if (config?.measures && typeof config.measures === "object") {
    return {
      groupBy,
      measures: Object.entries(config.measures).map(([name, measure]) => ({
        name,
        op: measure?.op,
        field: measure?.field ?? null,
      })),
    };
  }
  return {groupBy, measures: []};
}

export function validateAggregateConfig(config, fields) {
  if (!exactKeys(config, ["groupBy", "measures"])) {
    return [{groupIndex: null, measureIndex: null, code: "AGGREGATE_CONFIG_INVALID"}];
  }
  const errors = [];
  if (fields.length === 0) {
    errors.push({groupIndex: null, measureIndex: null, code: "AGGREGATE_INPUT_SCHEMA"});
  }
  if (!Array.isArray(config.groupBy) || config.groupBy.length > maximumGroupFields) {
    errors.push({groupIndex: null, measureIndex: null, code: "AGGREGATE_GROUP_COUNT_INVALID"});
  }
  if (!Array.isArray(config.measures) || config.measures.length < 1 || config.measures.length > maximumMeasures) {
    errors.push({groupIndex: null, measureIndex: null, code: "AGGREGATE_MEASURE_COUNT_INVALID"});
  }
  if (!Array.isArray(config.groupBy) || !Array.isArray(config.measures)) return errors;

  const inputByName = new Map(fields.map((field) => [field.name, field]));
  const outputNames = new Set();
  config.groupBy.forEach((fieldName, groupIndex) => {
    if (typeof fieldName !== "string" || !inputByName.has(fieldName)) {
      errors.push({groupIndex, measureIndex: null, code: "AGGREGATE_GROUP_FIELD_UNKNOWN"});
    }
    if (outputNames.has(fieldName)) {
      errors.push({groupIndex, measureIndex: null, code: "AGGREGATE_GROUP_FIELD_DUPLICATED"});
    }
    outputNames.add(fieldName);
  });

  config.measures.forEach((measure, measureIndex) => {
    if (!exactKeys(measure, ["name", "op", "field"])) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_MEASURE_INVALID"});
      return;
    }
    if (typeof measure.name !== "string" || !outputNamePattern.test(measure.name)) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_OUTPUT_NAME_INVALID"});
    } else if (outputNames.has(measure.name)) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_OUTPUT_NAME_DUPLICATED"});
    }
    outputNames.add(measure.name);

    const operation = operationDefinition(measure.op);
    if (!operation) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_OPERATION_INVALID"});
      return;
    }
    if (!operation.requiresField) {
      if (measure.field !== null) errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_FIELD_UNEXPECTED"});
      return;
    }
    const field = typeof measure.field === "string" ? inputByName.get(measure.field) : null;
    if (!field) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_FIELD_UNKNOWN"});
    } else if (!operation.accepts(field)) {
      errors.push({groupIndex: null, measureIndex, code: "AGGREGATE_FIELD_TYPE_INVALID"});
    }
  });
  return errors;
}
