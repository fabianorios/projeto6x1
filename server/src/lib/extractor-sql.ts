/**
 * Canonical Apdata extractor SQL (docs/apdata-extractor.sql) — MSSQL + Oracle.
 * SELECT-only bodies (no SET / no trailing semicolon) for assertSelectOnly.
 * Isolation (READ UNCOMMITTED / READ ONLY) is applied on the connection separately.
 * Aptools paste: getAptoolsExtractorScript defaults to nominal grain (nome + 1
 * row/colaborador). Pass grain:"aggregate" for LGPD omit. No SET TRANSACTION.
 *
 * Escalas: TiposDiasPonto TIP_* (validated live 2026-11-16); escala_atual =
 * work_days + 'x' + off_days. Active: HRI_OplDesativado=0 and HOR_OplDesativado=0.
 *
 * Benefits: ConBeneficios → PlanosBeneficios → PlanosBeneficiosValores
 * (MAX PBV_DtdInicio) → TiposBeneficiosEntsBens → TiposBeneficios (TBE_*);
 * active CBN_DtdFim IS NULL → beneficios_agg (codigo|descricao|valor;…).
 * Classification happens in the SPA (classifyBenefit / BenefitMappingTable).
 * Flag includeBenefits (default true): when false, omit VT CTE/joins/cols and
 * ConBeneficios→beneficios_agg (Folha/HC/escala remain). Import tolerates missing cols.
 * CNPJ filter: optional bound params (@cnpjN / :cnpjN), max 32.
 * Situação / vínculo: Premissas filters (default exclude 0,2,3,99; CLT + empregatícios).
 * Locais prefix: LOC_* (TEMP/dicionário — not LPC_*).
 * Sindicato: Sindicatos SIN_* via CON_CdiSindicato.
 * Horas Base: QuantidadesHorasMes HMV_* via CON_CdiQuantidadeHoraMes.
 */

import {
  buildSituacaoSqlPredicate,
  buildVinculoSqlJoins,
  buildVinculoSqlPredicate,
  resolveExtractFilters,
} from "./extract-filters.js";

export type ExtractorDialect = "mssql" | "oracle";

export type ExtractorGrain = "nominal" | "aggregate";

/** Aptools paste default: one row per colaborador with nome (no auto LGPD omit). */
export const DEFAULT_APTOOLS_GRAIN: ExtractorGrain = "nominal";

/** Default ON — current VT + beneficios_agg behavior. */
export const DEFAULT_INCLUDE_BENEFITS = true;

export type ExtractorFilters = {
  /** Full CNPJ strings (digits or formatted). Empty = no CNPJ filter. */
  cnpjs?: string[];
  /** Situações to exclude (default 0,2,3,99). */
  excludeSituacoes?: number[];
  /** Keep afastamentos (SIT_OplAfastamento=1 beyond demissões). Default true. */
  incluirAfastados?: boolean;
  /** TiposRegimesTrabalhistas codes (default [1]=CLT). */
  tipoRegimeTrabalhistaIds?: number[];
  /** CategsTrabseSoc codes; empty + somenteEmpregaticios → flag join. */
  categTrabeSocIds?: number[];
  /** Default true — join CategsTrabseSoc with SDK_OplVinculoEmpregaticio=1. */
  somenteEmpregaticios?: boolean;
  /** Aptools: nominal (default) | aggregate (LGPD omit). Ignored by Direct unless set. */
  grain?: ExtractorGrain;
  /**
   * Include VT + ConBeneficios→beneficios_agg (default true).
   * false: omit benefit CTEs/joins/columns; Folha/HC/escala remain.
   */
  includeBenefits?: boolean;
};

