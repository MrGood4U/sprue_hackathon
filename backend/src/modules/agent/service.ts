import {createHash, createHmac, randomUUID} from "node:crypto";
import type {GraphCredentialService} from "../graph-credential/service.js";
import {GraphSourceDiscoveryService} from "../graph/discovery.js";
import {RestrictedGraphMcpClient, SdkGraphMcpPlanningWire} from "../graph/mcp-client.js";
import type {ModelProfileService} from "../model-profile/service.js";
import type {Logger} from "../../shared/logger.js";
import {MemoryGraphSchemaCache} from "../graph/schema-cache.js";
import {graphPlannerNetworkCatalog} from "../graph/network-catalog.js";
import type {GraphSchemaCachePort} from "../graph/types.js";
import {
  AgentCommandConflictError,
  AgentCancellationUnavailableError,
  AgentInputError,
  AgentNotFoundError,
  AgentOperationInProgressError,
  AgentStorageError,
  type AgentCommandView,
  type AgentContent,
  type AgentPlannerFactory,
  type AgentProposalContent,
  type AgentRepository,
  type AgentSessionView,
} from "./contracts.js";
import {AgentHarness} from "./harness/controller.js";
import {sourceRole} from "./harness/compiler.js";
import {createAgentModel} from "./harness/factory.js";
import {AgentModelRequestError} from "./harness/remote-model.js";
import type {AgentDebugSink, AgentTraceSink, HarnessExplorationResult, HarnessTraceEvent} from "./harness/types.js";

export const agentNetworkCatalog = graphPlannerNetworkCatalog;

const productionPlannerFactory: AgentPlannerFactory = ({modelConfig, graphApiKey, graphGatewayEnvironment, graphSchemaCache, debugSink, traceSink}) => {
  const wire = new SdkGraphMcpPlanningWire({
    gatewayApiKey: graphApiKey,
    gatewayEnvironment: graphGatewayEnvironment,
    timeoutMs: modelConfig.timeoutMs,
  });
  const graph = new RestrictedGraphMcpClient(wire);
  const harness = new AgentHarness(
    createAgentModel(modelConfig),
    undefined,
    new GraphSourceDiscoveryService(graph, undefined, graphSchemaCache, graph),
    debugSink,
  );
  return {
    explore: (input, signal) => harness.explore(input, signal, traceSink),
    close: () => wire.close(),
  };
};

function normalizedText(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new AgentInputError();
  return normalized;
}

function optionalText(value: string | null | undefined, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) throw new AgentInputError();
  return normalized || null;
}

function contentHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function safePlanningError(error: unknown): {code: string; message: string; retryable: boolean} {
  const candidate = typeof error === "object" && error && "code" in error
    ? String((error as {code: unknown}).code)
    : "AGENT_PLANNING_FAILED";
  const code = /^[A-Z0-9_]{3,80}$/.test(candidate) ? candidate : "AGENT_PLANNING_FAILED";
  const known: Readonly<Record<string, {message: string; retryable: boolean}>> = {
    MODEL_PROFILE_REQUIRED: {
      message: "Configure and save a Model Service profile before generating a plan.",
      retryable: false,
    },
    GRAPH_CREDENTIAL_REQUIRED: {
      message: "Validate and select a Graph API credential before source discovery.",
      retryable: false,
    },
    AGENT_MODEL_REQUEST_FAILED: {
      message: "The configured model could not complete the bounded planning request.",
      retryable: true,
    },
    AGENT_RUN_TIMEOUT: {
      message: "The Agent planning run reached its configured time limit.",
      retryable: true,
    },
    AGENT_RUN_CANCELLED: {
      message: "The Agent planning run was stopped by the creator.",
      retryable: true,
    },
    AGENT_HARNESS_SCHEMA_ERROR: {
      message: "The configured model did not return the required planning structure after one bounded repair.",
      retryable: true,
    },
    GRAPH_MCP_CONNECTION_FAILED: {
      message: "The Graph source-discovery service could not be reached.",
      retryable: true,
    },
    GRAPH_MCP_TOOL_CALL_FAILED: {
      message: "The Graph source-discovery service did not complete a required metadata call.",
      retryable: true,
    },
    GRAPH_MCP_TOOL_UNAVAILABLE: {
      message: "A required Graph metadata capability is currently not available.",
      retryable: false,
    },
    FEASIBILITY_UNSUPPORTED_EVIDENCE_CONFLICT: {
      message: "The configured model repeated a source-evidence claim that conflicts with the inspected Graph schema.",
      retryable: true,
    },
  };
  return {code, ...(known[code] ?? {
    message: "The bounded Agent plan could not be completed. Review the intent and try again.",
    retryable: true,
  })};
}

