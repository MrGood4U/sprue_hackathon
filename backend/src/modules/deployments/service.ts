import {createHmac, createHash, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import type {StructuredDagCompileInput, StructuredDagCompilation} from "../dag/compiler.js";
import type {GraphCredentialService} from "../graph-credential/service.js";
import {GraphMcpError} from "../graph/mcp-client.js";
import type {GraphPlanningMcpPort, GraphRuntimeQueryPort} from "../graph/types.js";
import type {LiveSourceInput} from "./live-plan.js";
import {contentHash, createImmutableLivePlan} from "./live-plan.js";
import {executeLivePlan} from "./runtime.js";
import {LiveDeploymentError, type AdmittedLiveSource, type LiveDeploymentRepository} from "./contracts.js";

export type GraphLiveClient = GraphPlanningMcpPort & GraphRuntimeQueryPort;

export class LiveDeploymentService {
  constructor(
    private readonly repository: LiveDeploymentRepository,
    private readonly graphCredentials: GraphCredentialService,
    private readonly graphFactory: (apiKey: string) => GraphLiveClient,
    private readonly apiKeyHashKey: Buffer,
    private readonly dataPublicBaseUrl: string,
  ) {}

  private keyHash(value: string): string {
    return createHmac("sha256", this.apiKeyHashKey).update("sprue-data-api-v1\0").update(value).digest("hex");
  }

  private fingerprint(operation: string, values: readonly unknown[]): string {
    const hmac = createHmac("sha256", this.apiKeyHashKey).update(operation);
    for (const value of values) hmac.update("\0").update(JSON.stringify(value));
    return hmac.digest("hex");
  }

  async buildVersion(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    compilation: Extract<StructuredDagCompilation, {status: "passed"}>;
    dag: StructuredDagCompileInput["dag"];
    sources: readonly LiveSourceInput[];
    signal?: AbortSignal;
  }) {
    const sourceNodeIds = input.dag.nodes.filter((node) => node.type === "source")
      .map((node) => String(node.config.sourceId ?? node.config.sourceKey ?? ""));
    if (sourceNodeIds.length !== input.sources.length
      || sourceNodeIds.some((id) => !input.sources.some((source) => source.id === id))) {
      throw new LiveDeploymentError("LIVE_SOURCE_BINDING_INVALID");
    }
    const selected = (await this.graphCredentials.list(input.workspaceId))
      .find((credential) => credential.isSelected && credential.status === "active");
    if (!selected) throw new LiveDeploymentError("GRAPH_CREDENTIAL_NOT_SELECTED");
    const apiKey = await this.graphCredentials.resolve(input.workspaceId, selected.id);
    if (!apiKey) throw new LiveDeploymentError("GRAPH_CREDENTIAL_UNAVAILABLE");
    const graph = this.graphFactory(apiKey);
    try {
      const admitted: AdmittedLiveSource[] = [];
      for (const source of input.sources) {
        const schemaDocument = await graph.getSchema({type: "ipfs_hash", id: source.manifestIpfsCid}, input.signal);
        admitted.push({
          ...source,
          schemaDocument,
          schemaHash: createHash("sha256").update(schemaDocument).digest("hex"),
          providerCredentialId: selected.id,
        });
      }
      try {
        return await this.repository.persistVersion({
          workspaceId: input.workspaceId,
          productId: input.productId,
          actorUserId: input.actorUserId,
          sources: admitted,
          createPlan: (snapshotIds) => createImmutableLivePlan({
            compilation: input.compilation,
            dag: input.dag,
            sources: admitted.map((source) => ({...source, sourceSnapshotId: snapshotIds.get(source.id)!})),
          }),
        });
      } catch (error) {
        if (error instanceof LiveDeploymentError) throw error;
        throw new LiveDeploymentError("LIVE_VERSION_PERSIST_FAILED");
      }
    } catch (error) {
      if (error instanceof GraphMcpError) throw new LiveDeploymentError(error.code);
      throw error;
    } finally {
      await graph.close().catch(() => undefined);
    }
  }

  async deploy(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    alias?: string;
    idempotencyKey: string;
  }) {
    const alias = (input.alias?.trim() || input.productId).toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(alias)) throw new LiveDeploymentError("DEPLOYMENT_ALIAS_INVALID");
    const apiKey = `sprue_live_${createHmac("sha256", this.apiKeyHashKey)
      .update("sprue-data-api-issued-key-v1\0")
      .update(input.actorUserId)
      .update("\0")
      .update(input.workspaceId)
      .update("\0")
      .update(input.productId)
      .update("\0")
      .update(input.idempotencyKey)
      .digest("base64url")}`;
    const credential = {
      id: randomUUID(),
      name: "Default live API key",
      prefix: `${apiKey.slice(0, 19)}...`,
      hash: this.keyHash(apiKey),
    };
    const result = await this.repository.deploy({
      ...input,
      alias,
      publicBaseUrl: this.dataPublicBaseUrl,
      requestFingerprint: this.fingerprint("deploy_data_product", [
        input.workspaceId,
        input.productId,
        alias,
      ]),
      fingerprintKeyVersion: "data-api-command-v1",
      credential,
    });
    if (result.kind === "command_conflict") {
      throw new LiveDeploymentError("DEPLOYMENT_COMMAND_CONFLICT");
    }
    return {
      deployment: result.deployment,
      apiKey: {
        id: result.credential.id,
        name: result.credential.name,
        prefix: result.credential.prefix,
        apiKey,
        createdAt: result.createdAt.toISOString(),
      },
    };
  }

  async execute(input: {ownerUserId: string; productRef: string; authorization: string | undefined; limit: number; signal?: AbortSignal}) {
    const match = /^Bearer (sprue_live_[A-Za-z0-9_-]{43})$/.exec(input.authorization ?? "");
    if (!match) throw new LiveDeploymentError("DATA_API_KEY_REQUIRED");
    const loaded = await this.repository.loadAuthorized({
      ownerUserId: input.ownerUserId,
      productRef: input.productRef,
      keyHash: this.keyHash(match[1]!),
    });
    if (!loaded) throw new LiveDeploymentError("DATA_API_KEY_INVALID");
    if (contentHash(loaded.specification) !== loaded.specHash) throw new LiveDeploymentError("LIVE_PLAN_INTEGRITY_FAILED");
    const result = await executeLivePlan(loaded.specification, async (credentialId) => {
      const apiKey = await this.graphCredentials.resolve(loaded.workspaceId, credentialId);
      if (!apiKey) throw new LiveDeploymentError("GRAPH_CREDENTIAL_UNAVAILABLE");
      return this.graphFactory(apiKey);
    }, input.signal);
    return {
      data: result.rows.slice(0, input.limit),
      meta: {
        serveMode: "live" as const,
        versionId: loaded.activeVersionId,
        specHash: loaded.specHash,
        queriedAt: result.queriedAt,
        sourceRequests: result.sourceRequests,
        sourceRows: result.sourceRows,
        returnedRows: Math.min(result.rows.length, input.limit),
      },
    };
  }

  async exportBundle(workspaceId: string, productId: string) {
    const value = await this.repository.loadExport(workspaceId, productId);
    if (!value) throw new LiveDeploymentError("READY_VERSION_NOT_FOUND");
    if (contentHash(value.specification) !== value.specHash) throw new LiveDeploymentError("LIVE_PLAN_INTEGRITY_FAILED");
    const runnerTemplate = await readFile(new URL("./portable-runner.mjs", import.meta.url), "utf8");
    const runner = runnerTemplate.replace("__SPRUE_EXPECTED_SPEC_HASH__", value.specHash);
    return {
      format: "sprue-private-deployment-bundle-v1",
      productName: value.productName,
      versionId: value.versionId,
      specHash: value.specHash,
      files: {
        "dag.json": JSON.stringify(value.specification, null, 2),
        "runner.mjs": runner,
        ".env.example": "PORT=8787\nSPRUE_PRIVATE_API_KEY=replace-with-at-least-24-random-characters\nTHE_GRAPH_API_KEY=replace-with-your-server-side-graph-api-key\n# Optional JSON map keyed by source ID or manifest CID; values are full GraphQL URLs.\n# SPRUE_GRAPH_ENDPOINTS_JSON={}\n",
        "README.txt": [
          "Sprue private live deployment",
          "",
          "Requirements: Node.js 24 or newer. No npm install is required.",
          "1. Save each entry in files as the file name shown.",
          "2. Set SPRUE_PRIVATE_API_KEY and THE_GRAPH_API_KEY as server-side secrets; never put them in dag.json or runner.mjs.",
          "3. Start with: node runner.mjs",
          "4. Call with: curl -H \"Authorization: Bearer $SPRUE_PRIVATE_API_KEY\" http://127.0.0.1:8787/?limit=100",
          "",
          "The runner verifies dag.json against the immutable specification hash at startup. Every data request issues fresh live GraphQL queries. Result rows are never cached.",
          "Use SPRUE_GRAPH_ENDPOINTS_JSON only when a source needs a custom GraphQL URL. Key the JSON object by compiled source ID or manifest CID.",
        ].join("\n"),
      },
    };
  }
}
