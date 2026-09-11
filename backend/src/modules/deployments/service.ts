import {createHmac, createHash, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import type {StructuredDagCompileInput, StructuredDagCompilation} from "../dag/compiler.js";
import type {GraphCredentialService} from "../graph-credential/service.js";
import {GraphMcpError} from "../graph/mcp-client.js";
import type {GraphPlanningMcpPort, GraphRuntimeQueryPort, GraphRuntimeSchemaPort} from "../graph/types.js";
import type {LiveSourceInput} from "./live-plan.js";
import {contentHash, createImmutableLivePlan, declaredLiveQueryEntityType, LivePlanCompilationError} from "./live-plan.js";
import {executeLivePlan} from "./runtime.js";
import {LiveDeploymentError, type AdmittedLiveSource, type LiveDeploymentRepository} from "./contracts.js";
import type {LoadedX402Gate, X402PaymentRequirements} from "./contracts.js";
import {Blocky402Error, type X402Facilitator, type X402PaymentPayload} from "../payments/blocky402-client.js";

export type GraphLiveClient = GraphPlanningMcpPort & GraphRuntimeQueryPort & GraphRuntimeSchemaPort;

export class LiveDeploymentService {
  constructor(
    private readonly repository: LiveDeploymentRepository,
    private readonly graphCredentials: GraphCredentialService,
    private readonly graphFactory: (apiKey: string) => GraphLiveClient,
    private readonly apiKeyHashKey: Buffer,
    private readonly dataPublicBaseUrl: string,
    private readonly x402PublicBaseUrl: string,
    private readonly x402Facilitator?: X402Facilitator,
  ) {}

  private keyHash(value: string): string {
    return createHmac("sha256", this.apiKeyHashKey).update("sprue-data-api-v1\0").update(value).digest("hex");
  }

  private fingerprint(operation: string, values: readonly unknown[]): string {
    const hmac = createHmac("sha256", this.apiKeyHashKey).update(operation);
    for (const value of values) hmac.update("\0").update(JSON.stringify(value));
    return hmac.digest("hex");
  }

  private internalX402Key(deploymentId: string, publicationId: string): string {
    return `sprue_live_${createHmac("sha256", this.apiKeyHashKey)
      .update("sprue-x402-internal-key-v1\0")
      .update(deploymentId)
      .update("\0")
      .update(publicationId)
      .digest("base64url")}`;
  }

  private x402EndpointUrl(ownerUserId: string, productId: string): string {
    return `${this.x402PublicBaseUrl.replace(/\/$/, "")}/${ownerUserId}/${productId}`;
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
        let queryEntityType: string | null;
        try {
          queryEntityType = declaredLiveQueryEntityType(source, schemaDocument);
        } catch (error) {
          throw new LivePlanCompilationError(error);
        }
        if (!queryEntityType) {
          const queryFields = await graph.getRuntimeQueryFields(source.manifestIpfsCid, input.signal);
          queryEntityType = queryFields.find((field) =>
            field.name === source.queryEntity && field.list)?.entityType ?? null;
        }
        if (!queryEntityType) throw new LiveDeploymentError("LIVE_SOURCE_QUERY_ENTITY_INVALID");
        admitted.push({
          ...source,
          queryEntityType,
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
        if (error instanceof LivePlanCompilationError) throw new LiveDeploymentError("LIVE_SOURCE_SCHEMA_INVALID");
        throw new LiveDeploymentError("LIVE_VERSION_PERSIST_FAILED");
      }
    } catch (error) {
      if (error instanceof GraphMcpError) throw new LiveDeploymentError(error.code);
      if (error instanceof LivePlanCompilationError) throw new LiveDeploymentError("LIVE_SOURCE_SCHEMA_INVALID");
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

  async suspend(workspaceId: string, deploymentId: string) {
    const deployment = await this.repository.suspend({workspaceId, deploymentId});
    if (!deployment) throw new LiveDeploymentError("DEPLOYMENT_NOT_FOUND");
    return deployment;
  }

  async publishX402(input: {
    workspaceId: string;
    deploymentId: string;
    actorUserId: string;
    priceAtomic: string;
    signal?: AbortSignal;
  }) {
    if (!this.x402Facilitator) throw new LiveDeploymentError("BLOCKY402_UNAVAILABLE");
    if (!/^[1-9][0-9]{0,77}$/.test(input.priceAtomic)) throw new LiveDeploymentError("X402_PRICE_INVALID");
    const candidate = await this.repository.loadPublicationCandidate(input.workspaceId, input.deploymentId);
    if (!candidate) throw new LiveDeploymentError("X402_PUBLICATION_PREREQUISITES_MISSING");
    let supported;
    try {
      supported = await this.x402Facilitator.supported(input.signal);
    } catch (error) {
      if (error instanceof Blocky402Error) throw new LiveDeploymentError("BLOCKY402_UNAVAILABLE");
      throw error;
    }
    const requirements: X402PaymentRequirements = {
      scheme: "exact",
      network: "hedera:testnet",
      amount: input.priceAtomic,
      payTo: candidate.recipientAddress,
      maxTimeoutSeconds: 300,
      asset: "0.0.0",
      extra: {feePayer: supported.feePayer},
    };
    const publicationId = randomUUID();
    const internalApiKey = this.internalX402Key(candidate.deploymentId, publicationId);
    try {
      return await this.repository.publishX402({
        publicationId,
        candidate,
        actorUserId: input.actorUserId,
        priceAtomic: input.priceAtomic,
        requirements,
        facilitatorCapability: supported.capability,
        facilitatorCapabilityHash: contentHash(supported.capability),
        facilitatorUrl: this.x402Facilitator.publicUrl,
        internalCredential: {
          id: randomUUID(),
          prefix: `${internalApiKey.slice(0, 19)}...`,
          hash: this.keyHash(internalApiKey),
        },
      });
    } catch (error) {
      if (error instanceof LiveDeploymentError) throw error;
      throw new LiveDeploymentError("X402_PUBLICATION_FAILED");
    }
  }

  async retireX402(workspaceId: string, deploymentId: string, publicationId: string) {
    const publication = await this.repository.retireX402({workspaceId, deploymentId, publicationId});
    if (!publication) throw new LiveDeploymentError("X402_PUBLICATION_NOT_FOUND");
    return publication;
  }

  private paymentRequired(gate: LoadedX402Gate, error = "PAYMENT-SIGNATURE header is required") {
    return {
      kind: "payment_required" as const,
      body: {
        x402Version: 2 as const,
        error,
        resource: {
          url: this.x402EndpointUrl(gate.ownerUserId, gate.productId),
          description: gate.productName,
          mimeType: "application/json",
        },
        accepts: [gate.requirements],
        extensions: {},
      },
    };
  }

  private decodePaymentPayload(value: string): X402PaymentPayload | null {
    if (value.length < 4 || value.length > 65_536 || !/^[A-Za-z0-9+/_=-]+$/.test(value)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
      const accepted = parsed.accepted as Record<string, unknown> | undefined;
      const payload = parsed.payload as Record<string, unknown> | undefined;
      if (parsed.x402Version !== 2 || !accepted || accepted.scheme !== "exact"
        || accepted.network !== "hedera:testnet" || !payload || typeof payload.transaction !== "string"
        || payload.transaction.length < 16 || payload.transaction.length > 262_144) return null;
      return parsed as unknown as X402PaymentPayload;
    } catch {
      return null;
    }
  }

  async executeX402Request(input: {
    ownerUserId: string;
    productRef: string;
    paymentSignature: string | undefined;
    limit: number;
    path: string;
    signal?: AbortSignal;
  }) {
    const gate = await this.repository.loadX402Gate(input.ownerUserId, input.productRef);
    if (!gate) throw new LiveDeploymentError("X402_PUBLICATION_NOT_FOUND");
    if (!input.paymentSignature) return this.paymentRequired(gate);
    const payload = this.decodePaymentPayload(input.paymentSignature);
    if (!payload || contentHash(payload.accepted) !== contentHash(gate.requirements)) {
      return this.paymentRequired(gate, "The supplied payment does not match this resource requirement");
    }
    if (!this.x402Facilitator) throw new LiveDeploymentError("BLOCKY402_UNAVAILABLE");
    const authorizationHash = createHash("sha256").update(input.paymentSignature).digest("hex");
    const requestHash = contentHash({path: input.path, limit: input.limit, publicationId: gate.publicationId});
    const resourceUrl = this.x402EndpointUrl(gate.ownerUserId, gate.productId);
    const record = await this.repository.beginPaidRequest({
      gate,
      authorizationHash,
      requestHash,
      correlationId: randomUUID(),
      idempotencyKey: authorizationHash,
      resourceUrl,
      path: input.path,
      limit: input.limit,
      recoveryCapabilityHash: this.fingerprint("x402-recovery", [authorizationHash, gate.publicationId]),
    });
    if (!record) throw new LiveDeploymentError("X402_PAYMENT_REPLAYED");
    let settlementSucceeded = false;
    try {
      const verified = await this.x402Facilitator.verify(payload, gate.requirements, input.signal);
      if (!verified.valid || !verified.payer) {
        await this.repository.failPaidRequest({...record, code: verified.reason ?? "X402_PAYMENT_INVALID"});
        return this.paymentRequired(gate, "The supplied payment could not be verified");
      }
      const settled = await this.x402Facilitator.settle(payload, gate.requirements, input.signal);
      if (!settled.success || !settled.transaction || !settled.payer) {
        await this.repository.failPaidRequest({...record, code: settled.reason ?? "X402_SETTLEMENT_FAILED"});
        throw new LiveDeploymentError("X402_SETTLEMENT_FAILED");
      }
      settlementSucceeded = true;
      await this.repository.confirmPaidSettlement({
        ...record,
        gate,
        payerAddress: settled.payer,
        transaction: settled.transaction,
        settlementEvidence: settled.evidence,
      });
      const internalApiKey = this.internalX402Key(gate.deploymentId, gate.publicationId);
      const value = await this.execute({
        ownerUserId: gate.ownerUserId,
        productRef: gate.productId,
        authorization: `Bearer ${internalApiKey}`,
        limit: input.limit,
        signal: input.signal,
      });
      const responseBody = {data: value.data, meta: value.meta};
      const serialized = JSON.stringify(responseBody);
      await this.repository.completePaidRequest({
        ...record,
        responseContentHash: createHash("sha256").update(serialized).digest("hex"),
        responseByteCount: Buffer.byteLength(serialized),
      });
      return {
        kind: "success" as const,
        value,
        paymentResponse: {
          success: true,
          transaction: settled.transaction,
          network: "hedera:testnet",
          payer: settled.payer,
        },
      };
    } catch (error) {
      if (!(error instanceof LiveDeploymentError && error.code === "X402_SETTLEMENT_FAILED")) {
        await this.repository.failPaidRequest({
          ...record,
          code: error instanceof LiveDeploymentError ? error.code : "X402_REQUEST_FAILED",
          preservePayment: settlementSucceeded,
        }).catch(() => undefined);
      }
      if (error instanceof Blocky402Error) throw new LiveDeploymentError("BLOCKY402_UNAVAILABLE");
      throw error;
    }
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
