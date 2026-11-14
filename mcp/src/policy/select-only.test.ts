import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowlistedTable,
  assertSafeIdentifier,
  assertSelectOnly,
  bareTableName,
  clampLimit,
  DEFAULT_TABLE_ALLOWLIST,
  isAllowlistedTable,
} from "./select-only.js";

describe("assertSelectOnly", () => {
  it("allows plain SELECT", () => {
    assert.equal(assertSelectOnly("SELECT 1").ok, true);
  });

  it("allows WITH … SELECT", () => {
    const sql = "WITH x AS (SELECT 1 AS n) SELECT n FROM x";
    assert.equal(assertSelectOnly(sql).ok, true);
  });

  it("rejects empty SQL", () => {
    const r = assertSelectOnly("   ");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /empty/i);
  });

  it("rejects semicolons / multi-statement", () => {
    const r = assertSelectOnly("SELECT 1; DROP TABLE Contratados");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /semicolon/i);
  });

  it("rejects INSERT", () => {
    const r = assertSelectOnly("INSERT INTO Contratados VALUES (1)");
    assert.equal(r.ok, false);
  });

  it("rejects UPDATE", () => {
    const r = assertSelectOnly("UPDATE Horarios SET HOR_QtnHorasSemanal = 40");
    assert.equal(r.ok, false);
  });

  it("rejects DELETE", () => {
    const r = assertSelectOnly("DELETE FROM Folhas");
    assert.equal(r.ok, false);
  });

  it("rejects DDL DROP/ALTER/CREATE", () => {
    assert.equal(assertSelectOnly("DROP TABLE Horarios").ok, false);
    assert.equal(assertSelectOnly("ALTER TABLE Horarios ADD x INT").ok, false);
    assert.equal(assertSelectOnly("CREATE TABLE x (id INT)").ok, false);
  });

  it("rejects EXEC / MERGE", () => {
    assert.equal(assertSelectOnly("EXEC sp_who").ok, false);
    assert.equal(
      assertSelectOnly("MERGE INTO Horarios USING x ON 1=1 WHEN MATCHED THEN UPDATE SET a=1").ok,
      false,
    );
  });

  it("rejects SELECT that embeds forbidden keywords", () => {
    const embedded = assertSelectOnly(
      "SELECT * FROM Horarios WHERE 1=1 DELETE FROM Contratados",
    );
    assert.equal(embedded.ok, false);
  });
});

describe("allowlist", () => {
  it("includes feasibility seed tables", () => {
    for (const t of [
      "Horarios",
      "HorariosJornadas",
      "Contratados",
      "CentrosCustos",
      "Cargos",
      "QuantidadesHorasMes",
      "Folhas",
      "Locais",
      "Empresas",
      "Vinculos",
      "RamosAtividadesEmpresas",
      "HorariosTiposDiasAT",
      "ConATransportes",
      "MeiosTransportesItens",
    ]) {
      assert.equal(isAllowlistedTable(t), true, t);
    }
  });

  it("rejects ConCalculoATransportes (VT uses cadastro, not cálculo)", () => {
    assert.equal(isAllowlistedTable("ConCalculoATransportes"), false);
  });

  it("rejects unknown tables", () => {
    assert.equal(isAllowlistedTable("UsuariosAdmin"), false);
    const r = assertAllowlistedTable("Secrets");
    assert.equal(r.ok, false);
  });

  it("accepts schema-qualified allowlisted names", () => {
    assert.equal(isAllowlistedTable("dbo.Horarios"), true);
    assert.equal(bareTableName("dbo.Horarios"), "Horarios");
    assert.equal(assertAllowlistedTable("dbo.Contratados").ok, true);
  });

  it("DEFAULT_TABLE_ALLOWLIST is non-empty", () => {
    assert.ok(DEFAULT_TABLE_ALLOWLIST.length >= 7);
  });
});

describe("identifiers and limit", () => {
  it("validates identifiers", () => {
    assert.equal(assertSafeIdentifier("HOR_CdiHorario").ok, true);
    assert.equal(assertSafeIdentifier("a; DROP").ok, false);
    assert.equal(assertSafeIdentifier("col-name").ok, false);
  });

  it("clamps limit", () => {
    assert.equal(clampLimit(undefined, 5000), 100);
    assert.equal(clampLimit(10, 5000), 10);
    assert.equal(clampLimit(99999, 5000), 5000);
    assert.equal(clampLimit(0, 5000), 1);
    assert.equal(clampLimit(-5, 5000), 1);
  });
});
