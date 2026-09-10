import {createHash} from "node:crypto";
import {buildASTSchema, getNamedType, isInputObjectType, isObjectType, Kind, parse, validate} from "graphql";
import type {GraphQLField, GraphQLNamedType, GraphQLObjectType, GraphQLSchema} from "graphql";
import type {
  StructuredDagCompileInput,
  StructuredDagCompilation,
  StructuredDagField,
} from "../dag/compiler.js";
import {validateGraphSourceQueryPlan} from "../graph/query-plan.js";
import type {GraphSourceQueryPlan} from "../graph/types.js";

export interface LiveSourceBinding {
  fieldPath: string;
  requirementId: string;
}

export interface LiveAuxiliarySourceBinding {
  fieldPath: string;
  name?: string;
  requirementId?: string;
  purpose?: "filter" | "join" | "group" | "sort" | "derive" | "output";
}

export interface LiveSourceInput {
  id: string;
  displayName: string;
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  dataNetwork: string;
  queryEntity: string;
  queryEntityType?: string | null;
  queryPlan?: GraphSourceQueryPlan | null;
  fieldBindings: readonly LiveSourceBinding[];
  auxiliaryFieldBindings: readonly LiveAuxiliarySourceBinding[];
}

export interface LiveSourceProjection {
  fieldPath: string;
  outputPath: string;
}

export interface CompiledLiveSource extends LiveSourceInput {
  projections: readonly LiveSourceProjection[];
  queryDocument: string;
  pushedOperations: GraphSourceQueryPlan["pushedOperations"];
  initialCursor: string;
  pageSize: number;
  maxRequests: number;
  maxRows: number;
  providerCredentialId: string;
  sourceSnapshotId: string;
  adapterVersion: "graph-mcp-live-v1";
  access: {
    mode: "customer_api_key";
    providerCredentialId: string;
    spendingPolicyId: null;
    gatewayEnvironment: "mainnet";
  };
}

export interface ImmutableLivePlan {
  schemaVersion: 2;
  runtimeVersion: "dag-live-v1";
  compiler: {
    name: "structured-dag";
    version: "1";
    compilationHash: string;
  };
  sources: readonly CompiledLiveSource[];
  dag: StructuredDagCompileInput["dag"];
  outputSchema: {fields: readonly StructuredDagField[]};
}

const graphName = /^[_A-Za-z][_0-9A-Za-z]*$/;
const fieldPath = /^[_A-Za-z][_0-9A-Za-z]*(?:\.[_A-Za-z][_0-9A-Za-z]*)*$/;
const graphSchemaPrelude = parse(`
  scalar BigInt
  scalar BigDecimal
  scalar Bytes
  directive @entity(immutable: Boolean, timeseries: Boolean) on OBJECT
  directive @derivedFrom(field: String!) on FIELD_DEFINITION
`);

export class LivePlanCompilationError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The immutable live plan could not be compiled");
    this.name = "LivePlanCompilationError";
    this.cause = cause;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function buildGraphSchema(schemaDocument: string): GraphQLSchema {
  const providerDocument = parse(schemaDocument, {maxTokens: 100_000});
  const providerScalars = new Set(providerDocument.definitions
    .filter((definition) => definition.kind === Kind.SCALAR_TYPE_DEFINITION)
    .map((definition) => definition.name.value));
  const providerDirectives = new Set(providerDocument.definitions
    .filter((definition) => definition.kind === Kind.DIRECTIVE_DEFINITION)
    .map((definition) => definition.name.value));
  const missingGraphDefinitions = graphSchemaPrelude.definitions.filter((definition) => {
    if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) return !providerScalars.has(definition.name.value);
    if (definition.kind === Kind.DIRECTIVE_DEFINITION) return !providerDirectives.has(definition.name.value);
    return false;
  });
  return buildASTSchema({
    kind: Kind.DOCUMENT,
    definitions: [...missingGraphDefinitions, ...providerDocument.definitions],
  });
}

export function declaredLiveQueryEntityType(
  source: Pick<LiveSourceInput, "queryEntity">,
  schemaDocument: string,
): string | null {
  const listField = buildGraphSchema(schemaDocument).getQueryType()?.getFields()[source.queryEntity];
  const listed = listField ? getNamedType(listField.type) : null;
  return listed && isObjectType(listed) ? listed.name : null;
}

function querySelection(paths: readonly string[]): string {
  type Tree = Map<string, Tree>;
  const root: Tree = new Map();
  for (const path of paths) {
    if (!fieldPath.test(path)) throw new Error(`Provider field path ${path} is invalid`);
    let branch = root;
    for (const segment of path.split(".")) {
      const next = branch.get(segment) ?? new Map<string, Tree>();
      branch.set(segment, next);
      branch = next;
    }
  }
  const render = (tree: Tree): string => [...tree]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, children]) => children.size === 0 ? name : `${name} { ${render(children)} }`)
    .join(" ");
  return render(root);
}

