/* ============================================================================
   TURNOCHECK — EXTRATOR CANÔNICO APDATA (SEM PII / LGPD-SAFE)
   Compatível com Aptools (Exportação CSV) e Conexão Direta Read-Only.
   ============================================================================
   REGRAS APLICADAS:
   1. Zero PII: Nenhum nome, CPF, PIS ou matrícula individual é extraído.
   2. Situação: Apenas contratos ativos -> CON_CdiSituacao NOT IN (0, 2, 3, 99).
   3. VR: Plano de Benefício tipo 53 (PlanosBeneficiosValores).
   4. VT: Soma ativa (CAS_DtdFim IS NULL) em ConATransportes x MeiosTransportesItens.
          (Ignora ConCalculoATransportes conforme regra canônica).
   5. Sanitização: Remove ';' de textos para não quebrar CSV exportado pelo Aptools.
   ============================================================================ */


/* ----------------------------------------------------------------------------
   [DIALETO 1] MICROSOFT SQL SERVER (MSSQL)
   ---------------------------------------------------------------------------- */
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

WITH CTE_VT_DIARIO AS (
    SELECT 
        cat.CON_CdiContrato,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti 
        ON mti.MTI_CdiMeioTransporte = cat.MTI_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CON_CdiContrato
),
CTE_VR_DIARIO AS (
    SELECT 
        pbv.CON_CdiContrato,
        MAX(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS vr_valor_dia
    FROM PlanosBeneficiosValores pbv
    WHERE pbv.TPB_CdiTipoBeneficio = 53
      AND pbv.PBV_DtdFim IS NULL
    GROUP BY pbv.CON_CdiContrato
),
CTE_CICLO_HORARIO AS (
    SELECT 
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp 
        ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
)
SELECT 
    CAST(c.EMP_CdiEmpresa AS VARCHAR(20))                                           AS cod_empresa,
    CAST(c.LOC_CdiLocal AS VARCHAR(20))                                             AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '')              AS cnpj_completo,
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), ';', ' ')                        AS cod_cc,
    CAST(ISNULL(c.CAR_CdiCargo, 0) AS VARCHAR(20))                                  AS cod_cargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), ';', ' ')                     AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20))                                AS cod_vinculo,
    CAST(ISNULL(c.HOR_CdiHorario, 0) AS VARCHAR(20))                                AS cod_horario_atual,
    CASE 
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END                                                                             AS escala_atual,
    CAST(ISNULL(h.HOR_NuiCargaHorariaSemanal, 44.0) AS DECIMAL(10,2))               AS carga_semanal_atual,
    COUNT(c.CON_CdiContrato)                                                        AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2))                         AS massa_salarial_base,
    CAST(AVG(ISNULL(vr.vr_valor_dia, 0)) AS DECIMAL(18,2))                          AS vr_dia_medio,
    CAST(AVG(ISNULL(vt.vt_valor_dia, 0)) AS DECIMAL(18,2))                          AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE 
            WHEN ISNULL(cic.cycle_len, 0) > 0 
            THEN (30.0 * cic.work_days) / cic.cycle_len 
            ELSE 22.0 
        END
    ), 1) AS DECIMAL(10,1))                                                         AS dias_trabalho_mes_atual
FROM Contratos c
INNER JOIN Empresas e 
    ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l 
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa 
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
LEFT JOIN CentrosCustos cc 
    ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN Cargos cg 
    ON cg.CAR_CdiCargo = c.CAR_CdiCargo
LEFT JOIN Horarios h 
    ON h.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic 
    ON cic.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_VR_DIARIO vr 
    ON vr.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_VT_DIARIO vt 
    ON vt.CON_CdiContrato = c.CON_CdiContrato
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY 
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), ';', ' '),
    c.CAR_CdiCargo,
    REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), ';', ' '),
    c.CON_CdiVinculo,
    c.HOR_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    ISNULL(h.HOR_NuiCargaHorariaSemanal, 44.0)
