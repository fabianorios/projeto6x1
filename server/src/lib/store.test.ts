import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { EnvironmentStore } from "./store.js";

describe("EnvironmentStore", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );
  let dir: string;
  let store: EnvironmentStore;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ambientes-"));
    store = new EnvironmentStore(dir, key);
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates and lists with masked password", async () => {
    const created = await store.create({
      name: "Ambiente piloto A",
      engine: "mssql",
      host: "db.example.local",
      database: "folha_demo",
      user: "readonly",
      password: "never-return-this",
    });

    assert.equal(created.hasPassword, true);
    assert.equal(created.passwordMasked, "••••••••");
    assert.equal(created.active, true);
    assert.ok(!JSON.stringify(created).includes("never-return-this"));

    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.passwordMasked, "••••••••");
  });

  it("keeps password on update when omitted", async () => {
    const [first] = await store.list();
    assert.ok(first);
    const updated = await store.update(first!.id, {
      name: "Ambiente piloto A (edit)",
      password: "",
    });
    assert.equal(updated.name, "Ambiente piloto A (edit)");
    const record = await store.getRecord(first!.id);
    assert.ok(record);
    assert.equal(store.decryptPassword(record!), "never-return-this");
  });

  it("activates another environment", async () => {
    const second = await store.create({
      name: "Ambiente piloto B",
      engine: "oracle",
      host: "ora.example.local",
      database: "ORCL",
      user: "readonly",
      password: "other-secret",
    });
    assert.equal(second.active, false);
    const activated = await store.setActive(second.id);
    assert.equal(activated.active, true);
    const active = await store.getActive();
    assert.equal(active?.id, second.id);
  });
});