function sourceObject(
  source: LiveSourceInput,
  schema: GraphQLSchema,
  selectedPaths: readonly string[],
): GraphQLObjectType | null {
  const listField = schema.getQueryType()?.getFields()[source.queryEntity];
  const listed = listField ? getNamedType(listField.type) : null;
  if (listed && isObjectType(listed)) return listed;
  if (source.queryEntityType) {
    const pinned = schema.getType(source.queryEntityType);
    return pinned && isObjectType(pinned) ? pinned : null;
  }
  const topLevelFields = new Set(selectedPaths.map((path) => path.split(".")[0]!));
  const candidates = Object.values(schema.getTypeMap()).filter((type): type is GraphQLObjectType => {
    if (!isObjectType(type) || type.name.startsWith("__")) return false;
    const fields = type.getFields();
    return fields.id !== undefined && [...topLevelFields].every((name) => fields[name] !== undefined);
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

function validateSelectedPaths(entity: GraphQLObjectType | null, selectedPaths: readonly string[]): void {
  if (!entity) throw new Error("The selected Graph query entity could not be resolved from its schema");
  for (const path of selectedPaths) {
    let current: GraphQLObjectType | null = entity;
    const segments = path.split(".");
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const selected: GraphQLField<unknown, unknown> | undefined = current?.getFields()[segment];
      if (!selected) throw new Error(`Provider field path ${path} is absent from the selected Graph entity`);
      if (index < segments.length - 1) {
        const next: GraphQLNamedType = getNamedType(selected.type);
        if (!isObjectType(next)) throw new Error(`Provider field path ${path} crosses a non-object field`);
        current = next;
      }
    }
  }
}

function liveCursor(
  source: LiveSourceInput,
  schema: GraphQLSchema,
  entity: GraphQLObjectType | null,
): {type: string; initial: string} {
  const listField = schema.getQueryType()?.getFields()[source.queryEntity];
  const whereType = listField?.args.find((argument) => argument.name === "where")?.type;
  const filter = whereType ? getNamedType(whereType) : null;
  const cursorField = filter && isInputObjectType(filter) ? filter.getFields().id_gt : null;
  let cursorType = cursorField ? String(cursorField.type).replace(/!$/, "") : "";
  if (!cursorType && entity) cursorType = String(entity.getFields().id?.type ?? "").replace(/[\[\]!]/g, "");
  if (!new Set(["ID", "String", "Bytes"]).has(cursorType)) {
    throw new Error(`Query entity ${source.queryEntity} does not expose a supported id_gt cursor`);
  }
  return {type: cursorType, initial: cursorType === "Bytes" ? "0x" : ""};
}

export function compileLiveQuery(
  source: LiveSourceInput,
  schemaDocument: string,
  selectedPaths: readonly string[],
): {document: string; initialCursor: string} {
  if (!graphName.test(source.queryEntity)) throw new Error(`Query entity ${source.queryEntity} is invalid`);
  const schema = buildGraphSchema(schemaDocument);
  const entity = sourceObject(source, schema, selectedPaths);
  validateSelectedPaths(entity, selectedPaths);
  const selection = querySelection(["id", ...selectedPaths]);
  const cursor = liveCursor(source, schema, entity);
  return {
    document: `query SprueLiveSource($first: Int!, $cursor: ${cursor.type}!) { ${source.queryEntity}(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { ${selection} } _meta { deployment block { number hash timestamp } hasIndexingErrors } }`,
    initialCursor: cursor.initial,
  };
}

export function compileAuthoredLiveQuery(
  source: LiveSourceInput,
  schemaDocument: string,
  selectedPaths: readonly string[],
  plan: GraphSourceQueryPlan,
): {document: string; initialCursor: string} {
  const schema = buildGraphSchema(schemaDocument);
  const entity = sourceObject(source, schema, selectedPaths);
  validateSelectedPaths(entity, selectedPaths);
  const cursor = liveCursor(source, schema, entity);
  const authored = validateGraphSourceQueryPlan(plan, {queryEntity: source.queryEntity, selectedPaths});
  if (authored.cursorType !== cursor.type) {
    throw new Error(`Agent-authored cursor type ${authored.cursorType} does not match inspected type ${cursor.type}`);
  }
  if (schema.getQueryType()) {
    const issues = validate(schema, parse(plan.document, {maxTokens: 5_000}));
    if (issues.length > 0) throw new Error(`Agent-authored Graph query is incompatible with the inspected schema: ${issues[0]!.message}`);
  }
  return {document: plan.document, initialCursor: cursor.initial};
}

function collectExpressionFields(value: unknown, fields: Set<string>): void {
  if (!record(value)) return;
  if (value.op === "field" && typeof value.field === "string") fields.add(value.field);
  if (Array.isArray(value.inputs)) value.inputs.forEach((input) => collectExpressionFields(input, fields));
}

function sourceProjections(
  source: LiveSourceInput,
  dag: StructuredDagCompileInput["dag"],
): LiveSourceProjection[] {
  const sourceNode = dag.nodes.find((node) => node.type === "source"
    && String(node.config.sourceId ?? node.config.sourceKey ?? "") === source.id);
  if (!sourceNode?.outputSchema) throw new Error(`Source ${source.id} has no compiled output schema`);
  const outgoing = dag.edges.filter((edge) => edge.fromNode === sourceNode.id);
  if (outgoing.length !== 1) throw new Error(`Source ${source.id} does not have one normalization Map`);
  const map = dag.nodes.find((node) => node.id === outgoing[0]!.toNode && node.type === "map");
  if (!map || !Array.isArray(map.config.fields)) throw new Error(`Source ${source.id} does not have one normalization Map`);

  const referenced = new Set<string>();
  map.config.fields.forEach((definition) => {
    if (record(definition)) collectExpressionFields(definition.expression, referenced);
  });
  const available = new Set(sourceNode.outputSchema.fields.map((field) => field.name));
  const projections: LiveSourceProjection[] = [];
  for (const outputPath of [...referenced].sort()) {
    if (outputPath === "data_network") continue;
    if (!available.has(outputPath)) throw new Error(`Normalization Map references unavailable source field ${outputPath}`);
    const required = source.fieldBindings.find((binding) =>
      binding.fieldPath === outputPath || binding.requirementId === outputPath);
    const auxiliary = source.auxiliaryFieldBindings.find((binding) =>
      binding.fieldPath === outputPath || binding.name === outputPath || binding.requirementId === outputPath);
    const providerPath = required?.fieldPath ?? auxiliary?.fieldPath ?? outputPath;
    if (!fieldPath.test(providerPath)) throw new Error(`Source field ${outputPath} has no valid provider path`);
    projections.push({fieldPath: providerPath, outputPath});
  }
  if (projections.length === 0 && !referenced.has("data_network")) {
    throw new Error(`Source ${source.id} normalization does not consume a provider field`);
  }
  return projections;
}

export function createImmutableLivePlan(input: {
  compilation: Extract<StructuredDagCompilation, {status: "passed"}>;
  dag: StructuredDagCompileInput["dag"];
  sources: readonly (LiveSourceInput & {providerCredentialId: string; sourceSnapshotId: string; schemaDocument: string})[];
}): ImmutableLivePlan {
  try {
    return {
      schemaVersion: 2,
      runtimeVersion: "dag-live-v1",
      compiler: {
        name: "structured-dag",
        version: "1",
        compilationHash: input.compilation.compilationHash,
      },
      sources: input.sources.map((source) => {
        const projections = sourceProjections(source, input.dag);
        const selectedPaths = projections.map((item) => item.fieldPath);
        const query = source.queryPlan
          ? compileAuthoredLiveQuery(source, source.schemaDocument, selectedPaths, source.queryPlan)
          : compileLiveQuery(source, source.schemaDocument, selectedPaths);
        return {
          id: source.id,
          displayName: source.displayName,
          logicalSubgraphId: source.logicalSubgraphId,
          manifestIpfsCid: source.manifestIpfsCid,
          dataNetwork: source.dataNetwork,
          queryEntity: source.queryEntity,
          queryEntityType: source.queryEntityType ?? null,
          fieldBindings: source.fieldBindings,
          auxiliaryFieldBindings: source.auxiliaryFieldBindings,
          projections,
          providerCredentialId: source.providerCredentialId,
          sourceSnapshotId: source.sourceSnapshotId,
          adapterVersion: "graph-mcp-live-v1" as const,
          access: {
            mode: "customer_api_key" as const,
            providerCredentialId: source.providerCredentialId,
            spendingPolicyId: null,
            gatewayEnvironment: "mainnet" as const,
          },
          queryDocument: query.document,
          pushedOperations: source.queryPlan?.pushedOperations ?? [],
          initialCursor: query.initialCursor,
          pageSize: source.queryPlan?.pagination.pageSize ?? 500,
          maxRequests: source.queryPlan?.pagination.maxRequests ?? 20,
          maxRows: source.queryPlan?.pagination.maxRows ?? 10_000,
        };
      }),
      dag: input.dag,
      outputSchema: input.compilation.outputSchema,
    };
  } catch (error) {
    if (error instanceof LivePlanCompilationError) throw error;
    throw new LivePlanCompilationError(error);
  }
}
