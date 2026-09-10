import {createHash} from "node:crypto";
import type {GraphCredentialService} from "../graph-credential/service.js";
import {inspectGraphSchema} from "./discovery.js";
import {GraphMcpError} from "./mcp-client.js";
import {graphSubgraphNetworkCatalog, type GraphSubgraphNetwork} from "./network-catalog.js";
import type {
  GraphPlanningMcpPort,
  GraphRuntimeSchemaPort,
  GraphSourceReference,
} from "./types.js";

export type BuilderGraphClient = GraphPlanningMcpPort & GraphRuntimeSchemaPort;

export interface BuilderSourceSearchCandidate {
  displayName: string;
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  reportedNetwork: string | null;
  networkEvidence: "matched" | "unknown";
  totalQueryCount30d: number | null;
  reference: {type: "ipfs_hash"; id: string};
}

export interface BuilderSourceValidation {
  sourceId: string;
  provider: "the_graph";
  displayName: string;
  reference: GraphSourceReference;
  dataNetwork: string | null;
  networkLabel: string | null;
  schemaHash: string;
  schemaBytes: number;
  queryEntitySource: "source_sdl" | "runtime_introspection";
  entities: readonly {
    queryEntity: string;
    entityType: string;
    fields: readonly {
      path: string;
      graphType: string;
      valueType: string;
      nullable: boolean;
      list: boolean;
    }[];
  }[];
  activity: {
    totalQueryCount30d: number;
    dataPointsCount: number;
  } | null;
  access: {
    mode: "api_key";
    credentialId: string;
    verified: true;
  };
  observedAt: string;
  admissionStatus: "planning_verified";
}

export class BuilderSourceInputError extends Error {
  constructor() {
    super("BUILDER_SOURCE_INPUT_INVALID");
    this.name = "BuilderSourceInputError";
  }
}

export class BuilderSourceCredentialRequiredError extends Error {
  constructor() {
    super("GRAPH_CREDENTIAL_REQUIRED");
    this.name = "BuilderSourceCredentialRequiredError";
  }
}

export class BuilderSourceVerificationError extends Error {
  constructor() {
    super("GRAPH_SOURCE_VERIFICATION_FAILED");
    this.name = "BuilderSourceVerificationError";
  }
}

export class BuilderSourceDependencyError extends Error {
  constructor() {
    super("GRAPH_SOURCE_DEPENDENCY_UNAVAILABLE");
    this.name = "BuilderSourceDependencyError";
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function resolveNetwork(value: string | null | undefined): GraphSubgraphNetwork | null {
  const requested = normalize(value ?? "");
  if (!requested) return null;
  const network = graphSubgraphNetworkCatalog.find((candidate) => [
    candidate.dataNetwork,
    candidate.graphNetworkId,
    candidate.label,
    ...candidate.aliases,
  ].some((alias) => normalize(alias) === requested));
  if (!network) throw new BuilderSourceInputError();
  return network;
}

function displayMatchesNetwork(displayName: string, network: GraphSubgraphNetwork | null): boolean {
  if (!network) return false;
  const display = ` ${normalize(displayName)} `;
  return [network.graphNetworkId, network.label, ...network.aliases]
    .map(normalize)
    .some((alias) => alias && display.includes(` ${alias} `));
}

function validateQuery(value: string): string {
  const query = value.trim();
  if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new BuilderSourceInputError();
  }
  return query;
}

function validateIdentifier(reference: GraphSourceReference): GraphSourceReference {
  const id = reference.id.trim();
  if (!id || id.length > 256 || !/^[A-Za-z0-9:._-]+$/.test(id)) {
    throw new BuilderSourceInputError();
  }
  if (!new Set(["subgraph_id", "deployment_id", "ipfs_hash"]).has(reference.type)) {
    throw new BuilderSourceInputError();
  }
  return {...reference, id};
}

function sourceId(reference: GraphSourceReference): string {
  const digest = createHash("sha256")
    .update(reference.type)
    .update("\0")
    .update(reference.id)
    .digest("hex")
    .slice(0, 20);
  return `graph:manual:${digest}`;
}

function displayName(reference: GraphSourceReference): string {
  const label = reference.type === "subgraph_id"
    ? "Subgraph"
    : reference.type === "deployment_id"
      ? "Deployment"
      : "IPFS deployment";
  const compact = reference.id.length > 30
    ? `${reference.id.slice(0, 14)}…${reference.id.slice(-10)}`
    : reference.id;
  return `${label} ${compact}`;
}

export class BuilderGraphSourceService {
  constructor(
    private readonly credentials: Pick<GraphCredentialService, "list" | "resolve">,
    private readonly createClient: (apiKey: string) => BuilderGraphClient,
  ) {}