const SANITIZE_MSSQL = (expr: string, fallback: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(${expr}, '${fallback}'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')`;

const SANITIZE_ORACLE = (expr: string, fallback: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(${expr}, '${fallback}'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')`;

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
`.trim();

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
`.trim();

const MSSQL_SELECT = `
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
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN ISNULL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(ji.JOI_OplDesativado, 0) = 0
      AND ISNULL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        CONVERT(varchar(5), w.inicio, 108) + '-' + CONVERT(varchar(5), w.fim, 108) AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' + CAST(DATEDIFF(minute, w.fim, w.next_inicio) AS varchar(10)) + 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND DATEDIFF(minute, w.fim, w.next_inicio) > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        STRING_AGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_MSSQL("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")} AS desc_tipo,
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
        ${SANITIZE_MSSQL("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")}
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        ${SANITIZE_MSSQL("cc.CCU_CosEstrutura", "SEM_CC")} AS cod_cc,
        c.CON_CdiCargo,
        ${SANITIZE_MSSQL("cg.CAR_D1sCargo", "NAO_INFORMADO")} AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)) AS carga_semanal,
        ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS carga_mensal,
        ISNULL(c.CON_CdiSindicato, 0) AS CON_CdiSindicato,
        CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20)) AS cod_sindicato,
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
    LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
    LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        STRING_AGG(
            CAST(cod_tipo AS VARCHAR(20)) + '|' + desc_tipo + '|' +
            CAST(CAST(valor_medio AS DECIMAL(18,2)) AS VARCHAR(40)),
            CHAR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_MSSQL("cc.CCU_CosEstrutura", "SEM_CC")} AS cod_cc,
    ${SANITIZE_MSSQL("cc.CCU_D1sCentroCusto", "")} AS desc_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    ${SANITIZE_MSSQL("cg.CAR_D1sCargo", "NAO_INFORMADO")} AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    ${SANITIZE_MSSQL("ht.horario_trabalho_atual", "")} AS horario_trabalho_atual,
    ISNULL(
        CAST(cic.work_days AS VARCHAR(10)) + 'x' + CAST(cic.off_days AS VARCHAR(10)),
        'other'
    ) AS escala_atual,
    CAST(ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)) AS DECIMAL(10,2)) AS carga_semanal_atual,
    CAST(ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS DECIMAL(10,2)) AS carga_horaria_mensal,
    CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20)) AS cod_sindicato,
    ${SANITIZE_MSSQL('sin.SIN_D1sSindicato', 'SEM_SINDICATO')} AS nome_sindicato,
    ${SANITIZE_MSSQL('sin.SIN_NusCNPJ', '')} AS cnpj_sindicato,
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
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = ${SANITIZE_MSSQL("cc.CCU_CosEstrutura", "SEM_CC")}
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = ${SANITIZE_MSSQL("cg.CAR_D1sCargo", "NAO_INFORMADO")}
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND ISNULL(ben.cycle_len, -1) = ISNULL(cic.cycle_len, -1)
   AND ISNULL(ben.work_days, -1) = ISNULL(cic.work_days, -1)
   AND ISNULL(ben.off_days, -1) = ISNULL(cic.off_days, -1)
   AND ben.carga_semanal = ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0))
   AND ISNULL(ben.carga_mensal, -1) = ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5)
   AND ISNULL(ben.cod_sindicato, '0') = CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20))
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
__CNPJ_FILTER__
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    ${SANITIZE_MSSQL("cc.CCU_CosEstrutura", "SEM_CC")},
    ${SANITIZE_MSSQL("cc.CCU_D1sCentroCusto", "")},
    c.CON_CdiCargo, ${SANITIZE_MSSQL("cg.CAR_D1sCargo", "NAO_INFORMADO")},
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)),
    ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5),
    c.CON_CdiSindicato,
    ${SANITIZE_MSSQL('sin.SIN_D1sSindicato', 'SEM_SINDICATO')},
    ${SANITIZE_MSSQL('sin.SIN_NusCNPJ', '')},
    ht.horario_trabalho_atual
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const ORACLE_SELECT = `
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
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN NVL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(ji.JOI_OplDesativado, 0) = 0
      AND NVL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        TO_CHAR(w.inicio, 'HH24:MI') || '-' || TO_CHAR(w.fim, 'HH24:MI') AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' || TO_CHAR(ROUND((w.next_inicio - w.fim) * 1440)) || 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND (w.next_inicio - w.fim) * 1440 > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        LISTAGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_ORACLE("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")} AS desc_tipo,
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
        ${SANITIZE_ORACLE("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")}
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        ${SANITIZE_ORACLE("cc.CCU_CosEstrutura", "SEM_CC")} AS cod_cc,
        c.CON_CdiCargo,
        ${SANITIZE_ORACLE("cg.CAR_D1sCargo", "NAO_INFORMADO")} AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)) AS carga_semanal,
        NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS carga_mensal,
        NVL(c.CON_CdiSindicato, 0) AS CON_CdiSindicato,
        TO_CHAR(NVL(c.CON_CdiSindicato, 0)) AS cod_sindicato,
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
    LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
    LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        LISTAGG(
            TO_CHAR(cod_tipo) || '|' || desc_tipo || '|' ||
            TO_CHAR(CAST(valor_medio AS NUMBER(18,2))),
            CHR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_ORACLE("cc.CCU_CosEstrutura", "SEM_CC")} AS cod_cc,
    ${SANITIZE_ORACLE("cc.CCU_D1sCentroCusto", "")} AS desc_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    ${SANITIZE_ORACLE("cg.CAR_D1sCargo", "NAO_INFORMADO")} AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    ${SANITIZE_ORACLE("ht.horario_trabalho_atual", "")} AS horario_trabalho_atual,
    NVL(
        TO_CHAR(cic.work_days) || 'x' || TO_CHAR(cic.off_days),
        'other'
    ) AS escala_atual,
    CAST(NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)) AS NUMBER(10,2)) AS carga_semanal_atual,
    CAST(NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS NUMBER(10,2)) AS carga_horaria_mensal,
    TO_CHAR(NVL(c.CON_CdiSindicato, 0)) AS cod_sindicato,
    ${SANITIZE_ORACLE('sin.SIN_D1sSindicato', 'SEM_SINDICATO')} AS nome_sindicato,
    ${SANITIZE_ORACLE('sin.SIN_NusCNPJ', '')} AS cnpj_sindicato,
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
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = ${SANITIZE_ORACLE("cc.CCU_CosEstrutura", "SEM_CC")}
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = ${SANITIZE_ORACLE("cg.CAR_D1sCargo", "NAO_INFORMADO")}
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND NVL(ben.cycle_len, -1) = NVL(cic.cycle_len, -1)
   AND NVL(ben.work_days, -1) = NVL(cic.work_days, -1)
   AND NVL(ben.off_days, -1) = NVL(cic.off_days, -1)
   AND ben.carga_semanal = NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0))
   AND NVL(ben.carga_mensal, -1) = NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5)
   AND NVL(ben.cod_sindicato, '0') = TO_CHAR(NVL(c.CON_CdiSindicato, 0))
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
__CNPJ_FILTER__
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    ${SANITIZE_ORACLE("cc.CCU_CosEstrutura", "SEM_CC")},
    ${SANITIZE_ORACLE("cc.CCU_D1sCentroCusto", "")},
    c.CON_CdiCargo, ${SANITIZE_ORACLE("cg.CAR_D1sCargo", "NAO_INFORMADO")},
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)),
    NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5),
    c.CON_CdiSindicato,
    ${SANITIZE_ORACLE('sin.SIN_D1sSindicato', 'SEM_SINDICATO')},
    ${SANITIZE_ORACLE('sin.SIN_NusCNPJ', '')},
    ht.horario_trabalho_atual
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
`.trim();

const MSSQL_NOMINAL_SELECT = `

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
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN ISNULL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(ji.JOI_OplDesativado, 0) = 0
      AND ISNULL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        CONVERT(varchar(5), w.inicio, 108) + '-' + CONVERT(varchar(5), w.fim, 108) AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' + CAST(DATEDIFF(minute, w.fim, w.next_inicio) AS varchar(10)) + 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND DATEDIFF(minute, w.fim, w.next_inicio) > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        STRING_AGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_MSSQL("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")} AS desc_tipo,
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
        ${SANITIZE_MSSQL("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")}
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        CBN_CdiContratado,
        STRING_AGG(
            CAST(cod_tipo AS VARCHAR(20)) + '|' + desc_tipo + '|' +
            CAST(CAST(valor_medio AS DECIMAL(18,2)) AS VARCHAR(40)),
            CHAR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_CONTRATO
    GROUP BY CBN_CdiContratado
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_MSSQL('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
    ${SANITIZE_MSSQL('cc.CCU_D1sCentroCusto', '')} AS desc_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    ${SANITIZE_MSSQL('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
    ${SANITIZE_MSSQL('c.CON_DssNome', '')} AS nome,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    ${SANITIZE_MSSQL('ht.horario_trabalho_atual', '')} AS horario_trabalho_atual,
    ISNULL(
        CAST(cic.work_days AS VARCHAR(10)) + 'x' + CAST(cic.off_days AS VARCHAR(10)),
        'other'
    ) AS escala_atual,
    CAST(ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)) AS DECIMAL(10,2)) AS carga_semanal_atual,
    CAST(ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS DECIMAL(10,2)) AS carga_horaria_mensal,
    CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20)) AS cod_sindicato,
    ${SANITIZE_MSSQL('sin.SIN_D1sSindicato', 'SEM_SINDICATO')} AS nome_sindicato,
    ${SANITIZE_MSSQL('sin.SIN_NusCNPJ', '')} AS cnpj_sindicato,
    CAST(1 AS INT) AS qtd_colaboradores,
    CAST(ISNULL(c.CON_VlnSalario, 0) AS DECIMAL(18,2)) AS massa_salarial_base,
    CAST(0 AS DECIMAL(18,2)) AS vr_dia_medio,
    CAST(ISNULL(vt.vt_valor_dia, 0) AS DECIMAL(18,2)) AS vt_dia_medio,
    CAST(ROUND(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    , 1) AS DECIMAL(10,1)) AS dias_trabalho_mes_atual,
    ben.beneficios_agg AS beneficios_agg
