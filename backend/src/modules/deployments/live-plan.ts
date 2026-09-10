import {createHash} from "node:crypto";
import {buildSchema, getNamedType, isInputObjectType, isObjectType} from "graphql";
import type {GraphQLField, GraphQLNamedType, GraphQLObjectType} from "graphql";
import type {
  StructuredDagCompileInput,
  StructuredDagCompilation,
  StructuredDagField,
} from "../dag/compiler.js";

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
  schemaDocument: string,
  selectedPaths: readonly string[],
): GraphQLObjectType | null {
  const schema = buildSchema(schemaDocument);
  const listField = schema.getQueryType()?.getFields()[source.queryEntity];
  const listed = listField ? getNamedType(listField.type) : null;
  if (listed && isObjectType(listed)) return listed;
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
  schemaDocument: string,
  entity: GraphQLObjectType | null,
): {type: string; initial: string} {
  const schema = buildSchema(schemaDocument);
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
  const entity = sourceObject(source, schemaDocument, selectedPaths);
  validateSelectedPaths(entity, selectedPaths);
  const selection = querySelection(["id", ...selectedPaths]);
  const cursor = liveCursor(source, schemaDocument, entity);
  return {
    document: `query SprueLiveSource($first: Int!, $cursor: ${cursor.type}!) { ${source.queryEntity}(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { ${selection} } _meta { deployment block { number hash timestamp } hasIndexingErrors } }`,
    initialCursor: cursor.initial,
  };
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
      const query = compileLiveQuery(source, source.schemaDocument, projections.map((item) => item.fieldPath));
      return {
        id: source.id,
        displayName: source.displayName,
        logicalSubgraphId: source.logicalSubgraphId,
        manifestIpfsCid: source.manifestIpfsCid,
        dataNetwork: source.dataNetwork,
        queryEntity: source.queryEntity,
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
        initialCursor: query.initialCursor,
        pageSize: 500,
        maxRequests: 20,
        maxRows: 10_000,
      };
    }),
    dag: input.dag,
    outputSchema: input.compilation.outputSchema,
  };
}
