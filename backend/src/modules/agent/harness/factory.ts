import type {AgentModelConfig, AgentModelPort} from "./types.js";
import {AgentModelUnavailableError, assertModelConfig} from "./model-port.js";
import {MockAgentModel} from "./mock-model.js";

export function createAgentModel(config: AgentModelConfig): AgentModelPort {
  assertModelConfig(config);
  if (config.mode === "mock") return new MockAgentModel(config);
  throw new AgentModelUnavailableError();
}
