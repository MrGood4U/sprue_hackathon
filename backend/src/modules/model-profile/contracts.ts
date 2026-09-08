export const modelProfileProtocol = "openai_compatible_chat_completions" as const;

export interface ModelProfileInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
}

export interface ModelProfileView {
  configured: boolean;
  protocol: typeof modelProfileProtocol;
  apiUrl: string;
  model: string;
  hasApiKey: boolean;
  updatedAt: string | null;
}

export interface ModelProfileRecord {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  updatedByUserId: string;
  protocol: typeof modelProfileProtocol;
  apiUrl: string;
  model: string;
  apiKeyCiphertext: Buffer;
  encryptionKeyId: string;
  encryptionIv: Buffer;
  encryptionAuthTag: Buffer;
  secretVersion: number;
  credentialFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
  lockVersion: number;
}

export interface SealedModelCredential {
  ciphertext: Buffer;
  keyId: string;
  iv: Buffer;
  authTag: Buffer;
  fingerprint: string;
}

export interface ModelProfileWrite {
  workspaceId: string;
  actorUserId: string;
  protocol: typeof modelProfileProtocol;
  apiUrl: string;
  model: string;
  sealed: SealedModelCredential;
  secretVersion: number;
  expectedLockVersion: number | null;
}

export interface ModelProfileRepository {
  findByWorkspace(workspaceId: string): Promise<ModelProfileRecord | null>;
  compareAndSwap(input: ModelProfileWrite): Promise<ModelProfileRecord | null>;
}

export class ModelProfileInputError extends Error {
  constructor() {
    super("INVALID_MODEL_PROFILE");
    this.name = "ModelProfileInputError";
  }
}

export class ModelProfileStorageError extends Error {
  constructor() {
    super("MODEL_PROFILE_STORAGE_UNAVAILABLE");
    this.name = "ModelProfileStorageError";
  }
}

export class ModelProfileConnectionError extends Error {
  constructor() {
    super("MODEL_PROFILE_CONNECTION_FAILED");
    this.name = "ModelProfileConnectionError";
  }
}
