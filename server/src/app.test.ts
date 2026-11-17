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

  it("select SQL/driver errors return 4xx JSON (never 502)", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "SelectFail",
        engine: "mssql",
        host: "203.0.113.50",
        port: 1433,
        database: "nope",
        user: "ro",
        password: "x",
      }),
    });
    assert.equal(createRes.status, 201);
    const { environment } = await createRes.json();
    const res = await app.request("/api/query/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environmentId: environment.id,
        table: "Empresas",
        columns: ["EMP_CdiEmpresa"],
        limit: 1,
      }),
    });
    assert.ok(res.status === 400 || res.status === 422, `status=${res.status}`);
    assert.match(res.headers.get("content-type") ?? "", /json/i);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.ok(body.error.length > 0);
  });

  it("lists allowlisted tables", async () => {
    const res = await app.request("/api/query/tables");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.tables.includes("Horarios"));
    assert.ok(body.tables.includes("Contratados"));
    assert.ok(body.tables.includes("Locais"));
    assert.ok(body.tables.includes("Empresas"));
    assert.ok(body.tables.includes("Vinculos"));
    assert.ok(body.tables.includes("RamosAtividadesEmpresas"));
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

  it("GET extractor-sql returns Aptools script without credentials", async () => {
    const res = await app.request("/api/query/extractor-sql?engine=mssql");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.engine, "mssql");
    assert.match(String(body.sql), /Contratados/i);
    assert.match(String(body.sql), /LOC_CdiLocal/);
    assert.ok(!/SET\s+TRANSACTION/i.test(String(body.sql)));
    assert.ok(!JSON.stringify(body).toLowerCase().includes("password"));
  });

  it("POST ephemeral validates body and never echoes password", async () => {
    const res = await app.request("/api/query/ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "mssql",
        host: "127.0.0.1",
        port: 1,
        database: "nope",
        user: "ro",
        password: "ephemeral-secret-should-not-leak",
      }),
    });
    // Unreachable DB → 422 JSON (not Nginx 502); password must not appear
    assert.equal(res.status, 422);
    const text = await res.text();
    assert.ok(!text.includes("ephemeral-secret-should-not-leak"));
    const body = JSON.parse(text);
    assert.equal(body.ok, false);
    assert.equal(body.engine, "mssql");
    assert.match(String(body.error), /Falha de conexão|timeout|firewall/i);
  });

  it("POST ephemeral rejects incomplete body", async () => {
    const res = await app.request("/api/query/ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine: "mssql", host: "x" }),
    });
    assert.equal(res.status, 400);
  });

  it("POST ephemeral allows empty database for mssql", async () => {
    const res = await app.request("/api/query/ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "mssql",
        host: "127.0.0.1",
        port: 1,
        database: "",
        user: "ro",
        password: "mssql-empty-db-secret",
      }),
    });
    // Unreachable → 422 (schema accepted empty database)
    assert.equal(res.status, 422);
    const text = await res.text();
    assert.ok(!text.includes("mssql-empty-db-secret"));
    assert.match(text, /Falha de conexão|timeout|firewall/i);
  });

  it("POST ephemeral requires database for oracle", async () => {
    const res = await app.request("/api/query/ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "oracle",
        host: "127.0.0.1",
        port: 1521,
        database: "   ",
        user: "ro",
        password: "oracle-missing-service",
      }),
    });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes("oracle-missing-service"));
    assert.match(text, /database|Service Name|SID|oracle/i);
  });

  it("POST ephemeral catalog mode never echoes password", async () => {
    const res = await app.request("/api/query/ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "mssql",
        host: "127.0.0.1",
        port: 1,
        database: "nope",
        user: "ro",
        password: "catalog-secret-must-not-leak",
        mode: "catalog",
      }),
    });
    assert.equal(res.status, 422);
    const text = await res.text();
    assert.ok(!text.includes("catalog-secret-must-not-leak"));
    const body = JSON.parse(text);
    assert.equal(body.ok, false);
    assert.equal(body.mode, "catalog");
    assert.match(String(body.error), /Falha de conexão|timeout|firewall/i);
  });

  it("lists sql profiles with factory default", async () => {
    const res = await app.request("/api/sql-profiles");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.profiles));
    assert.ok(body.profiles.some((p: { readonly: boolean }) => p.readonly));
    assert.equal(body.factoryId, "factory-padrao-apdata-saas");
  });

  it("duplicates profile and blocks factory edit", async () => {
    const listRes = await app.request("/api/sql-profiles");
    const { factoryId } = await listRes.json();
    const dupRes = await app.request(`/api/sql-profiles/${factoryId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Padrão Apdata SaaS (cópia teste)" }),
    });
    assert.equal(dupRes.status, 201);
    const { profile } = await dupRes.json();
    assert.equal(profile.readonly, false);

    const blockRes = await app.request(`/api/sql-profiles/${factoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "nope" }),
    });
    assert.equal(blockRes.status, 403);
  });

  it("POST test-slot rejects DML without echoing secrets", async () => {
    const res = await app.request("/api/query/test-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: "ESTABELECIMENTOS",
        sql: "DELETE FROM Contratados",
        connection: {
          engine: "mssql",
          host: "127.0.0.1",
          port: 1,
          database: "nope",
          user: "ro",
          password: "test-slot-secret-no-leak",
        },
      }),
    });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes("test-slot-secret-no-leak"));
    assert.match(text, /SQL blocked/i);
  });
});
