/**
 * Turnocheck API — multi-client Apdata environments.
 * VPS: pm2 start + reverse-proxy /api → this process.
 */

import { serve } from "@hono/node-server";
import { loadServerConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadServerConfig();
const { app } = createApp({ config });

serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(
      `turnocheck-api listening on http://${info.address}:${info.port} (DATA_DIR=${config.dataDir})`,
    );
  },
);
