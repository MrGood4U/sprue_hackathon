export type ProductStatus = "draft" | "active" | "suspended" | "archived";
export type VersionStatus =
  | "proposed"
  | "validating"
  | "invalid"
  | "building"
  | "ready"
  | "retired";
export type DeploymentStatus =
  | "pending"
  | "deploying"
  | "healthy"
  | "degraded"
  | "suspended"
  | "failed";
export type RunStatus =
  | "queued"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface VersionSummary {
  id: string;
  versionNo: number;
  sourceCount: string;
  parentVersionId: string | null;
  specHash: string;
  status: VersionStatus;
  validatedAt: string | null;
  readyAt: string | null;
  createdAt: string;
}

export interface DeploymentSummary {
  id: string;
  environment: "local" | "demo" | "self_hosted";
  status: DeploymentStatus;
  endpointSlug: string;
  endpointUrl: string | null;
  activeVersionId: string | null;
  activeMaterializationId: string | null;
  activePublicationVersionId: string | null;
  accessMode: "private" | "api_key" | "x402" | null;
  sourceFreshnessAt: string | null;
}

export interface RunSummary {
  id: string;
  productId: string;
  versionId: string;
  runType: "build" | "preview" | "refresh" | "backfill" | "live_request";
  status: RunStatus;
  failureCode: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  updatedAt: string;
  latestVersion: VersionSummary | null;
  activeDeployment: DeploymentSummary | null;
  latestRun: RunSummary | null;
  nextAction:
    | "open_builder"
    | "resolve_access"
    | "build"
    | "deploy"
    | "inspect_run"
    | null;
}

export interface ProductDetail extends ProductSummary {
  workspaceId: string;
  accountWalletId: string;
  originalIntent: string;
  createdAt: string;
  lockVersion: number;
}

export interface ProductListInput {
  workspaceId: string;
  query?: string;
  status?: ProductStatus;
  limit: number;
  cursor?: {updatedAt: Date; id: string};
}

export interface ProductCreateWrite {
  id: string;
  workspaceId: string;
  actorUserId: string;
  accountWalletId: string;
  slug: string;
  name: string;
  description: string | null;
  originalIntent: string;
  idempotencyKey: string;
  requestFingerprint: string;
  fingerprintKeyVersion: string;
}

export interface ProductUpdateWrite {
  workspaceId: string;
  productId: string;
  actorUserId: string;
  name?: string;
  description?: string | null;
  expectedLockVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  fingerprintKeyVersion: string;
}

export interface ProductDeleteWrite {
  workspaceId: string;
  productId: string;
  actorUserId: string;
  expectedLockVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  fingerprintKeyVersion: string;
}

export interface ProductDeletion {
  productId: string;
  deletedAt: string;
}

export interface Money {
  networkId: string;
  network: string;
  assetId: string;
  assetIdentifier: string;
  symbol: string;
  decimals: number;
  amountAtomic: string;
}

export interface WorkspaceOverview {
  period: {startsAt: string; endsAt: string};
  activeProductCount: string;
  draftVersionCount: string;
  apiRequestCount: string;
  graphExpenses: Money[];
  grossSales: Money[];
  readiness: [];
  recentActivity: {
    kind: "execution_run";
    status: RunStatus;
    occurredAt: string;
    resource: {type: "execution_run"; id: string};
    summary: string;
  }[];
}

export interface DeliveryBlocker {
  code: string;
  message: string;
}

export interface DeliveryVersion {
  id: string;
  versionNo: number;
  status: VersionStatus;
  outputSchema: Record<string, unknown>;
}

export interface DeliveryDeployment {
  id: string;
  environment: "local" | "demo" | "self_hosted";
  provider: "railway" | "docker" | "local";
  status: DeploymentStatus;
  endpointSlug: string;
  endpointUrl: string | null;
  publicProductUrl: string | null;
  activeVersionId: string | null;
  activeMaterializationId: string | null;
  lastHealthAt: string | null;
  sourceFreshnessAt: string | null;
  updatedAt: string;
}

export interface DeliveryContract {
  deploymentId: string;
  activeVersionId: string;
  method: "GET";
  endpointUrl: string;
  accessMode: "private" | "api_key" | "x402";
  serveMode: "materialized" | "live";
  parameterSchema: readonly {
    name: "limit";
    location: "query";
    type: "integer";
    required: false;
    default: number;
    minimum: number;
    maximum: number;
  }[];
  responseSchema: {
    mediaType: "application/json";
    outputSchema: Record<string, unknown>;
  };
  exampleBody: Record<string, unknown> | null;
}

