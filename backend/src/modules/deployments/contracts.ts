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
  status: "healthy";
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
  loadExport(workspaceId: string, productId: string): Promise<{
    productName: string;
    versionId: string;
    specHash: string;
    specification: ImmutableLivePlan;
  } | null>;
}

export class LiveDeploymentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LiveDeploymentError";
  }
}
