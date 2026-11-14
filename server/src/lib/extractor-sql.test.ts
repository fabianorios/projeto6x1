import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSelectOnly } from "@projeto-6x1/mcp";
import {
  buildExtractorQuery,
  getAptoolsExtractorScript,
} from "./extractor-sql.js";
import { assertNoPiiColumns, mapExtractorRows } from "./extractor-map.js";

describe("extractor SQL", () => {
  it("MSSQL body passes SELECT-only guard", () => {
    const { sql } = buildExtractorQuery("mssql");
    const r = assertSelectOnly(sql);
    assert.equal(r.ok, true, r.ok ? "" : r.reason);
    assert.ok(!sql.includes(";"));
  });

  it("Oracle body passes SELECT-only guard", () => {
    const { sql } = buildExtractorQuery("oracle");
    const r = assertSelectOnly(sql);
    assert.equal(r.ok, true, r.ok ? "" : r.reason);
  });

  it("binds CNPJ filters without string concat injection", () => {
    const { sql, params } = buildExtractorQuery("mssql", {
      cnpjs: ["12.345.678/0001-90", "drop table"],
    });
    assert.ok(sql.includes("@cnpj0"));
    assert.equal(params.cnpj0, "12345678000190");
    // invalid short "digits" from 'drop table' filtered out
    assert.equal(params.tipoVr, 53);
    assert.ok(sql.includes("@tipoVr"));
    assert.ok(sql.includes("PBV_DtdInicio"));
    assert.ok(sql.includes("MRI_DtdInicioVigencia"));
    assert.ok(!sql.includes("= 53"));
  });

  it("binds benefit tipos from profile (parameterized)", () => {
    const { sql, params } = buildExtractorQuery("mssql", {
      benefitParams: {
        vrTipoBeneficio: 99,
        vaTipoBeneficio: null,
        assistenciaMedicaTipo: 12,
        assistenciaOdontologicaTipo: null,
        vaModoValor: "MES",
      },
    });
    assert.equal(params.tipoVr, 99);
    assert.equal(params.tipoVa, -1);
    assert.equal(params.tipoMedica, 12);
    assert.equal(params.tipoOdonto, -1);
    assert.ok(sql.includes("ConBeneficios"));
    assert.ok(sql.includes("TiposBeneficiosEntsBens"));
  });

  it("Aptools script is SELECT-only without SET TRANSACTION", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    assert.match(mssql, /FROM\s+Contratados\b/i);
    assert.match(mssql, /LPC_CdiLocal/);
    assert.match(mssql, /CAS_CdiContratado/);
    assert.match(mssql, /TDP_OplTrabalho/);
    assert.ok(!/SET\s+TRANSACTION/i.test(mssql));
    assert.ok(!/SET\s+TRANSACTION/i.test(oracle));
    assert.ok(!/\bContratos\b/i.test(mssql));
    assert.ok(!/\bLOC_/i.test(mssql));
  });
});

describe("extractor map", () => {
  it("maps aggregates and blocks PII columns", () => {
    const rows = mapExtractorRows([
      {
        COD_EMPRESA: "1",
        cod_filial: "2",
        cnpj_completo: "12345678000190",
        cod_cc: "CC-01",
        desc_cargo: "Operador",
        qtd_colaboradores: 2,
        massa_salarial_base: 4400,
        vr_dia_medio: 32,
        vt_dia_medio: 15,
        dias_trabalho_mes_atual: 26,
        carga_semanal_atual: 44,
        escala_atual: "6x1",
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].desc_cargo, "Operador");
    assert.equal(rows[0].qtd_colaboradores, 2);
    assert.throws(() => assertNoPiiColumns(["nome", "cod_cc"]));
    assert.doesNotThrow(() => assertNoPiiColumns(["cod_cc", "desc_cargo"]));
  });
});