export interface DeliveryPublication {
  id: string;
  revisionNo: number;
  status: "draft" | "active" | "retired" | "invalid";
  accessMode: "x402";
  serveMode: "materialized" | "live";
  price: Money | null;
  recipient: {
    walletAddressId: string;
    networkAccountRef: string | null;
    identityStatus: "unverified" | "resolved" | "mismatched";
    accountCompletionStatus: "not_applicable" | "unverified" | "hollow" | "complete";
    controlStatus: "unverified" | "pending" | "verified" | "rejected";
    canReceive: boolean;
    canSpend: boolean;
  } | null;
  paymentProtocolVersion: string | null;
  paymentScheme: string | null;
  maxTimeoutSeconds: number | null;
  facilitator: string | null;
  capabilityObservedAt: string | null;
  serviceFeeEnabled: boolean;
  createdAt: string;
}

export interface DeliverySale {
  id: string;
  correlationId: string;
  status: "received" | "payment_required" | "authorized" | "served" | "failed";
  amount: Money | null;
  payer: string | null;
  providerTransactionRef: string | null;
  networkTransactionId: string | null;
  networkTransactionHash: string | null;
  consensusTimestamp: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ProductDeliveryView {
  productId: string;
  capabilities: {
    deploy: boolean;
    privateRequest: boolean;
    privateExport: boolean;
    publishX402: boolean;
    publicRequest: boolean;
  };
  api: {
    readiness:
      | "no_version"
      | "version_not_ready"
      | "not_deployed"
      | "deploying"
      | "unavailable"
      | "available";
    blockers: DeliveryBlocker[];
    latestVersion: DeliveryVersion | null;
    activeVersion: DeliveryVersion | null;
    deployment: DeliveryDeployment | null;
    contract: DeliveryContract | null;
  };
  monetization: {
    readiness:
      | "api_not_ready"
      | "not_configured"
      | "draft"
      | "invalid"
      | "retired"
      | "active";
    blockers: DeliveryBlocker[];
    publication: DeliveryPublication | null;
    revenue: {
      grossSales: Money[];
      creatorProceeds: Money[];
      providerFees: Money[];
    };
    sales: DeliverySale[];
  };
}

export interface ProductRepository {
  list(input: ProductListInput): Promise<{items: ProductSummary[]; hasMore: boolean}>;
  find(workspaceId: string, productId: string): Promise<ProductDetail | null>;
  create(input: ProductCreateWrite): Promise<
    | {kind: "created" | "replayed"; product: ProductDetail}
    | {kind: "wallet_not_found" | "command_conflict"}
  >;
  update(input: ProductUpdateWrite): Promise<
    | {kind: "updated" | "replayed"; product: ProductDetail}
    | {kind: "not_found" | "precondition_failed" | "command_conflict"}
  >;
  delete(input: ProductDeleteWrite): Promise<
    | {kind: "deleted" | "replayed"; deletion: ProductDeletion}
    | {kind: "not_found" | "precondition_failed" | "command_conflict"}
  >;
  overview(workspaceId: string): Promise<WorkspaceOverview>;
  delivery(workspaceId: string, productId: string): Promise<ProductDeliveryView | null>;
}

export class ProductInputError extends Error {
  constructor() {
    super("PRODUCT_INPUT_INVALID");
    this.name = "ProductInputError";
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("PRODUCT_NOT_FOUND");
    this.name = "ProductNotFoundError";
  }
}

export class ProductWalletNotFoundError extends Error {
  constructor() {
    super("PRODUCT_WALLET_NOT_FOUND");
    this.name = "ProductWalletNotFoundError";
  }
}

export class ProductPreconditionError extends Error {
  constructor() {
    super("PRODUCT_PRECONDITION_FAILED");
    this.name = "ProductPreconditionError";
  }
}

export class ProductCommandConflictError extends Error {
  constructor() {
    super("PRODUCT_COMMAND_CONFLICT");
    this.name = "ProductCommandConflictError";
  }
}

export class ProductStorageError extends Error {
  constructor() {
    super("PRODUCT_STORAGE_UNAVAILABLE");
    this.name = "ProductStorageError";
  }
}
