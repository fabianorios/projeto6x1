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
    assert.equal(params.cnpj1, undefined);
    assert.ok(!Object.keys(params).some((k) => k.startsWith("tipo")));
  });

  it("emits beneficios_agg via TiposBeneficios (no hard-coded tipo)", () => {
    const { sql, params } = buildExtractorQuery("mssql");
    assert.ok(sql.includes("TiposBeneficios"));
    assert.ok(sql.includes("beneficios_agg"));
    assert.ok(sql.includes("PBV_DtdFim IS NULL"));
    assert.ok(sql.includes("STRING_AGG"));
    assert.ok(!/TPB_CdiTipoBeneficio\s*=\s*53/.test(sql));
    assert.ok(!sql.includes("@tipoVr"));
    assert.ok(!sql.includes("ConBeneficios"));
    assert.ok(!sql.includes("TiposBeneficiosEntsBens"));
    assert.deepEqual(params, {});

    const oracle = buildExtractorQuery("oracle").sql;
    assert.ok(oracle.includes("LISTAGG"));
    assert.ok(oracle.includes("beneficios_agg"));
  });

  it("Aptools script is SELECT-only without SET TRANSACTION", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    assert.match(mssql, /FROM\s+Contratados\b/i);
    assert.match(mssql, /LPC_CdiLocal/);
    assert.match(mssql, /CAS_CdiContratado/);
    assert.match(mssql, /TDP_OplTrabalho/);
    assert.match(mssql, /beneficios_agg/);
    assert.ok(!/SET\s+TRANSACTION/i.test(mssql));
    assert.ok(!/SET\s+TRANSACTION/i.test(oracle));
    assert.ok(!/\bContratos\b/i.test(mssql));
    assert.ok(!/\bLOC_/i.test(mssql));
    assert.match(mssql, /CHAR\(9\)/);
    assert.match(oracle, /CHR\(9\)/);
  });
});

describe("extractor map", () => {
  it("maps aggregates including beneficios_agg and blocks PII columns", () => {
    const rows = mapExtractorRows([
      {
        COD_EMPRESA: "1",
        cod_filial: "2",
        cnpj_completo: "12345678000190",
        cod_cc: "CC-01",
        desc_cargo: "Operador",
        qtd_colaboradores: 2,
        massa_salarial_base: 4400,
        vr_dia_medio: 0,
        vt_dia_medio: 15,
        dias_trabalho_mes_atual: 26,
        carga_semanal_atual: 44,
        escala_atual: "6x1",
        // Synthetic fixture — no real employee PII.
        BENEFICIOS_AGG:
          "53|VALE REFEICAO|30.50;52|VALE ALIMENTACAO|300;10|UNIMED TITULAR|400",
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].desc_cargo, "Operador");
    assert.equal(rows[0].qtd_colaboradores, 2);
    assert.equal(
      rows[0].beneficios_agg,
      "53|VALE REFEICAO|30.50;52|VALE ALIMENTACAO|300;10|UNIMED TITULAR|400",
    );
    assert.throws(() => assertNoPiiColumns(["nome", "cod_cc"]));
    assert.doesNotThrow(() => assertNoPiiColumns(["cod_cc", "desc_cargo"]));
  });
});
