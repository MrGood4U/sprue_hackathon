import {createHash} from "node:crypto";
import {
  Kind,
  parse,
  type FieldDefinitionNode,
  type ObjectTypeDefinitionNode,
  type ObjectTypeExtensionNode,
  type TypeNode,
} from "graphql";
import {z} from "zod";
import type {
  GraphDeploymentActivity,
  GraphDiscoveredSourceCandidate,
  GraphFieldRequirement,
  GraphInspectedField,
  GraphPlanningMcpPort,
  GraphRuntimeQueryField,
  GraphRuntimeSchemaPort,
  GraphSchemaCachePort,
  GraphSchemaEntityInspection,
  GraphSemanticValueType,
  GraphSourceDiscoveryPort,
  GraphSourceDiscoveryRequest,
  GraphSourceDiscoveryResult,
  GraphSourceDiscoveryNeed,
} from "./types.js";
import {MemoryGraphSchemaCache} from "./schema-cache.js";
import {graphNetworkAliases} from "./network-catalog.js";

const identifier = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/);
const needIdentifier = z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_-]*$/);
const semanticValueType = z.enum([
  "boolean",
  "string",
  "id",
  "address",
  "bytes",
  "integer",
  "decimal",
  "timestamp",
  "date",
  "json",
]);
const fieldRequirementSchema = z.object({
  id: identifier,
  description: z.string().trim().min(1).max(1000),
  expectedType: semanticValueType,
  unit: z.string().trim().max(40).nullable(),
  required: z.boolean(),
  allowNullable: z.boolean(),
  hints: z.array(z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/)).min(1).max(8),
}).strict();
const needSchema = z.object({
  id: needIdentifier,
  dataNetwork: z.string().trim().min(3).max(100).regex(/^[a-z0-9]+:[A-Za-z0-9._-]+$/),
  networkLabel: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _.-]+$/),
  keywords: z.array(z.string().trim().min(2).max(80).regex(/^[^\u0000-\u001f\u007f]+$/)).min(1).max(3),
  description: z.string().trim().min(1).max(1000),
  grain: z.string().trim().min(1).max(200),
  fields: z.array(fieldRequirementSchema).min(1).max(32),
  constraints: z.array(z.string().trim().min(1).max(1000)).max(16),
  contract: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chain: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/),
  }).optional(),
});

const requestSchema = z.object({needs: z.array(needSchema).min(1).max(4)});
const maxInspectedFieldsPerEntity = 1_024;

interface RawCandidate {
  sourceNeedId: string;
  discoveryMethod: "keyword" | "contract";
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  displayName: string;
  reportedNetwork: string | null;
}

interface CandidateSchemaInspection {
  schemaHash: string | null;
  schemaBytes: number | null;
  entities: readonly GraphSchemaEntityInspection[];
  schemaInspected: boolean;
  queryEntitySource: "source_sdl" | "runtime_introspection" | null;
  error: string | null;
}

export class GraphSourceDiscoveryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GraphSourceDiscoveryError";
  }
}

function fail(code: string, message: string): never {
  throw new GraphSourceDiscoveryError(code, message);
}

function namedType(type: TypeNode): string {
  return type.kind === Kind.NAMED_TYPE ? type.name.value : namedType(type.type);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function containsNormalizedPhrase(value: string, phrase: string): boolean {
  const normalizedValue = normalize(value);
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase.length > 0 && ` ${normalizedValue} `.includes(` ${normalizedPhrase} `);
}

function phraseSpecificity(value: string): number {
  const normalized = normalize(value);
  if (!normalized) return 0;
  return normalized.split(" ").length * 1_000 + normalized.length;
}

function terminal(path: string): string {
  return normalize(path.split(".").at(-1) ?? path).replace(/\s/g, "");
}

function identifierTokens(value: string): readonly string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isOrderedSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  let needleIndex = 0;
  for (const token of haystack) {
    if (token === needle[needleIndex]) needleIndex += 1;
    if (needleIndex === needle.length) return true;
  }
  return false;
}

