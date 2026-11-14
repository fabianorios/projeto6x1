/**
 * Factory default SqlProfile queries — immutable seed ("Padrão Apdata SaaS").
 * Derived from docs/apdata-extractor.sql (VR Plano 53, VT ConATransportes,
 * CON_CdiSituacao NOT IN (0,2,3,99)). SELECT/WITH bodies only (no SET/;).
 */

import type { SqlSlotId, SqlSlotQueries } from "./sql-profile-types.js";

const ESTABELECIMENTOS_MSSQL = `
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(ISNULL(e.EMP_DssEmpresa, ''), CHAR(59), ' ') AS razao_social,
    REPLACE(ISNULL(l.LOC_D1sLocal, ''), CHAR(59), ' ') AS nome_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    COUNT(c.CON_CdiContrato) AS qtd_ativos
FROM Contratos c
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    e.EMP_DssEmpresa,
    l.LOC_D1sLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '')
ORDER BY razao_social, nome_filial
`.trim();

const ESTABELECIMENTOS_ORACLE = `
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    REPLACE(NVL(e.EMP_DssEmpresa, ''), CHR(59), ' ') AS razao_social,
    REPLACE(NVL(l.LOC_D1sLocal, ''), CHR(59), ' ') AS nome_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    COUNT(c.CON_CdiContrato) AS qtd_ativos
FROM Contratos c
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    e.EMP_DssEmpresa,
    l.LOC_D1sLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '')
ORDER BY razao_social, nome_filial
`.trim();

const FOLHA_MSSQL = `
WITH CTE_CICLO_HORARIO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
)
SELECT
    CAST(c.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(c.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ') AS cod_cc,
    CAST(ISNULL(c.CAR_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' ') AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.HOR_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(ISNULL(h.HOR_NuiCargaHorariaSemanal, 44.0) AS DECIMAL(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContrato) AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2)) AS massa_salarial_base,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_trabalho_mes_atual
FROM Contratos c
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CAR_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '),
    c.CAR_CdiCargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '),
    c.CON_CdiVinculo,
    c.HOR_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    ISNULL(h.HOR_NuiCargaHorariaSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const FOLHA_ORACLE = `
WITH CTE_CICLO_HORARIO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
)
SELECT
    TO_CHAR(c.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(c.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ') AS cod_cc,
    TO_CHAR(NVL(c.CAR_CdiCargo, 0)) AS cod_cargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' ') AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.HOR_CdiHorario, 0)) AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(NVL(h.HOR_NuiCargaHorariaSemanal, 44.0) AS NUMBER(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContrato) AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2)) AS massa_salarial_base,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_trabalho_mes_atual
FROM Contratos c
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CAR_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '),
    c.CAR_CdiCargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '),
    c.CON_CdiVinculo,
    c.HOR_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    NVL(h.HOR_NuiCargaHorariaSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const REGRA_VR_MSSQL = `
WITH CTE_CICLO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
),
CTE_VR AS (
    SELECT
        pbv.CON_CdiContrato,
        MAX(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_dia
    FROM PlanosBeneficiosValores pbv
    WHERE pbv.TPB_CdiTipoBeneficio = 53
      AND pbv.PBV_DtdFim IS NULL
    GROUP BY pbv.CON_CdiContrato
)
SELECT
    CAST(c.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(c.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ') AS cod_cc,
    CAST(AVG(ISNULL(vr.valor_dia, 0)) AS DECIMAL(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_base_mes
FROM Contratos c
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN CTE_VR vr ON vr.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_CICLO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ')
`.trim();

const REGRA_VR_ORACLE = `
WITH CTE_CICLO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
),
CTE_VR AS (
    SELECT
        pbv.CON_CdiContrato,
        MAX(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_dia
    FROM PlanosBeneficiosValores pbv
    WHERE pbv.TPB_CdiTipoBeneficio = 53
      AND pbv.PBV_DtdFim IS NULL
    GROUP BY pbv.CON_CdiContrato
)
SELECT
    TO_CHAR(c.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(c.LOC_CdiLocal) AS cod_filial,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ') AS cod_cc,
    CAST(AVG(NVL(vr.valor_dia, 0)) AS NUMBER(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR2(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_base_mes
FROM Contratos c
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN CTE_VR vr ON vr.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_CICLO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ')
`.trim();

const REGRA_VT_MSSQL = `
WITH CTE_CICLO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
),
CTE_VT AS (
    SELECT
        cat.CON_CdiContrato,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MTI_CdiMeioTransporte = cat.MTI_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CON_CdiContrato
)
SELECT
    CAST(c.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(c.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ') AS cod_cc,
    CAST(AVG(ISNULL(vt.valor_dia, 0)) AS DECIMAL(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_base_mes
FROM Contratos c
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN CTE_VT vt ON vt.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_CICLO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ')
`.trim();

const REGRA_VT_ORACLE = `
WITH CTE_CICLO AS (
    SELECT
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
),
CTE_VT AS (
    SELECT
        cat.CON_CdiContrato,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MTI_CdiMeioTransporte = cat.MTI_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CON_CdiContrato
)
SELECT
    TO_CHAR(c.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(c.LOC_CdiLocal) AS cod_filial,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ') AS cod_cc,
    CAST(AVG(NVL(vt.valor_dia, 0)) AS NUMBER(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR2(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_base_mes
FROM Contratos c
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN CTE_VT vt ON vt.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_CICLO cic ON cic.HOR_CdiHorario = c.HOR_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ')
`.trim();

/** Proxy encargos — consultants customize; factory seeds Lucro Presumido-like %. */
const INDICES_MSSQL = `
SELECT
    CAST(c.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(c.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    CAST(20.0 AS DECIMAL(8,2)) AS inss_empresa_pct,
    CAST(2.0 AS DECIMAL(8,2)) AS rat_fap_pct,
    CAST(5.8 AS DECIMAL(8,2)) AS terceiros_pct,
    CAST(8.0 AS DECIMAL(8,2)) AS fgts_pct
FROM Contratos c
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY c.EMP_CdiEmpresa, c.LOC_CdiLocal
`.trim();

const INDICES_ORACLE = `
SELECT
    TO_CHAR(c.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(c.LOC_CdiLocal) AS cod_filial,
    CAST(20.0 AS NUMBER(8,2)) AS inss_empresa_pct,
    CAST(2.0 AS NUMBER(8,2)) AS rat_fap_pct,
    CAST(5.8 AS NUMBER(8,2)) AS terceiros_pct,
    CAST(8.0 AS NUMBER(8,2)) AS fgts_pct
FROM Contratos c
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY c.EMP_CdiEmpresa, c.LOC_CdiLocal
`.trim();

export const FACTORY_PROFILE_ID = "factory-padrao-apdata-saas";
export const FACTORY_PROFILE_NAME = "Padrão Apdata SaaS";

export function factoryDefaultSlots(): Record<SqlSlotId, SqlSlotQueries> {
  return {
    ESTABELECIMENTOS: {
      mssql: ESTABELECIMENTOS_MSSQL,
      oracle: ESTABELECIMENTOS_ORACLE,
    },
    FOLHA_E_ESCALAS: {
      mssql: FOLHA_MSSQL,
      oracle: FOLHA_ORACLE,
    },
    REGRA_VR: {
      mssql: REGRA_VR_MSSQL,
      oracle: REGRA_VR_ORACLE,
    },
    REGRA_VT: {
      mssql: REGRA_VT_MSSQL,
      oracle: REGRA_VT_ORACLE,
    },
    INDICES_ENCARGOS: {
      mssql: INDICES_MSSQL,
      oracle: INDICES_ORACLE,
    },
  };
}