function proposalContent(
  result: Extract<HarnessExplorationResult, {kind: "feasibility" | "unsupported"}>,
  traceStreamId: string,
  durationMs: number,
): AgentProposalContent {
  if (result.model.provider !== "remote") throw Object.assign(new Error("Remote model required"), {code: "REMOTE_MODEL_REQUIRED"});
  if (result.kind === "unsupported") {
    const withoutHash = {
      schemaVersion: 1 as const,
      kind: "proposal" as const,
      status: "unsupported" as const,
      intentSummary: result.unsupported.reason,
      specification: null,
      assumptions: [],
      issues: [{code: result.unsupported.code, message: result.unsupported.reason}],
      sourceEvidence: [],
      builderDraft: null,
      composition: null,
      discovery: result.discovery ? {
        gatewayEnvironment: result.discovery.gatewayEnvironment,
        searchCalls: result.discovery.searchCalls,
        inspectedSchemas: result.discovery.inspectedSchemas,
        candidateCount: result.discovery.candidates.length,
      } : null,
      model: result.model as {provider: "remote"; model: string; calls: number},
      readyForCompilation: false as const,
      durationMs,
      traceStreamId,
      trace: result.trace,
    };
    return {...withoutHash, proposalHash: contentHash(withoutHash)};
  }

  const candidates = new Map(result.discovery.candidates.map((candidate) => [candidate.candidateRef, candidate]));
  const needs = new Map(result.sourceNeeds.map((need) => [need.id, need]));
  const labels = new Map<string, string>(agentNetworkCatalog.map((network) => [network.dataNetwork, network.label]));
  const sourceEvidence = result.feasibility.selections.flatMap((selection) => {
    const candidate = candidates.get(selection.candidateRef);
    const need = needs.get(selection.sourceNeedId);
    const entity = candidate?.entities.find((value) => value.queryEntity === selection.queryEntity);
    if (!candidate || !need || candidate.status === "incompatible" || !entity) return [];
    return [{
      candidateRef: candidate.candidateRef,
      sourceNeedId: selection.sourceNeedId,
      dataNetwork: need.dataNetwork,
      networkLabel: labels.get(need.dataNetwork) ?? need.dataNetwork,
      displayName: candidate.displayName,
      logicalSubgraphId: candidate.logicalSubgraphId,
      manifestIpfsCid: candidate.manifestIpfsCid,
      queryEntity: entity.queryEntity,
      status: candidate.status,
      rationale: selection.rationale,
      matchedFacts: selection.fieldBindings.map((binding) => binding.requirementId),
      totalQueryCount30d: candidate.totalQueryCount30d,
      limitations: candidate.limitations,
    }];
  });
  const issues = [...new Set([
    "Immutable Deployment ID, historical coverage, access binding, bounded GraphQL compilation, and source snapshot admission are required before execution.",
    ...result.blockers,
  ])].map((message) => ({code: "SOURCE_ADMISSION_REQUIRED", message}));
  const builderSources = result.feasibility.selections.flatMap((selection) => {
    const candidate = candidates.get(selection.candidateRef);
    const need = needs.get(selection.sourceNeedId);
    const entity = candidate?.entities.find((value) => value.queryEntity === selection.queryEntity);
    if (!candidate || !need || candidate.status === "incompatible" || !entity) return [];
    return [{
      id: selection.candidateRef,
      sourceNeedId: selection.sourceNeedId,
      candidateRef: selection.candidateRef,
      dataNetwork: need.dataNetwork,
      displayName: candidate.displayName,
      logicalSubgraphId: candidate.logicalSubgraphId,
      manifestIpfsCid: candidate.manifestIpfsCid,
      queryEntity: selection.queryEntity,
      fieldBindings: selection.fieldBindings,
      auxiliaryFieldBindings: selection.auxiliaryFieldBindings,
      evidenceStatus: candidate.status,
    }];
  });
  const builderDraft = {
    schemaVersion: 1 as const,
    status: "requires_source_admission" as const,
    sources: builderSources,
    nodes: [
      ...builderSources.map((source) => ({
        id: sourceRole(source.sourceNeedId),
        type: "source" as const,
        operatorVersion: "1" as const,
        config: {
          sourceId: source.id,
          queryEntity: source.queryEntity,
          fieldBindings: source.fieldBindings,
          auxiliaryFieldBindings: source.auxiliaryFieldBindings,
        },
      })),
      ...result.feasibility.composition.nodes.map((node) => ({
        id: node.role,
        type: node.operator,
        operatorVersion: node.operatorVersion,
        config: node.config,
      })),
    ],
    edges: result.feasibility.composition.connections.map((connection) => ({
      fromNode: connection.fromRole,
      fromPort: "rows" as const,
      toNode: connection.toRole,
      toPort: connection.inputRole,
    })),
    outputSchema: {
      fields: result.discoveryPlan.semanticPlan.result.fields.map((field) => ({
        name: field.name,
        type: field.type,
        nullable: field.nullable,
        unit: field.unit,
      })),
    },
    refreshPolicy: result.discoveryPlan.semanticPlan.refresh,
  };
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "proposal" as const,
    status: "needs_input" as const,
    intentSummary: result.discoveryPlan.semanticPlan.summary,
    specification: null,
    assumptions: result.feasibility.assumptions,
    issues,
    sourceEvidence,
    builderDraft,
    composition: {
      sourceCount: sourceEvidence.length,
      operatorCount: result.feasibility.composition.nodes.length,
      edgeCount: result.feasibility.composition.connections.length,
      nodes: result.feasibility.composition.nodes.map((node) => ({role: node.role, operator: node.operator})),
    },
    discovery: {
      gatewayEnvironment: result.discovery.gatewayEnvironment,
      searchCalls: result.discovery.searchCalls,
      inspectedSchemas: result.discovery.inspectedSchemas,
      candidateCount: result.discovery.candidates.length,
    },
    model: result.model as {provider: "remote"; model: string; calls: number},
    readyForCompilation: false as const,
    durationMs,
    traceStreamId,
    trace: result.trace,
  };
  return {...withoutHash, proposalHash: contentHash(withoutHash)};
}

