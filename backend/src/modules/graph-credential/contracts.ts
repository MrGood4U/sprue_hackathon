export interface GraphCredentialView {
  id: string;
  label: string;
  provider: "the_graph";
  credentialType: "graph_api_key";
  ownershipModel: "customer_supplied";
  billingModel: "customer_subscription";
  publicPrefix: string | null;
  fingerprint: string;
  secretVersion: string;
  status: "pending_validation" | "active" | "invalid" | "revoked";
  isSelected: boolean;
  validatedAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  observedConstraints: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lockVersion: number;
}

export interface GraphCredentialRecord {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  label: string;
  secretRef: string;
  secretVersion: string;
  publicPrefix: string | null;
  fingerprint: string;
  status: GraphCredentialView["status"];
  isSelected: boolean;
  validatedAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  observedConstraints: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  lockVersion: number;
}

export interface GraphCredentialSecretRecord {
  providerCredentialId: string;
  ciphertext: Buffer;
  encryptionKeyId: string;
  encryptionIv: Buffer;
  encryptionAuthTag: Buffer;
  encryptedSecretVersion: number;
}

export interface SealedGraphCredential {
  ciphertext: Buffer;
  keyId: string;
  iv: Buffer;
  authTag: Buffer;
  fingerprint: string;
}

export interface GraphCredentialCreate {
  id: string;
  workspaceId: string;
  actorUserId: string;
  label: string;
  secretRef: string;
  secretVersion: number;
  publicPrefix: string;
  sealed: SealedGraphCredential;
}

export interface GraphCredentialRepository {
  list(workspaceId: string): Promise<readonly GraphCredentialRecord[]>;
  findByLabelOrFingerprint(
    workspaceId: string,
    label: string,
    fingerprint: string,
  ): Promise<GraphCredentialRecord | null>;
  create(input: GraphCredentialCreate): Promise<GraphCredentialRecord | null>;
  find(
    workspaceId: string,
    credentialId: string,
  ): Promise<GraphCredentialRecord | null>;
  findSecret(
    workspaceId: string,
    credentialId: string,
  ): Promise<(GraphCredentialRecord & GraphCredentialSecretRecord) | null>;
  setValidation(input: {
    workspaceId: string;
    credentialId: string;
    expectedLockVersion: number;
    status: "active" | "invalid";
    observedAt: Date;
    observedConstraints: Record<string, unknown>;
  }): Promise<GraphCredentialRecord | null>;
  select(input: {
    workspaceId: string;
    credentialId: string;
    expectedLockVersion: number;
  }): Promise<GraphCredentialRecord | null>;
  revoke(input: {
    workspaceId: string;
    credentialId: string;
    expectedLockVersion: number;
  }): Promise<GraphCredentialRecord | null>;
}

export interface GraphCredentialValidationObservation {
  status: "valid" | "rejected";
  observedAt: Date;
  targetSubgraphId: string;
  deploymentId: string | null;
  blockNumber: number | null;
  hasIndexingErrors: boolean | null;
}

export interface GraphCredentialValidator {
  validate(apiKey: string): Promise<GraphCredentialValidationObservation>;
}

export class GraphCredentialInputError extends Error {
  constructor() {
    super("INVALID_GRAPH_CREDENTIAL");
    this.name = "GraphCredentialInputError";
  }
}

export class GraphCredentialConflictError extends Error {
  constructor() {
    super("GRAPH_CREDENTIAL_CONFLICT");
    this.name = "GraphCredentialConflictError";
  }
}

export class GraphCredentialStorageError extends Error {
  constructor() {
    super("GRAPH_CREDENTIAL_STORAGE_UNAVAILABLE");
    this.name = "GraphCredentialStorageError";
  }
}

export class GraphCredentialNotFoundError extends Error {
  constructor() {
    super("GRAPH_CREDENTIAL_NOT_FOUND");
    this.name = "GraphCredentialNotFoundError";
  }
}

export class GraphCredentialPreconditionError extends Error {
  constructor() {
    super("GRAPH_CREDENTIAL_PRECONDITION_FAILED");
    this.name = "GraphCredentialPreconditionError";
  }
}

export class GraphCredentialValidationError extends Error {
  constructor(readonly reason: "rate_limited" | "unavailable") {
    super(`GRAPH_CREDENTIAL_VALIDATION_${reason.toUpperCase()}`);
    this.name = "GraphCredentialValidationError";
  }
}
