/**
 * Factory default SqlProfile queries — immutable seed ("Padrão Apdata SaaS").
 * VR/VA: ConBeneficios → PlanosBeneficios → PlanosBeneficiosValores
 *   (latest PBV_DtdInicio via ROW_NUMBER) → TiposBeneficiosEntsBens
 *   WHERE EBT_CdiTipoBeneficio = @tipo AND CBN_DtdFim IS NULL.
 * Tipo codes come from SqlProfile.benefitParams (factory VR=53, VA=52).
 * VT: ConATransportes × MeiosTransportesItens latest MRI_DtdInicioVigencia.
 * CON_CdiSituacao NOT IN (0,2,3,99). SELECT/WITH only (no SET/;).
 * Prefixes Aptools: Contratados=CON, Locais=LPC, HRI/TDP/CAS/MRI.
 */

import type { SqlSlotId, SqlSlotQueries } from "./sql-profile-types.js";

const ESTABELECIMENTOS_MSSQL = `
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(e.EMP_DssEmpresa, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS razao_social,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(l.LOC_D1sLocal, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS nome_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    COUNT(c.CON_CdiContratado) AS qtd_ativos
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
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
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(e.EMP_DssEmpresa, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS razao_social,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(l.LOC_D1sLocal, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS nome_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    COUNT(c.CON_CdiContratado) AS qtd_ativos
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
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
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        hj.HRI_CdiHorario,
        CONVERT(varchar(5), MIN(ji.JOI_HrdHoraMinutoInicio), 108) AS entrada,
        CONVERT(varchar(5), MAX(ji.JOI_HrdHoraMinutoFim), 108) AS saida
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(ji.JOI_OplDesativado, 0) = 0
      AND ISNULL(tdp.TIP_OplTrabalho, 0) = 1
      AND (ISNULL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1)
    GROUP BY hj.HRI_CdiHorario
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS cod_cc,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_D1sCentroCusto, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS desc_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(
        CASE WHEN ht.entrada IS NOT NULL AND ht.saida IS NOT NULL THEN ht.entrada + '-' + ht.saida ELSE NULL END
    , ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS horario_trabalho_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS DECIMAL(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2)) AS massa_salarial_base,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_trabalho_mes_atual
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_D1sCentroCusto, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '),
    c.CON_CdiCargo,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '),
    c.CON_CdiVinculo,
    c.CON_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    ISNULL(h.HOR_QtnHorasSemanal, 44.0),
    ht.entrada,
    ht.saida
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const FOLHA_ORACLE = `
WITH CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        hj.HRI_CdiHorario,
        TO_CHAR(MIN(ji.JOI_HrdHoraMinutoInicio), 'HH24:MI') AS entrada,
        TO_CHAR(MAX(ji.JOI_HrdHoraMinutoFim), 'HH24:MI') AS saida
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(ji.JOI_OplDesativado, 0) = 0
      AND NVL(tdp.TIP_OplTrabalho, 0) = 1
      AND (NVL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1)
    GROUP BY hj.HRI_CdiHorario
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS cod_cc,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_D1sCentroCusto, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS desc_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(
        CASE WHEN ht.entrada IS NOT NULL AND ht.saida IS NOT NULL THEN ht.entrada || '-' || ht.saida ELSE NULL END
    , ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS horario_trabalho_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(NVL(h.HOR_QtnHorasSemanal, 44.0) AS NUMBER(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2)) AS massa_salarial_base,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_trabalho_mes_atual
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_D1sCentroCusto, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '),
    c.CON_CdiCargo,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '),
    c.CON_CdiVinculo,
    c.CON_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    NVL(h.HOR_QtnHorasSemanal, 44.0),
    ht.entrada,
    ht.saida
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const REGRA_VR_MSSQL = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_RANK AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = @tipo
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VR AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(ISNULL(r.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_dia
    FROM CTE_BEN_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS cod_cc,
    CAST(AVG(ISNULL(vr.valor_dia, 0)) AS DECIMAL(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_base_mes
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VR vr ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ')
`.trim();

const REGRA_VR_ORACLE = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_RANK AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = :tipo
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VR AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(NVL(r.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_dia
    FROM CTE_BEN_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS cod_cc,
    CAST(AVG(NVL(vr.valor_dia, 0)) AS NUMBER(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR2(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_base_mes
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VR vr ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ')
`.trim();

const REGRA_VT_MSSQL = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_MRI_PRECO AS (
    SELECT
        MRI_CdiMeioTransporte,
        MRI_VlnUnitario,
        ROW_NUMBER() OVER (
            PARTITION BY MRI_CdiMeioTransporte
            ORDER BY MRI_DtdInicioVigencia DESC
        ) AS rn
    FROM MeiosTransportesItens
    WHERE ISNULL(MRI_OplDesativado, 0) = 0
),
CTE_VT AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) AS DECIMAL(18,4))) AS qtd_passes_dia,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS valor_dia
    FROM ConATransportes cat
    INNER JOIN CTE_MRI_PRECO mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
       AND mti.rn = 1
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS cod_cc,
    CAST(AVG(ISNULL(vt.valor_dia, 0)) AS DECIMAL(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_base_mes
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VT vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ')
`.trim();

const REGRA_VT_ORACLE = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_MRI_PRECO AS (
    SELECT
        MRI_CdiMeioTransporte,
        MRI_VlnUnitario,
        ROW_NUMBER() OVER (
            PARTITION BY MRI_CdiMeioTransporte
            ORDER BY MRI_DtdInicioVigencia DESC
        ) AS rn
    FROM MeiosTransportesItens
    WHERE NVL(MRI_OplDesativado, 0) = 0
),
CTE_VT AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) AS NUMBER(18,4))) AS qtd_passes_dia,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS valor_dia
    FROM ConATransportes cat
    INNER JOIN CTE_MRI_PRECO mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
       AND mti.rn = 1
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ') AS cod_cc,
    CAST(AVG(NVL(vt.valor_dia, 0)) AS NUMBER(18,2)) AS valor_dia,
    CAST('ESCALA' AS VARCHAR2(20)) AS modo_dias,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_base_mes
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VT vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' ')
`.trim();

const REGRA_VA_MSSQL = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_RANK AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = @tipo
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VA AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(ISNULL(r.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_dia
    FROM CTE_BEN_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
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
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VA vr ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ')
`.trim();

const REGRA_VA_ORACLE = `
WITH CTE_CICLO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_RANK AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = :tipo
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VA AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(NVL(r.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_dia
    FROM CTE_BEN_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
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
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_VA vr ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_CICLO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ')
`.trim();

/** Catálogo TiposBeneficios — calibrated join (MAX PBV_DtdInicio). */
const TIPOS_BENEFICIOS_MSSQL = `
SELECT
    tbe.TBE_CdiTipoBeneficio AS cod_tipo,
    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(tbe.TBE_D1sTipoBeneficio, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(124), ' '), CHAR(10), ' ') AS desc_tipo,
    COUNT(*) AS n_valores_ativos,
    AVG(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_medio,
    MIN(pbv.PBV_VlnBeneficio) AS valor_min,
    MAX(pbv.PBV_VlnBeneficio) AS valor_max
FROM ConBeneficios cbn
INNER JOIN PlanosBeneficios plb
    ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
INNER JOIN (
    SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio,
        p.PBV_DtdInicio
    FROM PlanosBeneficiosValores p
    INNER JOIN (
        SELECT
            PBV_CdiPlanoBeneficio,
            MAX(PBV_DtdInicio) AS max_inicio
        FROM PlanosBeneficiosValores
        GROUP BY PBV_CdiPlanoBeneficio
    ) u
        ON u.PBV_CdiPlanoBeneficio = p.PBV_CdiPlanoBeneficio
       AND u.max_inicio = p.PBV_DtdInicio
) pbv
    ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
INNER JOIN TiposBeneficiosEntsBens ebt
    ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
INNER JOIN TiposBeneficios tbe
    ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
WHERE cbn.CBN_DtdFim IS NULL
GROUP BY
    tbe.TBE_CdiTipoBeneficio,
    tbe.TBE_D1sTipoBeneficio
ORDER BY n_valores_ativos DESC, tbe.TBE_CdiTipoBeneficio
`.trim();

const TIPOS_BENEFICIOS_ORACLE = `
SELECT
    tbe.TBE_CdiTipoBeneficio AS cod_tipo,
    REPLACE(REPLACE(REPLACE(REPLACE(NVL(tbe.TBE_D1sTipoBeneficio, ''), CHR(59), ' '), CHR(9), ' '), CHR(124), ' '), CHR(10), ' ') AS desc_tipo,
    COUNT(*) AS n_valores_ativos,
    AVG(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_medio,
    MIN(pbv.PBV_VlnBeneficio) AS valor_min,
    MAX(pbv.PBV_VlnBeneficio) AS valor_max
FROM ConBeneficios cbn
INNER JOIN PlanosBeneficios plb
    ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
INNER JOIN (
    SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio,
        p.PBV_DtdInicio
    FROM PlanosBeneficiosValores p
    INNER JOIN (
        SELECT
            PBV_CdiPlanoBeneficio,
            MAX(PBV_DtdInicio) AS max_inicio
        FROM PlanosBeneficiosValores
        GROUP BY PBV_CdiPlanoBeneficio
    ) u
        ON u.PBV_CdiPlanoBeneficio = p.PBV_CdiPlanoBeneficio
       AND u.max_inicio = p.PBV_DtdInicio
) pbv
    ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
INNER JOIN TiposBeneficiosEntsBens ebt
    ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
INNER JOIN TiposBeneficios tbe
    ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
WHERE cbn.CBN_DtdFim IS NULL
GROUP BY
    tbe.TBE_CdiTipoBeneficio,
    tbe.TBE_D1sTipoBeneficio
ORDER BY n_valores_ativos DESC, tbe.TBE_CdiTipoBeneficio
`.trim();

const REGRA_FIXOS_MSSQL = `
WITH CTE_MED AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = @tipoMedica
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_ODONTO AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = @tipoOdonto
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_MED_VAL AS (
    SELECT CBN_CdiContratado, MAX(CAST(ISNULL(PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_mes
    FROM CTE_MED WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_ODONTO_VAL AS (
    SELECT CBN_CdiContratado, MAX(CAST(ISNULL(PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_mes
    FROM CTE_ODONTO WHERE rn = 1 GROUP BY CBN_CdiContratado
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ') AS cod_cc,
    CAST(AVG(ISNULL(med.valor_mes, 0)) AS DECIMAL(18,2)) AS valor_mes_medica,
    CAST(AVG(ISNULL(od.valor_mes, 0)) AS DECIMAL(18,2)) AS valor_mes_odonto
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_MED_VAL med ON med.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_ODONTO_VAL od ON od.CBN_CdiContratado = c.CON_CdiContratado
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ')
`.trim();

const REGRA_FIXOS_ORACLE = `
WITH CTE_MED AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = :tipoMedica
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_ODONTO AS (
    SELECT
        cbn.CBN_CdiContratado,
        pbv.PBV_VlnBeneficio,
        ROW_NUMBER() OVER (
            PARTITION BY cbn.CBN_CdiContratado, pb.PLB_CdiPlanoBeneficio
            ORDER BY pbv.PBV_DtdInicio DESC
        ) AS rn
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios pb
        ON pb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN PlanosBeneficiosValores pbv
        ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
      AND ebt.EBT_CdiTipoBeneficio = :tipoOdonto
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_MED_VAL AS (
    SELECT CBN_CdiContratado, MAX(CAST(NVL(PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_mes
    FROM CTE_MED WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_ODONTO_VAL AS (
    SELECT CBN_CdiContratado, MAX(CAST(NVL(PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_mes
    FROM CTE_ODONTO WHERE rn = 1 GROUP BY CBN_CdiContratado
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ') AS cod_cc,
    CAST(AVG(NVL(med.valor_mes, 0)) AS NUMBER(18,2)) AS valor_mes_medica,
    CAST(AVG(NVL(od.valor_mes, 0)) AS NUMBER(18,2)) AS valor_mes_odonto
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN CTE_MED_VAL med ON med.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_ODONTO_VAL od ON od.CBN_CdiContratado = c.CON_CdiContratado
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa,
    l.LOC_CdiLocal,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ')
`.trim();

/** Proxy encargos — consultants customize; factory seeds Lucro Presumido-like %. */
const INDICES_MSSQL = `
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    CAST(20.0 AS DECIMAL(8,2)) AS inss_empresa_pct,
    CAST(2.0 AS DECIMAL(8,2)) AS rat_fap_pct,
    CAST(5.8 AS DECIMAL(8,2)) AS terceiros_pct,
    CAST(8.0 AS DECIMAL(8,2)) AS fgts_pct
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY e.EMP_CdiEmpresa, l.LOC_CdiLocal
`.trim();

const INDICES_ORACLE = `
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    CAST(20.0 AS NUMBER(8,2)) AS inss_empresa_pct,
    CAST(2.0 AS NUMBER(8,2)) AS rat_fap_pct,
    CAST(5.8 AS NUMBER(8,2)) AS terceiros_pct,
    CAST(8.0 AS NUMBER(8,2)) AS fgts_pct
FROM Contratados c
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY e.EMP_CdiEmpresa, l.LOC_CdiLocal
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
    TIPOS_BENEFICIOS: {
      mssql: TIPOS_BENEFICIOS_MSSQL,
      oracle: TIPOS_BENEFICIOS_ORACLE,
    },
    REGRA_VR: {
      mssql: REGRA_VR_MSSQL,
      oracle: REGRA_VR_ORACLE,
    },
    REGRA_VA: {
      mssql: REGRA_VA_MSSQL,
      oracle: REGRA_VA_ORACLE,
    },
    REGRA_VT: {
      mssql: REGRA_VT_MSSQL,
      oracle: REGRA_VT_ORACLE,
    },
    REGRA_FIXOS: {
      mssql: REGRA_FIXOS_MSSQL,
      oracle: REGRA_FIXOS_ORACLE,
    },
    INDICES_ENCARGOS: {
      mssql: INDICES_MSSQL,
      oracle: INDICES_ORACLE,
    },
  };
}
