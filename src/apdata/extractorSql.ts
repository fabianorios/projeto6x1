/**
 * Official Apdata extractor dialects (docs/apdata-extractor.sql).
 * Used by Aptools copy UI and by mapping ephemeral API rows → PayrollRow[].
 * No SET TRANSACTION in Aptools paste — Aptools may reject it.
 *
 * Escalas: TiposDiasPonto TIP_* (validated live 2026-11-16); escala_atual =
 * work_days + 'x' + off_days. Active jornadas: HRI_OplDesativado=0 and
 * HOR_OplDesativado=0.
 *
 * Benefits: ConBeneficios → PlanosBeneficios → PlanosBeneficiosValores
 * (MAX PBV_DtdInicio) → TiposBeneficiosEntsBens → TiposBeneficios (TBE_*);
 * active CBN_DtdFim IS NULL → beneficios_agg (codigo|descricao|valor;…).
 * Locais: LOC_* (TEMP/dicionário). Situação/vínculo: Premissas extract filters.
 */

import {
  buildSituacaoSqlPredicate,
  buildVinculoSqlJoins,
  buildVinculoSqlPredicate,
  resolveExtractFilters,
  type ExtractFilterOptions,
} from './extractFilters'

export type ExtractorDialect = 'mssql' | 'oracle'

export type ExtractorSqlFilters = ExtractFilterOptions