  private async withClient<T>(workspaceId: string, operation: (
    client: BuilderGraphClient,
    credentialId: string,
  ) => Promise<T>): Promise<T> {
    let credentialId: string;
    let apiKey: string | null;
    try {
      const credential = (await this.credentials.list(workspaceId))
        .find((candidate) => candidate.isSelected && candidate.status === "active");
      if (!credential) throw new BuilderSourceCredentialRequiredError();
      credentialId = credential.id;
      apiKey = await this.credentials.resolve(workspaceId, credential.id);
    } catch (error) {
      if (error instanceof BuilderSourceCredentialRequiredError) throw error;
      throw new BuilderSourceDependencyError();
    }
    if (!apiKey) throw new BuilderSourceCredentialRequiredError();
    const client = this.createClient(apiKey);
    try {
      return await operation(client, credentialId);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async search(input: {
    workspaceId: string;
    query: string;
    network?: string | null;
  }): Promise<{
    query: string;
    network: {dataNetwork: string; graphNetworkId: string; label: string} | null;
    total: number;
    candidates: readonly BuilderSourceSearchCandidate[];
  }> {
    const query = validateQuery(input.query);
    const network = resolveNetwork(input.network);
    const contract = /^0x[a-fA-F0-9]{40}$/.test(query);
    if (query.startsWith("0x") && !contract) throw new BuilderSourceInputError();
    if (contract && !network) throw new BuilderSourceInputError();

    return this.withClient(input.workspaceId, async (client) => {
      const discovered = contract
        ? (await client.getTopDeploymentsForContract({
          contractAddress: query,
          chain: network!.graphNetworkId,
        })).map((candidate) => ({
          displayName: `Contract ${query.slice(0, 10)}…${query.slice(-6)}`,
          logicalSubgraphId: null,
          manifestIpfsCid: candidate.manifestIpfsCid,
          reportedNetwork: candidate.network,
        }))
        : (await Promise.all([
          client.searchSubgraphsByKeyword(query),
          ...(network && `${query} ${network.graphNetworkId}`.length <= 120
            ? [client.searchSubgraphsByKeyword(`${query} ${network.graphNetworkId}`)]
            : []),
        ])).flatMap((result) => result.subgraphs.map((candidate) => ({
          displayName: candidate.displayName,
          logicalSubgraphId: candidate.subgraphId,
          manifestIpfsCid: candidate.manifestIpfsCid,
          reportedNetwork: null,
        })));
      const unique = [...new Map(discovered.map((candidate) => [candidate.manifestIpfsCid, candidate])).values()]
        .slice(0, 10);
      const activity = unique.length > 0
        ? await client.getDeploymentActivity(unique.map((candidate) => candidate.manifestIpfsCid))
        : [];
      const activityById = new Map(activity.map((item) => [item.manifestIpfsCid, item.totalQueryCount30d]));
      const candidates = unique.map((candidate) => ({
        ...candidate,
        networkEvidence: candidate.reportedNetwork === network?.graphNetworkId
          || displayMatchesNetwork(candidate.displayName, network)
          ? "matched" as const
          : "unknown" as const,
        totalQueryCount30d: activityById.get(candidate.manifestIpfsCid) ?? null,
        reference: {type: "ipfs_hash" as const, id: candidate.manifestIpfsCid},
      })).sort((left, right) =>
        Number(right.networkEvidence === "matched") - Number(left.networkEvidence === "matched")
        || (right.totalQueryCount30d ?? -1) - (left.totalQueryCount30d ?? -1)
        || left.displayName.localeCompare(right.displayName));
      return {
        query,
        network: network ? {
          dataNetwork: network.dataNetwork,
          graphNetworkId: network.graphNetworkId,
          label: network.label,
        } : null,
        total: candidates.length,
        candidates,
      };
    });
  }

  async validate(input: {
    workspaceId: string;
    reference: GraphSourceReference;
    network?: string | null;
  }): Promise<BuilderSourceValidation> {
    const reference = validateIdentifier(input.reference);
    const network = resolveNetwork(input.network);
    return this.withClient(input.workspaceId, async (client, credentialId) => {
      let sdl: string;
      try {
        sdl = await client.getSchema(reference);
      } catch (error) {
        if (error instanceof GraphMcpError && error.code === "GRAPH_MCP_TOOL_REJECTED") {
          throw new BuilderSourceVerificationError();
        }
        throw error;
      }
      const schemaBytes = Buffer.byteLength(sdl, "utf8");
      if (!sdl.trim() || schemaBytes > 5_242_880) throw new BuilderSourceVerificationError();
      let inspection;
      try {
        inspection = inspectGraphSchema(sdl);
        if (inspection.requiresRuntimeIntrospection) {
          if (reference.type !== "ipfs_hash") throw new BuilderSourceVerificationError();
          const runtimeFields = await client.getRuntimeQueryFields(reference.id);
          inspection = inspectGraphSchema(sdl, runtimeFields);
        }
      } catch (error) {
        if (error instanceof BuilderSourceVerificationError) throw error;
        throw new BuilderSourceVerificationError();
      }
      const entities = inspection.entities.filter((entity) => entity.fields.length > 0);
      if (entities.length === 0) throw new BuilderSourceVerificationError();
      const activity = reference.type === "ipfs_hash"
        ? (await client.getDeploymentActivity([reference.id]))[0] ?? null
        : null;
      return {
        sourceId: sourceId(reference),
        provider: "the_graph" as const,
        displayName: displayName(reference),
        reference,
        dataNetwork: network?.dataNetwork ?? null,
        networkLabel: network?.label ?? null,
        schemaHash: `sha256:${createHash("sha256").update(sdl).digest("hex")}`,
        schemaBytes,
        queryEntitySource: inspection.queryEntitySource,
        entities,
        activity: activity ? {
          totalQueryCount30d: activity.totalQueryCount30d,
          dataPointsCount: activity.dataPointsCount,
        } : null,
        access: {mode: "api_key" as const, credentialId, verified: true as const},
        observedAt: new Date().toISOString(),
        admissionStatus: "planning_verified" as const,
      };
    });
  }
}