function successfulCompletion(
  result: HarnessExplorationResult,
  traceStreamId: string,
  durationMs: number,
): {contentText: string; contentJson: AgentContent; modelProvider: string; modelName: string; trace: readonly HarnessTraceEvent[]} {
  if (result.model.provider !== "remote") throw Object.assign(new Error("Remote model required"), {code: "REMOTE_MODEL_REQUIRED"});
  if (result.kind === "clarification") {
    return {
      contentText: result.clarification.questions.map((question) => question.question).join("\n"),
      contentJson: {
        schemaVersion: 1,
        kind: "clarification",
        questions: result.clarification.questions,
        model: result.model as {provider: "remote"; model: string; calls: number},
        durationMs,
        traceStreamId,
        trace: result.trace,
      },
      modelProvider: "remote",
      modelName: result.model.model,
      trace: result.trace,
    };
  }
  const contentJson = proposalContent(result, traceStreamId, durationMs);
  return {
    contentText: contentJson.intentSummary,
    contentJson,
    modelProvider: "remote",
    modelName: result.model.model,
    trace: result.trace,
  };
}

export class AgentService {
  private readonly activePlanningRuns = new Map<string, {
    workspaceId: string;
    sessionId: string;
    controller: AbortController;
  }>();

  constructor(
    private readonly repository: AgentRepository,
    private readonly modelProfiles: Pick<ModelProfileService, "resolve">,
    private readonly graphCredentials: Pick<GraphCredentialService, "list" | "resolve">,
    private readonly commandFingerprintKey: Buffer,
    private readonly fingerprintKeyVersion: string,
    private readonly plannerFactory: AgentPlannerFactory = productionPlannerFactory,
    private readonly logger?: Logger,
    private readonly debug = false,
    private readonly graphGatewayEnvironment: "mainnet" = "mainnet",
    private readonly graphSchemaCache: GraphSchemaCachePort = new MemoryGraphSchemaCache(),
    private readonly runTimeoutMs = 3_600_000,
  ) {}

  private fingerprint(operation: string, values: unknown[]): string {
    const hmac = createHmac("sha256", this.commandFingerprintKey).update(operation);
    for (const value of values) hmac.update("\0").update(JSON.stringify(value));
    return hmac.digest("hex");
  }

  async createSession(input: {
    workspaceId: string;
    actorUserId: string;
    productId?: string;
    title?: string;
    idempotencyKey: string;
  }): Promise<AgentSessionView> {
    const productId = input.productId ?? null;
    const title = optionalText(input.title, 120);
    const id = randomUUID();
    const requestFingerprint = this.fingerprint("create_agent_session", [input.workspaceId, productId, title]);
    try {
      const result = await this.repository.createSession({
        id,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        productId,
        title,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        fingerprintKeyVersion: this.fingerprintKeyVersion,
      });
      if (result.kind === "not_found") throw new AgentNotFoundError();
      if (result.kind === "command_conflict") throw new AgentCommandConflictError();
      if ("session" in result) return result.session;
      throw new AgentStorageError();
    } catch (error) {
      if (error instanceof AgentNotFoundError || error instanceof AgentCommandConflictError) throw error;
      throw new AgentStorageError();
    }
  }