const SANITIZE_MSSQL = (expr: string, fallback: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(${expr}, '${fallback}'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')`

const SANITIZE_ORACLE = (expr: string, fallback: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(${expr}, '${fallback}'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')`

const MSSQL_PBV_LATEST = `
    SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio
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
`.trim()

const ORACLE_PBV_LATEST = `
    SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio
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
`.trim()

const MSSQL_BODY = `
WITH CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 0 THEN 1 ELSE 0 END) AS off_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Horarios hciclo
        ON hciclo.HOR_CdiHorario = hj.HRI_CdiHorario
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(hciclo.HOR_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_MSSQL('tbe.TBE_D1sTipoBeneficio', 'SEM_DESC')} AS desc_tipo,
        AVG(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_medio
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios plb
        ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN (
${MSSQL_PBV_LATEST}
    ) pbv
        ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN TiposBeneficios tbe
        ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
    GROUP BY
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio,
        ${SANITIZE_MSSQL('tbe.TBE_D1sTipoBeneficio', 'SEM_DESC')}
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        ${SANITIZE_MSSQL('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
        c.CON_CdiCargo,
        ${SANITIZE_MSSQL('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS carga_semanal,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.CBN_CdiContratado
    __VINCULO_JOINS__
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal,
        STRING_AGG(
            CAST(cod_tipo AS VARCHAR(20)) + '|' + desc_tipo + '|' +
            CAST(CAST(valor_medio AS DECIMAL(18,2)) AS VARCHAR(40)),
            CHAR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_MSSQL('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    ${SANITIZE_MSSQL('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    ISNULL(
        CAST(cic.work_days AS VARCHAR(10)) + 'x' + CAST(cic.off_days AS VARCHAR(10)),
        'other'
    ) AS escala_atual,
    CAST(ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS DECIMAL(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2)) AS massa_salarial_base,
    CAST(0 AS DECIMAL(18,2)) AS vr_dia_medio,
    CAST(AVG(ISNULL(vt.vt_valor_dia, 0)) AS DECIMAL(18,2)) AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_trabalho_mes_atual,
    MAX(ben.beneficios_agg) AS beneficios_agg
FROM Contratados c
__VINCULO_JOINS__
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = ${SANITIZE_MSSQL('cc.CCU_CosEstrutura', 'SEM_CC')}
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = ${SANITIZE_MSSQL('cg.CAR_D1sCargo', 'NAO_INFORMADO')}
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND ISNULL(ben.cycle_len, -1) = ISNULL(cic.cycle_len, -1)
   AND ISNULL(ben.work_days, -1) = ISNULL(cic.work_days, -1)
   AND ISNULL(ben.off_days, -1) = ISNULL(cic.off_days, -1)
   AND ben.carga_semanal = ISNULL(h.HOR_QtnHorasSemanal, 44.0)
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    ${SANITIZE_MSSQL('cc.CCU_CosEstrutura', 'SEM_CC')},
    c.CON_CdiCargo, ${SANITIZE_MSSQL('cg.CAR_D1sCargo', 'NAO_INFORMADO')},
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    ISNULL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim()

const ORACLE_BODY = `
WITH CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 0 THEN 1 ELSE 0 END) AS off_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Horarios hciclo
        ON hciclo.HOR_CdiHorario = hj.HRI_CdiHorario
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(hciclo.HOR_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_ORACLE('tbe.TBE_D1sTipoBeneficio', 'SEM_DESC')} AS desc_tipo,
        AVG(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_medio
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios plb
        ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN (
${ORACLE_PBV_LATEST}
    ) pbv
        ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN TiposBeneficios tbe
        ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
    GROUP BY
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio,
        ${SANITIZE_ORACLE('tbe.TBE_D1sTipoBeneficio', 'SEM_DESC')}
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        ${SANITIZE_ORACLE('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
        c.CON_CdiCargo,
        ${SANITIZE_ORACLE('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        NVL(h.HOR_QtnHorasSemanal, 44.0) AS carga_semanal,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.CBN_CdiContratado
    __VINCULO_JOINS__
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal,
        LISTAGG(
            TO_CHAR(cod_tipo) || '|' || desc_tipo || '|' ||
            TO_CHAR(CAST(valor_medio AS NUMBER(18,2))),
            CHR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_ORACLE('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    ${SANITIZE_ORACLE('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    NVL(
        TO_CHAR(cic.work_days) || 'x' || TO_CHAR(cic.off_days),
        'other'
    ) AS escala_atual,
    CAST(NVL(h.HOR_QtnHorasSemanal, 44.0) AS NUMBER(10,2)) AS carga_semanal_atual,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2)) AS massa_salarial_base,
    CAST(0 AS NUMBER(18,2)) AS vr_dia_medio,
    CAST(AVG(NVL(vt.vt_valor_dia, 0)) AS NUMBER(18,2)) AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_trabalho_mes_atual,
    MAX(ben.beneficios_agg) AS beneficios_agg
FROM Contratados c
__VINCULO_JOINS__
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = ${SANITIZE_ORACLE('cc.CCU_CosEstrutura', 'SEM_CC')}
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = ${SANITIZE_ORACLE('cg.CAR_D1sCargo', 'NAO_INFORMADO')}
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND NVL(ben.cycle_len, -1) = NVL(cic.cycle_len, -1)
   AND NVL(ben.work_days, -1) = NVL(cic.work_days, -1)
   AND NVL(ben.off_days, -1) = NVL(cic.off_days, -1)
   AND ben.carga_semanal = NVL(h.HOR_QtnHorasSemanal, 44.0)
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    ${SANITIZE_ORACLE('cc.CCU_CosEstrutura', 'SEM_CC')},
    c.CON_CdiCargo, ${SANITIZE_ORACLE('cg.CAR_D1sCargo', 'NAO_INFORMADO')},
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    NVL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim()

function applyExtractFilterPlaceholders(
  template: string,
  dialect: ExtractorDialect,
  filters: ExtractorSqlFilters = {},
): string {
  const resolved = resolveExtractFilters(filters)
  return template
    .replaceAll('__VINCULO_JOINS__', buildVinculoSqlJoins(resolved, dialect))
    .replaceAll(
      '__SITUACAO_PREDICATE__',
      buildSituacaoSqlPredicate(resolved, dialect),
    )
    .replaceAll(
      '__VINCULO_PREDICATE__',
      buildVinculoSqlPredicate(resolved),
    )
}

/** SELECT body only (for assertSelectOnly / API). */
export function getExtractorSelectBody(
  dialect: ExtractorDialect,
  filters: ExtractorSqlFilters = {},
): string {
  return applyExtractFilterPlaceholders(
    dialect === 'oracle' ? ORACLE_BODY : MSSQL_BODY,
    dialect,
    filters,
  )
}

/**
 * Full Aptools script — SELECT only (no SET TRANSACTION).
 * Oracle: no trailing `;` — Aptools / thin clients raise ORA-00933 with it.
 * MSSQL: keep trailing `;` (historical Aptools paste).
 */
export function getAptoolsExtractorScript(
  dialect: ExtractorDialect,
  filters: ExtractorSqlFilters = {},
): string {
  const body = getExtractorSelectBody(dialect, filters)
  return dialect === 'oracle' ? `${body}\n` : `${body};\n`
}
