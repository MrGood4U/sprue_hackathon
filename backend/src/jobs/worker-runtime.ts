import type { Logger } from "../shared/logger.js";
// A future pg-boss adapter owns leasing and dispatch. Never substitute an in-memory queue.
export interface WorkerRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export interface CommandJob {
  commandId: string;
}
export function standbyWorker(logger: Logger): WorkerRuntime {
  return {
    async start() {
      logger.write({ event: "worker_standby", role: "worker" });
    },
    async stop() {},
  };
}