function semanticTokens(value: string): ReadonlySet<string> {
  const expanded = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const ignored = new Set(["a", "an", "the", "one", "per", "row", "rows", "record", "records", "entity", "entities", "event", "events", "data", "indexed", "existing", "provider", "defined", "source", "raw"]);
  const singular = (token: string) => token.endsWith("ies") && token.length > 4
    ? `${token.slice(0, -3)}y`
    : token.endsWith("s") && !token.endsWith("ss") && token.length > 3
      ? token.slice(0, -1)
      : token;
  return new Set(expanded.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular).filter((token) => !ignored.has(token)));
}

function entityMatchesGrain(grain: string, queryEntity: string, entityType: string): boolean {
  const grainTokens = semanticTokens(grain);
  if (grainTokens.size === 0) return true;
  const entityTokens = new Set([...semanticTokens(queryEntity), ...semanticTokens(entityType)]);
  return [...grainTokens].some((token) => entityTokens.has(token));
}

function graphValueType(name: string): GraphSemanticValueType {
  if (name === "Boolean") return "boolean";
  if (name === "ID") return "id";
  if (name === "Bytes") return "bytes";
  if (name === "Int" || name === "BigInt") return "integer";
  if (name === "Float" || name === "BigDecimal") return "decimal";
  if (name === "String") return "string";
  return "json";
}

function typeShape(type: TypeNode): {graphType: string; valueType: GraphSemanticValueType; nullable: boolean; list: boolean} {
  const nullable = type.kind !== Kind.NON_NULL_TYPE;
  const unwrapped = type.kind === Kind.NON_NULL_TYPE ? type.type : type;
  const list = unwrapped.kind === Kind.LIST_TYPE;
  let current: TypeNode = list ? unwrapped.type : unwrapped;
  if (current.kind === Kind.NON_NULL_TYPE) current = current.type;
  const graphType = namedType(current);
  return {graphType, valueType: graphValueType(graphType), nullable, list};
}

function collectFields(
  objectName: string,
  objectFields: ReadonlyMap<string, readonly FieldDefinitionNode[]>,
  leafTypes: ReadonlySet<string>,
  depth = 0,
  prefix = "",
  ancestors: ReadonlySet<string> = new Set(),
  inheritedNullable = false,
  inheritedList = false,
): GraphInspectedField[] {
  if (depth > 2 || ancestors.has(objectName)) return [];
  const fieldsForObject = (objectFields.get(objectName) ?? []).slice(0, maxInspectedFieldsPerEntity);
  const nextAncestors = new Set(ancestors).add(objectName);
  const fields: GraphInspectedField[] = [];
  const relationships: FieldDefinitionNode[] = [];

  // Preserve the row entity's own scalar fields before expanding relationships.
  // Otherwise one large nested object can exhaust the inspection budget before
  // later direct fields (for example Swap.amountUSD) are ever observed.
  for (const fieldDefinition of fieldsForObject) {
    const path = prefix ? `${prefix}.${fieldDefinition.name.value}` : fieldDefinition.name.value;
    const target = namedType(fieldDefinition.type);
    const shape = typeShape(fieldDefinition.type);
    const nullable = inheritedNullable || shape.nullable;
    const list = inheritedList || shape.list;
    if (leafTypes.has(target) || !objectFields.has(target)) {
      fields.push({...shape, path, nullable, list});
    } else {
      relationships.push(fieldDefinition);
    }
    if (fields.length >= maxInspectedFieldsPerEntity) return fields.slice(0, maxInspectedFieldsPerEntity);
  }

  for (const fieldDefinition of relationships) {
    const path = prefix ? `${prefix}.${fieldDefinition.name.value}` : fieldDefinition.name.value;
    const target = namedType(fieldDefinition.type);
    const shape = typeShape(fieldDefinition.type);
    const nullable = inheritedNullable || shape.nullable;
    const list = inheritedList || shape.list;
    fields.push(...collectFields(target, objectFields, leafTypes, depth + 1, path, nextAncestors, nullable, list));
    if (fields.length >= maxInspectedFieldsPerEntity) break;
  }
  return fields.slice(0, maxInspectedFieldsPerEntity);
}

