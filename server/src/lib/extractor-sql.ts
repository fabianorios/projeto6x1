/**
 * Canonical Apdata extractor SQL (docs/apdata-extractor.sql) — MSSQL + Oracle.
 * SELECT-only bodies (no SET / no trailing semicolon) for assertSelectOnly.
 * Isolation (READ UNCOMMITTED / READ ONLY) is applied on the connection separately.
 * Aptools paste: getAptoolsExtractorScript — no SET TRANSACTION (Aptools may reject it).
 *
 * Benefit tipos: bound as @tipoVr / @tipoVa / @tipoMedica / @tipoOdonto
 * (Oracle :tipo*). Sentinel -1 skips that benefit (no matching rows).
 * Ranking date on PlanosBeneficiosValores: PBV_DtdInicio DESC (ROW_NUMBER).
 * VT tarifas: MeiosTransportesItens latest MRI_DtdInicioVigencia.
 */

import {
  bindParamsForExtractor,
  defaultBenefitParams,
  normalizeBenefitParams,
  type BenefitParams,
} from "./benefit-params.js";

export type ExtractorDialect = "mssql" | "oracle";

export type ExtractorFilters = {
  /** Full CNPJ strings (digits or formatted). Empty = no CNPJ filter. */
  cnpjs?: string[];
  /** Active SqlProfile benefit type codes (optional → factory defaults). */
  benefitParams?: BenefitParams | null;
};

const MSSQL_SELECT = `
WITH CTE_MRI_PRECO AS (
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
CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) AS DECIMAL(18,4))) AS qtd_passes_dia,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN CTE_MRI_PRECO mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
       AND mti.rn = 1
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_VR_RANK AS (
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
      AND ebt.EBT_CdiTipoBeneficio = @tipoVr
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VR_DIARIO AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(ISNULL(r.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS vr_valor_dia
    FROM CTE_VR_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
),
CTE_VA_RANK AS (
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
      AND ebt.EBT_CdiTipoBeneficio = @tipoVa
      AND ISNULL(pb.PLB_OplDesativado, 0) = 0
      AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VA_DIARIO AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(ISNULL(r.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS va_valor
    FROM CTE_VA_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
),
CTE_MED_RANK AS (
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
CTE_MED AS (
    SELECT CBN_CdiContratado,
           MAX(CAST(ISNULL(PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_mes
    FROM CTE_MED_RANK WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_ODONTO_RANK AS (
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
CTE_ODONTO AS (
    SELECT CBN_CdiContratado,
           MAX(CAST(ISNULL(PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_mes
    FROM CTE_ODONTO_RANK WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TDP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TDP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20))                                           AS cod_empresa,
    CAST(l.LPC_CdiLocal AS VARCHAR(20))                                             AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, '')              AS cnpj_completo,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' ')                        AS cod_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20))                                  AS cod_cargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' ')                     AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20))                                AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20))                                AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END                                                                             AS escala_atual,
    CAST(ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS DECIMAL(10,2))                      AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado)                                                      AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2))                         AS massa_salarial_base,
    CAST(AVG(ISNULL(vr.vr_valor_dia, 0)) AS DECIMAL(18,2))                          AS vr_dia_medio,
    CAST(AVG(ISNULL(vt.vt_valor_dia, 0)) AS DECIMAL(18,2))                          AS vt_dia_medio,
    CAST(AVG(ISNULL(vt.qtd_passes_dia, 0)) AS DECIMAL(18,2))                        AS qtd_passes_dia_medio,
    CAST(AVG(ISNULL(va.va_valor, 0)) AS DECIMAL(18,2))                              AS va_valor_medio,
    CAST(AVG(ISNULL(med.valor_mes, 0)) AS DECIMAL(18,2))                            AS assist_medica_mes,
    CAST(AVG(ISNULL(od.valor_mes, 0)) AS DECIMAL(18,2))                             AS assist_odonto_mes,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1))                                                         AS dias_trabalho_mes_atual
FROM Contratados c
INNER JOIN Folhas f
    ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l
    ON l.LPC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e
    ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
LEFT JOIN CentrosCustos cc
    ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg
    ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h
    ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic
    ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VR_DIARIO vr
    ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_VT_DIARIO vt
    ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_VA_DIARIO va
    ON va.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_MED med
    ON med.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_ODONTO od
    ON od.CBN_CdiContratado = c.CON_CdiContratado
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
__CNPJ_FILTER__
GROUP BY
    e.EMP_CdiEmpresa,
    l.LPC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, ''),
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '),
    c.CON_CdiCargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '),
    c.CON_CdiVinculo,
    c.CON_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    ISNULL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY
    cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const ORACLE_SELECT = `
