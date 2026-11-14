import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerConfig } from "./config.js";
import { EnvironmentStore } from "./lib/store.js";
import { createEnvironmentRoutes } from "./routes/environments.js";
import { createEphemeralRoutes } from "./routes/ephemeral.js";
import { createQueryRoutes } from "./routes/query.js";

export type AppDeps = {
  config: ServerConfig;
  store?: EnvironmentStore;
};

export function createApp(deps: AppDeps) {
  const store =
    deps.store ??
    new EnvironmentStore(deps.config.dataDir, deps.config.encryptionKey);

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.config.corsOrigin === "*" ? "*" : deps.config.corsOrigin,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "turnocheck-api",
      selectOnly: true,
    }),
  );

  app.route(
    "/api/environments",
    createEnvironmentRoutes({ store, config: deps.config }),
  );
  app.route("/api/query", createQueryRoutes({ store, config: deps.config }));
  app.route("/api/query", createEphemeralRoutes());

  app.notFound((c) => c.json({ error: "not found" }, 404));

  return { app, store };
}
