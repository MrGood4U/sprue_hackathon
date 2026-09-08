import {Client, SSEClientTransport} from "@modelcontextprotocol/client";
import {z} from "zod";
import {
  graphMcpPlanningTools,
  type GraphContractDeployment,
  type GraphDeploymentActivity,
  type GraphMcpPlanningTool,
  type GraphMcpTool,
  type GraphPlanningMcpPort,
  type GraphRuntimeQueryField,
  type GraphRuntimeSchemaPort,
  type GraphSearchResult,
  type GraphSourceReference,
} from "./types.js";

const defaultEndpoint = "https://subgraphs.mcp.thegraph.com/sse";
const identifier = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9:._-]+$/);
const graphQlName = z.string().min(1).max(200).regex(/^[_A-Za-z][_0-9A-Za-z]*$/);
const keyword = z.string().trim().min(2).max(120).regex(/^[^\u0000-\u001f\u007f]+$/);
const chain = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/);
const contractAddress = z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/);
const runtimeSchemaTool = "execute_query_by_ipfs_hash" as const;
const runtimeQueryRootDocument = `query SprueRuntimeQueryRoot {
  __schema {
    queryType {
      fields(includeDeprecated: true) {
        name
        type {
          kind
          name
          ofType { kind name ofType { kind name ofType { kind name } } }
        }
      }
    }
  }
}`;

const rawSearchResult = z.object({
  subgraphs: z.array(z.object({
    id: identifier,
    metadata: z.object({displayName: z.string().trim().min(1).max(300)}).passthrough(),
    currentVersion: z.object({
      subgraphDeployment: z.object({ipfsHash: identifier}).passthrough(),
    }).passthrough().nullable(),
  }).passthrough()).max(1_000),
  total: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
}).passthrough();

const rawActivityResult = z.object({
  deployments: z.array(z.object({
    ipfs_hash: identifier,
    total_query_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    data_points_count: z.number().int().nonnegative().max(31),
  }).passthrough()).max(100),
  total_deployments_processed: z.number().int().nonnegative(),
}).passthrough();

const rawContractResult = z.object({
  subgraphDeployments: z.array(z.object({
    ipfsHash: identifier,
    manifest: z.object({network: z.string().trim().min(1).max(100)}).passthrough(),
    queryFeesAmount: z.union([z.string(), z.number()]).nullable().optional(),
  }).passthrough()).max(3),
}).passthrough();

