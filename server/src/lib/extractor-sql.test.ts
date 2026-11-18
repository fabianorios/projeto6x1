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

  it("emits beneficios_agg via ConBeneficios → TBE_* (no hard-coded tipo)", () => {
    const { sql, params } = buildExtractorQuery("mssql");
    assert.ok(sql.includes("ConBeneficios"));
    assert.ok(sql.includes("PlanosBeneficios"));
    assert.ok(sql.includes("TiposBeneficiosEntsBens"));
    assert.ok(sql.includes("TiposBeneficios"));
    assert.ok(sql.includes("TBE_CdiTipoBeneficio"));
    assert.ok(sql.includes("TBE_D1sTipoBeneficio"));
    assert.ok(sql.includes("MAX(PBV_DtdInicio)"));
    assert.ok(sql.includes("CBN_DtdFim IS NULL"));
    assert.ok(sql.includes("beneficios_agg"));
    assert.ok(sql.includes("STRING_AGG"));
    assert.ok(!sql.includes("PBV_DtdFim IS NULL"));
    assert.ok(!sql.includes("CBN_OplDesativado"));
    assert.ok(!sql.includes("TPB_CdiTipoBeneficio"));
    assert.ok(!/TBE_CdiTipoBeneficio\s*=\s*53/.test(sql));
    assert.ok(!sql.includes("@tipoVr"));
    assert.deepEqual(params, {});

    const oracle = buildExtractorQuery("oracle").sql;
    assert.ok(oracle.includes("LISTAGG"));
    assert.ok(oracle.includes("ConBeneficios"));
    assert.ok(oracle.includes("TBE_CdiTipoBeneficio"));
    assert.ok(oracle.includes("beneficios_agg"));
  });

  it("Oracle Folha has LISTAGG/NVL and rejects MSSQL-only tokens", () => {
    const oracle = getAptoolsExtractorScript("oracle");
    const mssql = getAptoolsExtractorScript("mssql");
    assert.match(oracle, /LISTAGG\s*\(/);
    assert.match(oracle, /WITHIN GROUP\s*\(\s*ORDER BY/);
    assert.match(oracle, /\bNVL\s*\(/);
    assert.match(oracle, /\bCHR\s*\(\s*59\s*\)/);
    assert.match(oracle, /\|\|/);
    assert.match(oracle, /AS NUMBER/);
    assert.match(oracle, /beneficios_agg/);
    assert.match(oracle, /cnpj_completo/);
    assert.match(oracle, /NOT IN \(0, 2, 3, 99\)/);
    assert.ok(!/\bISNULL\s*\(/i.test(oracle));
    assert.ok(!/\bSTRING_AGG\s*\(/i.test(oracle));
    assert.ok(!/\bCHAR\s*\(/i.test(oracle));
    assert.ok(!/\bVARCHAR\s*\(/i.test(oracle));
    assert.ok(!/\bDECIMAL\s*\(/i.test(oracle));
    assert.match(mssql, /STRING_AGG/);
    assert.match(mssql, /\bISNULL\s*\(/);
    assert.ok(!/\bLISTAGG\s*\(/i.test(mssql));
  });

  it("Oracle Aptools Folha must not end with ; (ORA-00933) and LISTAGG parses", () => {
    const oracle = getAptoolsExtractorScript("oracle");
    const mssql = getAptoolsExtractorScript("mssql");
    assert.ok(
      !/;\s*$/.test(oracle),
      "Oracle Aptools SQL must not end with semicolon (ORA-00933)",
    );
    assert.ok(!oracle.trimEnd().endsWith(";"));
    assert.match(
      oracle,
      /LISTAGG\s*\(\s*[\s\S]*?,\s*CHR\s*\(\s*59\s*\)\s*\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+cod_tipo\s*\)/i,
    );
    assert.ok(!/\bISNULL\s*\(/i.test(oracle));
    assert.ok(!/\bSTRING_AGG\s*\(/i.test(oracle));
    assert.ok(!/\bCHAR\s*\(/i.test(oracle));
    assert.ok(/;\s*$/.test(mssql), "MSSQL Aptools may keep trailing ;");
  });

  it("emits horario_trabalho_atual via JornadasItens JOI_* × TJO_OplTrabalhada", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    assert.match(mssql, /CTE_HORARIO_TRABALHO/);
    assert.match(mssql, /CTE_HT_ITENS/);
    assert.match(mssql, /CTE_HT_PARTS/);
    assert.match(mssql, /JornadasItens/);
    assert.match(mssql, /JOI_HrdHoraMinutoInicio/);
    assert.match(mssql, /JOI_HrdHoraMinutoFim/);
    assert.match(mssql, /TiposJornadas/);
    assert.match(mssql, /TJO_OplTrabalhada/);
    assert.match(mssql, /AS horario_trabalho_atual/);
    assert.match(mssql, /HRI_CdiJornada/);
    assert.match(mssql, /intervalo /);
    assert.match(mssql, /STRING_AGG\(part, ' \/ '\)/);
    assert.ok(!mssql.includes("JIT_"));
    assert.ok(!mssql.includes("OplConsiderarTrabalho"));
    assert.ok(!/CONVERT\(varchar\(5\), MIN\(ji\.JOI_HrdHoraMinutoInicio\)/.test(mssql));
    assert.match(oracle, /CTE_HORARIO_TRABALHO/);
    assert.match(oracle, /CTE_HT_ITENS/);
    assert.match(oracle, /JOI_HrdHoraMinutoInicio/);
    assert.match(oracle, /AS horario_trabalho_atual/);
    assert.match(oracle, /LISTAGG\(part, ' \/ '\)/);
    assert.match(oracle, /intervalo /);
    assert.ok(!/TO_CHAR\(MIN\(ji\.JOI_HrdHoraMinutoInicio\)/.test(oracle));
  });

  it("uses TIP_* escalas with work_days x off_days concat", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    assert.match(mssql, /TIP_OplTrabalho/);
    assert.match(mssql, /TIP_CdiTipoDiaPonto/);
    assert.ok(!mssql.includes("TDP_OplTrabalho"));
    assert.ok(!mssql.includes("TDP_CdiTipoDiaPonto"));
    assert.match(mssql, /HOR_OplDesativado/);
    assert.match(
      mssql,
      /CAST\(cic\.work_days AS VARCHAR\(10\)\) \+ 'x' \+ CAST\(cic\.off_days AS VARCHAR\(10\)\)/,
    );
    assert.ok(
      !/WHEN cic\.cycle_len = 7 AND cic\.work_days = 6 THEN '6x1'/.test(mssql),
    );
    assert.match(oracle, /TIP_OplTrabalho/);
    assert.match(
      oracle,
      /TO_CHAR\(cic\.work_days\) \|\| 'x' \|\| TO_CHAR\(cic\.off_days\)/,
    );
  });

  it("Aptools script is SELECT-only without SET TRANSACTION", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    assert.match(mssql, /FROM\s+Contratados\b/i);
    assert.match(mssql, /LOC_CdiLocal/);
    assert.match(mssql, /CAS_CdiContratado/);
    assert.match(mssql, /TIP_OplTrabalho/);
    assert.match(mssql, /beneficios_agg/);
    assert.ok(!/SET\s+TRANSACTION/i.test(mssql));
    assert.ok(!/SET\s+TRANSACTION/i.test(oracle));
    assert.ok(!/\bContratos\b/i.test(mssql));
    assert.ok(!/\bLPC_/i.test(mssql));
    assert.match(mssql, /Vinculos\b/);
    assert.match(mssql, /VIN_CdiTipoRegimeTrabalhista/);
    assert.match(mssql, /CategsTrabseSoc/);
    assert.match(mssql, /NOT IN \(0, 2, 3, 99\)/);
    assert.ok(!mssql.includes("__VINCULO_JOINS__"));
    assert.match(mssql, /CHAR\(9\)/);
    assert.match(oracle, /CHR\(9\)/);
    assert.match(mssql, /CCU_D1sCentroCusto/);
    assert.match(mssql, /AS desc_cc/);
    assert.match(oracle, /CCU_D1sCentroCusto/);
    assert.match(oracle, /AS desc_cc/);
  });

  it("joins Sindicatos + QuantidadesHorasMes (Horas Base)", () => {
    const mssql = getAptoolsExtractorScript("mssql");
    const oracle = getAptoolsExtractorScript("oracle");
    for (const sql of [mssql, oracle]) {
      assert.match(sql, /QuantidadesHorasMes/);
      assert.match(sql, /HMV_QtnQuantidadeHoraMes/);
      assert.match(sql, /CON_CdiQuantidadeHoraMes/);
      assert.match(sql, /Sindicatos/);
      assert.match(sql, /SIN_CdiSindicato/);
      assert.match(sql, /SIN_D1sSindicato/);
      assert.match(sql, /SIN_NusCNPJ/);
      assert.match(sql, /CON_CdiSindicato/);
      assert.match(sql, /AS carga_horaria_mensal/);
      assert.match(sql, /AS nome_sindicato/);
      assert.match(sql, /AS cnpj_sindicato/);
      assert.match(sql, /AS cod_sindicato/);
      assert.ok(!/CON_DssNome/i.test(sql));
    }
  });

  it("mapExtractorRows keeps sindicato + HMV fields", () => {
    const mapped = mapExtractorRows([
      {
        cod_empresa: "1",
        cod_filial: "2",
        cnpj_completo: "12345678000190",
        cod_cc: "CC-01",
        desc_cc: "Loja",
        cod_cargo: "9",
        desc_cargo: "Operador",
        cod_vinculo: "1",
        cod_horario_atual: "4",
        horario_trabalho_atual: "08:00-17:00",
        escala_atual: "6x1",
        carga_semanal_atual: 40,
        carga_horaria_mensal: 220,
        cod_sindicato: "12",
        nome_sindicato: "Sindicato Demo",
        cnpj_sindicato: "11222333000144",
        qtd_colaboradores: 3,
        massa_salarial_base: 9000,
        dias_trabalho_mes_atual: 26,
        beneficios_agg: "",
      },
    ]);
    assert.equal(mapped[0]!.carga_horaria_mensal, 220);
    assert.equal(mapped[0]!.carga_semanal_atual, 40);
    assert.equal(mapped[0]!.cod_sindicato, "12");
    assert.equal(mapped[0]!.nome_sindicato, "Sindicato Demo");
    assert.equal(mapped[0]!.cnpj_sindicato, "11222333000144");
  });

  it("mapExtractorRows reads Oracle-uppercased sindicato + HMV aliases", () => {
    const mapped = mapExtractorRows([
      {
        COD_EMPRESA: "1",
        COD_FILIAL: "1",
        CNPJ_COMPLETO: "12345678000190",
        COD_CC: "CC-99",
        DESC_CARGO: "Auxiliar",
        CARGA_SEMANAL_ATUAL: 36,
        CARGA_HORARIA_MENSAL: 180,
        COD_SINDICATO: "7",
        NOME_SINDICATO: "Sindicato Upper",
        CNPJ_SINDICATO: "99888777000166",
        QTD_COLABORADORES: 1,
        MASSA_SALARIAL_BASE: 2000,
        ESCALA_ATUAL: "5x2",
        DIAS_TRABALHO_MES_ATUAL: 22,
        BENEFICIOS_AGG: "",
      },
    ]);
    assert.equal(mapped[0]!.carga_horaria_mensal, 180);
    assert.equal(mapped[0]!.cod_sindicato, "7");
    assert.equal(mapped[0]!.nome_sindicato, "Sindicato Upper");
    assert.equal(mapped[0]!.cnpj_sindicato, "99888777000166");
  });


  it("applies incluirAfastados=false and custom regime/categoria", () => {
    const { sql } = buildExtractorQuery("mssql", {
      incluirAfastados: false,
      tipoRegimeTrabalhistaIds: [1],
      categTrabeSocIds: [101],
      somenteEmpregaticios: true,
    });
    assert.match(sql, /SIT_OplAfastamento/);
    assert.match(sql, /VIN_CdiCategTrabeSoc IN \(101\)/);
    assert.ok(!sql.includes("SDK_OplVinculoEmpregaticio"));
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
        DESC_CC: "Operacoes",
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
    assert.equal(rows[0].desc_cc, "Operacoes");
    assert.equal(rows[0].qtd_colaboradores, 2);
    assert.equal(
      rows[0].beneficios_agg,
      "53|VALE REFEICAO|30.50;52|VALE ALIMENTACAO|300;10|UNIMED TITULAR|400",
    );
    assert.throws(() => assertNoPiiColumns(["nome", "cod_cc"]));
    assert.doesNotThrow(() =>
      assertNoPiiColumns(["cod_cc", "desc_cc", "desc_cargo"]),
    );
  });
});
