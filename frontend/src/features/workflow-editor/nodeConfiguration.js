const configurationPrefixes = {
  filter: "FILTER_",
  map: "MAP_",
  aggregate: "AGGREGATE_",
  sort: "SORT_",
};

function hasOwnEntries(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function hasConfiguredShape(node) {
  const config = node?.config ?? {};
  if (node?.type === "source") return Boolean(config.sourceId || config.sourceKey);
  if (node?.type === "filter") {
    return Boolean(
      config.expression
      || config.window
      || (Array.isArray(config.predicate?.conditions) && config.predicate.conditions.length > 0),
    );
  }
  if (node?.type === "map") {
    return Boolean(config.recipe)
      || hasOwnEntries(config.mapping)
      || (["extend", "project"].includes(config.mode) && Array.isArray(config.fields) && config.fields.length > 0);
  }
  if (node?.type === "aggregate") {
    return (Array.isArray(config.measures) && config.measures.length > 0) || hasOwnEntries(config.measures);
  }
  if (node?.type === "sort") return Array.isArray(config.orderBy) && config.orderBy.length > 0;
  return true;
}

function isConfigurationError(node, error) {
  if (error?.nodeId !== node?.id) return false;
  if (node.type === "source") return error.code === "SOURCE_CONFIG";
  const prefix = configurationPrefixes[node.type];
  return Boolean(prefix) && typeof error.code === "string" && error.code.startsWith(prefix);
}

export function isNodeConfigured(node, validation = []) {
  if (!hasConfiguredShape(node)) return false;
  return !validation.some((error) => isConfigurationError(node, error));
}
