import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerConfig } from "./config.js";
import { EnvironmentStore } from "./lib/store.js";
import { SqlProfilesStore } from "./lib/sql-profiles-store.js";
import { createEnvironmentRoutes } from "./routes/environments.js";
import { createEphemeralRoutes } from "./routes/ephemeral.js";
import { createQueryRoutes } from "./routes/query.js";
import { createSimulateRoutes } from "./routes/simulate.js";
import {
  createSqlProfileRoutes,
  createTestSlotRoute,
} from "./routes/sql-profiles.js";

export type AppDeps = {
  config: ServerConfig;
  store?: EnvironmentStore;
  profiles?: SqlProfilesStore;
};

export function createApp(deps: AppDeps) {
  const store =
    deps.store ??
    new EnvironmentStore(deps.config.dataDir, deps.config.encryptionKey);
  const profiles =
    deps.profiles ?? new SqlProfilesStore(deps.config.dataDir);

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

  const profileDeps = { store, profiles, config: deps.config };

  app.route(
    "/api/environments",
    createEnvironmentRoutes({ store, config: deps.config }),
  );
  app.route("/api/sql-profiles", createSqlProfileRoutes(profileDeps));
  app.route("/api/query", createQueryRoutes({ store, config: deps.config }));
  app.route(
    "/api/query",
    createEphemeralRoutes({ config: deps.config }),
  );
  app.route("/api/query", createTestSlotRoute(profileDeps));
  app.route(
    "/api/simulate",
    createSimulateRoutes({ config: deps.config }),
  );

  app.notFound((c) => c.json({ error: "not found" }, 404));

  return { app, store, profiles };
}