FROM Contratados c
__VINCULO_JOINS__
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben ON ben.CBN_CdiContratado = c.CON_CdiContratado
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
__CNPJ_FILTER__
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo, nome
`.trim();

const ORACLE_NOMINAL_SELECT = `

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
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN NVL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(ji.JOI_OplDesativado, 0) = 0
      AND NVL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        TO_CHAR(w.inicio, 'HH24:MI') || '-' || TO_CHAR(w.fim, 'HH24:MI') AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' || TO_CHAR(ROUND((w.next_inicio - w.fim) * 1440)) || 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND (w.next_inicio - w.fim) * 1440 > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        LISTAGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        ${SANITIZE_ORACLE("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")} AS desc_tipo,
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
        ${SANITIZE_ORACLE("tbe.TBE_D1sTipoBeneficio", "SEM_DESC")}
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        CBN_CdiContratado,
        LISTAGG(
            TO_CHAR(cod_tipo) || '|' || desc_tipo || '|' ||
            TO_CHAR(CAST(valor_medio AS NUMBER(18,2))),
            CHR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_CONTRATO
    GROUP BY CBN_CdiContratado
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    ${SANITIZE_ORACLE('cc.CCU_CosEstrutura', 'SEM_CC')} AS cod_cc,
    ${SANITIZE_ORACLE('cc.CCU_D1sCentroCusto', '')} AS desc_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    ${SANITIZE_ORACLE('cg.CAR_D1sCargo', 'NAO_INFORMADO')} AS desc_cargo,
    ${SANITIZE_ORACLE('c.CON_DssNome', '')} AS nome,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    ${SANITIZE_ORACLE('ht.horario_trabalho_atual', '')} AS horario_trabalho_atual,
    NVL(
        TO_CHAR(cic.work_days) || 'x' || TO_CHAR(cic.off_days),
        'other'
    ) AS escala_atual,
    CAST(NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)) AS NUMBER(10,2)) AS carga_semanal_atual,
    CAST(NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS NUMBER(10,2)) AS carga_horaria_mensal,
    TO_CHAR(NVL(c.CON_CdiSindicato, 0)) AS cod_sindicato,
    ${SANITIZE_ORACLE('sin.SIN_D1sSindicato', 'SEM_SINDICATO')} AS nome_sindicato,
    ${SANITIZE_ORACLE('sin.SIN_NusCNPJ', '')} AS cnpj_sindicato,
    CAST(1 AS NUMBER(10)) AS qtd_colaboradores,
    CAST(NVL(c.CON_VlnSalario, 0) AS NUMBER(18,2)) AS massa_salarial_base,
    CAST(0 AS NUMBER(18,2)) AS vr_dia_medio,
    CAST(NVL(vt.vt_valor_dia, 0) AS NUMBER(18,2)) AS vt_dia_medio,
    CAST(ROUND(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    , 1) AS NUMBER(10,1)) AS dias_trabalho_mes_atual,
    ben.beneficios_agg AS beneficios_agg
