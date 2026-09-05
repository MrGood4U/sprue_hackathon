import { loadConfig, ConfigError } from "./config.js";
import { startRuntime } from "./runtime.js";
import { stdoutLogger } from "../shared/logger.js";
export async function main(role: "api" | "worker") {
  try {
    const runtime = await startRuntime(loadConfig(), role, stdoutLogger);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void runtime.stop().catch(() => {
        stdoutLogger.write({ event: "startup_failed", role });
        process.exitCode = 1;
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    if (error instanceof ConfigError)
      stdoutLogger.write({
        event: "configuration_invalid",
        fields: error.fields,
      });
    else stdoutLogger.write({ event: "startup_failed", role });
    process.exitCode = 1;
  }
}
