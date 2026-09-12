import type {ImmutableLivePlan, LiveSourceInput} from "./live-plan.js";

export interface AdmittedLiveSource extends LiveSourceInput {
  schemaDocument: string;
  schemaHash: string;
  providerCredentialId: string;
}

export interface LiveVersionView {
  id: string;
  versionNo: number;
  specHash: string;
}

export interface HostedDeploymentView {
  id: string;
  productId: string;
  ownerUserId: string;
  alias: string;
  endpointUrl: string;
  activeVersionId: string;
  status: "healthy" | "suspended";
}

export interface X402PaymentRequirements {
  scheme: "exact";
  network: "hedera:testnet";
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: "0.0.0";
  extra: {feePayer: string};
}

export interface X402PublicationView {
  id: string;
  deploymentId: string;
  revisionNo: number;
  status: "active" | "retired";
  priceAtomic: string;
  recipientAddress: string;
  network: "hedera:testnet";
  asset: "0.0.0";
  facilitator: "blocky402";
  createdAt: Date;
}

export interface X402PublicationCandidate {
  deploymentId: string;
  workspaceId: string;
  productId: string;
  productName: string;
  ownerUserId: string;
  activeVersionId: string;
  networkId: string;
  assetId: string;
  recipientWalletAddressId: string;
  recipientAddress: string;
}

export interface LoadedX402Gate extends X402PublicationCandidate {
  publicationId: string;
  priceAtomic: string;
  internalCredentialId: string;
  requirements: X402PaymentRequirements;
}

export interface PaidRequestRecord {
  requestId: string;
  paymentIntentId: string;
  paymentAttemptId: string;
}

export interface IssuedApiKey {
  id: string;
  name: string;
  prefix: string;
  apiKey: string;
  createdAt: string;
}

export interface LoadedLiveDeployment {
  deploymentId: string;
  workspaceId: string;
  productId: string;
  ownerUserId: string;
  activeVersionId: string;
  specification: ImmutableLivePlan;
  specHash: string;
  apiCredentialId: string;
}

export interface LiveDeploymentRepository {
  persistVersion(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    sources: readonly AdmittedLiveSource[];
    createPlan(sourceSnapshotIds: ReadonlyMap<string, string>): ImmutableLivePlan;
  }): Promise<LiveVersionView>;
  deploy(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    alias: string;
    publicBaseUrl: string;
    idempotencyKey: string;
    requestFingerprint: string;
    fingerprintKeyVersion: string;
    credential: {id: string; name: string; prefix: string; hash: string};
  }): Promise<{
    kind: "deployed" | "replayed";
    deployment: HostedDeploymentView;
    credential: {id: string; name: string; prefix: string};
    createdAt: Date;
  } | {kind: "command_conflict"}>;
  loadAuthorized(input: {
    ownerUserId: string;
    productRef: string;
    keyHash: string;
  }): Promise<LoadedLiveDeployment | null>;
  recordProviderRequests(input: {
    workspaceId: string;
    productId: string;
    apiAccessRequestId?: string;
    accessMode: "api_key" | "x402";
    quantity: number;
  }): Promise<void>;
  loadExport(workspaceId: string, productId: string): Promise<{
    productName: string;
    versionId: string;
    specHash: string;
    specification: ImmutableLivePlan;
  } | null>;
  suspend(input: {workspaceId: string; deploymentId: string}): Promise<HostedDeploymentView | null>;
  loadPublicationCandidate(workspaceId: string, deploymentId: string): Promise<X402PublicationCandidate | null>;
  publishX402(input: {
    publicationId: string;
    candidate: X402PublicationCandidate;
    actorUserId: string;
    priceAtomic: string;
    requirements: X402PaymentRequirements;
    facilitatorCapability: Record<string, unknown>;
    facilitatorCapabilityHash: string;
    facilitatorUrl: string;
    internalCredential: {id: string; prefix: string; hash: string};
  }): Promise<X402PublicationView>;
  retireX402(input: {workspaceId: string; deploymentId: string; publicationId: string}): Promise<X402PublicationView | null>;
  loadX402Gate(ownerUserId: string, productRef: string): Promise<LoadedX402Gate | null>;
  beginPaidRequest(input: {
    gate: LoadedX402Gate;
    authorizationHash: string;
    requestHash: string;
    correlationId: string;
    idempotencyKey: string;
    resourceUrl: string;
    path: string;
    limit: number;
    recoveryCapabilityHash: string;
  }): Promise<PaidRequestRecord | null>;
  failPaidRequest(input: PaidRequestRecord & {code: string; preservePayment?: boolean}): Promise<void>;
  confirmPaidSettlement(input: PaidRequestRecord & {
    gate: LoadedX402Gate;
    payerAddress: string;
    transaction: string;
    settlementEvidence: Record<string, unknown>;
  }): Promise<void>;
  completePaidRequest(input: PaidRequestRecord & {
    responseContentHash: string;
    responseByteCount: number;
  }): Promise<void>;
}

export class LiveDeploymentError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(code);
    this.name = "LiveDeploymentError";
  }
}
