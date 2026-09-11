import type {AgentBuilderDraft} from "./contracts.js";

type MutableNode = {
  id: string;
  type: AgentBuilderDraft["nodes"][number]["type"];
  operatorVersion: "1" | "2" | "3";
  config: Record<string, unknown>;
  outputSchema?: {fields: {name: string; type: string; nullable: boolean; unit: string | null}[]};
};

type MutableEdge = {fromNode: string; fromPort: "rows"; toNode: string; toPort: "rows" | "left" | "right"};

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
 * Provider filtering and ordering may move into Source after exact validation.
 * Field binding and flattening deliberately remain visible in the project-mode Map
 * immediately after Source, even when GraphQL selects the corresponding raw paths.
 */
export function residualizeAgentPushdowns(draft: AgentBuilderDraft): AgentBuilderDraft {
  const sources = structuredClone(draft.sources) as unknown as AgentBuilderDraft["sources"][number][];
  const nodes = structuredClone(draft.nodes) as unknown as MutableNode[];
  const edges = structuredClone(draft.edges) as unknown as MutableEdge[];

  for (const source of sources) {
    const sourceNode = nodes.find((node) => node.type === "source" && node.config.sourceId === source.id);
    if (!sourceNode) continue;
    const operations = source.queryPlan?.pushedOperations;
    if (!Array.isArray(operations)) continue;
    for (const operation of operations) {
      if (operation.operator === "filter" || operation.operator === "sort") {
        const node = nodes.find((candidate) => candidate.id === operation.nodeRole && candidate.type === operation.operator);
        if (node) removeUnaryNode(nodes, edges, node.id);
      }
    }
  }

  return {...draft, sources, nodes, edges};
}
