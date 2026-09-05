export type LogEvent =
  | {
      event: "request";
      requestId: string;
      method: string;
      route: string;
      status: number;
      durationMs: number;
    }
  | {
      event:
        | "listening"
        | "stopping"
        | "stopped"
        | "startup_failed"
        | "pool_error"
        | "worker_standby";
      role: "api" | "worker";
    }
  | { event: "configuration_invalid"; fields: string[] }
  | { event: "request_failed"; requestId: string; code: string };
export interface Logger {
  write(event: LogEvent): void;
}
export const stdoutLogger: Logger = {
  write(event) {
    process.stdout.write(
      JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
    );
  },
};
