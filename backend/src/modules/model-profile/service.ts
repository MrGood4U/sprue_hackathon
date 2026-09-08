import type {AgentModelConfig} from "../agent/harness/types.js";
import {
  testOpenAICompatibleModel,
  type AgentModelConnectionTestResult,
} from "../agent/harness/remote-model.js";
import {ModelCredentialCipher} from "./cipher.js";
import {
  ModelProfileConnectionError,
  ModelProfileInputError,
  ModelProfileStorageError,
  modelProfileProtocol,
  type ModelProfileInput,
  type ModelProfileRecord,
  type ModelProfileRepository,
  type ModelProfileView,
} from "./contracts.js";

type ModelTester = (config: AgentModelConfig) => Promise<AgentModelConnectionTestResult>;

function normalized(input: ModelProfileInput, existingApiKey?: string) {
  let url: URL;
  try {
    url = new URL(input.apiUrl.trim());
  } catch {
    throw new ModelProfileInputError();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ModelProfileInputError();
  }
  const apiKey = input.apiKey ?? existingApiKey;
  const model = input.model.trim();
  if (
    !apiKey ||
    !apiKey.trim() ||
    Buffer.byteLength(apiKey, "utf8") > 4096 ||
    !model ||
    model.length > 200
  ) {
    throw new ModelProfileInputError();
  }
  return {apiUrl: url.href, apiKey, model};
}

function view(record?: ModelProfileRecord | null): ModelProfileView {
  return {
    configured: Boolean(record),
    protocol: modelProfileProtocol,
    apiUrl: record?.apiUrl ?? "",
    model: record?.model ?? "",
    hasApiKey: Boolean(record),
    updatedAt: record?.updatedAt.toISOString() ?? null,
  };
}

export class ModelProfileService {
  constructor(
    private readonly repository: ModelProfileRepository,
    private readonly cipher: ModelCredentialCipher,
    private readonly timeoutMs: number,
    private readonly tester: ModelTester = testOpenAICompatibleModel,
  ) {}

  async read(workspaceId: string): Promise<ModelProfileView> {
    return view(await this.repository.findByWorkspace(workspaceId));
  }

  async save(workspaceId: string, actorUserId: string, input: ModelProfileInput): Promise<ModelProfileView> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.repository.findByWorkspace(workspaceId);
      const existingApiKey = existing ? this.cipher.open(existing) : undefined;
      const candidate = normalized(input, existingApiKey);
      const secretVersion = (existing?.secretVersion ?? 0) + 1;
      const stored = await this.repository.compareAndSwap({
        workspaceId,
        actorUserId,
        protocol: modelProfileProtocol,
        apiUrl: candidate.apiUrl,
        model: candidate.model,
        sealed: this.cipher.seal(workspaceId, secretVersion, candidate.apiKey),
        secretVersion,
        expectedLockVersion: existing?.lockVersion ?? null,
      });
      if (stored) return view(stored);
    }
    throw new ModelProfileStorageError();
  }

  async resolve(workspaceId: string): Promise<AgentModelConfig | null> {
    const record = await this.repository.findByWorkspace(workspaceId);
    if (!record) return null;
    return {
      mode: "remote",
      apiUrl: record.apiUrl,
      apiKey: this.cipher.open(record),
      model: record.model,
      timeoutMs: this.timeoutMs,
    };
  }

  async test(workspaceId: string, input: ModelProfileInput): Promise<AgentModelConnectionTestResult> {
    const existing = await this.repository.findByWorkspace(workspaceId);
    const candidate = normalized(input, existing ? this.cipher.open(existing) : undefined);
    try {
      return await this.tester({
        mode: "remote",
        apiUrl: candidate.apiUrl,
        apiKey: candidate.apiKey,
        model: candidate.model,
        timeoutMs: this.timeoutMs,
      });
    } catch {
      throw new ModelProfileConnectionError();
    }
  }
}