ORDER BY 
    cod_empresa, cod_filial, cod_cc, desc_cargo;


/* ----------------------------------------------------------------------------
   [DIALETO 2] ORACLE DATABASE (APDATA SAAS ORACLE)
   ----------------------------------------------------------------------------
WITH CTE_VT_DIARIO AS (
    SELECT 
        cat.CON_CdiContrato,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti 
        ON mti.MTI_CdiMeioTransporte = cat.MTI_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CON_CdiContrato
),
CTE_VR_DIARIO AS (
    SELECT 
        pbv.CON_CdiContrato,
        MAX(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS vr_valor_dia
    FROM PlanosBeneficiosValores pbv
    WHERE pbv.TPB_CdiTipoBeneficio = 53
      AND pbv.PBV_DtdFim IS NULL
    GROUP BY pbv.CON_CdiContrato
),
CTE_CICLO_HORARIO AS (
    SELECT 
        hj.HOR_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp 
        ON tdp.TIP_CdiTipoDia = hj.TIP_CdiTipoDia
    GROUP BY hj.HOR_CdiHorario
)
SELECT 
    TO_CHAR(c.EMP_CdiEmpresa)                                                       AS cod_empresa,
    TO_CHAR(c.LOC_CdiLocal)                                                         AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '')                   AS cnpj_completo,
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), ';', ' ')                           AS cod_cc,
    TO_CHAR(NVL(c.CAR_CdiCargo, 0))                                                 AS cod_cargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), ';', ' ')                        AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0))                                               AS cod_vinculo,
    TO_CHAR(NVL(c.HOR_CdiHorario, 0))                                               AS cod_horario_atual,
    CASE 
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END                                                                             AS escala_atual,
    CAST(NVL(h.HOR_NuiCargaHorariaSemanal, 44.0) AS NUMBER(10,2))                   AS carga_semanal_atual,
    COUNT(c.CON_CdiContrato)                                                        AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2))                             AS massa_salarial_base,
    CAST(AVG(NVL(vr.vr_valor_dia, 0)) AS NUMBER(18,2))                              AS vr_dia_medio,
    CAST(AVG(NVL(vt.vt_valor_dia, 0)) AS NUMBER(18,2))                              AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE 
            WHEN NVL(cic.cycle_len, 0) > 0 
            THEN (30.0 * cic.work_days) / cic.cycle_len 
            ELSE 22.0 
        END
    ), 1) AS NUMBER(10,1))                                                          AS dias_trabalho_mes_atual
FROM Contratos c
INNER JOIN Empresas e 
    ON e.EMP_CdiEmpresa = c.EMP_CdiEmpresa
INNER JOIN Locais l 
    ON l.EMP_CdiEmpresa = c.EMP_CdiEmpresa 
   AND l.LOC_CdiLocal = c.LOC_CdiLocal
LEFT JOIN CentrosCustos cc 
    ON cc.CCU_CdiCentroCusto = c.CCU_CdiCentroCusto
LEFT JOIN Cargos cg 
    ON cg.CAR_CdiCargo = c.CAR_CdiCargo
LEFT JOIN Horarios h 
    ON h.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic 
    ON cic.HOR_CdiHorario = c.HOR_CdiHorario
LEFT JOIN CTE_VR_DIARIO vr 
    ON vr.CON_CdiContrato = c.CON_CdiContrato
LEFT JOIN CTE_VT_DIARIO vt 
    ON vt.CON_CdiContrato = c.CON_CdiContrato
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY 
    c.EMP_CdiEmpresa,
    c.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), ';', ' '),
    c.CAR_CdiCargo,
    REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), ';', ' '),
    c.CON_CdiVinculo,
    c.HOR_CdiHorario,
    cic.cycle_len,
    cic.work_days,
    NVL(h.HOR_NuiCargaHorariaSemanal, 44.0)
ORDER BY 
    cod_empresa, cod_filial, cod_cc, desc_cargo;
---------------------------------------------------------------------------- */
