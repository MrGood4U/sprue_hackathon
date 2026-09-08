import {randomUUID} from "node:crypto";
import {GraphCredentialCipher} from "./cipher.js";
import {
  GraphCredentialConflictError,
  GraphCredentialInputError,
  GraphCredentialNotFoundError,
  GraphCredentialPreconditionError,
  GraphCredentialStorageError,
  type GraphCredentialRecord,
  type GraphCredentialRepository,
  type GraphCredentialValidator,
  type GraphCredentialView,
} from "./contracts.js";

function view(record: GraphCredentialRecord): GraphCredentialView {
  return {
    id: record.id,
    label: record.label,
    provider: "the_graph",
    credentialType: "graph_api_key",
    ownershipModel: "customer_supplied",
    billingModel: "customer_subscription",
    publicPrefix: record.publicPrefix,
    fingerprint: record.fingerprint,
    secretVersion: record.secretVersion,
    status: record.status,
    isSelected: record.isSelected,
    validatedAt: record.validatedAt?.toISOString() ?? null,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    observedConstraints: record.observedConstraints,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lockVersion: record.lockVersion,
  };
}

function normalize(label: string, apiKey: string) {
  const normalizedLabel = label.trim();
  const normalizedApiKey = apiKey.trim();
  if (
    !normalizedLabel ||
    normalizedLabel.length > 80 ||
    !normalizedApiKey ||
    Buffer.byteLength(normalizedApiKey, "utf8") > 4096
  ) {
    throw new GraphCredentialInputError();
  }
  return {label: normalizedLabel, apiKey: normalizedApiKey};
}

export class GraphCredentialService {
  constructor(
    private readonly repository: GraphCredentialRepository,
    private readonly cipher: GraphCredentialCipher,
    private readonly validator?: GraphCredentialValidator,
  ) {}

  async list(workspaceId: string): Promise<readonly GraphCredentialView[]> {
    return (await this.repository.list(workspaceId)).map(view);
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: {label: string; apiKey: string},
  ): Promise<GraphCredentialView> {
    const candidate = normalize(input.label, input.apiKey);
    const id = randomUUID();
    const secretVersion = 1;
    const sealed = this.cipher.seal(
      workspaceId,
      id,
      secretVersion,
      candidate.apiKey,
    );
    const existing = await this.repository.findByLabelOrFingerprint(
      workspaceId,
      candidate.label,
      sealed.fingerprint,
    );
    if (existing) {
      if (
        existing.status !== "revoked" &&
        existing.label === candidate.label &&
        existing.fingerprint === sealed.fingerprint
      ) return view(existing);
      throw new GraphCredentialConflictError();
    }
    const created = await this.repository.create({
      id,
      workspaceId,
      actorUserId,
      label: candidate.label,
      secretRef: `postgres-aesgcm:${id}`,
      secretVersion,
      publicPrefix: `${candidate.apiKey.slice(0, 4)}...`,
      sealed,
    });
    if (created) return view(created);
    const raced = await this.repository.findByLabelOrFingerprint(
      workspaceId,
      candidate.label,
      sealed.fingerprint,
    );
    if (
      raced?.status !== "revoked" &&
      raced?.label === candidate.label &&
      raced.fingerprint === sealed.fingerprint
    ) return view(raced);
    throw raced
      ? new GraphCredentialConflictError()
      : new GraphCredentialStorageError();
  }

  async resolve(
    workspaceId: string,
    credentialId: string,
  ): Promise<string | null> {
    const record = await this.repository.findSecret(workspaceId, credentialId);
    if (!record || record.status === "revoked") return null;
    return this.cipher.open(workspaceId, record);
  }

  async validate(
    workspaceId: string,
    credentialId: string,
    expectedLockVersion: number,
  ): Promise<GraphCredentialView> {
    if (!this.validator) throw new GraphCredentialStorageError();
    const record = await this.repository.findSecret(workspaceId, credentialId);
    if (!record || record.status === "revoked") {
      throw new GraphCredentialNotFoundError();
    }
    if (record.lockVersion !== expectedLockVersion) {
      throw new GraphCredentialPreconditionError();
    }
    const apiKey = this.cipher.open(workspaceId, record);
    const observation = await this.validator.validate(apiKey);
    const updated = await this.repository.setValidation({
      workspaceId,
      credentialId,
      expectedLockVersion,
      status: observation.status === "valid" ? "active" : "invalid",
      observedAt: observation.observedAt,
      observedConstraints: {
        validationTarget: {
          kind: "subgraph_id",
          id: observation.targetSubgraphId,
        },
        deploymentId: observation.deploymentId,
        blockNumber: observation.blockNumber,
        hasIndexingErrors: observation.hasIndexingErrors,
      },
    });
    if (!updated) throw new GraphCredentialPreconditionError();
    return view(updated);
  }

  async select(
    workspaceId: string,
    credentialId: string,
    expectedLockVersion: number,
  ): Promise<GraphCredentialView> {
    const current = await this.repository.find(workspaceId, credentialId);
    if (!current || current.status === "revoked") {
      throw new GraphCredentialNotFoundError();
    }
    if (current.lockVersion !== expectedLockVersion) {
      throw new GraphCredentialPreconditionError();
    }
    if (current.status !== "active") throw new GraphCredentialInputError();
    if (current.isSelected) return view(current);
    const selected = await this.repository.select({
      workspaceId,
      credentialId,
      expectedLockVersion,
    });
    if (!selected) throw new GraphCredentialPreconditionError();
    return view(selected);
  }

  async revoke(
    workspaceId: string,
    credentialId: string,
    expectedLockVersion: number,
  ): Promise<GraphCredentialView> {
    const current = await this.repository.find(workspaceId, credentialId);
    if (!current || current.status === "revoked") {
      throw new GraphCredentialNotFoundError();
    }
    if (current.lockVersion !== expectedLockVersion) {
      throw new GraphCredentialPreconditionError();
    }
    const revoked = await this.repository.revoke({
      workspaceId,
      credentialId,
      expectedLockVersion,
    });
    if (!revoked) throw new GraphCredentialPreconditionError();
    return view(revoked);
  }
}
