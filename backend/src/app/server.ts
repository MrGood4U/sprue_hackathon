import { createServer, type Server } from "node:http";
import type { Express } from "express";
export async function listen(
  app: Express,
  host: string,
  port: number,
): Promise<Server> {
  const server = createServer(
    {
      maxHeaderSize: 98304,
      requestTimeout: 30000,
      headersTimeout: 10000,
      keepAliveTimeout: 5000,
    },
    app,
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
export async function drain(server: Server, graceMs = 10000) {
  const timer = setTimeout(() => server.closeAllConnections(), graceMs);
  timer.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    });
  } finally {
    clearTimeout(timer);
  }
}
