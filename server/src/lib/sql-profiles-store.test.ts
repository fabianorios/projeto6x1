import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { assertSelectOnly } from "@projeto-6x1/mcp";
import {
  FACTORY_PROFILE_ID,
  factoryDefaultSlots,
} from "./sql-profile-defaults.js";
import { SQL_SLOT_IDS } from "./sql-profile-types.js";
import { SqlProfilesStore } from "./sql-profiles-store.js";
import {
  guardSlotSql,
  validateContractColumns,
} from "./sql-slot-guard.js";

describe("SqlProfilesStore", () => {
  let dir: string;
  let store: SqlProfilesStore;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "sql-profiles-"));
    store = new SqlProfilesStore(dir);
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("seeds immutable factory profile", async () => {
    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, FACTORY_PROFILE_ID);
    assert.equal(list[0]!.readonly, true);
    assert.equal(list[0]!.name, "Padrão Apdata SaaS");
  });

  it("factory SQL passes SELECT-only for every slot/dialect", () => {
    const slots = factoryDefaultSlots();
    for (const id of SQL_SLOT_IDS) {
      for (const dialect of ["mssql", "oracle"] as const) {
        const sql = slots[id][dialect];
        const r = assertSelectOnly(sql);
        assert.equal(r.ok, true, `${id}/${dialect}: ${r.ok ? "" : r.reason}`);
        const g = guardSlotSql(sql);
        assert.equal(g.ok, true, `${id}/${dialect} guard`);
      }
    }
  });

  it("duplicates factory into editable custom profile", async () => {
    const dup = await store.duplicate(FACTORY_PROFILE_ID, "Cliente VR Fixo 22d");
    assert.equal(dup.readonly, false);
    assert.equal(dup.name, "Cliente VR Fixo 22d");
    assert.notEqual(dup.id, FACTORY_PROFILE_ID);

    const updated = await store.update(dup.id, {
      slots: {
        ...dup.slots,
        REGRA_VR: {
          mssql: dup.slots.REGRA_VR.mssql.replace("'ESCALA'", "'FIXO_MES'"),
          oracle: dup.slots.REGRA_VR.oracle.replace("'ESCALA'", "'FIXO_MES'"),
        },
      },
    });
    assert.match(updated.slots.REGRA_VR.mssql, /FIXO_MES/);

    await assert.rejects(
      () => store.update(FACTORY_PROFILE_ID, { name: "hack" }),
      /read-only/,
    );
  });

  it("persists under DATA_DIR only", async () => {
    const raw = await readFile(join(dir, "sql-profiles.json"), "utf8");
    assert.match(raw, /Cliente VR Fixo 22d/);
    assert.ok(!raw.toLowerCase().includes("cpf"));
  });
});

describe("sql-slot-guard", () => {
  it("blocks PII and DDL", () => {
    assert.equal(guardSlotSql("DELETE FROM Contratos").ok, false);
    assert.equal(
      guardSlotSql("SELECT FUN_NusCPF AS cpf FROM Funcionarios").ok,
      false,
    );
    assert.equal(
      guardSlotSql("SELECT cod_empresa, cod_filial FROM Empresas").ok,
      true,
    );
  });

  it("validates contract columns case-insensitively", () => {
    const ok = validateContractColumns("ESTABELECIMENTOS", [
      "COD_EMPRESA",
      "cod_filial",
      "razao_social",
      "nome_filial",
      "cnpj_completo",
      "qtd_ativos",
    ]);
    assert.equal(ok.ok, true);
    const bad = validateContractColumns("REGRA_VR", ["cod_empresa"]);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.ok(bad.missing.includes("modo_dias"));
  });
});
