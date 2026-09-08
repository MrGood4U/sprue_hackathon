import type {AgentDebugSink, HarnessExplorationResult, HarnessTraceEvent} from "./harness/types.js";

export type AgentSessionStatus = "active" | "completed" | "abandoned";
export type AgentCommandStatus =
  | "queued"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AgentSessionView {
  id: string;
  productId: string | null;
  title: string | null;
  status: AgentSessionStatus;
  createdAt: string;
  closedAt: string | null;
  activeCommandId: string | null;
  traceStreamId: string | null;
}

export interface AgentSourceEvidence {
  candidateRef: string;
  sourceNeedId: string;
  dataNetwork: string;
  networkLabel: string;
  displayName: string;
  logicalSubgraphId: string | null;
  manifestIpfsCid: string;
  queryEntity: string;
  status: "suitable" | "needs_verification";
  rationale: string;
  matchedFacts: readonly string[];
  totalQueryCount30d: number | null;
  limitations: readonly string[];
}

export interface AgentProposalContent {
  schemaVersion: 1;
  kind: "proposal";
  status: "needs_input" | "unsupported";
  intentSummary: string;
  proposalHash: string;
  specification: null;
  assumptions: readonly string[];
  issues: readonly {code: string; message: string}[];
  sourceEvidence: readonly AgentSourceEvidence[];
  composition: {
    sourceCount: number;
    operatorCount: number;
    edgeCount: number;
    nodes: readonly {role: string; operator: string}[];
  } | null;
  discovery: {
    gatewayEnvironment: "mainnet";
    searchCalls: number;
    inspectedSchemas: number;
    candidateCount: number;
  } | null;
  model: {provider: "remote"; model: string; calls: number};
  readyForCompilation: false;
  durationMs: number;
  traceStreamId: string;
  trace: readonly HarnessTraceEvent[];
}

export interface AgentClarificationContent {
  schemaVersion: 1;
  kind: "clarification";
  questions: readonly {code: string; question: string}[];
  model: {provider: "remote"; model: string; calls: number};
  durationMs: number;
  traceStreamId: string;
  trace: readonly HarnessTraceEvent[];
}

export interface AgentErrorContent {
  schemaVersion: 1;
  kind: "error";
  code: string;
  message: string;
  retryable: boolean;
  durationMs: number;
  traceStreamId: string;
  trace: readonly HarnessTraceEvent[];
}

export type AgentContent =
  | AgentProposalContent
  | AgentClarificationContent
  | AgentErrorContent;

export interface AgentMessageView {
  id: string;
  sequenceNo: string;
  role: "user" | "assistant" | "tool";
  contentText: string | null;
  contentJson: AgentContent | null;
  redactionStatus: "none" | "secret_redacted" | "content_removed";
  modelProvider: string | null;
  modelName: string | null;
  createdAt: string;
}

export interface AgentCommandView {
  commandId: string;
  status: AgentCommandStatus;
  subject: {type: "agent_session"; id: string};
  traceStreamId: string;
  pollAfterMs: number;
}

export interface AgentPlanningStart {
  commandId: string;
  traceStreamId: string;
  userMessageId: string;
  status: AgentCommandStatus;
  replayed: boolean;
}

export interface AgentPlanningCompletion {
  contentText: string;
  contentJson: AgentContent;
  modelProvider: string | null;
  modelName: string | null;
  trace: readonly HarnessTraceEvent[];
  status: "succeeded" | "failed";
  errorCode: string | null;
}

export interface AgentRepository {
  createSession(input: {
    id: string;
    workspaceId: string;
    actorUserId: string;
    productId: string | null;
    title: string | null;
    idempotencyKey: string;
    requestFingerprint: string;
    fingerprintKeyVersion: string;
  }): Promise<
    | {kind: "created" | "replayed"; session: AgentSessionView}
    | {kind: "not_found" | "command_conflict"}
  >;
  listSessions(workspaceId: string, productId?: string): Promise<readonly AgentSessionView[]>;
  findSession(workspaceId: string, sessionId: string): Promise<AgentSessionView | null>;
  listMessages(
    workspaceId: string,
    sessionId: string,
    afterSequence: number,
    limit: number,
  ): Promise<{items: readonly AgentMessageView[]; hasMore: boolean}>;
  beginPlanning(input: {
    commandId: string;
    traceStreamId: string;
    userMessageId: string;
    workspaceId: string;
    sessionId: string;
    actorUserId: string;
    contentText: string;
    contentHash: string;
    idempotencyKey: string;
    requestFingerprint: string;
    fingerprintKeyVersion: string;
  }): Promise<
    | {kind: "started" | "replayed"; planning: AgentPlanningStart}
    | {kind: "not_found" | "in_progress" | "command_conflict"}
  >;
  completePlanning(
    workspaceId: string,
    sessionId: string,
    commandId: string,
    assistantMessageId: string,
    contentHash: string,
    completion: AgentPlanningCompletion,
  ): Promise<AgentCommandView>;
}

export interface AgentPlanner {
  explore(input: {intent: string; availableNetworks: readonly {dataNetwork: string; label: string}[]}): Promise<HarnessExplorationResult>;
  close(): Promise<void>;
}

export type AgentPlannerFactory = (input: {
  modelConfig: import("./harness/types.js").AgentModelConfig;
  graphApiKey: string;
  graphGatewayEnvironment: "mainnet";
  graphSchemaCache: import("../graph/types.js").GraphSchemaCachePort;
  debugSink?: AgentDebugSink;
}) => AgentPlanner;

export class AgentInputError extends Error {
  constructor() { super("AGENT_INPUT_INVALID"); this.name = "AgentInputError"; }
}
export class AgentNotFoundError extends Error {
  constructor() { super("AGENT_RESOURCE_NOT_FOUND"); this.name = "AgentNotFoundError"; }
}
export class AgentCommandConflictError extends Error {
  constructor() { super("AGENT_COMMAND_CONFLICT"); this.name = "AgentCommandConflictError"; }
}
export class AgentOperationInProgressError extends Error {
  constructor() { super("AGENT_OPERATION_IN_PROGRESS"); this.name = "AgentOperationInProgressError"; }
}
export class AgentStorageError extends Error {
  constructor() { super("AGENT_STORAGE_UNAVAILABLE"); this.name = "AgentStorageError"; }
}