function typeCompatible(requirement: GraphFieldRequirement, field: GraphInspectedField): boolean {
  if (field.list && requirement.expectedType !== "json") return false;
  if (!requirement.allowNullable && field.nullable) return false;
  if (requirement.expectedType === "json" || requirement.expectedType === field.valueType) return true;
  const textual = new Set<GraphSemanticValueType>(["string", "id", "address", "bytes"]);
  if (textual.has(requirement.expectedType) && textual.has(field.valueType)) return true;
  if (requirement.expectedType === "timestamp") return field.valueType === "integer" || field.valueType === "string";
  if (requirement.expectedType === "date") return field.valueType === "string" || field.valueType === "integer";
  return requirement.expectedType === "decimal" && field.valueType === "integer";
}

function requirementPathScore(requirement: GraphFieldRequirement, field: GraphInspectedField, grain: string): number {
  if (!typeCompatible(requirement, field)) return 0;
  const leaf = terminal(field.path);
  const leafTokens = identifierTokens(field.path.split(".").at(-1) ?? field.path);
  const full = normalize(field.path).replace(/[.\s]/g, "");
  const hints = [...requirement.hints, requirement.id]
    .map((hint) => ({
      compact: normalize(hint).replace(/[.\s]/g, ""),
      tokens: identifierTokens(hint),
    }))
    .filter((hint) => hint.compact.length > 0);
  let score = 0;
  for (const hint of hints) {
    if (leaf === hint.compact) score = Math.max(score, 100);
    else if (full === hint.compact) score = Math.max(score, 95);
    else if (hint.tokens.length >= 2 && isOrderedSubsequence(hint.tokens, leafTokens)) score = Math.max(score, 88);
    else if (full.endsWith(hint.compact) || hint.compact.endsWith(full)) score = Math.max(score, 80);
    else if (full.includes(hint.compact) || hint.compact.includes(leaf)) score = Math.max(score, 55);
  }
  if (score === 0) return 0;
  const depth = field.path.split(".").length - 1;
  score += depth === 0 ? 20 : -5 * depth;
  const semanticRequirement = normalize(`${requirement.id} ${requirement.description} ${requirement.hints.join(" ")}`);
  const eventGrain = /swap|trade|transaction|event/.test(normalize(grain));
  const perRowMetric = requirement.expectedType === "decimal" || requirement.expectedType === "integer";
  const metricRequirement = /amount|value|volume|price|quantity|fee|count/.test(semanticRequirement);
  const intrinsicallyAggregateField = /cumulative|total|count|liquidity|tvl|daily|hourly/.test(leaf);
  const nestedAggregateField = intrinsicallyAggregateField || /volume/.test(leaf);
  if (eventGrain && perRowMetric && metricRequirement && (intrinsicallyAggregateField || (depth > 0 && nestedAggregateField))) {
    score -= 60;
  }
  return Math.max(0, score);
}

interface ParsedSchemaInspection {
  entities: readonly {
    queryEntity: string;
    entityType: string;
    fields: readonly GraphInspectedField[];
  }[];
  queryEntitySource: "source_sdl" | "runtime_introspection";
  requiresRuntimeIntrospection: boolean;
}

