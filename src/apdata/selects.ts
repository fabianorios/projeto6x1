/**
 * Admin-facing SELECT texts from docs/apdata-turnocheck-mapping.md.
 * Shown for logic review before the live /api/query/select steps run.
 * Runtime uses single-table allowlisted SELECTs + client-side join (exportPayroll).
 */

export type ReviewSelect = {
  id: string
  title: string
  purpose: string
  sql: string
}

/** Skeletons B / C / D — LGPD: no name/CPF/address columns. */
export const REVIEW_SELECTS: ReviewSelect[] = [
  {
    id: 'B',
    title: 'B) Ciclo por horário → classificador',
    purpose:
      'Deriva escala_atual (6x1 / 5x2 / 4x3 / other) a partir de HorariosJornadas × TiposDiasPonto.',
    sql: `SELECT hj.HRI_CdiHorario,
       COUNT(*) AS cycle_len,
       SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) AS work_days,
       SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) AS off_days,
       CASE
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 6
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 1
           THEN '6x1'
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 5
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 2
           THEN '5x2'
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 4
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 3
           THEN '4x3'
         ELSE 'other'
       END AS escala_atual
FROM dbo.HorariosJornadas hj
JOIN dbo.TiposDiasPonto td
  ON td.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
GROUP BY hj.HRI_CdiHorario`,
  },
  {
    id: 'C',
    title: 'C) Export agregado → colunas CSV (sem PII)',
    purpose:
      'Agrega sit=1 por cargo × CC (código) × HMV × escala → layout import-layout.md. Sem nome.',
    sql: `;WITH ciclo AS (
  SELECT hj.HRI_CdiHorario,
         COUNT(*) AS cycle_len,
         SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) AS work_days,
         SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) AS off_days
  FROM dbo.HorariosJornadas hj
  JOIN dbo.TiposDiasPonto td ON td.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
  WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
  GROUP BY hj.HRI_CdiHorario
),
class AS (
  SELECT HRI_CdiHorario, cycle_len, work_days, off_days,
         CASE
           WHEN cycle_len = 7 AND work_days = 6 AND off_days = 1 THEN '6x1'
           WHEN cycle_len = 7 AND work_days = 5 AND off_days = 2 THEN '5x2'
           WHEN cycle_len = 7 AND work_days = 4 AND off_days = 3 THEN '4x3'
           ELSE 'other'
         END AS escala_ciclo
  FROM ciclo
)
SELECT
  car.CAR_D1sCargo                         AS cargo,
  AVG(NULLIF(con.CON_VlnSalario, 0))       AS salario,
  hmv.HMV_QtnQuantidadeHoraMes             AS carga_horaria_mensal,
  hmv.HMV_QtnHorasSemanal                  AS carga_horaria_semanal,
  ccu.CCU_CosEstrutura                     AS centro_custo,
  CASE
    WHEN hor.HOR_CdiTipoEscala = 3 THEN '12x36'
    ELSE ISNULL(cl.escala_ciclo, 'other')
  END                                      AS escala_atual,
  CASE
    WHEN cl.cycle_len > 0
      THEN ROUND(30.0 * cl.work_days / cl.cycle_len, 1)
  END                                      AS vr_dias_mes_atual,
  CASE
    WHEN cl.cycle_len > 0
      THEN ROUND(30.0 * cl.work_days / cl.cycle_len, 1)
  END                                      AS vt_dias_mes_atual,
  COUNT(*)                                 AS quantidade
FROM dbo.Contratados con
JOIN dbo.Cargos car ON car.CAR_CdiCargo = con.CON_CdiCargo
JOIN dbo.CentrosCustos ccu ON ccu.CCU_CdiCentroCusto = con.CON_CdiCentroCusto
LEFT JOIN dbo.QuantidadesHorasMes hmv
  ON hmv.HMV_CdiQuantidadeHoraMes = con.CON_CdiQuantidadeHoraMes
LEFT JOIN dbo.Horarios hor ON hor.HOR_CdiHorario = con.CON_CdiHorario
LEFT JOIN class cl ON cl.HRI_CdiHorario = con.CON_CdiHorario
WHERE con.CON_CdiSituacao = 1
GROUP BY
  car.CAR_D1sCargo,
  hmv.HMV_QtnQuantidadeHoraMes,
  hmv.HMV_QtnHorasSemanal,
  ccu.CCU_CosEstrutura,
  hor.HOR_CdiTipoEscala,
  cl.escala_ciclo,
  cl.cycle_len,
  cl.work_days`,
  },
  {
    id: 'D',
    title: 'D) VR valor/dia (planos tipo 53) — referência',
    purpose:
      'Planos VR na TEMP. Runtime usa override no fluxo (tabelas de benefício fora do allowlist /api/query).',
    sql: `SELECT pb.PLB_CdiPlanoBeneficio,
       AVG(pbv.PBV_VlnBeneficio) AS vr_valor_dia
FROM dbo.PlanosBeneficios pb
JOIN dbo.TiposBeneficiosEntsBens ebt
  ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
JOIN dbo.TiposBeneficios tbe
  ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
JOIN dbo.PlanosBeneficiosValores pbv
  ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
WHERE tbe.TBE_CdiTipoBeneficio = 53
  AND ISNULL(pb.PLB_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_VlnBeneficio, 0) > 0
GROUP BY pb.PLB_CdiPlanoBeneficio`,
  },
]

