import type {AgentModelConfig, AgentModelPort} from "./types.js";
import {assertModelConfig} from "./model-port.js";
import {MockAgentModel} from "./mock-model.js";
import {RemoteAgentModel} from "./remote-model.js";

export function createAgentModel(config: AgentModelConfig): AgentModelPort {
  assertModelConfig(config);
  if (config.mode === "mock") return new MockAgentModel(config);
  return new RemoteAgentModel(config);
}