FROM Contratados c
__VINCULO_JOINS__
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben ON ben.CBN_CdiContratado = c.CON_CdiContratado
WHERE __SITUACAO_PREDICATE__
AND __VINCULO_PREDICATE__
__CNPJ_FILTER__
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo, nome
`.trim();

export function cnpjDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Default ON unless explicitly false. */
export function resolveIncludeBenefits(
  includeBenefits: boolean | undefined,
): boolean {
  return includeBenefits !== false;
}

/**
 * When includeBenefits=false, omit VT + ConBeneficios CTEs/joins/columns.
 * Folha / HC / escala / horário remain. Import maps missing cols → 0 / "".
 */
export function applyIncludeBenefits(
  sql: string,
  includeBenefits: boolean,
): string {
  if (includeBenefits) return sql;
  let out = sql;
  out = out.replace(
    /CTE_VT_DIARIO AS \([\s\S]*?\n\),\n(?=CTE_CICLO_HORARIO)/,
    "",
  );
  out = out.replace(
    /,\nCTE_BEN_CONTRATO AS \([\s\S]*?\nCTE_BENEFICIOS_AGG AS \([\s\S]*?\n\)\n(?=SELECT)/,
    "\n",
  );
  out = out.replace(
    /\n[ \t]*CAST\(0 AS (?:DECIMAL|NUMBER)\(18,2\)\) AS vr_dia_medio,/g,
    "",
  );
  out = out.replace(
    /\n[ \t]*CAST\([^\n]*vt\.vt_valor_dia[^\n]* AS vt_dia_medio,/g,
    "",
  );
  out = out.replace(
    /,\n\s*(?:MAX\(ben\.beneficios_agg\)|ben\.beneficios_agg) AS beneficios_agg/g,
    "",
  );
  out = out.replace(
    /\nLEFT JOIN CTE_VT_DIARIO vt ON vt\.CAS_CdiContratado = c\.CON_CdiContratado\nLEFT JOIN CTE_BENEFICIOS_AGG ben[\s\S]*?(?=\nWHERE)/g,
    "\n",
  );
  return out;
}

function applyExtractFilterPlaceholders(
  template: string,
  dialect: ExtractorDialect,
  filters: ExtractorFilters,
): string {
  const resolved = resolveExtractFilters({
    excludeSituacoes: filters.excludeSituacoes,
    incluirAfastados: filters.incluirAfastados,
    tipoRegimeTrabalhistaIds: filters.tipoRegimeTrabalhistaIds,
    categTrabeSocIds: filters.categTrabeSocIds,
    somenteEmpregaticios: filters.somenteEmpregaticios,
  });
  return template
    .replaceAll(
      "__VINCULO_JOINS__",
      buildVinculoSqlJoins(resolved, dialect),
    )
    .replaceAll(
      "__SITUACAO_PREDICATE__",
      buildSituacaoSqlPredicate(resolved, dialect),
    )
    .replaceAll(
      "__VINCULO_PREDICATE__",
      buildVinculoSqlPredicate(resolved),
    );
}

/**
 * Build SELECT-only extractor SQL + bind params for CNPJ filter.
 * Max 32 CNPJs (defense in depth). No benefit-tipo binds — dynamic TiposBeneficios.
 * Situação / vínculo Premissas: literal integer lists (safe) + optional afastados EXISTS.
 */
function selectTemplate(
  dialect: ExtractorDialect,
  grain: ExtractorGrain,
): string {
  if (grain === "nominal") {
    return dialect === "oracle" ? ORACLE_NOMINAL_SELECT : MSSQL_NOMINAL_SELECT;
  }
  return dialect === "oracle" ? ORACLE_SELECT : MSSQL_SELECT;
}

export function buildExtractorQuery(
  dialect: ExtractorDialect,
  filters: ExtractorFilters = {},
  grain: ExtractorGrain = "aggregate",
): { sql: string; params: Record<string, string | number> } {
  const includeBenefits = resolveIncludeBenefits(filters.includeBenefits);
  const template = applyIncludeBenefits(
    applyExtractFilterPlaceholders(
      selectTemplate(dialect, grain),
      dialect,
      filters,
    ),
    includeBenefits,
  );
  const params: Record<string, string | number> = {};

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
      ? `REGEXP_REPLACE(NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''), '[^0-9]', '')`
      : `REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''), '.', ''), '/', ''), '-', ''), ' ', '')`;

  const filter = `AND ${expr} IN (${placeholders.join(", ")})`;
  return {
    sql: template.replace("__CNPJ_FILTER__", filter),
    params,
  };
}

/**
 * Aptools-ready SELECT (no SET TRANSACTION — Aptools may reject it).
 * Parity with SPA `src/apdata/extractorSql.ts` (beneficios_agg).
 * Oracle: no trailing `;` (ORA-00933 in Aptools). MSSQL keeps `;`.
 */
export function getAptoolsExtractorScript(
  dialect: ExtractorDialect,
  filters: ExtractorFilters = {},
): string {
  const grain =
    filters.grain === "aggregate" || filters.grain === "nominal"
      ? filters.grain
      : DEFAULT_APTOOLS_GRAIN;
  const { sql } = buildExtractorQuery(dialect, filters, grain);
  return dialect === "oracle" ? `${sql}\n` : `${sql};\n`;
}