WITH CTE_MRI_PRECO AS (
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
CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) AS NUMBER(18,4))) AS qtd_passes_dia,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN CTE_MRI_PRECO mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
       AND mti.rn = 1
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_VR_RANK AS (
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
      AND ebt.EBT_CdiTipoBeneficio = :tipoVr
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VR_DIARIO AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(NVL(r.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS vr_valor_dia
    FROM CTE_VR_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
),
CTE_VA_RANK AS (
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
      AND ebt.EBT_CdiTipoBeneficio = :tipoVa
      AND NVL(pb.PLB_OplDesativado, 0) = 0
      AND NVL(pbv.PBV_OplDesativado, 0) = 0
),
CTE_VA_DIARIO AS (
    SELECT
        r.CBN_CdiContratado,
        MAX(CAST(NVL(r.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS va_valor
    FROM CTE_VA_RANK r
    WHERE r.rn = 1
    GROUP BY r.CBN_CdiContratado
),
CTE_MED_RANK AS (
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
CTE_MED AS (
    SELECT CBN_CdiContratado,
           MAX(CAST(NVL(PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_mes
    FROM CTE_MED_RANK WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_ODONTO_RANK AS (
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
CTE_ODONTO AS (
    SELECT CBN_CdiContratado,
           MAX(CAST(NVL(PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_mes
    FROM CTE_ODONTO_RANK WHERE rn = 1 GROUP BY CBN_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TDP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TDP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa)                                                       AS cod_empresa,
    TO_CHAR(l.LPC_CdiLocal)                                                         AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, '')                   AS cnpj_completo,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' ')                           AS cod_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0))                                                 AS cod_cargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' ')                        AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0))                                               AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0))                                               AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END                                                                             AS escala_atual,
    CAST(NVL(h.HOR_QtnHorasSemanal, 44.0) AS NUMBER(10,2))                          AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado)                                                      AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2))                             AS massa_salarial_base,
    CAST(AVG(NVL(vr.vr_valor_dia, 0)) AS NUMBER(18,2))                              AS vr_dia_medio,
    CAST(AVG(NVL(vt.vt_valor_dia, 0)) AS NUMBER(18,2))                              AS vt_dia_medio,
    CAST(AVG(NVL(vt.qtd_passes_dia, 0)) AS NUMBER(18,2))                            AS qtd_passes_dia_medio,
    CAST(AVG(NVL(va.va_valor, 0)) AS NUMBER(18,2))                                  AS va_valor_medio,
    CAST(AVG(NVL(med.valor_mes, 0)) AS NUMBER(18,2))                                AS assist_medica_mes,
    CAST(AVG(NVL(od.valor_mes, 0)) AS NUMBER(18,2))                                 AS assist_odonto_mes,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1))                                                          AS dias_trabalho_mes_atual
FROM Contratados c
INNER JOIN Folhas f
    ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l
    ON l.LPC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e
    ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
LEFT JOIN CentrosCustos cc
    ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg
    ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h
    ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic
    ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VR_DIARIO vr
    ON vr.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_VT_DIARIO vt
    ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_VA_DIARIO va
    ON va.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_MED med
    ON med.CBN_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_ODONTO od
    ON od.CBN_CdiContratado = c.CON_CdiContratado
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
__CNPJ_FILTER__
GROUP BY
    e.EMP_CdiEmpresa,
    l.LPC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, ''),
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '),
    c.CON_CdiCargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '),
    c.CON_CdiVinculo,
    c.CON_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    NVL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY
    cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

export function cnpjDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Build SELECT-only extractor SQL + bind params for CNPJ + benefit tipos.
 * Max 32 CNPJs (defense in depth). Benefit tipos are integers from profile.
 */
export function buildExtractorQuery(
  dialect: ExtractorDialect,
  filters: ExtractorFilters = {},
): { sql: string; params: Record<string, string | number> } {
  const template = dialect === "oracle" ? ORACLE_SELECT : MSSQL_SELECT;
  const benefit = normalizeBenefitParams(
    filters.benefitParams ?? defaultBenefitParams(),
  );
  const benefitBinds = bindParamsForExtractor(dialect, benefit);
  const params: Record<string, string | number> = { ...benefitBinds };

  const rawList = (filters.cnpjs ?? [])
    .map(cnpjDigits)
    .filter((d) => d.length >= 8)
    .slice(0, 32);

  if (rawList.length === 0) {
    return {
      sql: template.replace("__CNPJ_FILTER__", ""),
      params,
    };
  }

  const placeholders: string[] = [];
  rawList.forEach((digits, i) => {
    const key = `cnpj${i}`;
    params[key] = digits;
    placeholders.push(dialect === "oracle" ? `:${key}` : `@${key}`);
  });

  const expr =
    dialect === "oracle"
      ? `REGEXP_REPLACE(NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, ''), '[^0-9]', '')`
      : `REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, ''), '.', ''), '/', ''), '-', ''), ' ', '')`;

  const filter = `AND ${expr} IN (${placeholders.join(", ")})`;
  return {
    sql: template.replace("__CNPJ_FILTER__", filter),
    params,
  };
}

/**
 * Aptools-ready SELECT (no SET TRANSACTION — Aptools may reject it).
 * Inlines integer benefit tipos (Aptools has no bind API); never concatenates
 * untrusted strings — only verified integers from BenefitParams.
 */
export function getAptoolsExtractorScript(
  dialect: ExtractorDialect,
  benefitParams?: BenefitParams | null,
): string {
  const { sql, params } = buildExtractorQuery(dialect, {
    benefitParams: benefitParams ?? defaultBenefitParams(),
  });
  let out = sql;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "number" || !Number.isInteger(value)) continue;
    const lit = String(value);
    out = out.split(`@${key}`).join(lit).split(`:${key}`).join(lit);
  }
  return out + ";\n";
}
