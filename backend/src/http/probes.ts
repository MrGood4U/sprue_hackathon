import type { Express } from "express";
export function registerProbes(
  app: Express,
  ready: () => Promise<boolean>,
  stopping: () => boolean,
) {
  app.get("/healthz", (_req, res) => {
    res.locals.routeTemplate = "/healthz";
    res.json({ status: "ok" });
  });
  app.get("/readyz", async (_req, res) => {
    res.locals.routeTemplate = "/readyz";
    const available =
      !stopping() && (await ready().catch(() => false)) && !stopping();
    res
      .status(available ? 200 : 503)
      .json({ status: available ? "ready" : "not_ready" });
  });
}
