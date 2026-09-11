import type {AgentBuilderDraft} from "./contracts.js";

type MutableNode = {
  id: string;
  type: AgentBuilderDraft["nodes"][number]["type"];
  operatorVersion: "1" | "2" | "3";
  config: Record<string, unknown>;
  outputSchema?: {fields: {name: string; type: string; nullable: boolean; unit: string | null}[]};
};

type MutableEdge = {fromNode: string; fromPort: "rows"; toNode: string; toPort: "rows" | "left" | "right"};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldReference(value: unknown): string | null {
  return record(value) && value.op === "field" && typeof value.field === "string" ? value.field : null;
}

function rewriteExpression(value: unknown, aliases: ReadonlyMap<string, string>): unknown {
  if (!record(value)) return value;
  if (value.op === "field" && typeof value.field === "string") {
    return {...value, field: aliases.get(value.field) ?? value.field};
  }
  if (!Array.isArray(value.inputs)) return value;
  return {...value, inputs: value.inputs.map((input) => rewriteExpression(input, aliases))};
}

function removeUnaryNode(nodes: MutableNode[], edges: MutableEdge[], nodeId: string): boolean {
  const incoming = edges.filter((edge) => edge.toNode === nodeId && edge.toPort === "rows");
  if (incoming.length !== 1) return false;
  const outgoing = edges.filter((edge) => edge.fromNode === nodeId);
  const retained = edges.filter((edge) => edge.toNode !== nodeId && edge.fromNode !== nodeId);
  const predecessor = incoming[0]!;
  for (const edge of outgoing) {
    retained.push({...edge, fromNode: predecessor.fromNode, fromPort: "rows"});
  }
  nodes.splice(nodes.findIndex((node) => node.id === nodeId), 1);
  edges.splice(0, edges.length, ...retained);
  return true;
}

/**
 * Converts the validated, full semantic composition into the residual Builder DAG.
 * Provider selection and direct field binding move into Source. Only transformations
 * that are not represented by the authored Source query remain as operators.
 */
export function residualizeAgentPushdowns(draft: AgentBuilderDraft): AgentBuilderDraft {
  const sources = structuredClone(draft.sources) as unknown as AgentBuilderDraft["sources"][number][];
  const nodes = structuredClone(draft.nodes) as unknown as MutableNode[];
  const edges = structuredClone(draft.edges) as unknown as MutableEdge[];

  for (const source of sources) {
    const sourceNode = nodes.find((node) => node.type === "source" && node.config.sourceId === source.id);
    if (!sourceNode) continue;
    const providerAliases = new Map<string, string>([
      ...source.fieldBindings.map((binding) => [binding.fieldPath, binding.requirementId] as const),
      ...source.auxiliaryFieldBindings.map((binding) => [binding.fieldPath, binding.name] as const),
      ["data_network", "data_network"] as const,
    ]);
    const aliases = new Map(providerAliases);
    for (const name of aliases.values()) aliases.set(name, name);

    const operations = source.queryPlan?.pushedOperations;
    if (!Array.isArray(operations)) continue;
    const mapRoles = operations
      .filter((operation) => operation.operator === "map")
      .map((operation) => operation.nodeRole);
    for (const role of mapRoles) {
      const map = nodes.find((node) => node.id === role && node.type === "map");
      if (!map || !Array.isArray(map.config.fields)) continue;
      const retained: Record<string, unknown>[] = [];
      const movedUnits = new Map<string, string | null>();
      for (const candidate of map.config.fields) {
        if (!record(candidate) || typeof candidate.name !== "string") {
          retained.push(candidate as Record<string, unknown>);
          continue;
        }
        const input = fieldReference(candidate.expression);
        const alias = input ? aliases.get(input) : null;
        if (alias === candidate.name) {
          movedUnits.set(alias, typeof candidate.unit === "string" ? candidate.unit : null);
          continue;
        }
        retained.push({...candidate, expression: rewriteExpression(candidate.expression, aliases)});
      }

      const sourceFieldByName = new Map(source.outputSchema.fields.map((field) => [field.name, field]));
      const projectedFields = [...providerAliases.entries()].flatMap(([providerPath, outputName]) => {
        const field = sourceFieldByName.get(providerPath) ?? sourceFieldByName.get(outputName);
        if (!field) return [];
        return [{...field, name: outputName, unit: movedUnits.get(outputName) ?? field.unit}];
      });
      const dataNetwork = sourceFieldByName.get("data_network") ?? {
        name: "data_network", type: "string", nullable: false, unit: null,
      };
      const uniqueFields = new Map(projectedFields.map((field) => [field.name, field]));
      uniqueFields.set("data_network", dataNetwork);
      const outputSchema = {fields: [...uniqueFields.values()]};
      source.outputSchema = outputSchema;
      sourceNode.outputSchema = structuredClone(outputSchema);

      if (retained.length === 0) {
        removeUnaryNode(nodes, edges, map.id);
      } else {
        map.config = {mode: "extend", fields: retained};
      }
    }

    for (const operation of operations) {
      if (operation.operator === "filter" || operation.operator === "sort") {
        const node = nodes.find((candidate) => candidate.id === operation.nodeRole && candidate.type === operation.operator);
        if (node) removeUnaryNode(nodes, edges, node.id);
      }
    }
  }

  return {...draft, sources, nodes, edges};
}
