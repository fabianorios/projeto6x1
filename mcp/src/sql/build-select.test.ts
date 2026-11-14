import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSelectOnly } from "../policy/select-only.js";
import { buildSelectRows } from "./build-select.js";

describe("buildSelectRows", () => {
  it("builds TOP SELECT for allowlisted table", () => {
    const built = buildSelectRows(
      { table: "Horarios", columns: ["HOR_CdiHorario"], limit: 10 },
      5000,
      "mssql",
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.match(built.sql, /^SELECT TOP \(10\) HOR_CdiHorario FROM Horarios$/i);
    assert.equal(assertSelectOnly(built.sql).ok, true);
    assert.equal(built.limit, 10);
  });

  it("rejects non-allowlisted table", () => {
    const built = buildSelectRows({ table: "sys.objects", limit: 5 }, 100);
    assert.equal(built.ok, false);
  });

  it("binds where params and rejects injection in column names", () => {
    const ok = buildSelectRows(
      {
        table: "Contratados",
        where: { CON_CdiHorario: 42, CON_CdiCargo: null },
        limit: 3,
      },
      100,
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.match(ok.sql, /CON_CdiHorario = @w0/i);
    assert.match(ok.sql, /CON_CdiCargo IS NULL/i);
    assert.equal(ok.params.w0, 42);

    const bad = buildSelectRows(
      {
        table: "Contratados",
        where: { "1=1; DROP TABLE x": 1 },
        limit: 1,
      },
      100,
    );
    assert.equal(bad.ok, false);
  });

  it("caps limit to maxRows", () => {
    const built = buildSelectRows(
      { table: "Folhas", limit: 50_000 },
      500,
      "mssql",
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.limit, 500);
    assert.match(built.sql, /TOP \(500\)/i);
  });

  it("oracle dialect uses FETCH FIRST", () => {
    const built = buildSelectRows(
      { table: "Cargos", limit: 2 },
      100,
      "oracle",
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.match(built.sql, /FETCH FIRST 2 ROWS ONLY/i);
    assert.equal(assertSelectOnly(built.sql).ok, true);
  });

  it("never produces INSERT/UPDATE/DELETE", () => {
    const built = buildSelectRows(
      {
        table: "HorariosJornadas",
        columns: ["HOR_CdiHorario"],
        orderBy: "HOR_CdiHorario",
        orderDir: "DESC",
        limit: 5,
      },
      100,
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.doesNotMatch(built.sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  });

  it("binds whereNotIn params", () => {
    const built = buildSelectRows(
      {
        table: "Contratados",
        columns: ["CON_CdiContratado", "CON_CdiSituacao"],
        whereNotIn: { CON_CdiSituacao: [0, 2, 3, 99] },
        limit: 100,
      },
      5000,
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.match(
      built.sql,
      /CON_CdiSituacao NOT IN \(@w0, @w1, @w2, @w3\)/i,
    );
    assert.equal(built.params.w0, 0);
    assert.equal(built.params.w3, 99);
    assert.equal(assertSelectOnly(built.sql).ok, true);
  });

  it("rejects empty or oversized whereNotIn", () => {
    assert.equal(
      buildSelectRows(
        { table: "Contratados", whereNotIn: { CON_CdiSituacao: [] }, limit: 1 },
        100,
      ).ok,
      false,
    );
    assert.equal(
      buildSelectRows(
        {
          table: "Contratados",
          whereNotIn: { CON_CdiSituacao: Array.from({ length: 33 }, (_, i) => i) },
          limit: 1,
        },
        100,
      ).ok,
      false,
    );
  });

  it("allowlists Locais, Empresas and RamosAtividadesEmpresas", () => {
    assert.equal(
      buildSelectRows(
        { table: "Locais", columns: ["LOC_CdiLocal"], limit: 5 },
        100,
      ).ok,
      true,
    );
    assert.equal(
      buildSelectRows(
        { table: "Empresas", columns: ["EMP_CdiEmpresa"], limit: 5 },
        100,
      ).ok,
      true,
    );
    assert.equal(
      buildSelectRows(
        {
          table: "RamosAtividadesEmpresas",
          columns: ["RAE_CdiRamoAtividadeEmpresa", "RAE_D1sRamoAtividadeEmpresa"],
          limit: 5,
        },
        100,
      ).ok,
      true,
    );
  });
});
