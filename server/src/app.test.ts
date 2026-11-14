import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { assertSelectOnly } from "@projeto-6x1/mcp";
import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";

describe("API routes", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );
  let dir: string;
  let app: ReturnType<typeof createApp>["app"];

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "api-ambientes-"));
    const config: ServerConfig = {
      port: 0,
      host: "127.0.0.1",
      encryptionKey: key,
      dataDir: dir,
      sqlTimeoutMs: 5_000,
      sqlMaxRows: 100,
      corsOrigin: "*",
    };
    ({ app } = createApp({ config }));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("health check", async () => {
    const res = await app.request("/api/health");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.selectOnly, true);
  });

  it("CRUD environments without leaking password", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ambiente teste",
        engine: "mssql",
        host: "127.0.0.1",
        database: "demo",
        user: "ro",
        password: "super-secret-password",
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.environment.passwordMasked, "••••••••");
    assert.ok(
      !JSON.stringify(created).includes("super-secret-password"),
      "password must not appear in response",
    );

    const listRes = await app.request("/api/environments");
    const listed = await listRes.json();
    assert.equal(listed.environments.length, 1);
    assert.equal(listed.environments[0].hasPassword, true);

    const id = created.environment.id as string;
    const updateRes = await app.request(`/api/environments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ambiente teste 2" }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.environment.name, "Ambiente teste 2");
    assert.equal(updated.environment.passwordMasked, "••••••••");
  });

  it("rejects non-allowlisted table on select proxy", async () => {
    const res = await app.request("/api/query/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "sys.objects" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /allowlist/i);
  });

  it("lists allowlisted tables", async () => {
    const res = await app.request("/api/query/tables");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.tables.includes("Horarios"));
    assert.ok(body.tables.includes("Contratados"));
    assert.ok(body.tables.includes("Locais"));
    assert.ok(body.tables.includes("Empresas"));
  });

  it("test connection returns JSON 200 even when DB is unreachable", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unreachable",
        engine: "mssql",
        host: "127.0.0.1",
        port: 1,
        database: "nope",
        user: "ro",
        password: "x",
      }),
    });
    assert.equal(createRes.status, 201);
    const { environment } = await createRes.json();
    const res = await app.request(`/api/environments/${environment.id}/test`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /json/i);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(typeof body.error, "string");
    assert.equal(body.driver, "mssql");
  });

  it("reuses MCP SELECT-only guard for DML", () => {
    assert.equal(assertSelectOnly("DELETE FROM Contratados").ok, false);
    assert.equal(assertSelectOnly("SELECT TOP (1) 1 FROM Horarios").ok, true);
  });
});