const rawTypeReference = z.object({
  kind: z.string().min(1).max(32),
  name: graphQlName.nullable().optional(),
  ofType: z.unknown().optional(),
}).passthrough();
type RawTypeReference = z.infer<typeof rawTypeReference>;
const rawRuntimeQueryRoot = z.object({
  data: z.object({
    __schema: z.object({
      queryType: z.object({
        fields: z.array(z.object({
          name: graphQlName,
          type: rawTypeReference,
        }).strict()).max(512),
      }).passthrough().nullable(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

interface GraphMcpWireResult {
  isError?: boolean;
  content?: readonly unknown[];
}

export interface GraphMcpPlanningWire {
  listToolNames(signal?: AbortSignal): Promise<ReadonlySet<string>>;
  callTool(tool: GraphMcpTool, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<GraphMcpWireResult>;
  close(): Promise<void>;
}

export class GraphMcpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GraphMcpError";
  }
}

function fail(code: string, message: string): never {
  throw new GraphMcpError(code, message);
}

function combineSignals(left: AbortSignal | undefined, right: AbortSignal): AbortSignal {
  if (!left) return right;
  return AbortSignal.any([left, right]);
}

export class SdkGraphMcpPlanningWire implements GraphMcpPlanningWire {
  private readonly client = new Client({name: "sprue-graph-discovery", version: "0.1.0"});
  private readonly transport: SSEClientTransport;
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly options: {
    gatewayApiKey: string;
    gatewayEnvironment: "mainnet";
    timeoutMs?: number;
  }) {
    if (options.gatewayEnvironment !== "mainnet") {
      fail("GRAPH_MCP_NETWORK_UNSUPPORTED", "Graph MCP discovery is pinned to The Graph Network mainnet");
    }
    if (options.gatewayApiKey.trim().length === 0) fail("GRAPH_MCP_CREDENTIAL_REQUIRED", "Graph MCP gateway credential is required");
    this.transport = new SSEClientTransport(new URL(defaultEndpoint), {
      authProvider: {token: async () => options.gatewayApiKey},
    });
  }

  private timeout(signal?: AbortSignal): {signal: AbortSignal; timeout: number} {
    const timeout = this.options.timeoutMs ?? 10_000;
    return {signal: combineSignals(signal, AbortSignal.timeout(timeout)), timeout};
  }

  private async connect(signal?: AbortSignal): Promise<void> {
    if (!this.connectPromise) {
      const options = this.timeout(signal);
      this.connectPromise = this.client.connect(this.transport, options).catch((error: unknown) => {
        this.connectPromise = null;
        throw new GraphMcpError("GRAPH_MCP_CONNECTION_FAILED", error instanceof Error && error.name === "AbortError"
          ? "Graph MCP connection timed out"
          : "Graph MCP connection failed");
      });
    }
    await this.connectPromise;
  }

  async listToolNames(signal?: AbortSignal): Promise<ReadonlySet<string>> {
    await this.connect(signal);
    try {
      const result = await this.client.listTools(undefined, this.timeout(signal));
      return new Set(result.tools.map((tool) => tool.name));
    } catch {
      fail("GRAPH_MCP_TOOL_LIST_FAILED", "Graph MCP tool discovery failed");
    }
  }

  async callTool(
    tool: GraphMcpTool,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<GraphMcpWireResult> {
    await this.connect(signal);
    try {
      return await this.client.callTool({name: tool, arguments: {...args}}, this.timeout(signal));
    } catch {
      fail("GRAPH_MCP_TOOL_CALL_FAILED", `Graph MCP planning tool ${tool} failed`);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
    this.connectPromise = null;
  }
}

function extractText(tool: GraphMcpTool, result: GraphMcpWireResult, maxBytes: number): string {
  if (result.isError) fail("GRAPH_MCP_TOOL_REJECTED", `Graph MCP planning tool ${tool} returned an error`);
  if (!Array.isArray(result.content) || result.content.length === 0) {
    fail("GRAPH_MCP_RESULT_INVALID", `Graph MCP planning tool ${tool} returned no text result`);
  }
  const blocks: string[] = [];
  let bytes = 0;
  for (const block of result.content) {
    if (typeof block !== "object" || block === null || (block as {type?: unknown}).type !== "text") {
      fail("GRAPH_MCP_RESULT_INVALID", `Graph MCP planning tool ${tool} returned a non-text result`);
    }
    const text = (block as {text?: unknown}).text;
    if (typeof text !== "string") fail("GRAPH_MCP_RESULT_INVALID", `Graph MCP planning tool ${tool} returned invalid text`);
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > maxBytes) fail("GRAPH_MCP_RESULT_TOO_LARGE", `Graph MCP planning tool ${tool} exceeded its result limit`);
    blocks.push(text);
  }
  return blocks.join("\n");
}

function parseJson(tool: GraphMcpTool, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    fail("GRAPH_MCP_RESULT_INVALID", `Graph MCP planning tool ${tool} returned invalid JSON`);
  }
}

function runtimeQueryField(value: {name: string; type: RawTypeReference}): GraphRuntimeQueryField | null {
  let current: unknown = value.type;
  let list = false;
  let entityType: string | null = null;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const parsed = rawTypeReference.safeParse(current);
    if (!parsed.success) return null;
    if (parsed.data.kind === "LIST") list = true;
    if (parsed.data.name) entityType = parsed.data.name;
    current = parsed.data.ofType;
  }
  return entityType ? {name: value.name, entityType, list} : null;
}

export class RestrictedGraphMcpClient implements GraphPlanningMcpPort, GraphRuntimeSchemaPort {
  private toolNames: ReadonlySet<string> | null = null;

  constructor(
    private readonly wire: GraphMcpPlanningWire,
    private readonly limits: {maxJsonBytes: number; maxSchemaBytes: number} = {
      maxJsonBytes: 1_048_576,
      maxSchemaBytes: 5_242_880,
    },
  ) {}

  private async invoke(tool: GraphMcpPlanningTool, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<string> {
    this.toolNames ??= await this.wire.listToolNames(signal);
    if (!graphMcpPlanningTools.includes(tool)) fail("GRAPH_MCP_TOOL_FORBIDDEN", "Graph MCP tool is outside the planning allowlist");
    if (!this.toolNames.has(tool)) fail("GRAPH_MCP_TOOL_UNAVAILABLE", `Required Graph MCP planning tool ${tool} is unavailable`);
    const result = await this.wire.callTool(tool, args, signal);
    return extractText(tool, result, tool.startsWith("get_schema_by_") ? this.limits.maxSchemaBytes : this.limits.maxJsonBytes);
  }

  async getRuntimeQueryFields(manifestIpfsCid: string, signal?: AbortSignal): Promise<readonly GraphRuntimeQueryField[]> {
    const id = identifier.parse(manifestIpfsCid);
    this.toolNames ??= await this.wire.listToolNames(signal);
    if (!this.toolNames.has(runtimeSchemaTool)) {
      fail("GRAPH_MCP_TOOL_UNAVAILABLE", "The fixed Graph runtime-schema capability is unavailable");
    }
    const result = await this.wire.callTool(runtimeSchemaTool, {
      ipfs_hash: id,
      query: runtimeQueryRootDocument,
      variables: {},
    }, signal);
    const parsed = rawRuntimeQueryRoot.parse(parseJson(
      runtimeSchemaTool,
      extractText(runtimeSchemaTool, result, this.limits.maxJsonBytes),
    ));
    return (parsed.data.__schema.queryType?.fields ?? [])
      .map(runtimeQueryField)
      .filter((field): field is GraphRuntimeQueryField => field !== null);
  }

  async searchSubgraphsByKeyword(value: string, signal?: AbortSignal): Promise<GraphSearchResult> {
    const validated = keyword.parse(value);
    const tool = "search_subgraphs_by_keyword";
    const parsed = rawSearchResult.parse(parseJson(tool, await this.invoke(tool, {keyword: validated}, signal)));
    return {
      subgraphs: parsed.subgraphs.flatMap((item) => item.currentVersion === null ? [] : [{
        subgraphId: item.id,
        displayName: item.metadata.displayName,
        manifestIpfsCid: item.currentVersion.subgraphDeployment.ipfsHash,
      }]),
      total: parsed.total,
      returned: parsed.returned,
    };
  }

  async getDeploymentActivity(values: readonly string[], signal?: AbortSignal): Promise<readonly GraphDeploymentActivity[]> {
    const manifestIpfsCids = z.array(identifier).min(1).max(10).parse(values);
    const tool = "get_deployment_30day_query_counts";
    const parsed = rawActivityResult.parse(parseJson(tool, await this.invoke(tool, {ipfs_hashes: manifestIpfsCids}, signal)));
    return parsed.deployments.map((item) => ({
      manifestIpfsCid: item.ipfs_hash,
      totalQueryCount30d: item.total_query_count,
      dataPointsCount: item.data_points_count,
    }));
  }

  async getSchema(reference: GraphSourceReference, signal?: AbortSignal): Promise<string> {
    const id = identifier.parse(reference.id);
    const invocation = reference.type === "deployment_id"
      ? {tool: "get_schema_by_deployment_id" as const, args: {deployment_id: id}}
      : reference.type === "subgraph_id"
        ? {tool: "get_schema_by_subgraph_id" as const, args: {subgraph_id: id}}
        : {tool: "get_schema_by_ipfs_hash" as const, args: {ipfs_hash: id}};
    return this.invoke(invocation.tool, invocation.args, signal);
  }

  async getTopDeploymentsForContract(
    request: {contractAddress: string; chain: string},
    signal?: AbortSignal,
  ): Promise<readonly GraphContractDeployment[]> {
    const validated = {contractAddress: contractAddress.parse(request.contractAddress), chain: chain.parse(request.chain)};
    const tool = "get_top_subgraph_deployments";
    const parsed = rawContractResult.parse(parseJson(tool, await this.invoke(tool, {
      contract_address: validated.contractAddress,
      chain: validated.chain,
    }, signal)));
    return parsed.subgraphDeployments.map((item) => ({
      manifestIpfsCid: item.ipfsHash,
      network: item.manifest.network,
      queryFeesAmount: item.queryFeesAmount === undefined || item.queryFeesAmount === null ? null : String(item.queryFeesAmount),
    }));
  }

  close(): Promise<void> {
    return this.wire.close();
  }
}

export function createGraphMcpPlanningClient(options: {
  gatewayApiKey: string;
  gatewayEnvironment: "mainnet";
  timeoutMs?: number;
}): GraphPlanningMcpPort {
  return new RestrictedGraphMcpClient(new SdkGraphMcpPlanningWire(options));
}
