import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EPHEMERAL_CONN_FAIL_MSG,
  createEphemeralClient,
  isEphemeralConnectionFailure,
  scrubErrorText,
} from "./ephemeral-db.js";

describe("ephemeral-db helpers", () => {
  it("classifies tedious/mssql connection codes as failures", () => {
    for (const code of ["ELOGIN", "ETIMEOUT", "ESOCKET", "ECONNREFUSED"]) {
      assert.equal(
        isEphemeralConnectionFailure(Object.assign(new Error("x"), { code })),
        true,
        code,
      );
    }
  });

  it("classifies nested originalError codes", () => {
    const err = Object.assign(new Error("ConnectionError: Failed to connect"), {
      name: "ConnectionError",
      originalError: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ESOCKET",
      }),
    });
    assert.equal(isEphemeralConnectionFailure(err), true);
  });

  it("does not treat SQL policy errors as connection failures", () => {
    assert.equal(
      isEphemeralConnectionFailure(new Error("SQL blocked: allowlist")),
      false,
    );
  });

  it("scrubs credentials from error text", () => {
    const scrubbed = scrubErrorText(
      "Login failed for user 'sa' password=super-secret-password",
      ["super-secret-password"],
    );
    assert.ok(!scrubbed.includes("super-secret-password"));
    assert.match(scrubbed, /\[redacted\]/);
  });

  it("does not scrub short usernames inside table names (sa ⊂ Empresas)", () => {
    const scrubbed = scrubErrorText("Invalid object name 'Empresas'.", [
      "sa",
      "x",
    ]);
    assert.equal(scrubbed, "Invalid object name 'Empresas'.");
  });

  it("exposes a stable Portuguese connection failure message", () => {
    assert.match(EPHEMERAL_CONN_FAIL_MSG, /Falha de conexão/);
    assert.match(EPHEMERAL_CONN_FAIL_MSG, /firewall|timeout/i);
  });

  it("createEphemeralClient omits empty MSSQL database (undefined, not \"\")", () => {
    const client = createEphemeralClient({
      engine: "mssql",
      host: "127.0.0.1",
      port: 1433,
      database: "   ",
      user: "ro",
      password: "x",
    });
    assert.equal(client.driver, "mssql");
    // Inspect private config via cast — empty must become undefined.
    const cfg = (client as unknown as { config: { database?: string } }).config;
    assert.equal(cfg.database, undefined);
  });
});