/** Live steps executed via POST /api/query/select (single-table). */
export const LIVE_SELECT_STEPS: {
  id: string
  label: string
  table: string
  columns: string[]
  where?: Record<string, string | number | boolean | null>
  note: string
}[] = [
  {
    id: 'tipos-dia',
    label: 'TiposDiasPonto (trabalho vs folga)',
    table: 'TiposDiasPonto',
    columns: ['TIP_CdiTipoDiaPonto', 'TIP_OplTrabalho'],
    note: 'Flags T/F — sem descrições de cliente.',
  },
  {
    id: 'jornadas',
    label: 'HorariosJornadas (ciclo ativo)',
    table: 'HorariosJornadas',
    columns: [
      'HRI_CdiHorario',
      'HRI_CdiTipoDiaPonto',
      'HRI_OplDesativado',
      'HRI_NuiOrdem',
    ],
    note: 'Sequência do ciclo por horário.',
  },
  {
    id: 'horarios',
    label: 'Horarios (tipo escala / 12×36)',
    table: 'Horarios',
    columns: ['HOR_CdiHorario', 'HOR_CdiTipoEscala', 'HOR_OplDesativado'],
    note: 'Sobrepor 12x36 quando HOR_CdiTipoEscala = 3.',
  },
  {
    id: 'contratados',
    label: 'Contratados ativos (sit=1)',
    table: 'Contratados',
    columns: [
      'CON_CdiCargo',
      'CON_CdiCentroCusto',
      'CON_CdiQuantidadeHoraMes',
      'CON_CdiHorario',
      'CON_VlnSalario',
      'CON_VlnSalarioIntegral',
      'CON_CdiSituacao',
    ],
    where: { CON_CdiSituacao: 1 },
    note: 'Sem CON_DssNome / CPF — só IDs e valores.',
  },
  {
    id: 'cargos',
    label: 'Cargos',
    table: 'Cargos',
    columns: ['CAR_CdiCargo', 'CAR_D1sCargo'],
    note: 'Texto de cargo (não é nome de pessoa).',
  },
  {
    id: 'centros',
    label: 'CentrosCustos (código interno)',
    table: 'CentrosCustos',
    columns: ['CCU_CdiCentroCusto', 'CCU_CosEstrutura'],
    note: 'CCU_CosEstrutura — evita nome de cliente em D1s.',
  },
  {
    id: 'hmv',
    label: 'QuantidadesHorasMes (HMV)',
    table: 'QuantidadesHorasMes',
    columns: [
      'HMV_CdiQuantidadeHoraMes',
      'HMV_QtnQuantidadeHoraMes',
      'HMV_QtnHorasSemanal',
    ],
    note: 'Carga mensal/semanal do contratado.',
  },
]