  async listSessions(workspaceId: string, productId?: string) {
    try { return await this.repository.listSessions(workspaceId, productId); }
    catch { throw new AgentStorageError(); }
  }

  async readSession(workspaceId: string, sessionId: string) {
    try {
      const value = await this.repository.findSession(workspaceId, sessionId);
      if (!value) throw new AgentNotFoundError();
      return value;
    } catch (error) {
      if (error instanceof AgentNotFoundError) throw error;
      throw new AgentStorageError();
    }
  }

  async listMessages(workspaceId: string, sessionId: string, afterSequence: number, limit: number) {
    try {
      const result = await this.repository.listMessages(workspaceId, sessionId, afterSequence, limit);
      const final = result.items.at(-1);
      return {
        items: result.items,
        nextAfterSequence: final?.sequenceNo ?? String(afterSequence),
        hasMore: result.hasMore,
      };
    } catch { throw new AgentStorageError(); }
  }

  async listActiveTrace(workspaceId: string, sessionId: string, afterSequence: number, limit: number) {
    try {
      const result = await this.repository.listActivePlanningTrace(
        workspaceId,
        sessionId,
        afterSequence,
        limit,
      );
      if (!result) throw new AgentNotFoundError();
      const final = result.items.at(-1);
      return {
        ...result,
        nextAfterSequence: String(final?.sequenceNo ?? afterSequence),
      };
    } catch (error) {
      if (error instanceof AgentNotFoundError) throw error;
      throw new AgentStorageError();
    }
  }

  async cancelPlanning(input: {workspaceId: string; sessionId: string; commandId: string}) {
    const active = this.activePlanningRuns.get(input.commandId);
    if (
      !active ||
      active.workspaceId !== input.workspaceId ||
      active.sessionId !== input.sessionId
    ) throw new AgentCancellationUnavailableError();
    try {
      const command = await this.repository.requestPlanningCancellation(
        input.workspaceId,
        input.sessionId,
        input.commandId,
      );
      if (!command) throw new AgentCancellationUnavailableError();
      active.controller.abort();
      return command;
    } catch (error) {
      if (error instanceof AgentCancellationUnavailableError) throw error;
      throw new AgentStorageError();
    }
  }

