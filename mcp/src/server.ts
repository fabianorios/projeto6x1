#!/usr/bin/env node
/**
 * Apdata folha MCP — read-only (SELECT-only) stdio entrypoint.
 * LGPD: do not return or log client names / CPF; prefer aggregated reads.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createDbClient, type DbClient } from "./db/index.js";
import {
  createServer,
  SERVER_NAME,
  SERVER_VERSION,
} from "./mcp-app.js";

async function main() {
  const config = loadConfig();
  let client: DbClient | null = null;

  const getClient = (): DbClient => {
    if (!client) {
      client = createDbClient(config);
    }
    return client;
  };

  const server = createServer(getClient, config.sqlMaxRows);
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    try {
      await client?.close();
    } catch {
      // ignore
    }
  };
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  await server.connect(transport);
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} ready (driver=${config.driver}, maxRows=${config.sqlMaxRows})`,
  );
}

export { createServer, SERVER_NAME, SERVER_VERSION };

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
