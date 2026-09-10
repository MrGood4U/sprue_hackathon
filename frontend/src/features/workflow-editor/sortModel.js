const maximumOrderKeys = 8;
const maximumTopK = 10_000;

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function createSortConfig(fields) {
  return {
    orderBy: fields.length > 0 ? [{field: fields[0].name, direction: "asc", nulls: "last"}] : [],
    limit: null,
  };
}

export function validateSortConfig(config, fields) {
  if (!exactKeys(config, ["orderBy", "limit"])) {
    return [{orderIndex: null, code: "SORT_CONFIG_INVALID"}];
  }
  const errors = [];
  if (!Array.isArray(config.orderBy) || config.orderBy.length < 1 || config.orderBy.length > maximumOrderKeys) {
    errors.push({orderIndex: null, code: "SORT_KEY_COUNT_INVALID"});
    return errors;
  }
  if (config.limit !== null && (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > maximumTopK)) {
    errors.push({orderIndex: null, code: "SORT_LIMIT_INVALID"});
  }
  const fieldNames = new Set(fields.map((field) => field.name));
  const seen = new Set();
  config.orderBy.forEach((ordering, orderIndex) => {
    if (!exactKeys(ordering, ["field", "direction", "nulls"])) {
      errors.push({orderIndex, code: "SORT_KEY_INVALID"});
      return;
    }
    if (!fieldNames.has(ordering.field)) errors.push({orderIndex, code: "SORT_FIELD_UNKNOWN"});
    if (seen.has(ordering.field)) errors.push({orderIndex, code: "SORT_FIELD_DUPLICATED"});
    seen.add(ordering.field);
    if (ordering.direction !== "asc" && ordering.direction !== "desc") {
      errors.push({orderIndex, code: "SORT_DIRECTION_INVALID"});
    }
    if (ordering.nulls !== "first" && ordering.nulls !== "last") {
      errors.push({orderIndex, code: "SORT_NULLS_INVALID"});
    }
  });
  return errors;
}