  async submitMessage(input: {
    workspaceId: string;
    sessionId: string;
    actorUserId: string;
    contentText: string;
    parentVersionId?: string;
    accessSelections?: readonly unknown[];
    idempotencyKey: string;
  }): Promise<AgentCommandView> {
    const text = normalizedText(input.contentText, 8000);
    if (input.parentVersionId || (input.accessSelections?.length ?? 0) > 0) {
      throw new AgentInputError();
    }
    const commandId = randomUUID();
    const traceStreamId = randomUUID();
    const userMessageId = randomUUID();
    const requestFingerprint = this.fingerprint("plan_agent_message", [
      input.workspaceId,
      input.sessionId,
      text,
      null,
      [],
    ]);
    let started;
    try {
      const result = await this.repository.beginPlanning({
        commandId,
        traceStreamId,
        userMessageId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        actorUserId: input.actorUserId,
        contentText: text,
        contentHash: contentHash({contentText: text}),
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        fingerprintKeyVersion: this.fingerprintKeyVersion,
        deadlineAt: new Date(Date.now() + this.runTimeoutMs),
      });
      if (result.kind === "not_found") throw new AgentNotFoundError();
      if (result.kind === "in_progress") throw new AgentOperationInProgressError();
      if (result.kind === "command_conflict") throw new AgentCommandConflictError();
      if ("planning" in result) started = result.planning;
      else throw new AgentStorageError();
    } catch (error) {
      if (
        error instanceof AgentNotFoundError ||
        error instanceof AgentOperationInProgressError ||
        error instanceof AgentCommandConflictError
      ) throw error;
      throw new AgentStorageError();
    }
    if (started.replayed) {
      return {
        commandId: started.commandId,
        status: started.status,
        subject: {type: "agent_session", id: input.sessionId},
        traceStreamId: started.traceStreamId,
        pollAfterMs: 0,
      };
    }

    let planner: ReturnType<AgentPlannerFactory> | undefined;
    const planningStartedAt = Date.now();
    const cancellationController = new AbortController();
    const timeoutSignal = AbortSignal.timeout(this.runTimeoutMs);
    const runSignal = AbortSignal.any([cancellationController.signal, timeoutSignal]);
    const activeRun = {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      controller: cancellationController,
    };
    this.activePlanningRuns.set(started.commandId, activeRun);
    const liveTrace: HarnessTraceEvent[] = [];
    let traceWrites = Promise.resolve();
    const traceSink: AgentTraceSink = (event) => {
      liveTrace.push(event);
      traceWrites = traceWrites
        .then(() => this.repository.appendPlanningTrace(
          input.workspaceId,
          input.sessionId,
          started.commandId,
          event,
        ))
        .catch(() => {
          this.logger?.write({
            event: "agent_trace_append_failed",
            stage: event.stage,
            sequenceNo: event.sequenceNo,
          });
        });
    };
    try {
      const modelConfig = await this.modelProfiles.resolve(input.workspaceId);
      if (!modelConfig) throw Object.assign(new Error("Model profile required"), {code: "MODEL_PROFILE_REQUIRED"});
      const credential = (await this.graphCredentials.list(input.workspaceId))
        .find((item) => item.isSelected && item.status === "active");
      if (!credential) throw Object.assign(new Error("Graph credential required"), {code: "GRAPH_CREDENTIAL_REQUIRED"});
      const graphApiKey = await this.graphCredentials.resolve(input.workspaceId, credential.id);
      if (!graphApiKey) throw Object.assign(new Error("Graph credential required"), {code: "GRAPH_CREDENTIAL_REQUIRED"});
      const debugSink: AgentDebugSink | undefined = this.debug && this.logger
        ? (event) => this.logger!.write({event: "agent_debug", ...event})
        : undefined;
      planner = this.plannerFactory({
        modelConfig,
        graphApiKey,
        graphGatewayEnvironment: this.graphGatewayEnvironment,
        graphSchemaCache: this.graphSchemaCache,
        debugSink,
        traceSink,
      });
      const result = await planner.explore({intent: text, availableNetworks: agentNetworkCatalog}, runSignal);
      await traceWrites;
      if (cancellationController.signal.aborted) {
        throw Object.assign(new Error("Agent run cancelled"), {code: "AGENT_RUN_CANCELLED"});
      }
      const completion = successfulCompletion(
        result,
        started.traceStreamId,
        Math.max(0, Date.now() - planningStartedAt),
      );
      return await this.repository.completePlanning(
        input.workspaceId,
        input.sessionId,
        started.commandId,
        randomUUID(),
        contentHash({text: completion.contentText, json: completion.contentJson}),
        {...completion, status: "succeeded", errorCode: null},
      );
    } catch (error) {
      const planningError = cancellationController.signal.aborted
        ? Object.assign(new Error("Agent run cancelled"), {code: "AGENT_RUN_CANCELLED"})
        : timeoutSignal.aborted
          ? Object.assign(new Error("Agent run timed out"), {code: "AGENT_RUN_TIMEOUT"})
        : error;
      const safe = safePlanningError(planningError);
      const modelError = error instanceof AgentModelRequestError ? error : null;
      const durationMs = Math.max(0, Date.now() - planningStartedAt);
      this.logger?.write({
        event: "agent_planning_failed",
        code: safe.code,
        reason: safe.code === "AGENT_RUN_CANCELLED" ? "cancelled" : modelError?.reason ?? "non_model_error",
        status: modelError?.status ?? null,
        providerCode: modelError?.providerCode ?? null,
        providerParam: modelError?.providerParam ?? null,
        durationMs,
      });
      const lastEvent = liveTrace.at(-1);
      if (lastEvent?.status !== "failed" || lastEvent.summary !== safe.message) {
        traceSink({
          sequenceNo: liveTrace.length + 1,
          stage: lastEvent?.status === "started" ? lastEvent.stage : lastEvent?.stage ?? "admit",
          status: "failed",
          summary: safe.message,
        });
      }
      await traceWrites;
      const trace = liveTrace;
      try {
        return await this.repository.completePlanning(
          input.workspaceId,
          input.sessionId,
          started.commandId,
          randomUUID(),
          contentHash(safe),
          {
            contentText: safe.message,
            contentJson: {
              schemaVersion: 1,
              kind: "error",
              ...safe,
              durationMs,
              traceStreamId: started.traceStreamId,
              trace,
            },
            modelProvider: null,
            modelName: null,
            trace,
            status: safe.code === "AGENT_RUN_CANCELLED" ? "cancelled" : "failed",
            errorCode: safe.code,
          },
        );
      } catch {
        throw new AgentStorageError();
      }
    } finally {
      if (this.activePlanningRuns.get(started.commandId) === activeRun) {
        this.activePlanningRuns.delete(started.commandId);
      }
      await planner?.close().catch(() => {});
    }
  }
}