function inspectSchema(
  sdl: string,
  runtimeQueryFields?: readonly GraphRuntimeQueryField[],
): ParsedSchemaInspection {
  const document = parse(sdl, {maxTokens: 100_000});
  const objectFields = new Map<string, FieldDefinitionNode[]>();
  const entityTypes = new Set<string>();
  const leafTypes = new Set(["ID", "String", "Boolean", "Int", "Float", "BigInt", "BigDecimal", "Bytes"]);
  for (const definition of document.definitions) {
    if (definition.kind === Kind.SCALAR_TYPE_DEFINITION || definition.kind === Kind.ENUM_TYPE_DEFINITION) {
      leafTypes.add(definition.name.value);
      continue;
    }
    if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION && definition.kind !== Kind.OBJECT_TYPE_EXTENSION) continue;
    const objectDefinition = definition as ObjectTypeDefinitionNode | ObjectTypeExtensionNode;
    const existing = objectFields.get(objectDefinition.name.value) ?? [];
    existing.push(...(objectDefinition.fields ?? []));
    objectFields.set(objectDefinition.name.value, existing);
    if (objectDefinition.directives?.some((directive) => directive.name.value === "entity")) {
      entityTypes.add(objectDefinition.name.value);
    }
  }
  const queryFields = objectFields.get("Query") ?? [];
  const requiresRuntimeIntrospection = queryFields.length === 0 && runtimeQueryFields === undefined;
  const queryEntities = queryFields.length > 0
    ? queryFields.slice(0, 128).map((queryField) => ({
      queryEntity: queryField.name.value,
      entityType: namedType(queryField.type),
    }))
    : (runtimeQueryFields ?? [])
      .filter((field) => field.list && entityTypes.has(field.entityType))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 128)
      .map((field) => ({
        queryEntity: field.name,
        entityType: field.entityType,
      }));
  const queryEntitySource = queryFields.length > 0 ? "source_sdl" as const : "runtime_introspection" as const;
  const inspections = queryEntities.map(({queryEntity, entityType}) => {
    const fields = [...new Map(collectFields(entityType, objectFields, leafTypes).map((field) => [field.path, field])).values()]
      .sort((left, right) => left.path.localeCompare(right.path));
    return {queryEntity, entityType, fields};
  });
  return {
    entities: inspections.sort((left, right) =>
      right.fields.length - left.fields.length
      || left.queryEntity.localeCompare(right.queryEntity)),
    queryEntitySource,
    requiresRuntimeIntrospection,
  };
}

function bindRequirements(
  entities: readonly {queryEntity: string; entityType: string; fields: readonly GraphInspectedField[]}[],
  need: GraphSourceDiscoveryNeed,
): readonly GraphSchemaEntityInspection[] {
  const requirements = need.fields;
  return entities.map(({queryEntity, entityType, fields}) => {
    const scoredBindings = requirements.map((requirement) => ({
      requirementId: requirement.id,
      fields: fields
        .map((field) => ({path: field.path, score: requirementPathScore(requirement, field, need.grain)}))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, 8),
    }));
    const suggestedBindings = scoredBindings.map((binding) => ({
      requirementId: binding.requirementId,
      fieldPaths: binding.fields.map((field) => field.path),
    }));
    return {
      queryEntity,
      entityType,
      fields,
      suggestedBindings,
      matchedRequirements: requirements
        .filter((requirement) => requirement.required && scoredBindings.find((item) => item.requirementId === requirement.id)!.fields.some((field) => field.score >= 40))
        .map((requirement) => requirement.id),
      grainHint: entityMatchesGrain(need.grain, queryEntity, entityType) ? "matched" : "unknown",
    } satisfies GraphSchemaEntityInspection;
  }).sort((left, right) =>
      right.matchedRequirements.length - left.matchedRequirements.length
      || Number(right.grainHint === "matched") - Number(left.grainHint === "matched")
      || right.fields.length - left.fields.length
      || left.queryEntity.localeCompare(right.queryEntity));
}

function networkEvidence(
  need: GraphSourceDiscoveryNeed,
  candidate: RawCandidate,
): GraphDiscoveredSourceCandidate["networkEvidence"] {
  if (candidate.discoveryMethod === "contract") {
    return normalize(candidate.reportedNetwork ?? "") === normalize(need.contract?.chain ?? "") ? "contract_filter" : "conflict";
  }
  const displayName = candidate.displayName;
  const matches = Object.entries(graphNetworkAliases).flatMap(([dataNetwork, aliases]) =>
    aliases
      .filter((alias) => containsNormalizedPhrase(displayName, alias))
      .map((alias) => ({dataNetwork, specificity: phraseSpecificity(alias)})));
  const requestedLabelSpecificity = containsNormalizedPhrase(displayName, need.networkLabel)
    ? phraseSpecificity(need.networkLabel)
    : 0;
  const targetSpecificity = Math.max(
    requestedLabelSpecificity,
    ...matches.filter((match) => match.dataNetwork === need.dataNetwork).map((match) => match.specificity),
  );
  const otherSpecificity = Math.max(
    0,
    ...matches.filter((match) => match.dataNetwork !== need.dataNetwork).map((match) => match.specificity),
  );
  if (otherSpecificity >= targetSpecificity && otherSpecificity > 0) return "conflict";
  return targetSpecificity > 0 ? "display_name" : "unknown";
}

