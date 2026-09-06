import type {AgentModelConfig, AgentModelPort} from "./types.js";

export type {AgentModelConfig, AgentModelPort};

export function assertModelConfig(config: AgentModelConfig): void {
  if (config.mode === "remote" && (!config.apiUrl || !config.apiKey)) {
    throw new Error("REMOTE_AGENT_REQUIRES_API_URL_AND_API_KEY");
  }
  if (config.timeoutMs < 250 || config.timeoutMs > 120000) {
    throw new Error("INVALID_AGENT_TIMEOUT");
  }
}