function baseRank(need: GraphSourceDiscoveryNeed, candidate: RawCandidate, totalQueryCount30d: number | null): number {
  const evidence = networkEvidence(need, candidate);
  const candidateTokens = semanticTokens(candidate.displayName);
  const networkTokens = semanticTokens([
    need.networkLabel,
    ...Object.values(graphNetworkAliases).flat(),
  ].join(" "));
  const keywordRelevance = need.keywords.reduce((best, keyword) => {
    const keywordTokens = [...semanticTokens(keyword)].filter((token) => !networkTokens.has(token));
    if (keywordTokens.length === 0) return best;
    const matches = keywordTokens.filter((token) => candidateTokens.has(token)).length;
    const score = matches === keywordTokens.length
      ? 30 + Math.min(10, matches * 5)
      : Math.floor(20 * matches / keywordTokens.length);
    return Math.max(best, score);
  }, 0);
  const activityScore = totalQueryCount30d === null ? 0 : Math.min(20, Math.floor(Math.log10(totalQueryCount30d + 1) * 5));
  return (evidence === "contract_filter" ? 30 : evidence === "display_name" ? 25 : evidence === "conflict" ? -100 : 0)
    + keywordRelevance
    + activityScore;
}

function candidateRef(needId: string, manifestIpfsCid: string): string {
  const digest = createHash("sha256").update(`${needId}\u0000${manifestIpfsCid}`).digest("hex").slice(0, 20);
  return `graph:${needId}:${digest}`;
}

export class GraphSourceDiscoveryService implements GraphSourceDiscoveryPort {
  constructor(
    private readonly graph: GraphPlanningMcpPort,
    private readonly limits: {
      maxSearchCallsPerNeed: number;
      maxSearchResultsPerCall: number;
      maxSchemaInspectionsPerNeed: number;
      maxSchemaBytes: number;
    } = {
      maxSearchCallsPerNeed: 3,
      maxSearchResultsPerCall: 10,
      maxSchemaInspectionsPerNeed: 10,
      maxSchemaBytes: 5_242_880,
    },
    private readonly schemaCache: GraphSchemaCachePort = new MemoryGraphSchemaCache(),
    private readonly runtimeSchema?: GraphRuntimeSchemaPort,
  ) {}

  async discover(input: GraphSourceDiscoveryRequest, signal?: AbortSignal): Promise<GraphSourceDiscoveryResult> {
    const request = requestSchema.parse(input);
    if (new Set(request.needs.map((need) => need.id)).size !== request.needs.length) {
      fail("GRAPH_DISCOVERY_NEED_DUPLICATE", "Graph source discovery need IDs must be unique");
    }
    for (const need of request.needs) {
      if (new Set(need.fields.map((field) => field.id)).size !== need.fields.length) {
        fail("GRAPH_DISCOVERY_FIELD_DUPLICATE", `Graph source discovery fields must be unique for ${need.id}`);
      }
    }
    let searchCalls = 0;
    const rawByNeed = new Map<string, RawCandidate[]>();
    const keywordCache = new Map<string, Awaited<ReturnType<GraphPlanningMcpPort["searchSubgraphsByKeyword"]>>>();

    for (const need of request.needs) {
      let needSearchCalls = 0;
      const raw: RawCandidate[] = [];
      if (need.contract) {
        if (needSearchCalls >= this.limits.maxSearchCallsPerNeed) {
          fail("GRAPH_DISCOVERY_SEARCH_LIMIT", `Graph source discovery search-call limit exceeded for ${need.id}`);
        }
        needSearchCalls += 1;
        searchCalls += 1;
        const deployments = await this.graph.getTopDeploymentsForContract({
          contractAddress: need.contract.address,
          chain: need.contract.chain,
        }, signal);
        raw.push(...deployments.slice(0, this.limits.maxSearchResultsPerCall).map((deployment) => ({
          sourceNeedId: need.id,
          discoveryMethod: "contract" as const,
          logicalSubgraphId: null,
          manifestIpfsCid: deployment.manifestIpfsCid,
          displayName: `Contract ${need.contract!.address}`,
          reportedNetwork: deployment.network,
        })));
      } else {
        for (const searchKeyword of need.keywords) {
          const cacheKey = normalize(searchKeyword);
          let result = keywordCache.get(cacheKey);
          if (!result) {
            if (needSearchCalls >= this.limits.maxSearchCallsPerNeed) break;
            needSearchCalls += 1;
            searchCalls += 1;
            result = await this.graph.searchSubgraphsByKeyword(searchKeyword, signal);
            keywordCache.set(cacheKey, result);
          }
          raw.push(...result.subgraphs.slice(0, this.limits.maxSearchResultsPerCall).map((subgraph) => ({
            sourceNeedId: need.id,
            discoveryMethod: "keyword" as const,
            logicalSubgraphId: subgraph.subgraphId,
            manifestIpfsCid: subgraph.manifestIpfsCid,
            displayName: subgraph.displayName,
            reportedNetwork: null,
          })));
        }
      }
      const deduplicated = [...new Map(raw.map((candidate) => [candidate.manifestIpfsCid, candidate])).values()];
      rawByNeed.set(need.id, deduplicated);
    }

    // Collect the official Subgraph MCP 30-day activity signal for every
    // potentially relevant candidate before selection. Activity is advisory:
    // it orders schema inspection, but a zero or missing count does not prove
    // that a deployment's schema is unusable. The MCP activity tool accepts at
    // most ten deployment hashes, so batch the complete bounded candidate set.
    const uniqueManifestCids = [...new Set([...rawByNeed.values()].flat().map((candidate) => candidate.manifestIpfsCid))];
    const activity: GraphDeploymentActivity[] = [];
    for (let offset = 0; offset < uniqueManifestCids.length; offset += 10) {
      activity.push(...await this.graph.getDeploymentActivity(uniqueManifestCids.slice(offset, offset + 10), signal));
    }
    const activityByCid = new Map(activity.map((item) => [item.manifestIpfsCid, item]));

    const schemaByCid = new Map<string, {sdl: string; error: string | null}>();
    const inspectionByNeedAndCid = new Map<string, CandidateSchemaInspection>();
    const inspectionKey = (needId: string, manifestIpfsCid: string) => `${needId}\u0000${manifestIpfsCid}`;
    const loadSchema = async (candidate: RawCandidate): Promise<{sdl: string; error: string | null}> => {
      const cached = schemaByCid.get(candidate.manifestIpfsCid);
      if (cached) return cached;
      let loaded: {sdl: string; error: string | null};
      try {
        const sdl = await this.graph.getSchema({type: "ipfs_hash", id: candidate.manifestIpfsCid}, signal);
        loaded = Buffer.byteLength(sdl, "utf8") > this.limits.maxSchemaBytes
          ? {sdl: "", error: "Schema exceeded the bounded inspection size"}
          : {sdl, error: null};
      } catch {
        loaded = {sdl: "", error: "Schema inspection failed"};
      }
      schemaByCid.set(candidate.manifestIpfsCid, loaded);
      return loaded;
    };
    const inspectCandidate = async (
      need: GraphSourceDiscoveryNeed,
      candidate: RawCandidate,
    ): Promise<CandidateSchemaInspection> => {
      const key = inspectionKey(need.id, candidate.manifestIpfsCid);
      const cached = inspectionByNeedAndCid.get(key);
      if (cached) return cached;
      const schema = await loadSchema(candidate);
      let inspection: CandidateSchemaInspection;
      if (schema.error) {
        inspection = {schemaHash: null, schemaBytes: null, entities: [], schemaInspected: false, queryEntitySource: null, error: schema.error};
      } else {
        const schemaBytes = Buffer.byteLength(schema.sdl, "utf8");
        const schemaHash = `sha256:${createHash("sha256").update(schema.sdl).digest("hex")}`;
        try {
          const cachedProjection = await this.schemaCache.get({
            manifestIpfsCid: candidate.manifestIpfsCid,
            schemaHash,
          }, signal);
          let projection = cachedProjection;
          if (!projection) {
            let parsed = inspectSchema(schema.sdl);
            if (parsed.requiresRuntimeIntrospection) {
              if (!this.runtimeSchema) {
                throw new GraphSourceDiscoveryError(
                  "GRAPH_RUNTIME_SCHEMA_REQUIRED",
                  "Runtime Query-root verification is required when source SDL omits Query",
                );
              }
              const runtimeQueryFields = await this.runtimeSchema.getRuntimeQueryFields(candidate.manifestIpfsCid, signal);
              parsed = inspectSchema(schema.sdl, runtimeQueryFields);
            }
            projection = {
              schemaVersion: 1,
              gatewayEnvironment: "mainnet",
              manifestIpfsCid: candidate.manifestIpfsCid,
              schemaHash,
              schemaBytes,
              queryEntitySource: parsed.queryEntitySource,
              entities: parsed.entities,
            };
            await this.schemaCache.set(projection, signal);
          }
          if (projection.entities.length === 0) {
            throw new GraphSourceDiscoveryError(
              "GRAPH_RUNTIME_QUERY_ENTITY_MISSING",
              "No verified collection Query field returns an inspected @entity type",
            );
          }
          inspection = {
            schemaHash,
            schemaBytes,
              entities: bindRequirements(projection.entities, need).slice(0, 8),
            schemaInspected: true,
            queryEntitySource: projection.queryEntitySource,
            error: null,
          };
        } catch (error) {
          const code = typeof error === "object" && error && "code" in error
            ? String((error as {code: unknown}).code)
            : null;
          const message = code === "GRAPH_SCHEMA_CACHE_UNAVAILABLE"
            ? "The shared Graph schema cache is unavailable; runtime introspection was not attempted."
            : code === "GRAPH_SCHEMA_CACHE_INVALID"
              ? "The shared Graph schema cache contained invalid evidence and was not trusted."
              : code === "GRAPH_RUNTIME_SCHEMA_REQUIRED"
                ? "Source SDL omits Query and no runtime Query-root verifier is configured."
                : code === "GRAPH_RUNTIME_QUERY_ENTITY_MISSING"
                  ? "No verified collection Query field returns an inspected @entity type."
                  : code?.startsWith("GRAPH_MCP_")
                    ? "Runtime Query-root introspection failed."
                    : "Schema SDL could not be parsed safely.";
          inspection = {schemaHash, schemaBytes, entities: [], schemaInspected: false, queryEntitySource: null, error: message};
        }
      }
      inspectionByNeedAndCid.set(key, inspection);
      return inspection;
    };

    // Treat every source need as its own MCP discovery problem. Inspect the
    // most-used candidates first, then use the deterministic semantic rank and
    // CID only as tie-breakers. A zero or missing activity count is not a schema
    // gate: no traffic metric can prove semantic field fit for arbitrary SDL.
    for (const need of request.needs) {
      const ordered = (rawByNeed.get(need.id) ?? []).slice().sort((left, right) => {
        const leftActivity = activityByCid.get(left.manifestIpfsCid)?.totalQueryCount30d ?? -1;
        const rightActivity = activityByCid.get(right.manifestIpfsCid)?.totalQueryCount30d ?? -1;
        return rightActivity - leftActivity
          || baseRank(need, right, rightActivity < 0 ? null : rightActivity)
            - baseRank(need, left, leftActivity < 0 ? null : leftActivity)
          || left.manifestIpfsCid.localeCompare(right.manifestIpfsCid);
      });
      let inspectedForNeed = 0;
      for (const candidate of ordered) {
        if (inspectedForNeed >= this.limits.maxSchemaInspectionsPerNeed) break;
        if (networkEvidence(need, candidate) === "conflict") continue;
        inspectedForNeed += 1;
        await inspectCandidate(need, candidate);
      }
    }

    const candidates: GraphDiscoveredSourceCandidate[] = [];
    for (const need of request.needs) {
      for (const raw of rawByNeed.get(need.id) ?? []) {
        const activityEvidence = activityByCid.get(raw.manifestIpfsCid);
        const inspection = inspectionByNeedAndCid.get(inspectionKey(need.id, raw.manifestIpfsCid));
        const limitations = [
          "Historical coverage and current indexing freshness require a separately authorized bounded validation query.",
          "Gateway Deployment ID and a workspace-owned immutable source snapshot remain unresolved; the manifest IPFS CID is not a Deployment ID.",
          "Discovery metadata does not establish the source-query access price.",
          "Semantic field meaning and units remain subject to model proposal and deterministic source admission.",
        ];
        const entities = inspection?.entities ?? [];
        const schemaHash = inspection?.schemaHash ?? null;
        const schemaBytes = inspection?.schemaBytes ?? null;
        const schemaInspected = inspection?.schemaInspected ?? false;
        if (!inspection) {
          const skipReason = networkEvidence(need, raw) === "conflict"
            ? "Schema was not inspected because returned network evidence conflicts with this source need."
            : "Schema was not inspected because this source need's bounded inspection budget was exhausted.";
          limitations.unshift(skipReason);
        } else if (inspection.error) {
          limitations.unshift(inspection.error);
        } else if (inspection.queryEntitySource === "runtime_introspection") {
          limitations.unshift("Query entity names were verified against the deployed GraphQL endpoint and cached by immutable manifest CID and source schema hash.");
        }
        const evidence = networkEvidence(need, raw);
        if (evidence === "unknown") limitations.unshift("Data network is not evidenced by the returned display name.");
        if (evidence === "conflict") limitations.unshift("Returned network evidence conflicts with the requested data network.");
        if (!activityEvidence) limitations.unshift("Required 30-day query activity evidence is missing.");
        if (activityEvidence?.totalQueryCount30d === 0) limitations.unshift("The deployment has zero observed queries during the last 30 days.");

        const status = evidence === "conflict"
          ? "incompatible"
          : (!schemaInspected || entities.length === 0 || evidence === "unknown" || !activityEvidence)
            ? "needs_verification"
            : "suitable";
        const bestMatchedRequirements = entities[0]?.matchedRequirements.length ?? 0;
        const grainMatchScore = entities.some((entity) => entity.grainHint === "matched") ? 20 : 0;
        const score = baseRank(need, raw, activityEvidence?.totalQueryCount30d ?? null)
          + bestMatchedRequirements * 15
          + grainMatchScore;
        candidates.push({
          candidateRef: candidateRef(need.id, raw.manifestIpfsCid),
          sourceNeedId: need.id,
          discoveryMethod: raw.discoveryMethod,
          logicalSubgraphId: raw.logicalSubgraphId,
          manifestIpfsCid: raw.manifestIpfsCid,
          displayName: raw.displayName,
          reportedNetwork: raw.reportedNetwork,
          networkEvidence: evidence,
          totalQueryCount30d: activityEvidence?.totalQueryCount30d ?? null,
          queryActivityEvidence: activityEvidence ? "observed" : "missing",
          schemaHash,
          schemaBytes,
          entities,
          status,
          score,
          limitations,
        });
      }
    }

    candidates.sort((left, right) => {
      const statusRank = {suitable: 2, needs_verification: 1, incompatible: 0};
      return statusRank[right.status] - statusRank[left.status]
        || right.score - left.score
        || (right.totalQueryCount30d ?? -1) - (left.totalQueryCount30d ?? -1)
        || left.candidateRef.localeCompare(right.candidateRef);
    });
    return {
      schemaVersion: 1,
      provider: "the_graph",
      gatewayEnvironment: "mainnet",
      searchedNeeds: request.needs.length,
      searchCalls,
      inspectedSchemas: schemaByCid.size,
      candidates,
      limits: {
        maxSearchCallsPerNeed: this.limits.maxSearchCallsPerNeed,
        maxSearchResultsPerCall: this.limits.maxSearchResultsPerCall,
        maxSchemaInspectionsPerNeed: this.limits.maxSchemaInspectionsPerNeed,
      },
    };
  }
}
